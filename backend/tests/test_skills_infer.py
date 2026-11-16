from datetime import UTC, datetime

import pytest

from app.skills.infer import build_profile, infer_languages, level_from_merged_prs

NOW = datetime(2026, 11, 16, tzinfo=UTC)
RECENT, OLD = "2026-10-01T00:00:00Z", "2019-01-01T00:00:00Z"


def repo(language, pushed_at=RECENT, fork=False):
    return {"language": language, "pushed_at": pushed_at, "fork": fork}


def test_recent_own_work_outweighs_old_repos_and_forks():
    repos = [repo("Python"), repo("Python"), repo("Go", OLD), repo("Rust", fork=True)]
    langs = infer_languages(repos, NOW)
    assert [lang["name"] for lang in langs] == ["Python", "Rust", "Go"]
    assert langs[0]["share"] > 0.7
    assert sum(lang["share"] for lang in langs) == pytest.approx(1, abs=0.01)


def test_a_trace_language_is_not_a_skill():
    repos = [repo("Python")] * 20 + [repo("Perl", OLD)]
    assert [lang["name"] for lang in infer_languages(repos, NOW)] == ["Python"]


def test_repos_without_a_language_are_ignored_and_no_repos_means_no_languages():
    assert infer_languages([repo(None)], NOW) == []
    assert infer_languages([], NOW) == []


def test_at_most_five_languages():
    repos = [repo(name) for name in ["A", "B", "C", "D", "E", "F", "G"]]
    assert len(infer_languages(repos, NOW)) == 5


@pytest.mark.parametrize(("merged", "level"), [(0, "new"), (1, "some"), (9, "some"),
                                                (10, "experienced"), (250, "experienced")])
def test_level_comes_from_prs_merged_elsewhere(merged, level):
    assert level_from_merged_prs(merged) == level


def test_profile_shape():
    profile = build_profile([repo("TypeScript")], merged_prs=3, now=NOW)
    assert profile == {"languages": [{"name": "TypeScript", "share": 1.0}], "level": "some",
                       "merged_prs": 3, "repos_counted": 1}
