"""Sync worker end to end: GitHub mocked with respx, real test schema."""

import copy
import re
from urllib.parse import parse_qs, urlparse

import httpx
import respx
from sqlalchemy import select

from app.db.models import Issue
from app.github.client import GitHubClient
from app.sync.discover import MAX_QUERY_CHARS, batch_repo_queries
from app.sync.mapping import map_repo
from app.sync.run import SyncStats, run_sync, sync_big_repo_bugs
from app.sync.runs import Deadline
from app.sync.upsert import upsert_repo

BASE = "https://api.github.com"


async def _no_sleep(_: float) -> None:
    return None


def _q(request: httpx.Request) -> str:
    return parse_qs(urlparse(str(request.url)).query)["q"][0]


def test_repo_queries_fit_the_limit_and_cover_every_repo():
    repos = [f"owner{i}/some-fairly-long-repo-name-{i}" for i in range(40)]
    base = 'label:"bug" state:open is:issue no:assignee archived:false'
    queries = batch_repo_queries(base, repos)
    assert all(len(q) <= MAX_QUERY_CHARS for q in queries)
    named = [name for q in queries for name in re.findall(r"repo:(\S+)", q)]
    assert sorted(named) == sorted(repos)  # each exactly once
    assert len(queries) < len(repos)  # actually batched


@respx.mock
async def test_sync_searches_both_labels_then_classifies(db_session_factory, fixture):
    page = fixture("search_issues_python.json")
    page["items"] = [i for i in page["items"] if "agentswarm" in i["repository_url"]]
    page["total_count"] = len(page["items"])
    search = respx.get(f"{BASE}/search/issues").respond(200, json=page)
    repo = {**fixture("repo.json"), "stargazers_count": 500}
    respx.get(url__regex=rf"{BASE}/repos/[^/]+/[^/]+$").respond(200, json=repo)

    async with GitHubClient("t", sleep=_no_sleep) as client:
        await run_sync(db_session_factory, client, ["python"], limit=50, lookback_days=30,
                       min_stars=10, big_repo_bugs=False)

    queries = {_q(call.request) for call in search.calls}
    assert any('label:"good first issue"' in q for q in queries)
    assert any('label:"help wanted"' in q for q in queries)
    with db_session_factory() as db:
        issues = db.execute(select(Issue)).scalars().all()
    assert issues and all(i.level in {"new", "some", "experienced"} for i in issues)
    assert all(i.kind is not None for i in issues)


@respx.mock
async def test_bug_pass_names_only_big_repos(db_session_factory, fixture):
    with db_session_factory() as db:
        big = {**map_repo(fixture("repo.json")), "github_id": 1, "full_name": "big/project",
               "stars": 20_000}
        small = {**big, "github_id": 2, "full_name": "small/project", "stars": 50}
        upsert_repo(db, big, etag=None)
        upsert_repo(db, small, etag=None)
        db.commit()

    bug = copy.deepcopy(fixture("search_issues_python.json")["items"][0])
    bug.update(repository_url=f"{BASE}/repos/big/project",
               labels=[{"name": "bug"}], title="Crash when config is empty")
    search = respx.get(f"{BASE}/search/issues").respond(
        200, json={"total_count": 1, "items": [bug]})
    respx.get(f"{BASE}/repos/big/project").respond(
        200, json={**fixture("repo.json"), "id": 1, "full_name": "big/project",
                   "stargazers_count": 20_000})

    async with GitHubClient("t", sleep=_no_sleep) as client:
        with db_session_factory() as db:
            await sync_big_repo_bugs(db, client, SyncStats())

    query = _q(search.calls.last.request)
    assert "repo:big/project" in query and "small/project" not in query
    assert 'label:"bug"' in query and "no:assignee" in query
    with db_session_factory() as db:
        stored = db.execute(select(Issue)).scalar_one()
    assert stored.title == "Crash when config is empty"



@respx.mock
async def test_a_spent_budget_skips_fetching_but_still_rescores(db_session_factory):
    async with GitHubClient("t", sleep=_no_sleep) as client:
        run = await run_sync(db_session_factory, client, ["python", "go"], limit=50,
                             lookback_days=30, min_stars=10, deadline=Deadline(0))
    assert run.status == "succeeded" and run.finished_at is not None
    assert not respx.calls


@respx.mock
async def test_no_new_language_starts_when_requests_are_nearly_gone(db_session_factory):
    async with GitHubClient("t", sleep=_no_sleep) as client:
        client.buckets["core"].remaining = 50
        run = await run_sync(db_session_factory, client, ["python", "go"], limit=50,
                             lookback_days=30, min_stars=10)
    assert run.status == "succeeded"
    assert not respx.calls
