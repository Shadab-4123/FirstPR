"""Benchmark the search queries the API really runs, with EXPLAIN ANALYZE.

Seeds a *separate* local database with synthetic data shaped like the real
index (scaled up, since at ~1k rows every plan is a sub-millisecond seq scan),
then times each query the search page can produce: the list query and the
count query, exactly as app/api/queries.py builds them.

Usage (from backend/, with scripts/dev-db.sh running):
    python ../perf/bench_queries.py --seed                     # once: 200k issues
    python ../perf/bench_queries.py --downgrade 0b72fc3abc0f --label before
    python ../perf/bench_queries.py --migrate head --label after

Never point BENCH_DATABASE_URL at Supabase: --seed drops the schema.
"""

import argparse
import os
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

BENCH_URL = os.environ.get(
    "BENCH_DATABASE_URL", "postgresql+psycopg://firstpr@localhost:5433/firstpr_bench"
)
os.environ["DATABASE_URL"] = BENCH_URL  # before importing app.*

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

from app.api.queries import IssueFilters, issue_count, issue_search  # noqa: E402

RUNS = 15

# What the search page sends, from the most common (landing page) down.
SCENARIOS: dict[str, dict] = {
    "landing page (best match)": {},
    "language = Python": {"language": "Python"},
    "text search 'parser error'": {"q": "parser error"},
    "easy + min 100 stars": {"difficulty": ["easy"], "min_stars": 100},
    "sort = newest": {"sort": "newest"},
    "sort = recently updated": {"sort": "updated"},
    "Python, updated in 30 days, by stars": {
        "language": "Python", "updated_within_days": 30, "sort": "stars"},
    "page 40 (deep pagination)": {"page": 40},
}

SEED_SQL = """
-- Repos: 10 languages, long-tailed stars, health spread like the real data.
INSERT INTO repos (github_id, full_name, html_url, language, topics, stars, forks,
                   open_issues_count, archived, pushed_at, health_score)
SELECT g, 'owner' || g || '/repo' || g, 'https://github.com/x/' || g,
       (ARRAY['Python','JavaScript','TypeScript','Go','Rust','Java','C++','C#','Ruby','PHP'])
         [1 + (g % 10)],
       '{}', floor(exp(random() * 10))::int, floor(exp(random() * 7))::int, 10, false,
       now() - random() * interval '400 days', 20 + floor(random() * 70)::int
FROM generate_series(1, :repos) g;

-- Issues: 90% open, ~80% of those available, titles built from a small vocabulary
-- so full-text search has realistic hit rates.
INSERT INTO issues (github_id, repo_id, number, title, body_excerpt, html_url, labels,
                    comments_count, state, created_at, updated_at, assignee_count,
                    has_linked_pr, is_available, difficulty_signals, difficulty_score,
                    difficulty_label)
SELECT g, 1 + (g % :repos), g,
       w[1 + (g % 13)] || ' ' || w[1 + ((g / 13) % 13)] || ' in ' || w[1 + ((g / 7) % 13)],
       'Steps to reproduce the ' || w[1 + ((g / 3) % 13)] || ' problem.',
       'https://github.com/x/issues/' || g,
       ARRAY['good first issue'] || (ARRAY['bug','documentation','enhancement','help wanted'])
         [1 + (g % 4)],
       g % 9,
       CASE WHEN random() < 0.9 THEN 'open' ELSE 'closed' END,
       now() - random() * interval '180 days',
       now() - random() * interval '180 days',
       0, false, random() < 0.8, '{}', random(),
       (ARRAY['easy','medium','hard'])[1 + (g % 3)]
FROM generate_series(1, :issues) g,
     (SELECT ARRAY['parser','error','docs','typo','test','cli','api','date','config',
                   'refactor','logging','timeout','unicode'] AS w) words;
ANALYZE;
"""


def compile_sql(stmt, dialect) -> tuple[str, dict]:
    """SQL + bound parameters, exactly as the app sends them through psycopg."""
    compiled = stmt.compile(dialect=dialect, compile_kwargs={"render_postcompile": True})
    return compiled.string, compiled.params


def explain_ms(conn, query: tuple[str, dict]) -> tuple[float, str]:
    """Execution time from EXPLAIN ANALYZE, plus the plan's top data-access nodes."""
    sql, params = query
    plan = conn.exec_driver_sql(f"EXPLAIN (ANALYZE, FORMAT JSON) {sql}", params).scalar()[0]
    nodes: list[str] = []

    def walk(node: dict) -> None:
        kind = node["Node Type"]
        if "Scan" in kind:
            target = node.get("Index Name") or node.get("Relation Name", "")
            nodes.append(f"{kind} ({target})")
        for child in node.get("Plans", []):
            walk(child)

    walk(plan["Plan"])
    return plan["Execution Time"], ", ".join(dict.fromkeys(nodes))


def seed(engine, repos: int, issues: int) -> None:
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    migrate(engine)
    with engine.begin() as conn:
        sql = SEED_SQL.replace(":repos", str(repos)).replace(":issues", str(issues))
        conn.execute(text(sql))
    print(f"seeded {repos:,} repos and {issues:,} issues")


def migrate(engine, revision: str = "head", *, down: bool = False) -> None:
    cfg = Config(str(Path(__file__).resolve().parents[1] / "backend" / "alembic.ini"))
    cfg.attributes["database_url"] = BENCH_URL
    (command.downgrade if down else command.upgrade)(cfg, revision)


def bench(engine, label: str) -> None:
    print(f"\n### {label}\n")
    print("| Scenario | list p50 | list p95 | count p50 | Plan (list query) |")
    print("| --- | ---: | ---: | ---: | --- |")
    with engine.connect() as conn:
        for name, params in SCENARIOS.items():
            f = IssueFilters(**params)
            list_sql = compile_sql(issue_search(f), engine.dialect)
            count_sql = compile_sql(issue_count(f), engine.dialect)
            explain_ms(conn, list_sql)  # warm the cache once; we measure warm queries
            runs = [explain_ms(conn, list_sql) for _ in range(RUNS)]
            counts = [explain_ms(conn, count_sql)[0] for _ in range(RUNS)]
            times = sorted(t for t, _ in runs)
            p95 = times[int(len(times) * 0.95) - 1]
            print(f"| {name} | {statistics.median(times):.1f} ms | {p95:.1f} ms | "
                  f"{statistics.median(counts):.1f} ms | {runs[0][1]} |")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", action="store_true", help="drop, migrate and fill the bench DB")
    parser.add_argument("--repos", type=int, default=20_000)
    parser.add_argument("--issues", type=int, default=200_000)
    parser.add_argument("--migrate", metavar="REV", help="alembic upgrade to REV before timing")
    parser.add_argument("--downgrade", metavar="REV", help="alembic downgrade to REV before timing")
    parser.add_argument("--label", default="results")
    args = parser.parse_args()

    if "supabase" in BENCH_URL:
        sys.exit("refusing to run against Supabase")
    engine = create_engine(BENCH_URL)
    if args.seed:
        seed(engine, args.repos, args.issues)
    if args.migrate or args.downgrade:
        migrate(engine, args.downgrade or args.migrate, down=bool(args.downgrade))
        with engine.begin() as conn:
            conn.execute(text("ANALYZE"))
    bench(engine, args.label)


if __name__ == "__main__":
    main()
