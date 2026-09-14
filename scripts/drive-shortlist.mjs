// Deep regression drive for "Shortlist" (dev-only, not in CI).
//
// The property that matters here is not "a clue appeared" — that passes on a
// generator that lies. It is THE CASE INVARIANT:
//   1. every clue shown is TRUE of the suspect the app eventually reveals;
//   2. that suspect survives every clue;
//   3. each clue strictly narrows the surviving set;
//   4. the last clue leaves exactly ONE suspect standing.
//
// So the drive rebuilds the board's entire predicate vocabulary from
// src/data/shortlist.json, maps each clue sentence the app rendered back to
// the predicate that produced it, and recomputes the survivor set itself. It
// never asks the app what is true. It also plays a case the honest way — a
// perfect solver that crosses off exactly what the clues eliminate — and
// checks the app pays the score the drive computed independently.
//
// tests/shortlistEngine.test.ts covers the generator over thousands of cases;
// this covers the screen actually wired to it.
//
// Usage:  npm run build && npx vite preview --port 4173 &
//         node scripts/drive-shortlist.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const DATA = JSON.parse(fs.readFileSync(new URL('../src/data/shortlist.json', import.meta.url), 'utf8'));
const PLAYERS = ['Ankit', 'Priya', 'Sam'];
const CASES = 5;
const LIVES = 3;
const POINTS = [10, 8, 6, 4, 3, 2];
const pointsFor = n => POINTS[n - 1] ?? 2;

// --- the engine's clue vocabulary, rebuilt here from the same JSON ---
const lettersOf = w => (w.match(/[a-z]/gi) || []).length;
const LETTERS_ATTR = {
  k: '__letters', kind: 'num',
  more: 'has more than {n} letters in its name',
  fewer: 'has fewer than {n} letters in its name',
  exact: 'has exactly {n} letters in its name',
};
const valueOf = (it, k) => (k === '__letters' ? lettersOf(it.w) : it.a[k]);

function allPredicates(board) {
  const out = [];
  for (const a of [...board.attrs, LETTERS_ATTR]) {
    if (a.kind === 'cat') {
      const vals = [...new Set(board.items.map(i => String(valueOf(i, a.k))))].sort();
      for (const v of vals) {
        const p = a.phrase?.[v] ?? v;
        out.push({ text: `is ${p}`, key: a.k, holds: i => String(valueOf(i, a.k)) === v });
        out.push({ text: `is not ${p}`, key: a.k, holds: i => String(valueOf(i, a.k)) !== v });
      }
    } else if (a.kind === 'bool') {
      out.push({ text: a.yes, key: a.k, holds: i => valueOf(i, a.k) === true });
      out.push({ text: a.no, key: a.k, holds: i => valueOf(i, a.k) !== true });
    } else {
      const vals = [...new Set(board.items.map(i => Number(valueOf(i, a.k))))].sort((x, y) => x - y);
      for (const n of vals) {
        if (n === 0 && a.zero) out.push({ text: a.zero, key: a.k, holds: i => Number(valueOf(i, a.k)) === 0 });
        else if (a.exact) out.push({ text: a.exact.replace('{n}', String(n)), key: a.k, holds: i => Number(valueOf(i, a.k)) === n });
        if (a.more) out.push({ text: a.more.replace('{n}', String(n)), key: a.k, holds: i => Number(valueOf(i, a.k)) > n });
        if (a.fewer) out.push({ text: a.fewer.replace('{n}', String(n)), key: a.k, holds: i => Number(valueOf(i, a.k)) < n });
      }
    }
  }
  return out;
}
// "Our suspect is a mammal." -> the predicate that renders exactly that
const predBySentence = board => {
  const m = new Map();
  for (const p of allPredicates(board)) m.set(`our suspect ${p.text}.`.toLowerCase(), p);
  return m;
};

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
await page.setViewport({ width: 390, height: 950 });
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
}, PLAYERS);

const text = () => page.evaluate(() => document.body.innerText);
// innerText comes back AFTER css text-transform, so anything styled uppercase
// arrives in caps (notes/04). Every text assertion here is case-insensitive.
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
    if (el && !el.disabled) { el.click(); return true; }
    return false;
  }, { sel, t });
  if (!ok) throw new Error(`click failed: "${t}"`);
  await sleep(220);
};
// The clue tape renders one <p> per clue, in order.
const clueSentences = () => page.evaluate(() =>
  [...document.querySelectorAll('p')]
    .filter(p => /^our suspect /i.test(p.textContent.trim()))
    .map(p => p.textContent.trim()));
