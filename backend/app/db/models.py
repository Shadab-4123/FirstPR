"""Database tables.

Rule from the blueprint: store raw GitHub values next to computed scores, so
scores can be recomputed later without re-crawling GitHub.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Computed,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Repo(Base):
    __tablename__ = "repos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    github_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    full_name: Mapped[str] = mapped_column(String(200), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    html_url: Mapped[str] = mapped_column(String(300))
    language: Mapped[str | None] = mapped_column(String(60))
    topics: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    stars: Mapped[int] = mapped_column(Integer, default=0)
    forks: Mapped[int] = mapped_column(Integer, default=0)
    open_issues_count: Mapped[int] = mapped_column(Integer, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    pushed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Computed later (week 2); nullable until then so "unknown" != "bad".
    has_contributing: Mapped[bool | None] = mapped_column(Boolean)
    health_score: Mapped[int | None] = mapped_column(Integer)
    health_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Sync bookkeeping
    etag: Mapped[str | None] = mapped_column(String(200))
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    issues: Mapped[list["Issue"]] = relationship(back_populates="repo")

    __table_args__ = (
        Index("ix_repos_topics", "topics", postgresql_using="gin"),
        # Each index below was chosen with perf/bench_queries.py; see perf/INDEXES.md.
        Index("ix_repos_health", health_score.desc().nulls_last()),  # "best match" ranking
        Index("ix_repos_language_lower", func.lower(language)),  # language filter
        Index("ix_repos_stars", stars.desc()),  # sort=stars, min_stars
    )


class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    github_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    repo_id: Mapped[int] = mapped_column(ForeignKey("repos.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text)
    body_excerpt: Mapped[str] = mapped_column(Text, default="")
    html_url: Mapped[str] = mapped_column(String(300))
    labels: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    comments_count: Mapped[int] = mapped_column(Integer, default=0)
    author_association: Mapped[str | None] = mapped_column(String(40))
    state: Mapped[str] = mapped_column(String(10), default="open")

    # GitHub's own timestamps (not row timestamps).
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Availability: is someone already on it? Store *why* so the UI can explain.
    assignee_count: Mapped[int] = mapped_column(Integer, default=0)
    has_linked_pr: Mapped[bool] = mapped_column(Boolean, default=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    unavailable_reason: Mapped[str | None] = mapped_column(String(40))

    # Difficulty: signals are the raw inputs, so the score can be recomputed or explained.
    difficulty_signals: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    difficulty_score: Mapped[float | None] = mapped_column(Float)
    difficulty_label: Mapped[str | None] = mapped_column(String(10))
    est_hours: Mapped[float | None] = mapped_column(Float)

    # Sync bookkeeping
    etag: Mapped[str | None] = mapped_column(String(200))
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Full-text search over title (weight A) and body excerpt (weight B).
    search_vector: Mapped[Any] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('english', coalesce(title, '')), 'A') || "
            "setweight(to_tsvector('english', coalesce(body_excerpt, '')), 'B')",
            persisted=True,
        ),
    )

    repo: Mapped[Repo] = relationship(back_populates="issues")

    __table_args__ = (
        Index("ix_issues_labels", "labels", postgresql_using="gin"),
        Index("ix_issues_search_vector", "search_vector", postgresql_using="gin"),
        # Postgres doesn't index foreign keys by itself; every search joins on this.
        Index("ix_issues_repo_id", "repo_id"),
        # Partial: only open issues are ever listed, so closed ones stay out of the index.
        Index("ix_issues_open_updated", updated_at.desc(), postgresql_where=text("state = 'open'")),
        Index("ix_issues_open_created", created_at.desc(), postgresql_where=text("state = 'open'")),
    )


class SyncRun(Base):
    __tablename__ = "sync_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="running")  # running/succeeded/failed
    query: Mapped[str | None] = mapped_column(Text)
    issues_seen: Mapped[int] = mapped_column(Integer, default=0)
    issues_upserted: Mapped[int] = mapped_column(Integer, default=0)
    repos_upserted: Mapped[int] = mapped_column(Integer, default=0)
    github_requests: Mapped[int] = mapped_column(Integer, default=0)
    rate_limit_remaining: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
