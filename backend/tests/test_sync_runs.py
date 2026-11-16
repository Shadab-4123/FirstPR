"""A sync_runs row must never stay "running" after its job is gone (see app/sync/runs.py)."""

import asyncio
import os
import signal
import time
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.db.models import SyncRun
from app.sync.runs import (
    INTERRUPTED,
    Deadline,
    failure_reason,
    mark_abandoned_runs,
    rotate_daily,
    stop_gracefully_on_sigterm,
)


def _add_run(db, *, status: str, hours_ago: float) -> int:
    started = datetime.now(UTC) - timedelta(hours=hours_ago)
    run = SyncRun(query="q", status=status, started_at=started)
    db.add(run)
    db.commit()
    return run.id


def test_only_old_running_rows_are_marked_abandoned(db_session_factory):
    with db_session_factory() as db:
        stuck = _add_run(db, status="running", hours_ago=9)  # the 2026-11-16 re-check
        busy = _add_run(db, status="running", hours_ago=1)  # a job that is really running
        done = _add_run(db, status="succeeded", hours_ago=9)
        assert mark_abandoned_runs(db) == 1
        rows = {r.id: r for r in db.execute(select(SyncRun)).scalars()}
    assert rows[stuck].status == "failed" and "abandoned" in (rows[stuck].error or "")
    assert rows[busy].status == "running"
    assert rows[done].status == "succeeded"


@pytest.mark.parametrize("exc", [KeyboardInterrupt(), asyncio.CancelledError()])
def test_being_stopped_reads_as_interrupted(exc):
    assert failure_reason(exc) == INTERRUPTED


def test_a_real_error_keeps_its_message():
    assert failure_reason(ValueError("bad page")) == "ValueError: bad page"


def test_deadline():
    now = [0.0]
    deadline = Deadline(2, clock=lambda: now[0])
    assert not deadline.passed()
    now[0] = 119
    assert not deadline.passed()
    now[0] = 120
    assert deadline.passed()
    assert not Deadline(None).passed()


def test_rotation_starts_somewhere_new_each_day_and_keeps_everything():
    langs = ["python", "go", "rust"]
    first = [rotate_daily(langs, date(2026, 11, d))[0] for d in (16, 17, 18)]
    assert sorted(first) == sorted(langs)  # three days, three different starts
    assert sorted(rotate_daily(langs, date(2026, 11, 17))) == sorted(langs)
    assert rotate_daily([], date(2026, 11, 17)) == []


def test_sigterm_becomes_an_interrupt_the_job_can_record():
    previous = signal.getsignal(signal.SIGTERM)
    try:
        stop_gracefully_on_sigterm()
        with pytest.raises(KeyboardInterrupt):
            os.kill(os.getpid(), signal.SIGTERM)
            for _ in range(100):  # the handler runs between bytecodes, right after kill()
                time.sleep(0.01)
    finally:
        signal.signal(signal.SIGTERM, previous)
