// PartySpark dev-only drive: 5 Alive's five decks, one round each.
//
// The thing this checks is the thing a screenshot cannot: that each tile
// actually deals from ITS pool in five_alive.json. drawTurnCategories does
// `(data as Record<Difficulty, string[]>)[diff] || []` — a tile whose key has
// no pool deals nothing at all and the round renders five blank cards, which
// looks like a rendering bug rather than a missing deck. tests/
// fiveAliveCategories.test.ts pins the key parity in CI; this pins that the
// keys are actually WIRED, all the way to the card.
//
// It also walks a whole 5-round turn on each deck, so the round-to-round
// advance is exercised on every one of them, and checks the adult gate is on
// Social and ONLY on Social.
//
// Usage: npm run build && npx vite preview --port 4173 &
//        node scripts/drive-five-alive-decks.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const POOLS = JSON.parse(fs.readFileSync(new URL('../src/data/five_alive.json', import.meta.url), 'utf8'));
// Tile title as rendered -> pool key in the JSON.
const DECKS = [
  { title: 'Easy', key: 'easy' },
  { title: 'Hard', key: 'hard' },
  { title: 'Desi', key: 'desi' },
  { title: 'Kids', key: 'kids' },
  { title: 'Social', key: 'spicy', adult: true },
];
const ADULT_PIN = '0438';
const ROUNDS = 5;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isEnvNoise = u => u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com') || u.includes('/api/');

const fail = [];
const check = (ok, msg) => { if (!ok) { fail.push(msg); console.log(`  ✗ ${msg}`); } else console.log(`  ✓ ${msg}`); };

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
  errors.push(`[console] ${m.text()}`);
});
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
// The play screen arms a beforeunload guard (confirmOnExit) so a real player
// can't lose a round by refreshing. Left unhandled it hangs page.goto().
page.on('dialog', d => d.accept().catch(() => {}));

const clickText = async (sel, text) => {
  const ok = await page.evaluate(({ sel, text }) => {
    const el = [...document.querySelectorAll(sel)]
      .find(e => e.textContent.trim().toLowerCase().includes(text.toLowerCase()));
    if (el) { el.click(); return true; }
    return false;
  }, { sel, text });
  if (!ok) throw new Error(`click failed: ${sel} "${text}"`);
  await sleep(240);
};
const body = () => page.evaluate(() => document.body.innerText);
/** The category straight off the clue card. */
const card = () => page.evaluate(() => document.querySelector('h2.font-serif')?.textContent.trim() ?? '');

/** Home -> 5 Alive -> Just Play -> the deck picker. Reload each time: the
 *  play screen guards its exit with a confirm, so this is the clean route. */
const toPicker = async () => {
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForFunction(
    () => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('5 Alive')),
    { timeout: 15000 });
  await clickText('.game-card h3', '5 Alive');
  await sleep(1400);
  await clickText('button', 'Just Play');
  await sleep(700);
};

/** Play a whole turn on one deck, collecting the category of every round.
 *  Rounds are 6/5/4/3/2s and end on the buzzer, so this just waits them out. */
const playTurn = async () => {
  const seen = [];
  for (let r = 0; r < ROUNDS; r++) {
    await page.waitForFunction(() => !!document.querySelector('h2.font-serif'), { timeout: 8000 });
    seen.push(await card());
    await page.waitForFunction(() => /BUZZER!/i.test(document.body.innerText), { timeout: 12000 });
    if (r < ROUNDS - 1) { await clickText('button', 'Next Round'); await sleep(500); }
  }
  return seen;
};

try {
  await toPicker();

  const tiles = await page.evaluate(() =>
    [...document.querySelectorAll('h3')].map(h => h.textContent.trim()));
  check(
    JSON.stringify(tiles) === JSON.stringify(DECKS.map(d => d.title)),
    `picker is exactly the five decks (${tiles.join(', ')})`,
  );

  for (const deck of DECKS) {
    console.log(`\n${deck.title}`);
    if (deck !== DECKS[0]) await toPicker();
    await clickText('h3', deck.title);
    await sleep(500);

    if (deck.adult) {
      // The gate must be here — and only here. sessionStorage carries the
      // unlock across reloads in one tab, so it only appears the first time.
      const gated = /Enter the 4-digit PIN/i.test(await body());
      check(gated, 'Social is behind the adult PIN gate');
      if (gated) {
        const boxes = await page.$$('input[type="tel"]');
        check(boxes.length === 4, `PIN gate shows 4 boxes (${boxes.length})`);
        for (let i = 0; i < boxes.length; i++) await boxes[i].type(ADULT_PIN[i]);
        await sleep(900);
      }
    } else {
      check(!/Enter the 4-digit PIN/i.test(await body()), `${deck.title} is not adult-gated`);
    }

    await sleep(600);
    const seen = await playTurn();
    check(seen.length === ROUNDS && seen.every(Boolean),
      `dealt a category in all ${ROUNDS} rounds (${seen.filter(Boolean).length}/${ROUNDS})`);

    const pool = new Set(POOLS[deck.key]);
    const strays = seen.filter(c => c && !pool.has(c));
    check(strays.length === 0,
      strays.length
        ? `NOT from the '${deck.key}' pool: ${strays.join(' | ')}`
        : `every category came from five_alive.json's '${deck.key}' pool`);

    // Five rounds in one turn must be five different categories.
    check(new Set(seen).size === seen.length, 'no category repeated inside one turn');

    // A deck must not quietly deal another deck's content.
    const foreign = Object.entries(POOLS)
      .filter(([k]) => k !== deck.key)
      .flatMap(([k, v]) => seen.filter(c => new Set(v).has(c) && !pool.has(c)).map(c => `${c} (${k})`));
    check(foreign.length === 0,
      foreign.length ? `leaked from another deck: ${foreign.join(', ')}` : 'no other deck leaked in');
  }

  check(errors.length === 0, errors.length ? `console clean (${errors.join(' | ')})` : 'console clean');
} catch (e) {
  fail.push(String(e));
  console.log(`  ✗ ${e}`);
} finally {
  await browser.close();
}

console.log(`\n${fail.length ? `${fail.length} FAILED` : 'all checks passed'}`);
process.exit(fail.length ? 1 : 0);
