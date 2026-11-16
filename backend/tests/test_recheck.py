"""Re-check job against the real test schema, with GitHub mocked by respx."""

import asyncio
import copy
from datetime import UTC, datetime, timedelta

import pytest
import respx
from sqlalchemy import select

from app.db.models import Issue, SyncRun
from app.github.client import GitHubClient
from app.sync.mapping import map_issue, map_repo
from app.sync.recheck import run_recheck
from app.sync.runs import INTERRUPTED, Deadline
from app.sync.upsert import upsert_issue, upsert_repo

BASE = "https://api.github.com"
REPO = "andrewsiah/agentswarm-data-tasks"


async def _no_sleep(_: float) -> None:
    return None


@pytest.fixture
def seeded(db_session_factory, fixture):
    """One repo and one open, available issue, as the sync would have stored them."""
    item = copy.deepcopy(fixture("search_issues_python.json")["items"][0])
    with db_session_factory() as db:
        repo_id = upsert_repo(db, map_repo(fixture("repo.json")), etag=None)
        issue_id = upsert_issue(db, map_issue(item, repo_id))
        db.commit()
    url = f"{BASE}/repos/{REPO}/issues/{item['number']}"
    return db_session_factory, item, issue_id, url


async def _recheck(factory) -> SyncRun:
    async with GitHubClient("t", sleep=_no_sleep, rand=lambda: 0.0) as client:
        return await run_recheck(factory, client, max_issues=100)


def _issue(factory, issue_id: int) -> Issue:
    with factory() as db:
        return db.execute(select(Issue).where(Issue.id == issue_id)).scalar_one()


def _mock_extras(url: str, *, timeline=None, comments=None) -> None:
    respx.get(f"{url}/timeline").respond(200, json=timeline or [])
    respx.get(f"{url}/comments").respond(200, json=comments or [])


@respx.mock
async def test_closed_issue_is_marked_closed(seeded):
    factory, item, issue_id, url = seeded
    respx.get(url).respond(200, json={**item, "state": "closed",
                                      "closed_at": "2026-11-14T10:00:00Z"})
    run = await _recheck(factory)

    issue = _issue(factory, issue_id)
    assert run.status == "succeeded"
    assert issue.state == "closed" and not issue.is_available
    assert issue.unavailable_reason == "closed"
    assert issue.last_checked_at is not None


@respx.mock
async def test_assigned_issue_is_hidden_without_extra_calls(seeded):
    factory, item, issue_id, url = seeded
    respx.get(url).respond(200, json={**item, "assignees": [{"login": "someone"}]})
    timeline = respx.get(f"{url}/timeline")
    await _recheck(factory)

    assert _issue(factory, issue_id).unavailable_reason == "assigned"
    assert not timeline.called  # already unavailable, so no point spending requests


@respx.mock
async def test_claim_comment_and_linked_pr_are_detected(seeded):
    factory, item, issue_id, url = seeded
    respx.get(url).respond(200, json={**item, "comments": 1})
    _mock_extras(url, comments=[{"body": "Hi! I'd like to work on this."}])
    await _recheck(factory)
    assert _issue(factory, issue_id).unavailable_reason == "claimed_in_comments"


@respx.mock
async def test_open_pr_reference_hides_issue(seeded):
    factory, item, issue_id, url = seeded
    respx.get(url).respond(200, json={**item, "comments": 0})
    pr = {"event": "cross-referenced",
          "source": {"issue": {"state": "open", "pull_request": {"url": "x"}}}}
    _mock_extras(url, timeline=[pr])
    await _recheck(factory)

    issue = _issue(factory, issue_id)
    assert issue.unavailable_reason == "linked_pr" and issue.has_linked_pr


@respx.mock
async def test_unchanged_issue_uses_etag_and_keeps_state(seeded):
    factory, item, issue_id, url = seeded
    first = respx.get(url).respond(200, json={**item, "comments": 0}, headers={"ETag": 'W/"v1"'})
    _mock_extras(url)
    await _recheck(factory)

    first.respond(304)
    await _recheck(factory)

    assert first.calls.last.request.headers["If-None-Match"] == 'W/"v1"'
    issue = _issue(factory, issue_id)
    assert issue.is_available and issue.etag == 'W/"v1"'


