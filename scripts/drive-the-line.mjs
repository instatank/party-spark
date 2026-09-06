// Deep regression drive for "The Line" (dev-only, not in CI).
//
// The thing worth proving on the real screen is not "a card appeared". It is
// THE LINE INVARIANT, checked against the deck JSON rather than against the
// app's own opinion:
//
//  1. THE LINE ALWAYS RISES — every value rendered on the line, looked up in
//     src/data/the_line.json, strictly increases from top to bottom. Checked
//     on EVERY turn of EVERY round, not once at the end. "The placement was
//     accepted" passes on broken code; this does not.
//
//  2. NOTHING IS IN TWO PLACES — hand, line and discard partition the cards
//     that have been dealt. The drive tracks them itself: a card it saw placed
//     correctly must be on the line and gone from the hand; a card it saw
//     rejected must be on neither.
//
//  3. THE HIDDEN VALUES STAY HIDDEN — a card in hand must never render its
//     number, or the game is over before it starts.
//
//  4. THE JUDGEMENT IS THE DECK'S — the drive computes the correct gap itself
//     from the JSON values, plays deliberately right and deliberately wrong
//     placements, and checks the app agreed each time. It then recomputes the
//     end-screen totals independently.
//
// Content is randomised (which cards are dealt, which starter), so ONE green
// run proves very little — run it five or six times.
//
// Usage:  npm run build && npx vite preview --port 4173 &
//         node scripts/drive-the-line.mjs [http://localhost:4173] [--solo] [--deck=fast]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:4173';
const SOLO = process.argv.includes('--solo');
const DECK_ARG = (process.argv.find(a => a.startsWith('--deck=')) || '').split('=')[1];
const PLAYERS = SOLO ? ['Ankit'] : ['Ankit', 'Priya'];
const HAND_SIZE = 4;
const SOLO_LIVES = 3;

const data = JSON.parse(fs.readFileSync(new URL('../src/data/the_line.json', import.meta.url), 'utf8'));

