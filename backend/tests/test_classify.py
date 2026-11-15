import pytest

from app.scoring.classify import contribution_kind, contributor_level, has_tracked_label


@pytest.mark.parametrize(
    "labels, difficulty, stars, level",
    [
        (["good first issue"], "easy", 50, "new"),
        (["Good First Issue", "docs"], "easy", 50, "new"),  # label case doesn't matter
        (["good first issue"], "medium", 50, "new"),  # model leans hard; medium still fits
        (["good first issue"], "hard", 50, "some"),
        (["good first issue"], None, 50, "some"),  # not estimated: don't promise "easy"
        (["help wanted"], "easy", 50, "some"),
        (["help wanted"], "medium", 50, "experienced"),
        (["help wanted"], "hard", 50, "experienced"),
        (["bug"], "easy", 5000, "experienced"),  # bugs in big repos, whatever the text says
        (["good first issue", "help wanted"], "easy", 50, "new"),  # beginner label wins
    ],
)
def test_contributor_level(labels, difficulty, stars, level):
    assert contributor_level(labels, difficulty, stars) == level


@pytest.mark.parametrize(
    "labels, title, kind",
    [
        (["documentation"], "Update the install section", "docs"),
        (["good first issue", "bug"], "Crash on empty input", "bug"),
        (["enhancement"], "Dark mode", "feature"),
        (["translation"], "Add German strings", "translation"),
        (["i18n", "help wanted"], "Spanish", "translation"),
        (["performance"], "Faster startup", "performance"),
        (["testing"], "Cover the CLI parser", "tests"),
        # No useful labels: fall back to the title.
        (["good first issue"], "Fix typo in README", "docs"),  # docs beats bug
        (["good first issue"], "Add unit tests for date utils", "tests"),
        (["help wanted"], "docs: explain the config file", "docs"),
        (["help wanted"], "feat(cli): add --json flag", "feature"),
        (["help wanted"], "chore: bump deps", "other"),
        # Maintainer labels beat a misleading title.
        (["documentation"], "Fix the broken example", "docs"),
    ],
)
def test_contribution_kind(labels, title, kind):
    assert contribution_kind(labels, title) == kind


def test_tracked_labels():
    assert has_tracked_label(["Help Wanted"])
    assert has_tracked_label(["bug"])
    assert not has_tracked_label(["enhancement", "question"])