const tileWords = () => page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .map(b => ({ spans: [...b.querySelectorAll('span')].map(s => s.textContent.trim()), dis: b.disabled }))
    .filter(x => x.spans.length >= 2 && x.spans[0].length <= 4 && x.spans[1])
    .map(x => ({ w: x.spans[1], dis: x.dis })));
const tapTile = async word => {
  const ok = await page.evaluate(w => {
    const el = [...document.querySelectorAll('button')].find(b => {
      const s = [...b.querySelectorAll('span')].map(x => x.textContent.trim());
      return s.length >= 2 && s[1] === w && !b.disabled;
    });
    if (el) { el.click(); return true; }
    return false;
  }, word);
  if (!ok) throw new Error(`no enabled tile for "${word}"`);
  await sleep(110);
};

const BOARD_LABEL = process.argv.includes('--objects') ? 'The Usual Objects'
  : process.argv.includes('--menu') ? 'On the Menu' : 'The Creature Line-up';
const BOARD = DATA.boards.find(b => b.name === BOARD_LABEL);
const LOOKUP = predBySentence(BOARD);

console.log(`\nShortlist — deep drive (${BOARD_LABEL})\n`);

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')), { timeout: 15000 });
await clickNewTab();
await clickText('Shortlist', '.game-card h3');
await sleep(1500);

let t = await text();
check(has(t, 'suspects'), 'setup screen renders');
check(PLAYERS.every(p => t.includes(p)), 'shared session roster carried the 3 names in');
check(DATA.boards.every(b => t.includes(b.name)), 'all three line-ups are offered');

await clickText(BOARD_LABEL);
await sleep(600);

let expectedScore = 0;
let expectedLives = LIVES;
let solvedCount = 0;
const clueCounts = [];
let wrongTested = false, earlyTested = false, lateTested = false;