@respx.mock
async def test_deleted_issue_is_marked_gone(seeded):
    factory, _, issue_id, url = seeded
    respx.get(url).respond(404, json={"message": "Not Found"})
    await _recheck(factory)

    issue = _issue(factory, issue_id)
    assert issue.state == "gone" and not issue.is_available


@respx.mock
async def test_sync_does_not_overwrite_a_detected_claim(seeded, fixture):
    factory, item, issue_id, url = seeded
    respx.get(url).respond(200, json={**item, "comments": 1})
    _mock_extras(url, comments=[{"body": "I'll take this"}])
    await _recheck(factory)

    # Next day the search still returns it (open + unassigned) and the sync re-upserts it.
    with factory() as db:
        upsert_issue(db, map_issue(item, _issue(factory, issue_id).repo_id))
        db.commit()
    assert _issue(factory, issue_id).unavailable_reason == "claimed_in_comments"


@respx.mock
async def test_short_stored_body_is_refetched_without_etag(seeded):
    """Issues saved when we kept 600 chars get their full body on the next re-check."""
    factory, item, issue_id, url = seeded
    with factory() as db:
        db.query(Issue).filter(Issue.id == issue_id).update({
            "body_excerpt": "x" * 600, "etag": 'W/"old"',
            "difficulty_signals": {"body_length": 2500},
        })
        db.commit()
    route = respx.get(url).respond(200, json={**item, "body": "y" * 2500, "comments": 0},
                                   headers={"ETag": 'W/"new"'})
    _mock_extras(url)
    await _recheck(factory)

    assert "If-None-Match" not in route.calls.last.request.headers
    issue = _issue(factory, issue_id)
    assert len(issue.body_excerpt) == 2500 and issue.etag == 'W/"new"'

    await _recheck(factory)  # next time: body is complete, so the ETag is used again
    assert route.calls.last.request.headers["If-None-Match"] == 'W/"new"'


# --- A run must never stay "running" after the job is gone (app/sync/runs.py) ---


async def test_a_stopped_recheck_records_interrupted_and_its_progress(seeded, monkeypatch):
    """What a CI time limit does: the task is cancelled mid-check."""
    factory, *_ = seeded

    async def stopped(*_args, **_kwargs):
        raise asyncio.CancelledError

    monkeypatch.setattr("app.sync.recheck.recheck_issue", stopped)
    with pytest.raises(asyncio.CancelledError):
        await _recheck(factory)
    with factory() as db:
        run = db.execute(select(SyncRun)).scalar_one()
    assert run.status == "failed" and run.error == INTERRUPTED
    assert run.finished_at is not None and run.issues_seen == 0


@respx.mock
async def test_a_spent_budget_stops_checking_but_still_succeeds(seeded):
    factory, _, issue_id, _ = seeded
    async with GitHubClient("t", sleep=_no_sleep, rand=lambda: 0.0) as client:
        run = await run_recheck(factory, client, max_issues=100, deadline=Deadline(0))
    assert run.status == "succeeded" and run.issues_seen == 0
    assert not respx.calls  # nothing was fetched
    assert _issue(factory, issue_id).last_checked_at is None  # waits for the next run


@respx.mock
async def test_a_recheck_first_clears_a_run_left_running(seeded):
    factory, item, _, url = seeded
    with factory() as db:
        db.add(SyncRun(query="recheck max=2000", status="running",
                       started_at=datetime.now(UTC) - timedelta(hours=9)))
        db.commit()
    respx.get(url).respond(200, json=item)
    _mock_extras(url)
    await _recheck(factory)
    with factory() as db:
        statuses = sorted(r.status for r in db.execute(select(SyncRun)).scalars())
    assert statuses == ["failed", "succeeded"]
