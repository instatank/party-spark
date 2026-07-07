// Focused headless drive of Toon Studio (Roast Me v2 Phase 4) with a stubbed
// /api/ai: text endpoints return null (offline deck), edit_image returns a
// valid PNG on the FIRST call (success → reveal, allowance spent) and null on
// the SECOND (failure → error banner, allowance refunded). Verifies both
// paths + the daily-ration counter, and dumps gallery/reveal screenshots.
//
// Usage: npm run build && npx vite preview --port 4173 &
//        node scripts/drive-roast-toon.mjs [http://localhost:4173] [outdir]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const OUT = process.argv[3] || process.env.TMPDIR || '/tmp';
const FACE = 'public/icons/icon-192.png';
// 1×1 PNG — a decodable stand-in for a generated caricature.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEnvNoise = url => url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');

const browser = await puppeteer.launch({
  ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('console', m => {
  if (m.type() !== 'error') return;
  const loc = m.location()?.url || '';
  if (m.text().includes('Failed to load resource') && (isEnvNoise(loc) || loc === '')) return;
  errors.push(`[console] ${m.text()} (${loc})`);
});
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));

let editCalls = 0;
await page.setRequestInterception(true);
page.on('request', req => {
  if (!req.url().includes('/api/ai')) return req.continue();
  let type = '';
  try { type = JSON.parse(req.postData() || '{}').type || ''; } catch { /* not JSON */ }
  const data = type === 'edit_image' ? (++editCalls === 1 ? TINY_PNG : null) : null;
  req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
});

const clickText = async (selector, text, { timeout = 8000 } = {}) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ok = await page.evaluate(({ selector, text }) => {
      const el = [...document.querySelectorAll(selector)]
        .find(e => e.textContent.trim().toLowerCase().includes(text.toLowerCase()));
      if (el) { el.click(); return true; }
      return false;
    }, { selector, text });
    if (ok) return true;
    await sleep(150);
  }
  throw new Error(`clickText timeout: ${selector} "${text}"`);
};

const waitText = async (text, { timeout = 8000 } = {}) => {
  await page.waitForFunction(
    t => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    { timeout }, text);
};

const toonUsed = () => page.evaluate(() => {
  try { return (JSON.parse(localStorage.getItem('roast_central_toons') || 'null') || { used: 0 }).used; } catch { return -1; }
});

const step = async (label, fn) => { process.stdout.write(`• ${label}… `); await fn(); console.log('ok'); };

try {
  await step('load home', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Roast Central')), { timeout: 15000 });
  });
  await step('open Roast Central (solo)', async () => { await clickText('.game-card h3', 'Roast Central'); await waitText('Drop your face'); });
  await step('upload face', async () => {
    const fileInput = await page.$('input[type=file]');
    await fileInput.uploadFile(FACE);
    await waitText('Victim acquired');
  });
  await step('into the deck (offline fallback)', async () => {
    await clickText('button', 'ROAST ME');
    await waitText('classic deck', { timeout: 15000 });
  });
  await step('open Toon Studio', async () => {
    await page.click('button[aria-label="Open Toon Studio"]');
    await waitText('3 of 3 left today');
    await sleep(300);
    await page.screenshot({ path: `${OUT}/toon-gallery.png` });
  });
  await step('generate (success path)', async () => {
    await clickText('button', 'Caricature');
    await waitText('fresh from the studio', { timeout: 15000 });
    await sleep(400);
    await page.screenshot({ path: `${OUT}/toon-reveal.png` });
    const used = await toonUsed();
    if (used !== 1) throw new Error(`allowance after success should be 1, got ${used}`);
  });
  await step('back to gallery shows 2 left', async () => {
    await clickText('button', 'Another');
    await waitText('2 of 3 left today');
  });
  await step('generate (failure path → refund)', async () => {
    await clickText('button', 'Anime');
    await waitText('art department choked', { timeout: 15000 });
    const used = await toonUsed();
    if (used !== 1) throw new Error(`allowance after refund should be 1, got ${used}`);
    await waitText('2 of 3 left today');
  });

  console.log(`\nedit_image calls: ${editCalls} (expected 2)`);
  console.log(`errors: ${errors.length}`);
  errors.forEach(e => console.log('  ' + e));
  await browser.close();
  process.exit(errors.length === 0 && editCalls === 2 ? 0 : 1);
} catch (e) {
  console.log(`\nFAILED: ${e.message}`);
  try { await page.screenshot({ path: `${OUT}/toon-failure.png` }); } catch { /* ignore */ }
  const body = await page.evaluate(() => document.body.innerText.slice(0, 500)).catch(() => '');
  console.log('screen:\n' + body);
  errors.forEach(err => console.log('  ' + err));
  await browser.close();
  process.exit(1);
}
