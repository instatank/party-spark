// Deep regression drive for "Echo" (dev-only, not in CI).
//
// The thing worth testing here is not "the add worked" — that passes on
// broken code. It is the CHAIN INVARIANT: across a whole round the chain only
// ever grows, by exactly one item, never reorders its existing items, and
// never repeats one. The drive records the chain shown at every replay and
// checks each against the previous (see notes/05).
//
// It also asserts the scoring rule (a clean recital pays exactly the length
// of the chain you carried), that a wrong tap ends the round and names both
// the tile you hit and the tile you needed, that the opening player rotates
// each round, and that the running totals are what the drive computed itself.
//
// Usage:  npm run build && npx vite preview --port 4173 &
//         node scripts/drive-echo.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const DATA = JSON.parse(fs.readFileSync(new URL('../src/data/echo.json', import.meta.url), 'utf8'));
const PLAYERS = ['Ankit', 'Priya', 'Sam'];
const ROUNDS = 3;
const BOARD_LABEL = 'The Market';
const BOARD = DATA.themes.find(t => t.name === BOARD_LABEL);

const isEnvNoise = u => u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (ok, label) => { console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); if (!ok) fails.push(label); };

const browser = await puppeteer.launch({
  ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 900 });
page.on('console', m => {
  if (m.type() !== 'error') return;
  const loc = m.location()?.url || '';
  if (m.text().includes('Failed to load resource') && (isEnvNoise(loc) || loc === '')) return;
  errors.push(`[console] ${m.text()} (${loc})`);
});
page.on('requestfailed', r => { if (!isEnvNoise(r.url())) errors.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`); });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
await page.evaluateOnNewDocument(names => {
  const now = Date.now();
  localStorage.setItem('party_spark_session', JSON.stringify({ startTime: now, lastActivity: now, usedContent: {}, teams: names }));
  localStorage.setItem('echo_timer_secs', '120');   // long enough that the drive never races the clock
}, PLAYERS);

const text = () => page.evaluate(() => document.body.innerText);
// innerText is returned AFTER css text-transform, so copy styled `uppercase`
// comes back ALL CAPS (notes/04). Compare case-insensitively.
const has = (t, needle) => t.toLowerCase().includes(String(needle).toLowerCase());
// Home parks the newest games behind a NEW tab, so their card is not in the
// DOM until that tab is clicked. Matched by aria-label — the visible label is
// an icon + "NEW" + a count badge.
const clickNewTab = async () => {
  const ok = await page.evaluate(() => {
    const el = document.querySelector('button[aria-label="New games"]');
    if (el) { el.click(); return true; }
    return false;
  });
  if (!ok) throw new Error('NEW tab not found on home');
  await new Promise(r => setTimeout(r, 300));
};

const clickText = async (t, sel = 'button') => {
  const ok = await page.evaluate(({ sel, t }) => {
    const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if (el) { el.click(); return true; }
    return false;
  }, { sel, t });
  if (!ok) throw new Error(`click failed: "${t}"`);
  await sleep(200);
};
// Board tiles carry the item word; match it exactly so "Bread" can't hit
// "Baguette" and "Potato" can't hit "Sweet potato".
const tileWords = () => page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .map(b => [...b.querySelectorAll('span')].map(s => s.textContent.trim()))
    .filter(spans => spans.length >= 2)
    .map(spans => spans[1]));
const tapTile = async word => {
  const ok = await page.evaluate(w => {
    const el = [...document.querySelectorAll('button')].find(b => {
      const spans = [...b.querySelectorAll('span')].map(s => s.textContent.trim());
      return spans.length >= 2 && spans[1] === w && !b.disabled;
    });
    if (el) { el.click(); return true; }
    return false;
  }, word);
  if (!ok) throw new Error(`no enabled tile for "${word}"`);
  await sleep(150);
};
const enabledTiles = () => page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .filter(b => !b.disabled)
    .map(b => [...b.querySelectorAll('span')].map(s => s.textContent.trim()))
    .filter(spans => spans.length >= 2)
    .map(spans => spans[1]));
// The replay screen renders the chain in order as chips.
const replayChain = async () => {
  await page.waitForFunction(() => {
    const t = document.body.innerText;
    const m = t.match(/(\d+)\s*\/\s*(\d+)/);
    return m && m[1] === m[2];
  }, { timeout: 20000 });
  return page.evaluate(() =>
    [...document.querySelectorAll('span')]
      .filter(s => s.className.includes('animate-slide-up') && s.className.includes('rounded-lg'))
      .map(s => {
        const emoji = s.querySelector('span')?.textContent ?? '';
        return s.textContent.slice(emoji.length).trim();
      }));
};

console.log('\nEcho — deep drive\n');

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')), { timeout: 15000 });
await clickNewTab();
await clickText('Echo', '.game-card h3');
await sleep(1500);

let t = await text();
check(/chain/i.test(t), 'setup screen renders');
check(PLAYERS.every(p => t.includes(p)), 'shared session roster carried the 3 names in');
check(DATA.themes.every(x => t.includes(x.name)), 'all four boards are offered');
check(/120s round/i.test(t), 'shared TimerSetting chip reflects the stored preference');

await clickText(BOARD_LABEL);
await sleep(600);

const pts = Object.fromEntries(PLAYERS.map(p => [p, 0]));
const openers = [];
let brokeTested = false, cleanTested = false;

for (let round = 0; round < ROUNDS; round++) {
  t = await text();
  check(has(t, `Round ${round + 1} of ${ROUNDS}`), `round ${round + 1}: intro screen`);
  const opener = PLAYERS.find(p => new RegExp(`${p}\\b[^.]*opens`).test(t));
  check(Boolean(opener), `round ${round + 1}: intro names the opening player`);
  openers.push(opener);
  await clickText('Start the chain');
  await sleep(350);

  // The chain as the drive believes it to be, rebuilt from what it tapped.
  let expected = [];
  let prevChain = [];
  const seen = new Set();
  // Break on turn `breakOn` of the round, varying it so an early break and a
  // deeper one both get exercised.
  // Round 2 runs deep on purpose — a chain of eight is where a reorder or a
  // duplicate would actually have somewhere to hide.
  const breakOn = round === 0 ? 3 : round === 1 ? 8 : 2;

  for (let turn = 0; ; turn++) {
    t = await text();
    const who = PLAYERS.find(p => t.includes(`Phone to ${p}`));
    if (!who) throw new Error(`round ${round + 1} turn ${turn}: no handoff in "${t.slice(0, 140)}"`);
    check(who === PLAYERS[(PLAYERS.indexOf(opener) + turn) % PLAYERS.length], `r${round + 1}t${turn + 1}: turn order holds (${who})`);
    await clickText(turn === 0 ? 'Open the chain' : "I'm ready");
    await sleep(300);

    const deliberateBreak = turn === breakOn;

    if (turn > 0) {
      // --- recite ---
      const words = await tileWords();
      check(words.length === BOARD.items.length, `r${round + 1}t${turn + 1}: full ${BOARD.items.length}-tile board on screen`);
      if (deliberateBreak) {
        // tap a tile that is NOT the one required at this position
        const needed = expected[0];
        const wrong = BOARD.items.map(i => i.w).find(w => w !== needed);
        await tapTile(wrong);
        await sleep(350);
        t = await text();
        check(has(t, `${who} broke it at 1`), `r${round + 1}: break screen names ${who} and the position`);
        check(t.includes(wrong), `r${round + 1}: break screen shows the tile that was tapped (${wrong})`);
        check(t.includes(needed), `r${round + 1}: break screen shows the tile that was needed (${needed})`);
        check(has(t, `Chain reached ${expected.length}`), `r${round + 1}: break screen states the chain length ${expected.length}`);
        brokeTested = true;
        await clickText(`Round ${round + 1} scores`);
        await sleep(400);
        break;
      }
      for (const w of expected) await tapTile(w);
      await sleep(300);
      pts[who] += expected.length;
      cleanTested = true;
      t = await text();
      check(has(t, `+${expected.length} points`), `r${round + 1}t${turn + 1}: clean recital of ${expected.length} pays ${expected.length}`);
    }

    // --- add ---
    const free = await enabledTiles();
    check(free.length === BOARD.items.length - expected.length, `r${round + 1}t${turn + 1}: only the ${BOARD.items.length - expected.length} unused tiles are addable`);
    check(expected.every(w => !free.includes(w)), `r${round + 1}t${turn + 1}: chain items are locked out of the add board`);
    const pick = free[(turn * 5 + round) % free.length];
    await tapTile(pick);
    expected.push(pick);
    await sleep(300);

    // --- replay: the invariant check ---
    const shown = await replayChain();
    const shownWords = shown;
    check(shownWords.length === expected.length, `r${round + 1}t${turn + 1}: replay shows ${expected.length} chip(s)`);
    check(shownWords.join('|') === expected.join('|'), `r${round + 1}t${turn + 1}: replay matches the chain the drive built`);
    // INVARIANT: grew by exactly one, kept every earlier item in place, no repeat
    check(shownWords.length === prevChain.length + 1, `r${round + 1}t${turn + 1}: chain grew by exactly one`);
    check(prevChain.every((w, i) => shownWords[i] === w), `r${round + 1}t${turn + 1}: every earlier item kept its position`);
    check(!seen.has(shownWords[shownWords.length - 1]), `r${round + 1}t${turn + 1}: the new item is not already in the chain`);
    seen.add(shownWords[shownWords.length - 1]);
    prevChain = shownWords;

    await clickText('Pass to ');
    await sleep(350);
  }

  // --- round end ---
  t = await text();
  check(/the chain reached/i.test(t), `round ${round + 1}: round summary`);
  const leaves = await page.evaluate(() => [...document.querySelectorAll('*')]
    .filter(e => e.children.length === 0).map(e => e.textContent.trim()));
  PLAYERS.forEach(p => check(leaves.includes(String(pts[p])), `round ${round + 1}: ${p}'s running total of ${pts[p]} is shown`));
  await clickText(round + 1 >= ROUNDS ? 'Final scores' : `Round ${round + 2}`);
  await sleep(600);
}

check(brokeTested && cleanTested, 'exercised both a clean recital and a broken chain');
check(new Set(openers).size === ROUNDS, `the opening player rotated across all ${ROUNDS} rounds (${openers.join(' → ')})`);

// ---- end screen ----
t = await text();
const leaves = await page.evaluate(() => [...document.querySelectorAll('*')]
  .filter(e => e.children.length === 0).map(e => e.textContent.trim()).filter(Boolean));
PLAYERS.forEach(p => check(leaves.includes(String(pts[p])), `end screen shows ${p}'s total of ${pts[p]}`));
const leader = Object.entries(pts).sort((a, b) => b[1] - a[1])[0];
check(t.includes(leader[0]), `end screen names the leader (${leader[0]} on ${leader[1]})`);
check(/the three chains/i.test(t), 'end screen carries the per-round chain log');
check(/share the chain/i.test(t), 'share button offered on the end screen');
console.log(`    expected points: ${JSON.stringify(pts)}`);

console.log(`\nconsole/page errors: ${errors.length}`);
for (const e of errors) console.log(`    ${e}`);
await browser.close();
const bad = fails.length + errors.length;
console.log(bad ? `\n✗ ${fails.length} assertion(s) failed, ${errors.length} error(s)` : '\n✓ Echo drove clean end-to-end');
process.exit(bad ? 1 : 0);
