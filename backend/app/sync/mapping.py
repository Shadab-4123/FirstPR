"""Turn raw GitHub JSON into row dicts. Pure functions, so they are easy to test."""

from datetime import datetime
from typing import Any

from app.scoring.availability import check_availability
from app.scoring.classify import contribution_kind, contributor_level
from app.scoring.difficulty import extract_signals, score_difficulty

# Enough for the issue overview page to show what it's about; search results send less.
BODY_EXCERPT_CHARS = 4000


def clean_text(value: str | None) -> str:
    """GitHub text can contain NUL characters; Postgres rejects them in text and JSONB."""
    return (value or "").replace("\x00", "")


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def repo_full_name_from_url(repository_url: str) -> str:
    # "https://api.github.com/repos/owner/name" -> "owner/name"
    return repository_url.split("/repos/", 1)[1]


def map_repo(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "github_id": data["id"],
        "full_name": data["full_name"],
        "description": data.get("description"),
        "html_url": data["html_url"],
        "language": data.get("language"),
        "topics": data.get("topics") or [],
        "stars": data.get("stargazers_count", 0),
        "forks": data.get("forks_count", 0),
        "open_issues_count": data.get("open_issues_count", 0),
        "archived": bool(data.get("archived")),
        "pushed_at": _dt(data.get("pushed_at")),
    }


def map_issue(item: dict[str, Any], repo_id: int, *, repo_stars: int) -> dict[str, Any]:
    """One GitHub issue as a row. Difficulty, level and type are computed together, so a row is
    never stored with a level that disagrees with its difficulty, even if the job dies before
    its final rescore (on 2026-11-16 a killed re-check left 10 "hard" issues filed as "new").
    `repo_stars` is required because the level depends on it."""
    body = clean_text(item.get("body"))
    labels = [label["name"] for label in item.get("labels", [])]
    assignees = item.get("assignees") or ([item["assignee"]] if item.get("assignee") else [])

    signals = extract_signals(body, labels, item.get("comments", 0), title=item["title"])
    difficulty = score_difficulty(signals)
    availability = check_availability(state=item["state"], assignee_count=len(assignees))

    return {
        "github_id": item["id"],
        "repo_id": repo_id,
        "number": item["number"],
        "title": clean_text(item["title"]),
        "body_excerpt": body[:BODY_EXCERPT_CHARS],
        "html_url": item["html_url"],
        "labels": labels,
        "comments_count": item.get("comments", 0),
        "author_association": item.get("author_association"),
        "state": item["state"],
        "created_at": _dt(item["created_at"]),
        "updated_at": _dt(item["updated_at"]),
        "closed_at": _dt(item.get("closed_at")),
        "assignee_count": len(assignees),
        "is_available": availability.available,
        "unavailable_reason": availability.reason,
        "difficulty_signals": signals,
        "difficulty_score": difficulty.score,
        "difficulty_label": difficulty.label,
        # Provisional: the rescore at the end of the sync replaces these with the model's.
        "difficulty_method": "baseline_heuristic",
        "difficulty_confidence": None,
        "difficulty_reasons": difficulty.reasons,
        "level": contributor_level(labels, difficulty.label, repo_stars),
        "kind": contribution_kind(labels, clean_text(item["title"])),
    }
