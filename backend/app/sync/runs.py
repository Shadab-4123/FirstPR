"""Bookkeeping shared by the sync and the re-check: each job is one row in sync_runs.

A row must never stay "running" after its process is gone, or /stats shows a job that
isn't happening (that's what a CI time limit did on 2026-11-16). Three layers:

1. Time budgets: each job stops on its own before CI's limit would stop it.
2. If CI stops it anyway (SIGINT, then SIGTERM), the job records "failed: interrupted".
3. A hard kill can't be caught, so every job first marks stale "running" rows as failed.
"""

import asyncio
import signal
import time
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import CursorResult, update
from sqlalchemy.orm import Session

from app.db.models import SyncRun

# Longer than any job can run in CI (the workflow's job limit is 150 minutes).
ABANDONED_AFTER = timedelta(hours=3)
INTERRUPTED = "interrupted: the job was stopped before it finished (e.g. a CI time limit)"


def mark_abandoned_runs(db: Session) -> int:
    """A run killed outright (machine off, SIGKILL) never records its end. Without this it
    would stay "running" forever and confuse /stats."""
    result: CursorResult = db.execute(  # type: ignore[assignment]
        update(SyncRun)
        .where(SyncRun.status == "running",
               SyncRun.started_at < datetime.now(UTC) - ABANDONED_AFTER)
        .values(status="failed", error="abandoned: process stopped before finishing")
    )
    db.commit()
    return result.rowcount


def failure_reason(exc: BaseException) -> str:
    """What to store in sync_runs.error: an interruption reads as one, not as a stack trace."""
    if isinstance(exc, KeyboardInterrupt | asyncio.CancelledError):
        return INTERRUPTED
    return f"{type(exc).__name__}: {exc}"[:2000]


def stop_gracefully_on_sigterm() -> None:
    """Treat SIGTERM like Ctrl+C, so the job's except/finally run and record the failure.
    CI sends SIGINT and then SIGTERM before killing a job that ran out of time."""
    signal.signal(signal.SIGTERM, signal.default_int_handler)


class Deadline:
    """A time budget. `None` minutes means no limit."""

    def __init__(self, minutes: float | None, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self._end = None if minutes is None else clock() + minutes * 60

    def passed(self) -> bool:
        return self._end is not None and self._clock() >= self._end


def rotate_daily(items: Sequence[str], today: date) -> list[str]:
    """Start from a different item each day, so a time budget doesn't always cut the same
    languages."""
    if not items:
        return []
    start = today.toordinal() % len(items)
    return [*items[start:], *items[:start]]
