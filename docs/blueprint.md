# Open Source Contribution Finder – Project Blueprint

Nov 11, 2026 · @Shadab Raza

## 1. Overview and goals

**FirstPR** (working name) helps developers find open-source issues they can actually fix: matched to their skills, in healthy repos, still unclaimed, with a data-backed difficulty and time estimate.

The project is built to be a hiring signal, not a demo. Similar finders exist (goodfirstissue.dev, Up For Grabs), so the value is in the engineering underneath: a synced issue index, measured scoring models, and production habits (tests, CI/CD, monitoring).

**Success criteria (what "done" means):**

- Live URL with real data: 5,000+ open good-first-issues indexed from 1,000+ repos.
- Search results return in under 300 ms (p95), served from your own database, not live GitHub calls.
- A difficulty estimator that beats a simple heuristic baseline on held-out data, with the numbers in the README.
- CI runs tests on every push; merges to main deploy automatically.
- README with architecture diagram, demo GIF, design decisions and an honest "what broke and how I fixed it" section.

**Who uses it:** a student or junior developer who wants a first open-source contribution and doesn't know where to start.

**Non-goals:** a general GitHub search engine, code review tooling, or anything needing paid infrastructure.

## 2. What makes it hireable

Hiring guides for 2026 agree on a few signals: deployed projects, production habits (failure handling, data modeling, shipping), and measured results instead of claims. Each row below maps a signal to the part of this project that proves it.

| Recruiter signal | Where this project shows it |
| --- | --- |
| Handles real-world constraints | Background sync that respects GitHub rate limits, with retries and backoff |
| Data modeling and performance | Indexed Postgres store; before/after latency numbers from load tests |
| Measured quality, not claims | Difficulty model evaluated against a baseline on held-out historical data |
| Product judgment | Repo health score and "still available?" detection, the things users actually need |
| Production habits | Docker, CI/CD, tests, structured logs, error monitoring |
| Security basics | GitHub OAuth, token encryption, input validation, no secrets in the repo |
| Communication | README with diagram, design-decision log, short write-up |

The weak version of this idea is "call GitHub's API and filter." The strong version is everything in the right-hand column. Build toward the strong version.

## 3. Features

Build in this order. Each tier is shippable on its own, so you always have something to show.

**MVP (Week 1–2): useful without any AI**

- Search issues by language, topic, label, repo stars, last activity and assignee status.
- Issue card: title, repo, labels, comment count, age, link that opens the issue on GitHub.
- Sort by relevance, newest, or repo health.
- Pagination and fast filtering from the local database.

**Differentiators (Week 2–3): what makes it stand out**

- **Repo health score** (0–100): recent commits, PR merge rate, maintainer response time, CONTRIBUTING.md present.
- **Availability check**: hides issues that are assigned, have a linked open PR, or have an "I'll take this" comment.
- **Difficulty and time estimate**: model-based (see section 7), shown as Easy / Medium / Hard with a confidence note.
- **Skill matching**: rank issues by overlap with the user's languages and topics.

**Personalization (Week 3)**

- Sign in with GitHub; skills inferred from the user's own repos, editable by hand.
- Save issues and track status: Saved → Claimed → PR opened → Merged.

**Stretch goals (only after everything above is deployed)**

- Weekly email digest of new matching issues.
- LLM-written plain-English summary of what an issue needs ("you'd change the date parser in utils/"), clearly labeled as AI-generated.
- Browser extension or CLI (`firstpr search --lang python`).
- Public stats page (issues indexed, sync freshness, model accuracy).

## 4. Architecture and tech stack

&#91;embedded content: system architecture · 6 components\]

The browser only talks to your API, and the API only reads your database. The sync worker (highlighted) is the single component that calls GitHub, writes to Postgres and runs the difficulty model.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind, TanStack Query | Builds on your FirstHive skills; TypeScript catches API drift |
| API | FastAPI (Flask is an acceptable swap) | Typed models, automatic OpenAPI docs, async for GitHub calls |
| Database | PostgreSQL (Supabase or Neon free tier) | Arrays, GIN indexes and JSONB suit labels, topics and features |
| ORM and migrations | SQLAlchemy, Alembic | Versioned schema changes you can show in the repo |
| GitHub client | httpx | Async requests, easy to mock with recorded fixtures |
| Scheduling | APScheduler or a cron-triggered script | Free-tier friendly; upgrade to Celery + Redis only if needed |
| ML | scikit-learn, pandas | Enough for a defensible model and a clean evaluation |
| Testing | pytest, Vitest, Playwright | One tool per layer |
| DevOps | Docker, GitHub Actions | Reproducible runs and automatic deploys |
| Hosting | Vercel/Netlify (web), Render/Railway (API + worker) | Free tiers cover this project; check current limits |
| Monitoring | Sentry, structured logs | Production-style visibility on a student budget |

