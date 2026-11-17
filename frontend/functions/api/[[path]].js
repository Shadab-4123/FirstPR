// Cloudflare Pages Function: forwards every /api/* request to the API on Render.
// The browser then sees one site, so the sign-in cookie is first-party and no CORS is
// needed: the same job render.yaml's "rewrite /api/*" rule did when the site was on Render.
// Runs on Cloudflare's free Workers quota (100,000 requests a day).

const API_ORIGIN = 'https://firstpr-api-5lk3.onrender.com'

// A sleeping free Render service answers a proxied request with an instant 502 instead of
// holding it while it starts (2026-11-17). Reads are retried for up to a minute, so a
// visitor gets a slow first load instead of an error page. An external pinger
// (cron-job.org, every 5 minutes) normally keeps the API awake, so this rarely runs.
const WAKE_STATUSES = new Set([502, 503])
const RETRY_EVERY_MS = 3_000
const RETRY_FOR_MS = 60_000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** @param {{ request: Request }} context */
export const onRequest = async ({ request }) => {
  const url = new URL(request.url)
  const target = new URL(url.pathname + url.search, API_ORIGIN)
  const isRead = ['GET', 'HEAD'].includes(request.method)
  // Render picks the app by Host: forwarding "firstpr.pages.dev" gets a 502 "no-deploy".
  const headers = new Headers(request.headers)
  headers.delete('host')

  const send = () =>
    fetch(target, {
      method: request.method,
      headers,
      body: isRead ? undefined : request.body,
      // Hand redirects (sign-in to GitHub and back) to the browser instead of following them here.
      redirect: 'manual',
    })

  // Writes are sent once: their body can't be replayed, and they must never happen twice.
  if (!isRead) return send()

  const giveUpAt = Date.now() + RETRY_FOR_MS
  let response = await send()
  while (WAKE_STATUSES.has(response.status) && Date.now() < giveUpAt) {
    await sleep(RETRY_EVERY_MS)
    response = await send()
  }
  return response
}