// --- the rules, re-implemented here on purpose -----------------------------
// The engine formats and judges; so does this file, from the JSON alone. If
// they ever disagree, one of them is wrong and the drive says so.
const formatValue = (v, units) => {
  const rung = [...units].reverse().find(u => v >= u.min) ?? units[0];
  const x = v * rung.factor;
  const abs = Math.abs(x);
  const dp = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 4;
  const rounded = Number(x.toFixed(dp));
  if (!rung.suffix) return String(rounded);
  return `${rounded.toLocaleString('en-US', { maximumFractionDigits: dp })} ${rung.suffix}`;
};
const correctGap = (lineValues, v) => {
  let g = 0;
  while (g < lineValues.length && lineValues[g] < v) g += 1;
  return g;
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
await page.setViewport({ width: 390, height: 1000 });
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
// innerText comes back AFTER css text-transform, so uppercase copy arrives in
// caps (notes/04). Every comparison in this file goes through here.
const has = (t, needle) => t.toLowerCase().includes(String(needle).toLowerCase());
const clickText = async (t, sel = 'button') => {
  const ok = await page.evaluate(({ sel, t }) => {
    const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if (el && !el.disabled) { el.click(); return true; }
    return false;
  }, { sel, t });
  if (!ok) throw new Error(`click failed: "${t}"`);
  await sleep(220);
};
// The screen can move on its own (a verdict landing, a win firing). Nothing
// below assumes it is still where it was three taps ago (notes/08).
const stage = () => page.evaluate(() => document.querySelector('[data-line-stage]')?.dataset.lineStage ?? null);
const waitStage = async want => {
  await page.waitForFunction(
    w => document.querySelector('[data-line-stage]')?.dataset.lineStage === w,
    { timeout: 15000 }, want,
  );
};
const lineRows = () => page.evaluate(() => [...document.querySelectorAll('[data-line-row]')].map(r => ({
  label: r.dataset.lineRow,
  value: r.querySelector('[data-line-value]')?.textContent.trim() ?? '',
})));
const handCards = () => page.evaluate(() => [...document.querySelectorAll('[data-hand-card]')].map(b => ({
  label: b.dataset.handCard,
  shown: b.textContent.trim(),
})));
const gapCount = () => page.evaluate(() => document.querySelectorAll('[data-line-gap]').length);
const tapHand = async label => {
  const ok = await page.evaluate(l => {
    const b = document.querySelector(`[data-hand-card="${CSS.escape(l)}"]`);
    if (b) { b.click(); return true; }
    return false;
  }, label);
  if (!ok) throw new Error(`no hand card "${label}"`);
  await sleep(180);
};
const tapGap = async g => {
  const ok = await page.evaluate(n => {
    const b = document.querySelector(`[data-line-gap="${n}"]`);
    if (b) { b.click(); return true; }
    return false;
  }, g);
  if (!ok) throw new Error(`no gap ${g}`);
};
const verdict = () => page.evaluate(() => document.querySelector('[data-line-verdict]')?.dataset.lineVerdict ?? null);
const rejected = () => page.evaluate(() => [...document.querySelectorAll('[data-line-reject]')].map(d => d.dataset.lineReject));
// Rows and rejected ghosts in document order, so the drive can check a miss is
// drawn at the slot it was actually aimed at rather than merely present.
const lineSlots = () => page.evaluate(() =>
  [...document.querySelectorAll('[data-line-row],[data-line-reject]')].map(e => ({
    kind: e.hasAttribute('data-line-reject') ? 'reject' : 'row',
    label: e.dataset.lineReject ?? e.dataset.lineRow,
  })));

console.log(`\nThe Line — deep drive (${SOLO ? 'solo' : PLAYERS.length + ' players'})\n`);

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')), { timeout: 15000 });
await clickText('The Line', '.game-card h3');
await page.waitForFunction(() => Boolean(document.querySelector('[data-line-stage="SETUP"]')), { timeout: 15000 });

let t = await text();
check(has(t, 'never say the number'), 'setup screen renders');
check(PLAYERS.every(p => t.includes(p)) || SOLO, 'shared session roster carried the names in');
check(data.decks.every(d => has(t, d.name)), `all ${data.decks.length} decks are offered`);
check(SOLO ? has(t, 'playing solo') : has(t, `${PLAYERS.length} players`), 'the roster line reflects the mode');

const deck = DECK_ARG ? data.decks.find(d => d.id === DECK_ARG) : data.decks[Math.floor(Math.random() * data.decks.length)];
const byLabel = new Map(deck.cards.map(c => [c.label, c]));
console.log(`    deck: ${deck.name} (${deck.cards.length} cards)`);
await clickText(deck.name);
await sleep(600);

// --- independent bookkeeping ------------------------------------------------
const placed = PLAYERS.map(() => 0);
const misses = PLAYERS.map(() => 0);
const seenOnLine = new Set();      // labels the drive watched lock in
const seenDiscarded = new Set();   // labels the drive watched get rejected
let turn = 0, correctBranch = 0, wrongBranch = 0, seat = 0, startedWith = null, bottomMissSeen = false;

const MAX_TURNS = SOLO ? 80 : 40;
while (turn < MAX_TURNS) {
  const st = await stage();
  if (st === 'END') break;
  if (st === 'HANDOFF') {
    const ht = await text();
    check(has(ht, `Phone to ${PLAYERS[seat]}`), `t${turn + 1}: handoff names ${PLAYERS[seat]}`);
    await clickText('Take a look');
    await waitStage('PLAY');
  }
  if ((await stage()) !== 'PLAY') break;

  // ---------- (1) THE LINE ALWAYS RISES ----------
  const rows = await lineRows();
  const vals = rows.map(r => byLabel.get(r.label)?.value);
  const unknown = rows.filter(r => !byLabel.has(r.label)).map(r => r.label);
  check(unknown.length === 0, `t${turn + 1}: every card on the line is from ${deck.name}${unknown.length ? ` (stray: ${unknown.join(', ')})` : ''}`);
  const rising = vals.every((v, i) => i === 0 || v > vals[i - 1]);
  check(rising, `t${turn + 1}: the line rises — ${rows.length} card${rows.length === 1 ? '' : 's'}, ${vals[0]} → ${vals[vals.length - 1]}`);
  if (!rising) { console.log(`      ${rows.map(r => `${r.label}=${byLabel.get(r.label)?.value}`).join(' | ')}`); break; }
  // the printed value must be the deck's value, formatted the deck's way
  const misprinted = rows.filter(r => r.value !== formatValue(byLabel.get(r.label).value, deck.units));
  check(misprinted.length === 0, `t${turn + 1}: every printed value matches the deck${misprinted.length ? ` (${misprinted[0].label} showed "${misprinted[0].value}")` : ''}`);
  if (startedWith === null) startedWith = rows[0].label;

  // ---------- (2) + (3) the hand ----------
  const hand = await handCards();
  check(hand.length > 0 && hand.length <= HAND_SIZE, `t${turn + 1}: hand holds ${hand.length} card${hand.length === 1 ? '' : 's'}`);
  const leaked = hand.filter(h => {
    const v = formatValue(byLabel.get(h.label).value, deck.units);
    return h.shown !== h.label || h.shown.includes(v);
  });
  check(leaked.length === 0, `t${turn + 1}: no hidden value leaks into the hand${leaked.length ? ` (${leaked[0].shown})` : ''}`);
  const onLine = new Set(rows.map(r => r.label));
  const doubled = hand.filter(h => onLine.has(h.label) || seenDiscarded.has(h.label));
  check(doubled.length === 0, `t${turn + 1}: no card is in two places at once${doubled.length ? ` (${doubled[0].label})` : ''}`);

  // ---------- (4) play a deliberately right or wrong placement ----------
  // seat 0 always plays correctly so somebody actually wins; the other seat
  // (or, solo, every third turn) plays a deliberate miss so the wrong branch
  // is exercised rather than assumed.
  const playWrong = SOLO ? turn % 3 === 2 : seat === 1 && placed[1] + misses[1] !== 1;

  // A miss aimed PAST THE BOTTOM of the line is a different render path from
  // one aimed between two cards, and reaching it has to be ENGINEERED, not
  // waited for. A card can only be missed that way if it does not actually
  // belong at the bottom, so:
  //   - on a miss, take the SMALLEST card in hand (least likely to be bottom);
  //   - on a correct turn, take the LARGEST, which raises the line's ceiling
  //     and makes the next hand interior.
  // Leaving it to the random pick was green about nineteen runs in twenty —
  // the deal decided whether the branch got tested, which is the worst kind
  // of green. Once the branch is claimed the drive goes back to picking
  // at random, so the rest of the run is not steered.
  const value = h => byLabel.get(h.label).value;
  let pick;
  if (bottomMissSeen) {
      pick = hand[Math.floor(Math.random() * hand.length)];
  } else if (playWrong) {
      const usable = hand.filter(h => correctGap(vals, value(h)) !== vals.length);
      pick = (usable.length ? usable : hand).reduce((a, b) => (value(a) <= value(b) ? a : b));
  } else {
      pick = hand.reduce((a, b) => (value(a) >= value(b) ? a : b));
  }
  const card = byLabel.get(pick.label);
  const truth = correctGap(vals, card.value);
  const aimBottom = playWrong && !bottomMissSeen && truth !== vals.length;
  const gap = !playWrong ? truth : aimBottom ? vals.length : (truth === 0 ? 1 : truth - 1);

  await tapHand(pick.label);
  check((await gapCount()) === rows.length + 1, `t${turn + 1}: picking a card opens ${rows.length + 1} gap${rows.length ? 's' : ''}`);
  if ((await stage()) !== 'PLAY') break;   // the screen has not moved under us
  await tapGap(gap);
  await page.waitForFunction(() => Boolean(document.querySelector('[data-line-verdict]')), { timeout: 10000 });

  const gotVerdict = await verdict();
  const expected = playWrong ? 'wrong' : 'correct';
  check(gotVerdict === expected, `t${turn + 1}: ${PLAYERS[seat]} played ${pick.label} at gap ${gap} (true gap ${truth}) → app says ${gotVerdict}, deck says ${expected}`);

  // the verdict must show the true value, and the fact note
  const vt = await text();
  check(has(vt, formatValue(card.value, deck.units)), `t${turn + 1}: the verdict reveals ${formatValue(card.value, deck.units)}`);
  check(has(vt, card.note.slice(0, 24)), `t${turn + 1}: the verdict carries the card's note`);

  // ---------- the piles moved the way the rules say ----------
  const after = await lineRows();
  const afterLabels = new Set(after.map(r => r.label));
  if (expected === 'correct') {
    check(afterLabels.has(pick.label), `t${turn + 1}: ${pick.label} locked into the line`);
    check(after.length === rows.length + 1, `t${turn + 1}: the line grew by exactly one`);
    const av = after.map(r => byLabel.get(r.label).value);
    check(av.every((v, i) => i === 0 || v > av[i - 1]), `t${turn + 1}: the line still rises after the placement`);
    check(after[gap]?.label === pick.label, `t${turn + 1}: it landed in the slot that was tapped`);
    seenOnLine.add(pick.label);
    placed[seat] += 1;
    correctBranch += 1;
  } else {
    check(!afterLabels.has(pick.label), `t${turn + 1}: ${pick.label} never reached the line`);
    check(after.length === rows.length, `t${turn + 1}: a miss leaves the line exactly as it was`);
    check((await rejected()).includes(pick.label), `t${turn + 1}: the miss is shown on screen`);
    const slots = await lineSlots();
    check(slots[gap]?.kind === 'reject' && slots[gap]?.label === pick.label,
      `t${turn + 1}: the miss is drawn at the slot it was aimed at (${gap === rows.length ? 'the very bottom' : `slot ${gap}`})`);
    if (gap === rows.length) bottomMissSeen = true;
    seenDiscarded.add(pick.label);
    misses[seat] += 1;
    wrongBranch += 1;
  }

  await clickText('', 'button[class*="h-12"]').catch(async () => {
    // the Next button's copy changes with what happens next — click by role
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /pass the phone|next card|final scores|see how you did/i.test(x.textContent));
      if (b) b.click();
    });
  });
  await sleep(450);
  if (!SOLO) seat = (seat + 1) % PLAYERS.length;
  turn += 1;
}

