// Focused headless drive of Roast Battle (Phase 3) on the OFFLINE fallback
// path: /api/ai is stubbed to {ok:true,data:null} so observation returns null
// and every roast comes from the bundled fallback deck — the game must never
// dead-end. Drives roster → capture 2 faces → generate → reveal → vote →
// EndScreen, dumps the reveal poster + result screen as PNGs for a visual check.
//
// Usage: npm run build && npx vite preview --port 4173 &
//        node scripts/drive-roast-battle.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const OUT = process.argv[3] || process.env.TMPDIR || '/tmp';
const FACE = 'public/icons/icon-192.png';

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
page.on('requestfailed', r => { if (!isEnvNoise(r.url()) && !r.url().includes('/api/')) errors.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`); });

// Stub the AI so we exercise the offline fallback deterministically.
await page.setRequestInterception(true);
page.on('request', req => {
  if (req.url().includes('/api/ai')) {
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: null }) });
  } else {
    req.continue();
  }
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

const step = async (label, fn) => { process.stdout.write(`• ${label}… `); await fn(); console.log('ok'); };

try {
  // Home → Roast Central
  await step('load home', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Roast Central')), { timeout: 15000 });
  });
  await step('open Roast Central', async () => { await clickText('.game-card h3', 'Roast Central'); await waitText('Solo'); });

  // Switch to Battle
  await step('pick Battle mode', async () => { await clickText('button', 'Battle'); await waitText('The line-up'); });

  // Roster: add 2 players
  await step('add 2 players', async () => {
    await clickText('button', 'Add Player/Team Names');
    await page.waitForSelector('input[type=text]', { timeout: 5000 });
    const inputs = await page.$$('input[type=text]');
    await inputs[0].type('Ali');
    await inputs[1].type('Bo');
    await clickText('button', 'Save');
    await waitText('Ali');
  });

  await step('start battle', async () => { await clickText('button', 'START BATTLE'); await waitText('Pass the phone to'); });

  // Capture 2 faces
  for (const [i, name] of [[0, 'Ali'], [1, 'Bo']]) {
    await step(`capture ${name}`, async () => {
      await waitText(name);
      await clickText('button', "snap my face");
      await waitText('get in frame');
      const fileInput = await page.$('input[type=file]');
      await fileInput.uploadFile(FACE);
      await sleep(600); // downscale + decode
      // advance: "Next player" for first, "Roast them all" for last
      if (i === 0) await clickText('button', 'Next player');
      else await clickText('button', 'Roast them all');
    });
  }

  // Reveal
  await step('generate → reveal 1', async () => { await waitText('Reveal 1 of 2', { timeout: 15000 }).catch(()=>{}); await waitText('Pass the phone to'); await clickText('button', 'Reveal my roast'); await waitText('Roast 1 / 2'); });
  await step('dump reveal poster PNG', async () => {
    await sleep(700); // poster canvas draw
    await page.screenshot({ path: `${OUT}/battle-reveal.png` });
  });
  await step('reveal 2', async () => { await clickText('button', 'Next roast'); await waitText('Pass the phone to'); await clickText('button', 'Reveal my roast'); await waitText('Roast 2 / 2'); });
  await step('to vote', async () => { await clickText('button', 'Time to vote'); await waitText('Pass the phone to'); });

  // Vote — each votes the only other player
  await step('vote round 1', async () => {
    await clickText('button', "I'm ready to vote");
    await waitText('roasted the hardest');
    await clickText('button', 'Bo'); // Ali votes Bo
  });
  await step('vote round 2', async () => {
    await waitText('Pass the phone to');
    await clickText('button', "I'm ready to vote");
    await waitText('roasted the hardest');
    await clickText('button', 'Ali'); // Bo votes Ali
  });

  // Result
  await step('result screen', async () => {
    await waitText('Roast Battle', { timeout: 8000 });
    await waitText('Share Result');
    await sleep(400);
    await page.screenshot({ path: `${OUT}/battle-result.png` });
  });

  const body = await page.evaluate(() => document.body.innerText);
  const hasNames = body.includes('Ali') && body.includes('Bo');
  console.log(`\nresult body has both players: ${hasNames}`);
  console.log(`errors: ${errors.length}`);
  errors.forEach(e => console.log('  ' + e));
  await browser.close();
  process.exit(errors.length === 0 && hasNames ? 0 : 1);
} catch (e) {
  console.log(`\nFAILED: ${e.message}`);
  try { await page.screenshot({ path: `${OUT}/battle-failure.png` }); } catch {}
  const body = await page.evaluate(() => document.body.innerText.slice(0, 500)).catch(() => '');
  console.log('screen:\n' + body);
  errors.forEach(e => console.log('  ' + e));
  await browser.close();
  process.exit(1);
}
