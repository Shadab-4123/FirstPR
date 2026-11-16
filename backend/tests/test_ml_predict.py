"""Serving the difficulty model: the real model file, and the sync's rescore step."""

import copy

import pytest
from sqlalchemy import select

pytest.importorskip("sklearn")  # needs the `ml` extras, which CI installs

from app.db.models import Issue  # noqa: E402
from app.ml.dataset import feature_row  # noqa: E402
from app.ml.predict import HIDDEN_FROM_REASONS, METHOD, PHRASES, DifficultyModel  # noqa: E402
from app.scoring.difficulty import extract_signals  # noqa: E402
from app.sync.mapping import map_issue, map_repo  # noqa: E402
from app.sync.scoring import rescore_issues  # noqa: E402
from app.sync.upsert import upsert_issue, upsert_repo  # noqa: E402
from tests.fixture_repo import REPO_STARS


@pytest.fixture(scope="module")
def model():
    loaded = DifficultyModel.load()
    assert loaded is not None, "ml/difficulty_model.joblib should be in the repo"
    return loaded


def row(body="Fix the typo in `README.md`", labels=("good first issue", "documentation")):
    signals = extract_signals(body, list(labels), 0, title="Fix typo")
    return feature_row(signals, author_association="MEMBER", stars=5000, forks=900,
                       language="Python")


def test_predictions_are_well_formed(model):
    (p,) = model.predict([row()])
    assert p.label in {"easy", "medium", "hard"}
    assert 1 / 3 <= p.confidence <= 1  # top of three probabilities
    assert p.hours >= 0


def test_reasons_are_plain_language_and_about_the_issue(model):
    shown = {phrase for pair in PHRASES.values() for phrase in pair if phrase}
    big = row(body="- [ ] step\n" * 8 + "`a()` `b()` `c()` " * 10,
              labels=("good first issue", "enhancement", "ui", "api", "core"))
    for p in model.predict([row(), big]):
        assert set(p.reasons) <= shown  # never a raw feature name
        assert len(p.reasons) <= 3
    assert not any(name in PHRASES for name in HIDDEN_FROM_REASONS)


def test_docs_typo_issue_scores_easier_than_a_big_checklist(model):
    easy, big = model.predict([
        row(),
        row(body="- [ ] step\n" * 8 + "`a()` `b()` " * 10,
            labels=("good first issue", "enhancement", "ui", "api", "core")),
    ])
    order = {"easy": 0, "medium": 1, "hard": 2}
    assert order[easy.label] <= order[big.label]


@pytest.fixture
def stored(db_session_factory, fixture):
    def add(**overrides):
        item = {**copy.deepcopy(fixture("search_issues_python.json")["items"][0]), **overrides}
        with db_session_factory() as db:
            repo_id = upsert_repo(db, map_repo(fixture("repo.json")), etag=None)
            issue_id = upsert_issue(db, map_issue(item, repo_id, repo_stars=REPO_STARS))
            db.commit()
        return issue_id
    return add


def _issue(factory, issue_id):
    with factory() as db:
        return db.execute(select(Issue).where(Issue.id == issue_id)).scalar_one()


def test_rescore_uses_the_model_and_sets_level(db_session_factory, stored, model):
    issue_id = stored()
    with db_session_factory() as db:
        counts = rescore_issues(db, model)
    issue = _issue(db_session_factory, issue_id)
    assert counts["model"] == 1 and issue.difficulty_method == METHOD
    assert issue.difficulty_confidence is not None and issue.level is not None


def test_old_signals_with_a_complete_body_are_recomputed(db_session_factory, stored, model):
    issue_id = stored(body="Short body.")
    with db_session_factory() as db:  # simulate a row saved before the new signal keys
        db.query(Issue).filter(Issue.id == issue_id).update(
            {"difficulty_signals": {"body_length": 11, "comments": 0}})
        db.commit()
        rescore_issues(db, model)
    issue = _issue(db_session_factory, issue_id)
    assert issue.difficulty_method == METHOD and "inline_code" in issue.difficulty_signals


def test_old_signals_with_a_cut_body_fall_back_to_the_heuristic(db_session_factory, stored, model):
    issue_id = stored()
    with db_session_factory() as db:  # only 600 of 3,000 chars stored, old keys only
        db.query(Issue).filter(Issue.id == issue_id).update(
            {"body_excerpt": "x" * 600, "difficulty_signals": {"body_length": 3000}})
        db.commit()
        counts = rescore_issues(db, model)
    issue = _issue(db_session_factory, issue_id)
    assert counts["heuristic"] == 1 and issue.difficulty_method == "baseline_heuristic"
    assert issue.difficulty_confidence is None


def test_without_a_model_everything_uses_the_heuristic(db_session_factory, stored):
    issue_id = stored()
    with db_session_factory() as db:
        rescore_issues(db, None)
    assert _issue(db_session_factory, issue_id).difficulty_method == "baseline_heuristic"


def test_api_reports_model_method_confidence_and_reasons(db_session_factory, stored, model):
    from fastapi.testclient import TestClient

    from app.db.session import get_db
    from app.main import app

    issue_id = stored()
    with db_session_factory() as db:
        rescore_issues(db, model)

    def override():
        with db_session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override
    try:
        difficulty = TestClient(app).get(f"/api/v1/issues/{issue_id}").json()[
            "score_breakdown"]["difficulty"]
    finally:
        app.dependency_overrides.clear()
    assert difficulty["method"] == METHOD and difficulty["score"] is None
    assert 0 < difficulty["confidence"] <= 1
    assert difficulty["reasons"] == _issue(db_session_factory, issue_id).difficulty_reasons
