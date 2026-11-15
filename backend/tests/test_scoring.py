import pytest

from app.scoring.availability import check_availability, has_open_linked_pr, is_claim_comment
from app.scoring.difficulty import extract_signals, score_difficulty


class TestDifficultySignals:
    def test_counts_code_blocks_and_file_paths(self):
        body = "Fix `src/utils/date.py`\n```py\nx = 1\n```\n```\ny\n```\nalso lib/a.ts"
        s = extract_signals(body, ["bug"], comments_count=2)
        assert s["code_blocks"] == 2
        assert s["file_paths"] == 2
        assert s["comments"] == 2

    def test_handles_missing_body(self):
        s = extract_signals(None, [], 0)
        assert s["body_length"] == 0 and s["code_blocks"] == 0

    def test_label_hints_are_case_insensitive(self):
        s = extract_signals("x", ["Documentation", "PERFORMANCE"], 0)
        assert s["easy_labels"] == 1 and s["hard_labels"] == 1

    def test_is_deterministic(self):
        args = ("Some body text " * 50, ["good first issue"], 3)
        assert extract_signals(*args) == extract_signals(*args)

    def test_counts_inline_code_checklists_and_links(self):
        body = ("Call `parse()` with `--strict`.\n- [ ] add test\n- [x] repro\n"
                "* [ ] docs\nSee https://a.dev and http://b.dev")
        s = extract_signals(body, ["bug", "good first issue"], 0, title="Fix parser")
        assert s["inline_code"] == 2
        assert s["checklist_items"] == 3
        assert s["links"] == 2
        assert s["title_length"] == len("Fix parser") and s["label_count"] == 2

    def test_body_is_capped_like_the_training_data(self):
        assert extract_signals("x" * 20_000, [], 0)["body_length"] == 8000


class TestDifficultyScore:
    def test_docs_issue_pointing_at_one_file_is_easy(self):
        s = extract_signals("Typo in docs/index.md, line 4 says teh. " * 3, ["documentation"], 0)
        result = score_difficulty(s)
        assert result.label == "easy"
        assert "points to a specific file" in result.reasons

    def test_long_discussed_refactor_is_hard(self):
        s = extract_signals("x" * 6000, ["refactor"], comments_count=12)
        assert score_difficulty(s).label == "hard"

    def test_score_is_clamped(self):
        huge = {"body_length": 10**6, "comments": 10**4, "code_blocks": 50, "file_paths": 50,
                "hard_labels": 3}
        assert score_difficulty(huge).score == 1.0
        assert score_difficulty({"easy_labels": 5, "file_paths": 1, "body_length": 500}).score >= 0

    def test_empty_signals_default_to_medium_or_easy(self):
        assert score_difficulty({}).label in ("easy", "medium")


class TestAvailability:
    @pytest.mark.parametrize(
        "kwargs, reason",
        [
            ({"state": "closed", "assignee_count": 0}, "closed"),
            ({"state": "open", "assignee_count": 1}, "assigned"),
            ({"state": "open", "assignee_count": 0, "has_linked_pr": True}, "linked_pr"),
            ({"state": "open", "assignee_count": 0, "recent_comments": ["I'll take this!"]},
             "claimed_in_comments"),
        ],
    )
    def test_unavailable_reasons(self, kwargs, reason):
        result = check_availability(**kwargs)
        assert not result.available and result.reason == reason

    def test_open_unassigned_is_available(self):
        assert check_availability(state="open", assignee_count=0).available

    @pytest.mark.parametrize(
        "text",
        ["I'll work on this", "Can I take this?", "I am working on it", "please assign me",
         "I'd like to work on this one"],
    )
    def test_claim_phrases(self, text):
        assert is_claim_comment(text)

    @pytest.mark.parametrize(
        "text",
        ["Is anyone working on this?", "This would take a while", "Thanks for the report",
         "I think the fix is in parser.py"],
    )
    def test_non_claims_are_not_flagged(self, text):
        assert not is_claim_comment(text)

    def test_removed_label_makes_issue_unavailable(self):
        result = check_availability(state="open", assignee_count=0, labels=["bug"])
        assert result.reason == "label_removed"

    def test_label_match_is_case_insensitive(self):
        assert check_availability(
            state="open", assignee_count=0, labels=["Good First Issue"]
        ).available


def _xref(state: str, is_pr: bool = True) -> dict:
    issue = {"state": state, **({"pull_request": {"url": "..."}} if is_pr else {})}
    return {"event": "cross-referenced", "source": {"type": "issue", "issue": issue}}


class TestLinkedPr:
    def test_open_pr_reference_counts(self):
        assert has_open_linked_pr([{"event": "labeled"}, _xref("open")])

    @pytest.mark.parametrize(
        "events",
        [
            [],
            [_xref("closed")],  # abandoned or merged PR: issue is free again (or closed anyway)
            [_xref("open", is_pr=False)],  # another *issue* mentioned it, not a PR
            [{"event": "commented"}],
        ],
    )
    def test_other_events_do_not_count(self, events):
        assert not has_open_linked_pr(events)
