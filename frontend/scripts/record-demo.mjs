// Records the README demo: search → filter → open an issue, on the live site.
//
//   cd frontend && node scripts/record-demo.mjs [https://firstpr-web.onrender.com]
//
// Writes a .webm next to the repo's docs/; scripts/demo-gif.sh turns it into docs/demo.gif.
// Scripted rather than screen-recorded, so it can be redone whenever the UI changes.
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const SITE = process.argv[2] ?? 'https://firstpr-web.onrender.com'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../docs/.demo-video')
const SIZE = { width: 1200, height: 750 }

// Headless video has no mouse pointer, so draw one that follows the real (scripted) mouse.
const CURSOR = `
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div')
    c.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:18px;height:18px;' +
      'margin:-3px 0 0 -3px;border-radius:50%;background:rgba(17,17,17,.75);' +
      'box-shadow:0 0 0 3px rgba(255,255,255,.9);transition:transform .12s;left:-50px;top:-50px'
    document.body.appendChild(c)
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px' })
    addEventListener('mousedown', () => { c.style.transform = 'scale(.7)' })
    addEventListener('mouseup', () => { c.style.transform = 'scale(1)' })
  })`

const pause = (page, ms) => page.waitForTimeout(ms)

/** Glide the pointer to an element, like a person would, instead of teleporting. */
const moveTo = async (page, locator) => {
  const box = await locator.boundingBox()
  await page.mouse.move(box.x + Math.min(box.width / 2, 60), box.y + box.height / 2, { steps: 25 })
}

const choose = async (page, label, value) => {
  const select = page.getByLabel(label, { exact: true })
  await moveTo(page, select)
  await pause(page, 250)
  await page.mouse.down()
  await page.mouse.up()
  await select.selectOption(value)
  await page.waitForLoadState('networkidle')
  await pause(page, 900)
}

// Wake the free-tier API first, so the recording doesn't start with a 50 s wait.
await fetch(`${SITE}/api/v1/health`)

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: SIZE,
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: SIZE },
})
await context.addInitScript(CURSOR)
const page = await context.newPage()
const recordingStart = Date.now()

await page.goto(SITE)
await page.getByText(/^Showing /).waitFor() // results are on screen, not loading placeholders
const startedAt = Date.now() // the GIF starts here; everything before is a blank page loading
await page.mouse.move(600, 500)
await pause(page, 1500) // the landing sentence

await choose(page, 'Language', 'Python')
await choose(page, 'Size (short form)', 'easy') // the filter bar under the sentence

const search = page.getByRole('searchbox', { name: 'Search titles and descriptions' })
await moveTo(page, search)
await search.click()
await search.pressSequentially('docs', { delay: 140 })
await page.waitForURL(/q=docs/)
await page.waitForLoadState('networkidle')
await pause(page, 600)

// Bring the results into view, then open the first one.
const first = page.getByRole('heading', { level: 2 }).first().getByRole('link')
await first.scrollIntoViewIfNeeded()
await pause(page, 400)
await page.mouse.wheel(0, 120)
await pause(page, 1200)
await moveTo(page, first)
await pause(page, 500)
await first.click()
await page.waitForURL(/\/issues\/\d+$/)
await page.getByRole('heading', { name: 'What this issue is about' }).waitFor() // the brief, not a placeholder
await pause(page, 2200) // availability, size and health at a glance

for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, 70)
  await pause(page, 90)
}
await pause(page, 2200)

const trim = ((startedAt - recordingStart) / 1000).toFixed(2)
await context.close() // finishes writing the video
await browser.close()

const video = readdirSync(OUT).find((f) => f.endsWith('.webm'))
renameSync(join(OUT, video), join(OUT, 'demo.webm'))
writeFileSync(join(OUT, 'trim'), trim)
console.log(`recorded ${join(OUT, 'demo.webm')}, content starts at ${trim}s`)