for (let c = 0; c < CASES; c++) {
  t = await text();
  check(has(t, `Case ${c + 1} of ${CASES}`), `case ${c + 1}: intro screen`);
  check(BOARD.cases.some(x => t.includes(x)), `case ${c + 1}: carries a case flavour line`);
  await clickText('Read the first clue');
  await sleep(350);

  // --- rebuild the truth from the clues on screen, independently ---
  let survivors = BOARD.items.map((_, i) => i);
  let seen = [];
  const takeStock = async label => {
    const sentences = await clueSentences();
    check(sentences.length === seen.length + 1, `${label}: exactly ${seen.length + 1} clue(s) on the tape`);
    const fresh = sentences[sentences.length - 1];
    const pred = LOOKUP.get(fresh.toLowerCase());
    check(Boolean(pred), `${label}: "${fresh}" is a clue this board can express`);
    if (!pred) throw new Error(`unrecognised clue: ${fresh}`);
    const next = survivors.filter(i => pred.holds(BOARD.items[i]));
    // INVARIANT 3 — every clue strictly narrows the field
    check(next.length < survivors.length && next.length >= 1, `${label}: clue narrows ${survivors.length} → ${next.length}`);
    survivors = next;
    seen.push(pred);
    return sentences;
  };
  await takeStock(`case ${c + 1} clue 1`);

  // On case 3, deliberately name a suspect the clues have already ruled out,
  // to exercise the life-loss branch and the forced extra clue.
  const goWrong = c === 2;

  let cluesUsed = 1;
  if (goWrong) {
    // pick any suspect the clues have already ruled out — guaranteed wrong
    const bad = BOARD.items.findIndex((_, i) => !survivors.includes(i));
    await clickText('Name them');
    await sleep(250);
    await tapTile(BOARD.items[bad].w);
    await clickText('It was ');
    await sleep(400);
    expectedLives -= 1;
    wrongTested = true;
    t = await text();
    check(has(t, `Not ${BOARD.items[bad].w}`), `case ${c + 1}: verdict names the wrong accusation`);
    check(has(t, 'one life gone') || has(t, 'no clues left'), `case ${c + 1}: a wrong name costs a life`);
    await clickText(survivors.length > 1 ? 'Take the next clue' : 'Back to the board');
    await sleep(400);
    if (survivors.length > 1) { cluesUsed += 1; await takeStock(`case ${c + 1} clue ${cluesUsed}`); }
  }

  // Cross off exactly what the clues eliminate — an honest, perfect solver.
  // Tapping is a TOGGLE, so the set has to be tracked: re-tapping a suspect
  // already crossed off would quietly put them back on the board.
  const crossedLocal = new Set();
  const crossOff = async label => {
    for (const i of BOARD.items.map((_, i) => i).filter(i => !survivors.includes(i) && !crossedLocal.has(i))) {
      await tapTile(BOARD.items[i].w);
      crossedLocal.add(i);
    }
    const shown = await text();
    check(has(shown, `${BOARD.items.length - crossedLocal.size} left on your board`),
      `${label}: board counter reads ${BOARD.items.length - crossedLocal.size} left`);
  };
  await crossOff(`case ${c + 1} clue 1`);

  while (survivors.length > 1) {
    await clickText('Another clue');
    await sleep(320);
    cluesUsed += 1;
    await takeStock(`case ${c + 1} clue ${cluesUsed}`);
    await crossOff(`case ${c + 1} clue ${cluesUsed}`);
  }
  // INVARIANT 4 — when the chain is exhausted, exactly one suspect stands
  check(survivors.length === 1, `case ${c + 1}: the clues narrow to exactly one suspect`);
  if (cluesUsed <= 3) earlyTested = true; else lateTested = true;

  // the field is down to one, so this is the deduced culprit
  const target = survivors[0];
  await clickText('Name them');
  await sleep(250);
  // crossed-off suspects must not be accusable
  const nameTiles = await tileWords();
  check(nameTiles.filter(x => !x.dis).length === BOARD.items.length - crossedLocal.size,
    `case ${c + 1}: only the ${BOARD.items.length - crossedLocal.size} uncrossed suspects can be accused`);
  await tapTile(BOARD.items[target].w);
  await clickText('It was ');
  await sleep(450);

  t = await text();
  const right = !has(t, `Not ${BOARD.items[target].w}`);
  // The deduction was forced by the clues, so a correct answer here is the
  // real check: it proves the app's hidden suspect is the one its own clues
  // point at, not merely that the screens work.
  check(right, `case ${c + 1}: the deduced suspect really is the culprit`);
  // INVARIANT 1 + 2 — every clue shown is true of the revealed culprit
  check(seen.every(p => p.holds(BOARD.items[target])), `case ${c + 1}: all ${seen.length} clues are true of ${BOARD.items[target].w}`);
  if (right) {
    const pts = pointsFor(cluesUsed);
    expectedScore += pts;
    solvedCount += 1;
    clueCounts.push(cluesUsed);
    check(has(t, `It was ${BOARD.items[target].w}`), `case ${c + 1}: verdict reveals ${BOARD.items[target].w}`);
    check(has(t, `+${pts} points`), `case ${c + 1}: pays ${pts} for closing on clue ${cluesUsed}`);
    await clickText(c + 1 >= CASES ? 'The final report' : `Case ${c + 2}`);
  } else {
    expectedLives -= 1;
    clueCounts.push(cluesUsed);
    await clickText(survivors.length > 1 ? 'Take the next clue' : 'Back to the board');
  }
  await sleep(600);
}

check(wrongTested, 'exercised a wrong accusation');
check(earlyTested || lateTested, `exercised the payout curve across clue counts ${clueCounts.join(', ')}`);

// ---- final report ----
t = await text();
const leaves = await page.evaluate(() => [...document.querySelectorAll('*')]
  .filter(e => e.children.length === 0).map(e => e.textContent.trim()).filter(Boolean));
check(has(t, `${solvedCount} of ${CASES} closed`), `report says ${solvedCount} of ${CASES} closed`);
check(leaves.includes(String(expectedScore)), `report shows the independently-computed score of ${expectedScore}`);
check(leaves.includes(`${expectedLives}/${LIVES}`), `report shows ${expectedLives}/${LIVES} lives left`);
const totalClues = clueCounts.reduce((a, b) => a + b, 0);
check(leaves.includes(String(totalClues)), `report shows ${totalClues} clues used`);
check(has(t, 'share the report'), 'share button offered');
console.log(`    expected: score ${expectedScore}, ${solvedCount}/${CASES} closed, clues ${clueCounts.join('+')}=${totalClues}, lives ${expectedLives}`);

console.log(`\nconsole/page errors: ${errors.length}`);
for (const e of errors) console.log(`    ${e}`);
await browser.close();
const bad = fails.length + errors.length;
console.log(bad ? `\n✗ ${fails.length} assertion(s) failed, ${errors.length} error(s)` : '\n✓ Shortlist drove clean end-to-end');
process.exit(bad ? 1 : 0);