## 5. Data model

Seven tables cover everything. Store raw GitHub values next to your computed scores so you can recompute scores later without re-crawling.

| Table | Key columns | Notes |
| --- | --- | --- |
| `repos` | id, github\_id (unique), full\_name, language, topics (text\[\]), stars, pushed\_at, has\_contributing, health\_score, health\_updated\_at | Index on language, stars, health\_score; GIN index on topics |
| `issues` | id, github\_id (unique), repo\_id, number, title, body\_excerpt, labels (text\[\]), comments\_count, created\_at, updated\_at, state, assignee\_count, has\_linked\_pr, difficulty\_score, difficulty\_label, est\_hours | Index on (state, repo\_id), updated\_at; GIN on labels |
| `users` | id, github\_id, login, access\_token\_encrypted, created\_at | Token encrypted at rest; never logged |
| `user_skills` | user\_id, skill, weight, source (inferred / manual) | Unique on (user\_id, skill) |
| `saved_issues` | user\_id, issue\_id, status (saved / claimed / pr\_opened / merged), updated\_at | Unique on (user\_id, issue\_id) |
| `sync_runs` | id, started\_at, finished\_at, issues\_seen, issues\_upserted, rate\_limit\_remaining, error | Powers the stats page and debugging |
| `training_examples` | issue\_github\_id, features (jsonb), pr\_merged\_hours, files\_changed, lines\_changed | Historical closed issues used to train and evaluate the estimator |

**Design rules**

- Upsert on `github_id` so re-syncing never creates duplicates.
- Add indexes only for filters the UI actually uses, then verify with `EXPLAIN ANALYZE`. Keep the before/after timings for the README.
- Use migrations (Alembic) from day one; never edit the schema by hand.

## 6. Ingestion pipeline

A scheduled worker copies GitHub data into your database; users never trigger GitHub calls directly. This is the most important engineering decision in the project.

**Why:** GitHub's search API allows only about 30 requests per minute and returns at most 1,000 results per query. A live-proxy app would hit those limits with a handful of users. Verify current limits in GitHub's docs before you code against them.

**Pipeline steps**

1. **Discover:** run searches like `label:"good first issue" state:open is:issue language:python`. To get past the 1,000-result cap, split queries by language and by created-date window.
2. **Fetch details:** for each new or updated issue, fetch repo metadata (stars, language, topics, pushed\_at) once per repo and cache it.
3. **Enrich:** check assignees and timeline events for linked PRs; check for CONTRIBUTING.md; compute repo health.
4. **Score:** run the difficulty model and store the result on the issue row.
5. **Upsert** everything on `github_id`; log a `sync_runs` row.

**Rate-limit and failure handling (the part to show off)**

- Read `X-RateLimit-Remaining` and `X-RateLimit-Reset` on every response; sleep until reset when near zero.
- Use ETags / conditional requests so unchanged resources return 304 and cost nothing against the limit.
- Retry transient errors (5xx, timeouts) with exponential backoff and jitter; stop after N tries and record the error.
- Make every step idempotent so a crashed run can simply be restarted.
- Re-check open issues on a schedule and mark closed or assigned ones, so the index never shows stale data.

**Scheduling:** start with APScheduler or a cron-triggered script (free-tier friendly). Move to Celery + Redis only if you need parallel workers; don't add it just to look impressive.

**Test it:** record real GitHub responses as fixtures and mock the HTTP layer, so tests run offline and never burn your rate limit.

## 7. Scoring and the difficulty estimator

Three scores drive the product. Keep each one simple, explainable and tested.

### Repo health score (0–100)

A weighted sum of normalized signals. Start with these and tune by eye on repos you know.

