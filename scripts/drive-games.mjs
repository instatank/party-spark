// PartySpark regression drive (dev-only): opens every game from the home
// screen in headless Chromium and fails on any console/page error.
// Usage:  npm run build && npx vite preview --port 4173 &
//         node scripts/drive-games.mjs [http://localhost:4173] [--tabs]
// --tabs: also drives the 4 hidden Coming Soon games — requires a build with
//         SHOW_TABS=true in src/App.tsx (flip temporarily, rebuild, revert).
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:4173';
const DEEP = process.argv.includes('--deep');

// Coming Soon games (WILTY, Icebreakers, Traitors, WYR) are hidden while
// SHOW_TABS=false in App.tsx — pass --tabs when driving a build that has the
// flag flipped, and the script will click the Coming Soon tab for them.
const HOME_GAMES = [
  'Charades', 'Taboo', 'Roast Me', 'Imposter',
  'Most Likely To', 'Never Have I Ever', 'Fact or Fiction', 'The Forecast',
  'Truth or Drink', '5 Alive', 'Linked', 'Scramble', 'House Rules',
  'Ballpark', 'Echo', 'Shortlist', 'Target',
];
const COMING_SOON_GAMES = ['Would I Lie To You', 'Icebreakers', 'The Traitors', 'Would You Rather'];
const WITH_TABS = process.argv.includes('--tabs');
const GAMES = WITH_TABS
  ? [...HOME_GAMES.map(t => ({ t, tab: false })), ...COMING_SOON_GAMES.map(t => ({ t, tab: true }))]
  : HOME_GAMES.map(t => ({ t, tab: false }));

// External resources (Google Fonts) are unreachable from this sandbox — their
// failures are environmental, not app bugs. localhost failures always count.
const isEnvNoise = url => url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');

const results = [];
const browser = await puppeteer.launch({
  // sandbox Chromium if present, else puppeteer's own download
  ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

async function freshPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = [];
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url || '';
    if (m.text().includes('Failed to load resource') && (isEnvNoise(loc) || loc === '')) return;
    errors.push(`[console] ${m.text()} (${loc})`);
  });
  page.on('requestfailed', r => { if (!isEnvNoise(r.url())) errors.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('partyspark_adult_unlocked', 'true');
    sessionStorage.setItem('partyspark_intimate_unlocked', 'true');
  });
  return { page, errors };
}

// Wait for splash (5s) to clear and home cards to render.
async function toHome(page) {
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForFunction(
    () => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')),
    { timeout: 15000 },
  );
}

const clickByText = async (page, selector, text) => {
  const ok = await page.evaluate(({ selector, text }) => {
    const el = [...document.querySelectorAll(selector)]
      .find(e => e.textContent.trim().toLowerCase().includes(text.toLowerCase()));
    if (el) { el.click(); return true; }
    return false;
  }, { selector, text });
  if (!ok) throw new Error(`clickByText failed: ${selector} "${text}"`);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const { t: title, tab } of GAMES) {
  const { page, errors } = await freshPage();
  try {
    await toHome(page);
    if (tab) { await clickByText(page, 'button', 'Coming Soon'); await sleep(400); }
    // open the game card (h3 title inside .game-card)
    await clickByText(page, '.game-card h3', title);
    await sleep(2000); // lazy chunk load + first screen render
    const hasHeader = await page.evaluate(() =>
      Boolean(document.querySelector('button[aria-label="Home"]') ||
              [...document.querySelectorAll('button')].length > 0));
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
    results.push({ game: title, opened: hasHeader && bodyText.length > 10, errors: [...errors], preview: bodyText.split('\n').slice(0, 4).join(' | ') });
  } catch (e) {
    results.push({ game: title, opened: false, errors: [...errors, `[drive] ${e.message}`] });
  } finally {
    await page.close();
  }
}

let failed = 0;
for (const r of results) {
  const bad = !r.opened || r.errors.length > 0;
  if (bad) failed++;
  console.log(`${bad ? '✗' : '✓'} ${r.game}${r.opened ? '' : ' [did not open]'}`);
  for (const e of r.errors) console.log(`    ${e}`);
  if (bad && r.preview) console.log(`    screen: ${r.preview}`);
}
console.log(`\n${results.length - failed}/${results.length} games opened clean`);
await browser.close();
process.exit(failed ? 1 : 0);
