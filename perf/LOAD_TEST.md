# Load test: 50 users searching for 2 minutes

Script: [`load/search.js`](load/search.js) (k6). Runner: [`load/run.sh`](load/run.sh). Raw k6 summaries: [`load/results/`](load/results/).

## Result

Search p95 is **92 ms with the search indexes and 250 ms without them**, on the same 200,000 issues and the same traffic. The target is under 300 ms. No request failed in any run.

| Endpoint | p50, no indexes | p50, indexes | p95, no indexes | p95, indexes | p99, indexes |
| --- | ---: | ---: | ---: | ---: | ---: |
| `GET /issues` (search) | 121.3 ms | **42.6 ms** | 250.5 ms | **92.1 ms** | 111.0 ms |
| `GET /issues/{id}` | 5.1 ms | 4.9 ms | 11.5 ms | 8.0 ms | 10.4 ms |
| `GET /meta/filters` | 5.1 ms | 4.9 ms | 10.4 ms | 7.9 ms | 11.1 ms |
| `GET /stats` | 5.2 ms | 4.9 ms | 10.4 ms | 7.6 ms | 36.5 ms |
| `GET /auth/me` (signed out) | 5.8 ms | 5.5 ms | 11.3 ms | 8.8 ms | 11.5 ms |

About 4,100 requests per run, at 28–29 requests per second. Repeating the run with indexes gave search p95 98.2 ms ([`after-repeat.md`](load/results/after-repeat.md)), so expect ±10% between runs.

## Method

- **Traffic.** Each of the 50 virtual users repeats one newcomer visit, sending the same requests the React pages send:
  - the landing page: `/auth/me`, `/issues`, `/meta/filters` and `/stats` together;
  - a filtered search (language, sometimes level, difficulty or "updated in 30 days", one of four sorts), and page 2 three times in ten;
  - a text search half the time;
  - then it opens one issue from the results.

  Users pause 1–3 s between steps and 3–8 s on the issue page, so these are 50 people reading pages, not 50 loops firing as fast as they can.
- **Load shape.** The 50 users start over 15 s, then the load holds at 50 for 2 minutes. k6 thresholds fail the run if search or issue p95 goes over 300 ms, or if more than 1% of requests fail.
- **Data.** The 200,000 synthetic issues across 20,000 repos are the same data as [INDEXES.md](INDEXES.md). The live index (about 4,600 issues on 2026-11-17) is too small for the indexes to show much difference. Level and type were filled in with the app's own `reclassify_issues`, so the Explore filters return real matches.
- **"No indexes".** [`load/indexes.py`](load/indexes.py) runs only the index migration's own `downgrade()`, then its `upgrade()` to restore. `alembic downgrade` can't be used: it would also drop columns that later migrations added and the API reads.
- **Server.** One uvicorn process with INFO logs, as in production, pinned to one CPU core (`taskset -c 0`). k6 ran on the other 15 cores of the laptop (Intel i5-1240P). Postgres 16.15 was local and not limited.

Reproduce from the repo root, with `scripts/dev-db.sh` running and the bench DB seeded (`cd backend && python ../perf/bench_queries.py --seed`):

```bash
perf/load/run.sh after on        # indexes as in production
perf/load/run.sh before off      # same data, the six search indexes dropped
```

## What the numbers say

- **Most of a search's time goes to counting matches.** Timed on their own (`bench_queries.py`), the indexed list query takes 0.1–2.7 ms, but the `COUNT(*)` behind "N issues found" takes 12–33 ms. It has to visit every matching row, and on the landing page that is 140,000 rows. Without load, a single search takes about 30 ms end to end; under load, waiting for the one API core pushes the median to 43 ms. Capping the count, for example showing "1,000+ issues", is the next fix if search ever needs to be faster.
- **Broad text searches cost the most.** `q=typo` matches about a quarter of the synthetic issues and takes about 80 ms even with no load. Real issue text has far more varied words than these 13-word synthetic titles, so this overstates the real cost.
- **Cached and single-row endpoints don't change much.** The issue page is a primary-key lookup, and filters and stats are cached for 60 s. Their p95 stays under 12 ms with or without the search indexes.

## Limits

- **This measures the code and the database design, not the hosting.** Production runs on Render's free tier (a fraction of a CPU, and it sleeps when idle), and every query crosses from Singapore to Supabase in Mumbai. Live latency is higher, and a cold start takes about 50 s. These numbers show how the app behaves when data grows, not how much traffic the free tier can handle.
- **The database had the whole machine.** Only the API was limited to one core, so this doesn't test a small database server.
- **Signed-out traffic only.** For you and My issues need real GitHub sessions, so they aren't included.
