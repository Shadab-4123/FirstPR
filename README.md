# FirstPR

**Find open-source issues you can actually fix: open, unclaimed, in active repos, with an honest difficulty estimate.**

**Live demo:** https://firstpr-web.onrender.com · **API docs:** https://firstpr-api-5lk3.onrender.com/docs

> Hosted on Render's free tier: if the site has been idle, the first search can take ~50 s while the API wakes up.

<!-- TODO(you): record a ~15s GIF (search → filter → open an issue) and save it as docs/demo.gif, then uncomment:
![FirstPR demo](docs/demo.gif)
-->

---

## Why

Sites like goodfirstissue.dev list issues that carry a `good first issue` label. In practice, many of those issues have already been claimed, sit in repos nobody maintains, or turn out to be far harder than the label suggests. FirstPR keeps its own synced index of these issues and filters out the ones that are no longer available. It also scores each issue so you can see why it was ranked where it is.

## Status

This is a work in progress, built on a four-week plan (see [`docs/blueprint.md`](docs/blueprint.md)).

| Area | State |
| --- | --- |
| Postgres schema + Alembic migrations (`repos`, `issues`, `sync_runs`) | ✅ done |
| GitHub client: search, repo fetch, rate-limit handling, ETags, retries | ✅ done |
| Sync worker: date-window splitting past GitHub's 1,000-result cap, idempotent upserts | ✅ done |
| Difficulty model: trained on 3,291 past issues, beats the heuristic baseline ([evaluation](ml/EVAL.md)) | ✅ done |
| Explore by level (new / some experience / experienced) and type, plus a first-PR guide | ✅ done |
| Re-check job: hides closed, assigned, claimed ("I'll take this"), linked-PR and de-labelled issues | ✅ done |
| Repo health score (explainable 0–100, used for "best match" ranking) | ✅ done |
| Search indexes chosen with `EXPLAIN ANALYZE` ([before/after](perf/INDEXES.md)) | ✅ done |
| REST API: `/issues`, `/issues/{id}`, `/meta/filters`, `/stats`, `/health` | ✅ done |
| Supabase Postgres (Mumbai) with Row Level Security on all tables | ✅ done |
| Real data sync: 1,100+ open issues across 8+ languages in Supabase | ✅ done |
| React frontend: search page with URL-synced filters | ✅ first version |
| Dockerfiles + Docker Compose (tested locally), Render Blueprint | ✅ done |
| Live deployment on Render (API + static site, Supabase DB) | ✅ done |
| CI (lint, types, tests, Docker build) + daily sync workflow | ✅ done |
| GitHub OAuth, saved issues, skill-based ranking | ⏳ planned |

## Architecture

<!-- TODO(you): add a diagram image (docs/architecture.png) once the frontend and deploy exist. -->

```
GitHub REST API ──► sync worker (app/sync) ──► PostgreSQL ◄── FastAPI (app/api) ◄── React UI
                     rate limits, ETags,        indexed,          /api/v1/*
                     retries, upserts           full-text search
```

Search requests are answered from our own Postgres, never by calling GitHub live. That keeps search fast, means we never hit GitHub's rate limits while serving users, and lets us filter on things GitHub search can't, like availability and difficulty.

## Tech stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, httpx, Pydantic
- **Database:** PostgreSQL on Supabase (full-text search, array labels); local Postgres for tests
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, TanStack Query, types generated from the API's OpenAPI schema
- **ML:** scikit-learn (logistic regression), pandas; time-based train/test split
- **CI/CD (planned):** GitHub Actions

## Local setup

Prerequisites: Python 3.12+, Node 22 and PostgreSQL 16 binaries installed locally. Docker is optional (see below).

```bash
# 1. Clone
git clone https://github.com/TODO-your-username/FirstPR.git   # TODO(you): your GitHub username
cd FirstPR

# 2. Start a project-local Postgres on port 5433 (creates firstpr + firstpr_test DBs)
scripts/dev-db.sh start

# 3. Backend environment
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# 4. Config: copy the example and add a GitHub token (see below)
cp .env.example .env

# 5. Create the tables
alembic upgrade head

# 6. Load sample data (~200 Python issues)
python -m app.sync.run --language python --limit 200

# 7. Run the API → http://localhost:8000/docs
uvicorn app.main:app --reload

# 8. In a second terminal: the frontend → http://localhost:5173
cd frontend
npm install
npm run dev
```

### Or: everything in Docker

With Docker installed, one command runs Postgres, the API and the frontend. It uses its own database, not Supabase.