| Signal | Why it matters | Starting weight |
| --- | --- | --- |
| Days since last push | Dead repos waste contributors' time | 30 |
| PR merge rate, last 90 days | Shows maintainers actually merge outside PRs | 25 |
| Median time to first maintainer response | Fast replies mean a better first experience | 25 |
| CONTRIBUTING.md present | Signals a welcoming project | 10 |
| Open good-first-issues left unanswered | Many ignored issues means a neglected backlog | 10 |

### Availability check

An issue is "available" when it is open, has no assignee, has no linked open PR (from timeline events), and no recent comment matching patterns like "I'll take this" or "working on it". Store the reason it was filtered so the UI can explain it.

### Difficulty and time estimator

The goal is a prediction you can defend with numbers, not a made-up label.

**Ground truth:** use closed good-first-issues that were fixed by a merged PR. For each one you can measure files changed, lines changed and hours from issue open to PR merge. Collect a few thousand into `training_examples`.

**Features (from the issue and repo at the time it was open):** body length, number of code blocks, number of file paths or function names mentioned, comment count, label set, repo size and language, age of issue, whether a maintainer commented with guidance.

**Models, in order:**

1. **Baseline heuristic:** a hand-written formula (for example, more comments and longer body means harder).
2. **Classical ML:** logistic regression or gradient boosting (scikit-learn) predicting Easy / Medium / Hard bands defined from lines changed and files changed.
3. **Optional LLM summary:** a short "what you'd need to change" blurb, shown separately and labeled as AI-generated.

**Evaluation plan:**

- Split data by time (train on older issues, test on newer) so you don't leak the future.
- Report accuracy and a confusion matrix for the bands, and mean absolute error for hours.
- Compare every model against the baseline in a results table in the README.
- Show a confidence note in the UI ("low confidence: few similar issues"). If the model doesn't beat the baseline, say so and ship the baseline; an honest result is still a strong interview story.

**Keep in a repo folder `ml/`:** the data-collection script, training notebook or script, saved model file, and an `EVAL.md` with the final numbers.

## 8. API design

A small REST API under `/api/v1`, documented automatically by FastAPI's OpenAPI page (link it in the README).

| Method and path | Purpose | Auth |
| --- | --- | --- |
| `GET /issues` | Search and filter issues, paginated | Public |
| `GET /issues/{id}` | Issue detail with score breakdown | Public |
| `GET /repos/{id}` | Repo detail with health score breakdown | Public |
| `GET /meta/filters` | Available languages, labels, topics for the UI | Public |
| `GET /stats` | Issues indexed, last sync time, model accuracy | Public |
| `GET /auth/github/login`, `GET /auth/github/callback` | OAuth flow | Public |
| `GET /me`, `PUT /me/skills` | Profile and skills | User |
| `GET /me/saved`, `PUT /me/saved/{issue_id}` | Saved issues and status changes | User |
| `GET /health` | Liveness and DB check for the host | Public |

**`GET /issues` query parameters:** `language`, `topics`, `labels`, `min_stars`, `min_health`, `difficulty` (easy / medium / hard), `available_only` (default true), `updated_within_days`, `q` (text), `sort` (relevance / newest / health), `page`, `page_size` (max 50). Use cursor or keyset pagination if offset pagination gets slow.

**Conventions**

- Validate all input with Pydantic models; return one consistent error shape: `{ "error": { "code", "message" } }`.
- Return a `score_breakdown` object on issues so the UI can explain why something ranks high.
- Add response caching (short TTL) for `/meta/filters` and `/stats`.
- Rate-limit public endpoints per IP so your own API can't be abused.
- Version the API path so future changes don't break the frontend.

## 9. Frontend

React + TypeScript (Vite) + Tailwind, building on what you already use at FirstHive. Keep the UI plain and fast; recruiters judge usability in seconds.

**Pages**

- **Home / Search:** filter sidebar (language, difficulty, labels, min health, available only), results list, sort dropdown, URL-synced filters so searches are shareable.
- **Issue detail:** description excerpt, score breakdown ("why this ranks high"), repo health card, big "Open on GitHub" button.
- **Saved:** the user's saved issues grouped by status.
- **Profile:** skills (inferred and editable).
- **Stats:** issues indexed, last sync, estimator accuracy vs baseline. Great for recruiters to see numbers at a glance.

**Technical choices**

