// PartySpark deep regression drive (dev-only): exercises countdown, expiry
// transitions and score paths in the 6 timer games (Charades, Taboo, Fact or
// Fiction, 5 Alive, Linked, Scramble). Companion to drive-games.mjs.
// Usage:  npm run build && npx vite preview --port 4173 &
//         node scripts/deep-drive.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// fonts: no external network in this sandbox. /api/: no serverless functions
// behind vite preview / python http.server — games fall back to local data.
const isEnvNoise = url => url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') || url.includes('/api/');
const isEnvNoiseMsg = msg => msg.includes('[ai/') || msg.includes('501') || msg.includes('404');

const browser = await puppeteer.launch({
  // sandbox Chromium if present, else puppeteer's own download
  ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}), headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

async function freshGame(gameTitle, errors) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url || '';
    if (m.text().includes('Failed to load resource') && (isEnvNoise(loc) || loc === '')) return;
    if (isEnvNoiseMsg(m.text())) return;
    errors.push(`[console] ${m.text()}`);
  });
  page.on('requestfailed', r => { if (!isEnvNoise(r.url())) errors.push(`[reqfail] ${r.url()}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('partyspark_adult_unlocked', 'true');
    sessionStorage.setItem('partyspark_intimate_unlocked', 'true');
  });
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')), { timeout: 15000 });
  await click(page, gameTitle);
  await sleep(1800);
  return page;
}

async function click(page, text) {
  const ok = await page.evaluate(t => {
    const el = [...document.querySelectorAll('button, .game-card')]
      .find(e => e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if (el) { el.click(); return true; }
    return false;
  }, text);
  if (!ok) throw new Error(`click failed: "${text}"`);
}

async function typeInput(page, text) {
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll('input[type="text"], input:not([type])')].find(i => !i.value);
    if (inp) inp.focus();
  });
  await page.keyboard.type(text);
}

const body = page => page.evaluate(() => document.body.innerText);
// standalone integers in on-screen order (timer is first in all these games)
const ints = async page => (await body(page)).match(/(?<![\d:.])\d+(?![\d:.])/g)?.map(Number) ?? [];
const mmss = async page => {
  const m = (await body(page)).match(/(\d\d):(\d\d)/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERT: ${msg}`); };

const FLOWS = {
  '5 Alive': async page => {
    await click(page, 'Just Play'); await sleep(600);
    await click(page, 'Easy'); await sleep(1000);
    // round screen ints: [round#, of-5, TIMER, name-N, in-N-seconds]
    const t1 = (await ints(page))[2];
    await sleep(2000);
    const t2 = (await ints(page))[2];
    assert(t2 < t1, `countdown should decrease (${t1} -> ${t2})`);
    await sleep(6000); // round is 6s total — expiry must have fired
    const txt = await body(page);
    assert(/BUZZER!/i.test(txt), 'buzzer/tally screen after expiry');
    await click(page, 'Next Round'); await sleep(800);
    assert(/Round 2/i.test(await body(page)), 'advanced to round 2');
  },
  'Charades': async page => {
    await click(page, 'Family Mix'); await sleep(1000);
    const [t1, s1] = await ints(page);
    await sleep(3200);
    const [t2] = await ints(page);
    assert(t2 <= t1 - 2 && t2 < t1, `timer should tick (${t1} -> ${t2})`);
    await click(page, 'Correct'); await sleep(600);
    const after = await ints(page);
    assert(after[1] === s1 + 1, `score should increment (${s1} -> ${after[1]})`);
  },
  'Taboo': async page => {
    await click(page, 'Easy'); await sleep(800);
    await click(page, 'START TIMER'); await sleep(1000); // ready-gate before play
    const [t1, s1] = await ints(page);
    await sleep(3200);
    const [t2] = await ints(page);
    assert(t2 <= t1 - 2 && t2 < t1, `timer should tick (${t1} -> ${t2})`);
    await click(page, 'Correct'); await sleep(600);
    const after = await ints(page);
    assert(after[1] === s1 + 1, `score should increment (${s1} -> ${after[1]})`);
  },
  'Fact or Fiction': async page => {
    await click(page, 'Sports'); await sleep(1000);
    const t1 = await mmss(page);
    assert(t1 !== null, 'mm:ss timer visible');
    await sleep(3200);
    const t2 = await mmss(page);
    assert(t2 < t1, `timer should tick (${t1}s -> ${t2}s)`);
    await click(page, 'FACT'); await sleep(1200); // answer; feedback/next question
  },
  'Linked (just play)': async page => {
    await click(page, 'Just Play'); await sleep(600);
    await click(page, 'Easy'); await sleep(1000);
    await click(page, 'Reveal'); await sleep(600);
    assert(/THE LINK IS/i.test(await body(page)), 'reveal shows the connector');
    await click(page, 'Correct'); await sleep(800);
    const txt = await body(page);
    assert(/1\s*\|?\s*solved|solved/i.test(txt) && /Reveal/i.test(txt), 'solved count + next puzzle');
  },
  'Linked (pass mode)': async page => {
    await typeInput(page, 'Ana'); await typeInput(page, 'Ben');
    await click(page, 'Start — 60s'); await sleep(600);
    await click(page, 'Easy'); await sleep(600);
    await click(page, '— Start'); await sleep(1000); // "I'm Ana — Start" ready gate
    const t1 = (await ints(page))[0];
    await sleep(3200);
    const t2 = (await ints(page))[0];
    assert(t2 < t1, `pass-mode timer should tick (${t1} -> ${t2})`);
    await click(page, 'Got it'); await sleep(1600); // answer flash then next puzzle
  },
  'Scramble': async page => {
    await click(page, 'Solo'); await sleep(600);
    await click(page, 'Easy'); await sleep(600);
    await click(page, 'Start'); await sleep(1000);
    const t1 = (await ints(page))[0];
    await sleep(3200);
    const t2 = (await ints(page))[0];
    assert(t2 <= t1 - 2 && t2 < t1, `timer should tick (${t1} -> ${t2})`);
  },
};

let failed = 0;
for (const [name, flow] of Object.entries(FLOWS)) {
  const errors = [];
  let page;
  try {
    page = await freshGame(name.replace(/ \(.*\)/, ''), errors);
    await flow(page);
    if (errors.length) throw new Error('console/page errors (see below)');
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}: ${e.message}`);
    for (const err of errors) console.log(`    ${err}`);
    if (page) console.log(`    screen: ${(await body(page)).replace(/\n+/g, ' | ').slice(0, 250)}`);
  } finally {
    if (page) await page.close();
  }
}
console.log(`\n${Object.keys(FLOWS).length - failed}/${Object.keys(FLOWS).length} deep flows passed`);
await browser.close();
process.exit(failed ? 1 : 0);
