"""Training-data collection: mapping rules (pure) and the collector end to end (mocked)."""

import copy
from datetime import date

import httpx
import pytest
import respx
from sqlalchemy import func, select

from app.db.models import TrainingExample
from app.github.client import GitHubClient, GitHubError
from app.ml.collect import build_query, collect, map_training_example
from app.sync.discover import Window

GRAPHQL = "https://api.github.com/graphql"


@pytest.fixture
def nodes(fixture):
    return copy.deepcopy(fixture("graphql_closed_issues.json")["search"]["nodes"])


def test_query_targets_fixed_beginner_issues_in_a_window():
    q = build_query("c++", Window(date(2025, 6, 1), date(2025, 6, 30)))
    assert 'label:"good first issue"' in q and "is:closed" in q
    assert "reason:completed" in q and "linked:pr" in q
    assert "closed:2025-06-01..2025-06-30" in q and "language:c++" in q


def test_maps_targets_from_the_merged_pr(nodes):
    node = nodes[1]  # recorded: one merged PR, 57 additions, 2 files
    row, why = map_training_example(node, min_stars=0)
    assert why == "ok"
    assert row["lines_changed"] == 57 and row["files_changed"] == 2
    assert row["repo_full_name"] == "scarowar/terraform-branch-deploy"
    assert row["pr_merged_hours"] > 0


def test_unmerged_prs_are_ignored_and_earliest_merged_wins(nodes):
    node = nodes[1]
    merged = node["closedByPullRequestsReferences"]["nodes"][0]
    later = {**merged, "number": 999, "mergedAt": "2030-01-01T00:00:00Z", "additions": 1}
    unmerged = {**merged, "number": 998, "merged": False, "additions": 10_000}
    node["closedByPullRequestsReferences"]["nodes"] = [later, unmerged, merged]
    row, _ = map_training_example(node, min_stars=0)
    assert row["pr_number"] == merged["number"]


@pytest.mark.parametrize(
    "change, reason",
    [
        (lambda n: n["closedByPullRequestsReferences"].update(nodes=[]), "no_merged_pr"),
        (lambda n: n.update(databaseId=None), "not_an_issue"),
        (lambda n: n["repository"].update(stargazerCount=3), "low_stars"),
    ],
)
def test_skip_reasons(nodes, change, reason):
    node = nodes[1]
    change(node)
    row, why = map_training_example(node, min_stars=10)
    assert row is None and why == reason


def test_pr_opened_before_the_issue_is_skipped(nodes):
    # Recorded case: PR opened 2025-06-27, issue filed 2025-06-30 to document it.
    row, why = map_training_example(nodes[0], min_stars=0)
    assert row is None and why == "pr_before_issue"


def test_comments_after_the_pr_opened_are_dropped(nodes):
    """Leakage guard: post-PR comments discuss the fix, so the model must not see them."""
    node = nodes[1]
    pr_opened = node["closedByPullRequestsReferences"]["nodes"][0]["createdAt"]
    node["comments"]["nodes"] = [
        {"createdAt": node["createdAt"], "authorAssociation": "OWNER", "body": "Look at cli.py"},
        {"createdAt": pr_opened, "authorAssociation": "NONE", "body": "Fixed in the PR!"},
    ]
    row, _ = map_training_example(node, min_stars=0)
    assert [c["body"] for c in row["raw"]["comments_pre_pr"]] == ["Look at cli.py"]


async def _no_sleep(_: float) -> None:
    return None


def _page(nodes, *, total, has_next=False, cursor=None):
    return {"data": {"rateLimit": {"cost": 1, "remaining": 4999, "resetAt": "x"},
                     "search": {"issueCount": total, "nodes": nodes,
                                "pageInfo": {"hasNextPage": has_next, "endCursor": cursor}}}}


@respx.mock
async def test_collect_saves_once_and_is_idempotent(db_session_factory, nodes):
    respx.post(GRAPHQL).respond(200, json=_page(nodes, total=len(nodes)))
    async with GitHubClient("t", sleep=_no_sleep) as client:
        first = await collect(db_session_factory, client, ["python"], per_language=100,
                              months=1, min_stars=10, today=date(2025, 6, 30))
        again = await collect(db_session_factory, client, ["python"], per_language=100,
                              months=1, min_stars=10, today=date(2025, 6, 30))

    with db_session_factory() as db:
        stored = db.execute(select(func.count()).select_from(TrainingExample)).scalar()
    # Recorded page: 5 issues, 2 from repos with >= 10 stars, both PRs opened after the issue.
    assert first == {"python": 2} and stored == 2
    assert again == {"python": 0}  # re-running inserts nothing new


@respx.mock
async def test_collect_follows_cursor_and_stops_at_budget(db_session_factory, nodes):
    good = nodes[1]
    pages = [
        _page([{**good, "databaseId": 1}], total=3, has_next=True, cursor="c1"),
        _page([{**good, "databaseId": 2}, {**good, "databaseId": 3}], total=3),
    ]
    route = respx.post(GRAPHQL).mock(side_effect=[httpx.Response(200, json=p) for p in pages])
    async with GitHubClient("t", sleep=_no_sleep) as client:
        saved = await collect(db_session_factory, client, ["python"], per_language=2, months=1,
                              min_stars=0, today=date(2025, 6, 30))
    assert saved == {"python": 2}
    assert route.calls[1].request.content.count(b'"cursor":"c1"') == 1


@respx.mock
async def test_graphql_errors_raise():
    respx.post(GRAPHQL).respond(200, json={"errors": [{"message": "Bad field"}]})
    async with GitHubClient("t", sleep=_no_sleep) as client:
        with pytest.raises(GitHubError, match="Bad field"):
            await client.graphql("query { x }", {})