- Data fetching and caching with TanStack Query; keep filter state in the URL, not in global state.
- Typed API client generated from the backend's OpenAPI schema, so frontend and backend can't drift.
- Debounced text search, skeleton loaders, and an empty state that suggests loosening filters.
- Show an error state with a retry button for failed requests.
- Accessibility basics: keyboard navigation, labels on inputs, sufficient color contrast.
- Responsive layout; many recruiters open links on a phone.

**Components to build first:** `FilterPanel`, `IssueCard`, `ScoreBadge`, `HealthMeter`, `Pagination`, `EmptyState`, `ErrorState`.

## 10. Auth and personalization

Use GitHub OAuth only; no passwords to store.

**Flow**

1. User clicks "Sign in with GitHub"; backend redirects with a random `state` value (CSRF protection).
2. GitHub redirects back with a code; backend verifies `state` and exchanges the code for an access token.
3. Request the minimum scopes needed (read-only public data). Don't ask for repo write access.
4. Backend creates or updates the user, encrypts the token at rest, and sets an HTTP-only, Secure, SameSite session cookie.

**Skill inference**

- Fetch the user's public repos and tally languages and topics, weighted by recent activity.
- Store results in `user_skills` with `source = inferred`; let the user add, remove or re-weight skills.
- Relevance score = overlap between the user's skills and the repo's language/topics, plus a small bonus for issue freshness.

**Security checklist**

- [ ] Secrets only in environment variables; `.env` in `.gitignore`, `.env.example` committed.
- [ ] Tokens encrypted at rest and never written to logs.
- [ ] CORS limited to your frontend origin.
- [ ] Input validated server-side; parameterized queries only (SQLAlchemy).
- [ ] Session cookie flags set; logout clears the session.
- [ ] Dependency scanning on (Dependabot).

## 11. Testing, CI/CD, deployment and monitoring

This section turns a working app into a professional one. Budget a full week for it.

**Testing**

| Layer | Tool | What to cover |
| --- | --- | --- |
| Backend unit | pytest | Scoring functions, availability rules, query builders |
| Backend integration | pytest + test Postgres (Docker) | API endpoints with real database, upsert idempotency |
| GitHub client | pytest + recorded fixtures | Rate-limit handling, retries, pagination; no live calls |
| ML | pytest | Feature extraction is deterministic; model file loads; metrics above a threshold |
| Frontend | Vitest + React Testing Library | FilterPanel, IssueCard, error and empty states |
| End to end | Playwright (1–2 flows) | Search with filters, open issue detail |

Target 70–80% backend coverage on the logic that matters; don't chase 100%.

**CI/CD (GitHub Actions)**

- On every pull request: lint (ruff, eslint), type check (mypy or pyright, tsc), tests.
- On merge to main: build Docker image, run migrations, deploy.
- Scheduled workflow (or host cron) runs the sync worker.

**Deployment (free-tier friendly)**

- Frontend: Vercel or Netlify.
- Backend + worker: Render or Railway, using a Dockerfile.
- Database: Supabase or Neon Postgres.
- Optional Redis cache: Upstash.
- Confirm current free-tier limits before committing to a host.

**Monitoring**

- Structured JSON logs with request IDs.
- Sentry (free tier) for backend and frontend errors.
- `/health` endpoint plus an uptime check.
- The `sync_runs` table and `/stats` page show data freshness.

**Performance targets to measure and record**

- Search p95 latency under 300 ms at your test load; record numbers before and after adding indexes.
- Sync run time and issues processed per minute.
- Load test with k6 or Locust (for example, 50 concurrent users for 2 minutes). Save the script and the results in `/perf`.

## 12. Four-week plan

Assumes 2–3 focused hours on weekdays and more on weekends. If a week slips, cut stretch goals, never testing or deployment. Tick items off as you go.

### Week 1: data in, basic app out

- [ ] Create repo, folder structure, Docker Compose (API + Postgres), `.env.example`
- [ ] Register a GitHub OAuth app and create a personal access token for the crawler
- [ ] Write the Alembic migration for `repos`, `issues`, `sync_runs`
- [ ] GitHub client: search, fetch repo, rate-limit header handling, ETags
- [ ] Sync job v1: crawl one language, upsert issues and repos, log a sync run
- [ ] `GET /issues` with language, label, min\_stars, pagination
- [ ] React app: search page, filter panel, issue cards, link out to GitHub
- [ ] Deploy a first version (even if rough) so deployment is never a last-week surprise

