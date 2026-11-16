import { defineConfig, devices } from '@playwright/test'

/**
 * One real flow, end to end: the production build, the real API, a real Postgres
 * seeded with the backend's test fixtures. Nothing is mocked.
 *
 * Local: scripts/dev-db.sh start, then `npm run e2e` (uses backend/.venv).
 * CI sets E2E_DATABASE_URL and E2E_PYTHON.
 */
const API_PORT = 8765
const WEB_PORT = 4173
const PYTHON = process.env.E2E_PYTHON ?? '.venv/bin/python'
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql+psycopg://firstpr@localhost:5433/firstpr_e2e'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one shared database
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Fresh schema and data on every run, then the API.
      command: `${PYTHON} -m alembic upgrade head && ${PYTHON} tests/e2e_seed.py && ${PYTHON} -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: '../backend',
      env: { DATABASE_URL, LOG_LEVEL: 'WARNING' },
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run build && npx vite preview --port ${WEB_PORT} --strictPort`,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