// ---------- the run really ended, for the reason the rules give ----------
check((await stage()) === 'END', 'the game reached its end screen');
if (SOLO) {
  check(misses[0] === SOLO_LIVES, `solo ended on ${SOLO_LIVES} misses (drive counted ${misses[0]})`);
  check(placed[0] > 0, `solo got ${placed[0]} card${placed[0] === 1 ? '' : 's'} onto the line`);
} else {
  const winner = placed.findIndex(p => p === HAND_SIZE);
  check(winner >= 0, `somebody emptied a hand of ${HAND_SIZE}`);
  check(has(await text(), PLAYERS[winner]), `end screen names the winner (${PLAYERS[winner]})`);
}

t = await text();
const leaves = await page.evaluate(() => [...document.querySelectorAll('*')]
  .filter(e => e.children.length === 0).map(e => e.textContent.trim()).filter(Boolean));
PLAYERS.forEach((p, i) => check(leaves.includes(String(placed[i])), `end screen shows ${p}'s ${placed[i]} placement${placed[i] === 1 ? '' : 's'}`));
check(has(t, 'share the line'), 'share button offered');
check(has(t, deck.name), 'end screen names the deck played');
// the final line is the starter plus everything the drive watched lock in
const finalRows = await page.evaluate(() => [...document.querySelectorAll('[data-line-row]')].length);
check(finalRows === 0, 'the play screen is gone at the end');
check(has(t, String(1 + seenOnLine.size)), `end screen reports a final line of ${1 + seenOnLine.size}`);
check(correctBranch > 0 && wrongBranch > 0, `exercised both branches (${correctBranch} correct, ${wrongBranch} wrong)`);
check(bottomMissSeen, 'exercised a miss aimed past the bottom of the line');
check(seenOnLine.size + seenDiscarded.size === correctBranch + wrongBranch, 'every card played went to exactly one pile');

console.log(`    started from: ${startedWith}`);
console.log(`    tally: ${PLAYERS.map((p, i) => `${p}=${placed[i]} placed/${misses[i]} missed`).join('  ')}`);
console.log(`\nconsole/page errors: ${errors.length}`);
for (const e of errors) console.log(`    ${e}`);
await browser.close();
const bad = fails.length + errors.length;
console.log(bad ? `\n✗ ${fails.length} assertion(s) failed, ${errors.length} error(s)` : '\n✓ The Line drove clean end-to-end');
process.exit(bad ? 1 : 0);