**Done when:** you can search 1,000+ real issues on a live URL.

### Week 2: make the data trustworthy

- [ ] Split discovery queries to get past the 1,000-result cap; cover top 8–10 languages
- [ ] Retry with backoff; idempotent steps; re-check open issues and mark closed ones
- [ ] Availability check (assignee, linked PR, "I'll take this" comments)
- [ ] Repo health score with unit tests
- [ ] Add indexes guided by `EXPLAIN ANALYZE`; record before/after timings
- [ ] Recorded-fixture tests for the GitHub client
- [ ] GitHub Actions: lint, type check, tests on every PR

**Done when:** results are fresh, filtered for availability, and CI is green.

### Week 3: the differentiator

- [ ] Collect `training_examples` from closed issues with merged PRs
- [ ] Baseline heuristic, then scikit-learn model; time-based train/test split
- [ ] Write `ml/EVAL.md` with accuracy, confusion matrix, hours MAE and baseline comparison
- [ ] Store difficulty label and hours estimate on issues; show them in the UI with a confidence note
- [ ] GitHub OAuth login, encrypted tokens, session cookie
- [ ] Skill inference and relevance ranking
- [ ] Saved issues with status tracking
- [ ] Stats page

**Done when:** a signed-in user sees ranked issues with difficulty estimates, and your README can quote model numbers.

### Week 4: polish and proof

- [ ] Frontend tests and one Playwright flow
- [ ] Automatic deploy on merge; scheduled sync running in production
- [ ] Sentry, structured logs, `/health`
- [ ] k6 or Locust load test; record results in `/perf`
- [ ] README: architecture diagram, demo GIF, design decisions, "what broke" section, setup steps
- [ ] 600–1,000 word write-up (blog post or LinkedIn article)
- [ ] Update resume bullets with your real measured numbers
- [ ] Pin the repo on GitHub; add the live link to your resume and LinkedIn

**Done when:** a stranger can open the link, understand the project in 30 seconds, and find the numbers.

## 13. Repo structure and local setup

One monorepo keeps everything in one place for recruiters.

```
firstpr/
  backend/
    app/
      api/            # routes, dependencies, error handlers
      core/           # config, security, logging
      db/             # models, session, migrations (alembic)
      github/         # client, rate limiter, fixtures helpers
      sync/           # discover, enrich, upsert jobs
      scoring/        # health.py, availability.py, difficulty.py
      schemas/        # Pydantic request/response models
    tests/
      fixtures/       # recorded GitHub responses
    Dockerfile
    pyproject.toml
  frontend/
    src/
      api/            # generated client
      components/
      pages/
      hooks/
    package.json
  ml/
    collect.py        # build training_examples
    train.py
    EVAL.md           # final metrics vs baseline
  perf/               # k6 scripts and results
  docs/               # architecture diagram, decisions.md
  .github/workflows/  # ci.yml, deploy.yml, sync.yml
  docker-compose.yml
  .env.example
  README.md
```

**Local setup you should be able to run on day one**

1. `cp .env.example .env` and fill in the GitHub token and OAuth keys.
2. `docker compose up` starts the API and Postgres.
3. `alembic upgrade head` creates the tables.
4. `python -m app.sync.run --language python --limit 200` loads sample data.
5. `npm install && npm run dev` in `frontend/`.

Keep a `docs/decisions.md` log from the start: one short entry per decision (what you chose, what else you considered, why). It becomes your interview script and your README's design section.

## 14. Resume bullets and portfolio presentation

Only write a number you have measured yourself. Fill the blanks from your own `EVAL.md`, `/perf` results and `sync_runs` table; never copy these placeholders.

**Project entry (resume)**

> **FirstPR – Open Source Issue Finder** | React, TypeScript, FastAPI, PostgreSQL, scikit-learn, Docker, GitHub Actions | Live Demo · Source Code
>
> - Built a scheduled sync pipeline indexing **\[N\]** open good-first-issues across **\[M\]** repos with rate-limit handling, ETag caching and idempotent retries.
> - Trained a difficulty model on **\[N\]** historical issues that predicts effort band with **\[X\]%** accuracy vs **\[Y\]%** for a heuristic baseline (time-based split).
> - Cut search p95 latency from **\[A\] ms to \[B\] ms** through composite indexes and serving from a local store; verified with k6 load tests.
> - Shipped with CI/CD (GitHub Actions, Docker), **\[Z\]%** backend test coverage, and Sentry monitoring.

