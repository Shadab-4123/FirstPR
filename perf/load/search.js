// k6 load test: 50 newcomers using the search site at once, for 2 minutes.
//
// Each virtual user repeats one visit, sending exactly the requests the React
// pages send (see frontend/src/pages): the landing page, a filter or two, a text
// search, sometimes page 2, then opening an issue. It pauses between steps the
// way a person reads, so 50 users here are 50 people, not 50 tight loops.
//
// Run with perf/load/run.sh, or directly:
//   k6 run -e BASE_URL=http://localhost:8765 perf/load/search.js
import http from 'k6/http'
import { check, group, sleep } from 'k6'

const BASE = `${__ENV.BASE_URL || 'http://localhost:8765'}/api/v1`
const LABEL = __ENV.LABEL || 'results'
const OUT_DIR = __ENV.OUT_DIR || 'perf/load/results'

export const options = {
  scenarios: {
    newcomers: {
      executor: 'ramping-vus',
      stages: [
        { duration: '15s', target: 50 }, // ramp up, so the first second isn't 50 cold requests
        { duration: '2m', target: 50 }, // the measured part
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  // The blueprint's target is search p95 under 300 ms. A threshold makes k6 exit
  // non-zero when it's missed, so a regression can't hide in a wall of numbers.
  thresholds: {
    'http_req_duration{endpoint:search}': ['p(95)<300'],
    'http_req_duration{endpoint:issue}': ['p(95)<300'],
    // Looser: cached for 60 s, or no database work. Listed so they get their own row.
    'http_req_duration{endpoint:filters}': ['p(95)<1000'],
    'http_req_duration{endpoint:stats}': ['p(95)<1000'],
    'http_req_duration{endpoint:me}': ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

// Values that exist in the data, so filters return rows like real use does.
const LANGUAGES = ['Python', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'Java', 'Ruby']
const LEVELS = ['new', 'some']
const SORTS = ['relevance', 'relevance', 'newest', 'updated', 'stars'] // default is the most common
const WORDS = ['parser error', 'typo', 'docs', 'timeout', 'unicode', 'cli config', 'logging']

const pick = (xs) => xs[Math.floor(Math.random() * xs.length)]
const think = (min = 1, max = 3) => sleep(min + Math.random() * (max - min))
const query = (params) =>
  Object.entries(params)
    .flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')

// `name` groups URLs with different query strings into one row in the results.
const get = (path, endpoint, extra = {}) =>
  http.get(`${BASE}${path}`, { tags: { endpoint, name: endpoint }, ...extra })

// Signed-out visitors get 401 from /auth/me; that's the expected answer, not a failure.
const meParams = { responseCallback: http.expectedStatuses(200, 401) }

const search = (params) => {
  const res = get(`/issues?${query(params)}`, 'search')
  check(res, { 'search 200': (r) => r.status === 200 })
  return res.status === 200 ? res.json('items') : []
}

export default function () {
  let items = []

  group('landing page', () => {
    // The page fires these together, like the browser does.
    const [me, list, , ] = http.batch([
      ['GET', `${BASE}/auth/me`, null, { tags: { endpoint: 'me', name: 'me' }, ...meParams }],
      ['GET', `${BASE}/issues`, null, { tags: { endpoint: 'search', name: 'search' } }],
      ['GET', `${BASE}/meta/filters`, null, { tags: { endpoint: 'filters', name: 'filters' } }],
      ['GET', `${BASE}/stats`, null, { tags: { endpoint: 'stats', name: 'stats' } }],
    ])
    check(me, { 'me answered': (r) => r.status === 401 || r.status === 200 })
    check(list, { 'search 200': (r) => r.status === 200 })
    items = list.status === 200 ? list.json('items') : []
  })
  think()

  group('filter', () => {
    const params = { language: pick(LANGUAGES), sort: pick(SORTS) }
    if (Math.random() < 0.5) params.level = pick(LEVELS)
    if (Math.random() < 0.3) params.difficulty = ['easy', 'medium']
    if (Math.random() < 0.2) params.updated_within_days = 30
    items = search(params)
    think()
    if (Math.random() < 0.3) {
      items = search({ ...params, page: 2 })
      think()
    }
  })

  if (Math.random() < 0.5) {
    group('text search', () => {
      const found = search({ q: pick(WORDS) })
      if (found.length) items = found
    })
    think()
  }

  if (items.length) {
    group('open an issue', () => {
      const res = get(`/issues/${pick(items).id}`, 'issue')
      check(res, { 'issue 200': (r) => r.status === 200 })
    })
    think(3, 8) // reading the brief
  }
}

// Keep the full numbers next to the script, so the write-up quotes a file, not memory.
export function handleSummary(data) {
  const rows = ['search', 'issue', 'filters', 'stats', 'me'].map((e) => {
    const m = data.metrics[`http_req_duration{endpoint:${e}}`]
    const v = m ? m.values : {}
    const f = (x) => (x === undefined ? '-' : x.toFixed(1))
    return `| ${e} | ${f(v.med)} | ${f(v['p(95)'])} | ${f(v['p(99)'])} | ${f(v.max)} |`
  })
  const reqs = data.metrics.http_reqs.values
  const failed = data.metrics.http_req_failed.values.rate
  const table = [
    `### ${LABEL}`,
    '',
    `${reqs.count} requests, ${reqs.rate.toFixed(1)}/s, ${(failed * 100).toFixed(2)}% failed`,
    '',
    '| Endpoint | p50 ms | p95 ms | p99 ms | max ms |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
  ].join('\n')
  return {
    stdout: `\n${table}\n`,
    [`${OUT_DIR}/${LABEL}.json`]: JSON.stringify(data, null, 2),
    [`${OUT_DIR}/${LABEL}.md`]: table,
  }
}