```bash
cp backend/.env.example backend/.env   # add GITHUB_TOKEN
docker compose up --build              # app → http://localhost:8080, API → http://localhost:8000/docs
docker compose run --rm sync           # load ~200 Python issues into the Docker DB
```

### Deploying

[`render.yaml`](render.yaml) is a Render Blueprint: the API runs as a Docker web service and the frontend as a static site that forwards `/api/*` to it. The database stays on Supabase. In Render, go to New → Blueprint, pick this repo, and enter `DATABASE_URL` and `GITHUB_TOKEN` when asked. Run migrations against Supabase from your machine (`alembic upgrade head`) before deploying a schema change.

**Database:** `DATABASE_URL` in `backend/.env` points at Supabase. Use the *Session pooler* connection string (IPv4, port 5432), with the `postgresql+psycopg://` prefix and `?sslmode=require`. URL-encode special characters in the password. Tests always use the local `firstpr_test` database from step 2, never Supabase.

**API types:** after changing a backend response model, regenerate the frontend types:

```bash
cd backend && python -c "import json; from app.main import app; print(json.dumps(app.openapi(), indent=2))" > ../frontend/openapi.json
cd ../frontend && npm run gen:api
```

**GitHub token:** create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens) with public-repository read-only access. It needs no extra permissions. Put it in `backend/.env` as `GITHUB_TOKEN=...`. Without a token the sync still runs, but GitHub allows only 60 requests per hour.

### Running tests

```bash
cd backend && source .venv/bin/activate
pytest            # GitHub calls are replayed from recorded fixtures; tests use the firstpr_test DB
ruff check .
```

## API

All endpoints live under `/api/v1`. Interactive docs are at `/docs` when the API is running.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/issues` | Search and filter issues (paginated) |
| GET | `/issues/{id}` | One issue with its score breakdown |
| GET | `/meta/filters` | Languages, labels, difficulties for the filter UI |
| GET | `/stats` | Counts and the last successful sync |
| GET | `/health` | Liveness and database check |

`GET /issues` query parameters: `language`, `labels`, `min_stars`, `difficulty` (easy / medium / hard), `available_only` (default `true`), `updated_within_days`, `q` (full-text search), `sort` (relevance / newest / updated / stars), `page`, `page_size` (max 50).

Errors always use the same shape: `{ "error": { "code": "...", "message": "..." } }`.

## Results

<!-- TODO(you): fill only with numbers you measured yourself (sync_runs table, perf/, ml/EVAL.md). -->

| Metric | Value |
| --- | --- |
| Open issues indexed | TODO |
| Repos indexed | TODO |
| Search p95 latency (before → after indexes) | TODO ms → TODO ms |
| Difficulty model accuracy vs heuristic baseline (658 held-out issues) | 40.6% vs 30.4% |
| Severe errors (easy↔hard), model vs heuristic | 14.4% vs 22.5% |
| Backend test coverage | TODO % |

## Design decisions

<!-- TODO(you): 5–7 short entries. Keep a running log in docs/decisions.md and copy the best ones here. -->

- **Serve from our own database, not live GitHub calls.** Search stays fast and predictable, and rate limits only affect the background sync, never users.
- **Split search queries into date windows.** GitHub search returns at most 1,000 results per query, so the sync halves a window's date range until each piece fits under the cap.
- **Row Level Security with no policies on every table.** Supabase publishes the `public` schema through an API anyone can call with the public key. With RLS on and no policies, that API returns nothing. Our backend connects as the table owner, so it isn't affected.
- **Every write is an upsert, and each page is committed separately.** A crashed sync can simply be run again, and it loses at most one page of work.
- **ETags on repo fetches.** If a repo hasn't changed, GitHub replies `304 Not Modified`, and that reply doesn't count against the rate limit.
- TODO(you): add more as you make them.

## What broke and how I fixed it

<!-- TODO(you): 2–3 real stories from building this. Interviewers love these. Format: what happened → how you found it → the fix. -->

_TODO_

## Known limitations and future work

- The difficulty score is a hand-written heuristic for now. A trained model is planned (Week 3).
- No user accounts yet. GitHub OAuth, skill-based ranking and saved issues are planned.
- TODO(you): add anything you discover.

## Author

<!-- TODO(you): your links -->
Built by **Shadab Raza** · GitHub: TODO · LinkedIn: TODO · Write-up: TODO

## License

<!-- TODO(you): pick one (MIT is common for portfolio projects) and add a LICENSE file. -->
TODO
