// Cloudflare Pages Function: forwards every /api/* request to the API on Render.
// The browser then sees one site, so the sign-in cookie is first-party and no CORS is
// needed: the same job render.yaml's "rewrite /api/*" rule did when the site was on Render.
// Runs on Cloudflare's free Workers quota (100,000 requests a day).

const API_ORIGIN = 'https://firstpr-api-5lk3.onrender.com'

/** @param {{ request: Request }} context */
export const onRequest = ({ request }) => {
  const url = new URL(request.url)
  const target = new URL(url.pathname + url.search, API_ORIGIN)
  const hasBody = !['GET', 'HEAD'].includes(request.method)
  return fetch(target, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? request.body : undefined,
    // Hand redirects (sign-in to GitHub and back) to the browser instead of following them here.
    redirect: 'manual',
  })
}