**Experience section tie-in:** at FirstHive you built dashboards and CSV ingestion on the frontend. This project shows the same thinking on the backend and data side. Mention that continuity in interviews.

**README checklist**

- [ ] One-sentence pitch and live link at the very top
- [ ] Demo GIF (15 seconds: search, filter, open an issue)
- [ ] Architecture diagram
- [ ] Results table: estimator vs baseline; latency before vs after
- [ ] "Design decisions" (5–7 short entries from `docs/decisions.md`)
- [ ] "What broke and how I fixed it" (2–3 real stories)
- [ ] Setup steps that actually work from a clean clone
- [ ] Known limitations and future work

**Presentation**

- Pin the repo on GitHub, add topics, and write a clear repo description.
- Add the live link to your resume, LinkedIn and portfolio site.
- Post the write-up on dev.to or LinkedIn; link it from the README.
- Keep commit history clean: small, meaningful commits show how you work.
- Optional but strong: contribute to a real open-source project yourself using this tool, and mention the merged PR.

## 15. Interview talking points

Be ready to answer these without looking at the code. Write your own answers in `docs/decisions.md`.

| Likely question | What a strong answer covers |
| --- | --- |
| Why not call GitHub live on each search? | Rate limits, latency, the 1,000-result cap, reliability; trade-off is data freshness, handled by scheduled re-checks |
| How do you handle rate limits? | Reading headers, sleeping until reset, ETags for 304s, backoff with jitter, idempotent steps |
| How did you decide on the difficulty labels? | Ground truth from merged PRs, features, time-based split, baseline comparison, confidence note |
| What if the model isn't better than the baseline? | Ship the baseline, report honestly, explain what you'd try next |
| How do you keep the index from going stale? | Scheduled re-checks, closed/assigned detection, `sync_runs` monitoring |
| What was the hardest bug? | One real story: symptom, how you found the cause, the fix, how you prevented a repeat |
| How would this scale to 100x the data? | Partition crawl by language, move to a job queue with workers, add read replicas or caching, review indexes |
| How do you protect user tokens? | Minimal scopes, encryption at rest, never logged, HTTP-only cookie, OAuth state check |
| What would you do differently? | One honest decision you'd change, and why |

**Tip:** pick two stories (one performance fix, one bug) and rehearse them in under two minutes each. Interviewers remember specifics: the query that took 1.8 s and why the index fixed it.

## 16. Building with Claude and Cursor, and still owning it

Using AI tools is fine and expected. Interviewers will ask you to explain and change your own code, so the rule is: **build with AI, but be able to rebuild any part without it.**

**Working loop for each feature**

1. Write a short spec yourself (inputs, outputs, edge cases) before prompting.
2. Ask the AI for a plan first; read it and change anything you disagree with.
3. Generate in small pieces (one function or endpoint at a time), not whole modules.
4. Write or ask for tests, then run them. Don't merge code you haven't run.
5. Explain the code back in your own words (to the AI or in a comment in `decisions.md`). If you can't, ask for a simpler version.
6. Commit with a message you wrote.

**Prompt starters by phase**

- Schema: "Design a Postgres schema for \[tables\]. List indexes you'd add and the queries each serves. Explain the trade-offs."
- GitHub client: "Write a client that reads rate-limit headers, uses ETags and retries with exponential backoff. Include tests using recorded responses."
- Scoring: "Write a pure function that computes \[score\] from these inputs, with unit tests for edge cases (missing data, zero values)."
- ML: "Given these features, set up a time-based train/test split, a baseline and a scikit-learn model, and print accuracy, confusion matrix and MAE."
- Review: "Review this diff for bugs, security issues and missing tests. Don't rewrite it; list problems."

**Understanding checks before each week ends**

- [ ] I can explain the data flow from GitHub to the browser on a whiteboard.
- [ ] I can say why each index exists and what query it serves.
- [ ] I can describe how the estimator was trained and how it was evaluated.
- [ ] I can run the whole system from a clean clone.
- [ ] I can fix a small bug in any file without asking the AI where it is.

If a check fails, spend an hour reading that part of the code before moving on. That hour is what separates "I used AI" from "I built this."
