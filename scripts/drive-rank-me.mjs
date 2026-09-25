// DEV-only drive of Rank Me: all three modes end to end.
//   npm run build && npx vite preview --port 4173
//   node scripts/drive-rank-me.mjs [http://localhost:4173] [--shots DIR]
// Asserts, against the JSON and an independent re-implementation of the
// scoring (never the screen's own numbers):
//  * Hot Seat refuses to start with fewer than 3 names; the seat rotates in
//    roster order; a real mouse DRAG and a TAP-swap both reorder the list;
//    the top/bottom labels are on every ranking screen; the hand-off screen
//    shows no item (privacy); the reader never starts on the ranker's order;
//    every reveal's score matches the scoring rule; the round end's per-player
//    readability and room total match.
//  * After Dark is locked and unselected without the PIN, deals nothing before
//    it, and joins after 0438. Know Me with After Dark + "Keep it sweet" deals
//    only After Dark cards with no ex; roles alternate; "Rank it as X would";
//    the end headline, deck split, best read and biggest miss are all right.
//  * Couples vs Couples: every team plays the same card each round, roles
//    alternate inside each team, the board's totals match after every round.
//  * No card repeats within a session, and a reloaded session prefers cards
//    this device has not seen yet.
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:4173';
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > -1 ? process.argv[shotsAt + 1] : null;
const data = JSON.parse(fs.readFileSync(new URL('../src/data/rank_me.json', import.meta.url)));
const byPrompt = new Map();
for (const c of data.cards) byPrompt.set(c.id, c);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

// Independent scoring — written from the brief, not imported from the app.
const score = (ranker, pred) => ranker.reduce((s, item, i) => {
  const off = Math.abs(i - pred.indexOf(item));
  return s + (off === 0 ? 2 : off === 1 ? 1 : 0) * (i === 0 || i === 4 ? 2 : 1);
}, 0);
const pct = (pts, n = 1) => Math.round(pts / (14 * n) * 100);
const avg = xs => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

const browser = await puppeteer.launch({
  ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  headless: 'new', args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: false });
// Leaving mid-game raises the native "Leave site?" prompt (ScreenHeader's
// confirmOnExit). The drive does that exactly once, on purpose — see below.
const dialogs = [];
page.on('dialog', d => { dialogs.push(d.type()); d.accept(); });
page.on('pageerror', e => fails.push(`[pageerror] ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !/manifest|favicon|401|net::ERR_CERT_AUTHORITY_INVALID|net::ERR_FAILED/i.test(m.text())) fails.push(`[console] ${m.text()}`); });
const shot = async name => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
const text = () => page.evaluate(() => document.body.innerText);
const stage = () => page.evaluate(() => document.querySelector('[data-stage]')?.getAttribute('data-stage'));
const clickText = (sel, t) => page.evaluate((sel, t) => {
  const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
  if (el) el.click(); return Boolean(el);
}, sel, t);
const clickSel = sel => page.evaluate(sel => { const el = document.querySelector(sel); if (el) el.click(); return Boolean(el); }, sel);
const order = () => page.evaluate(() => [...document.querySelectorAll('[data-rank-item]')].map(e => e.getAttribute('data-rank-item')));
const cardId = () => page.evaluate(() => document.querySelector('[data-card-id]')?.getAttribute('data-card-id'));
const rowCentre = i => page.evaluate(i => {
  const r = document.querySelectorAll('[data-rank-item]')[i].getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, i);
const tapRow = async i => { const c = await rowCentre(i); await page.mouse.click(c.x, c.y); await sleep(120); };
const dragRow = async (from, to) => {
  const a = await rowCentre(from), b = await rowCentre(to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x, a.y + (b.y > a.y ? 8 : -8), { steps: 2 });
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up(); await sleep(250);
};
// Tap-swap the list into an exact order (selection sort over swaps).
const arrange = async target => {
  let cur = await order();
  for (let i = 0; i < 5; i++) {
    if (cur[i] === target[i]) continue;
    const j = cur.indexOf(target[i]);
    await tapRow(i); await tapRow(j);
    cur = await order();
  }
  check(JSON.stringify(cur) === JSON.stringify(target), `arrange: wanted ${target}, got ${cur}`);
};

const seedRoster = names => page.evaluate(names => {
  const k = 'party_spark_session'; const d = JSON.parse(localStorage.getItem(k) || '{}');
  d.teams = names; d.lastActivity = Date.now(); d.startTime = d.startTime || Date.now(); d.usedContent = d.usedContent || {};
  localStorage.setItem(k, JSON.stringify(d));
}, names);
const openGame = async () => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('button[aria-label="New games"]'), { timeout: 15000 });
  await page.click('button[aria-label="New games"]'); await sleep(400);
  check(await clickText('.game-card h3', 'Rank Me'), 'no Rank Me card under the NEW tab');
  await page.waitForFunction(() => document.querySelector('[data-stage="SETUP"]'), { timeout: 10000 });
};
const deckPressed = id => page.evaluate(id => document.querySelector(`[data-deck="${id}"]`)?.getAttribute('aria-pressed'), id);

// Plays one ranker → reader turn. `predict(rankerOrder)` returns the order the
// reader should lock in. Returns what was played.
const allDealt = [];
const playTurn = async ({ label, ranker, reader, predict, dragFirst = false, tapFirst = false }) => {
  check(await stage() === 'PASS_RANK', `${label}: expected PASS_RANK, got ${await stage()}`);
  const pass = await text();
  check(pass.includes(`Pass to ${ranker}`) || pass.includes(`Pass to\n${ranker}`), `${label}: hand-off does not name ${ranker}`);
  check(await clickSel('[data-cta]'), `${label}: no hand-off button`); await sleep(250);
  check(await stage() === 'RANK', `${label}: expected RANK`);
  const id = await cardId();
  const card = byPrompt.get(id);
  check(card, `${label}: card ${id} not in the JSON`);
  const rankBody = await text();
  check(rankBody.includes(card.top.toUpperCase()) || rankBody.includes(card.top), `${label}: top label missing`);
  check(rankBody.includes(card.bottom.toUpperCase()) || rankBody.includes(card.bottom), `${label}: bottom label missing`);
  let o = await order();
  check([...o].sort().join('|') === [...card.items].sort().join('|'), `${label}: items on screen are not the card's`);
  if (dragFirst) {
    const expect = [...o]; const [x] = expect.splice(0, 1); expect.splice(2, 0, x);
    await dragRow(0, 2);
    o = await order();
    check(JSON.stringify(o) === JSON.stringify(expect), `${label}: drag 1→3 gave ${o}, expected ${expect}`);
    await shot('rankme-after-drag');
  }
  if (tapFirst) {
    const expect = [...o]; [expect[1], expect[3]] = [expect[3], expect[1]];
    await tapRow(1); await tapRow(3);
    o = await order();
    check(JSON.stringify(o) === JSON.stringify(expect), `${label}: tap-swap 2↔4 gave ${o}, expected ${expect}`);
  }
  const locked = o;
  const lockBottom = await page.evaluate(() => document.querySelector('[data-lock]')?.getBoundingClientRect().bottom ?? Infinity);
  check(lockBottom <= 667, `${label}: Lock in sits below the fold (${Math.round(lockBottom)}px on a 667px screen)`);
  check(await clickSel('[data-lock]'), `${label}: no lock button`); await sleep(250);
  check(await stage() === 'PASS_READ', `${label}: expected PASS_READ`);
  const handoff = await text();
  check(!card.items.some(it => handoff.includes(it)), `${label}: an item is visible on the hand-off screen`);
  await clickSel('[data-cta]'); await sleep(250);
  check(await stage() === 'READ', `${label}: expected READ`);
  const readStart = await order();
  check(readStart.join('|') !== locked.join('|'), `${label}: reader started on the ranker's answer`);
  const banner = await page.evaluate(() => document.querySelector('[data-read-banner]')?.innerText || '');
  check(banner.includes(`Rank it as ${ranker} would`), `${label}: banner "${banner}"`);
  const readBody = await text();
  check(readBody.includes(card.top.toUpperCase()) || readBody.includes(card.top), `${label}: top label missing when reading`);
  const pred = predict(locked);
  await arrange(pred);
  await clickSel('[data-lock]'); await sleep(400);
  check(await stage() === 'REVEAL', `${label}: expected REVEAL`);
  const shown = await page.evaluate(() => ({
    pts: Number(document.querySelector('[data-score]')?.getAttribute('data-score')),
    left: [...document.querySelectorAll('[data-ranker-item]')].map(e => e.getAttribute('data-ranker-item')),
    right: [...document.querySelectorAll('[data-reader-item]')].map(e => e.getAttribute('data-reader-item')),
    tier: document.querySelector('[data-tier]')?.innerText || '',
  }));
  const pts = score(locked, pred);
  check(shown.pts === pts, `${label}: screen says ${shown.pts}, rule says ${pts}`);
  check(JSON.stringify(shown.left) === JSON.stringify(locked), `${label}: reveal left column is not the ranker's order`);
  check(JSON.stringify(shown.right) === JSON.stringify(pred), `${label}: reveal right column is not the guess`);
  const tier = pts === 14 ? 'Mind reader' : pts >= 10 ? 'Close' : pts >= 7 ? 'Getting there' : 'Guesswork';
  check(shown.tier.includes(tier) && shown.tier.includes(`${pct(pts)}%`), `${label}: tier "${shown.tier}", expected ${tier} ${pct(pts)}%`);
  allDealt.push(id);
  return { id, card, ranker, reader, locked, pred, pts };
};

// Predictions that produce a spread of scores.
const PREDICTORS = [
  o => o,                                    // 14
  o => [o[1], o[0], o[2], o[3], o[4]],       // 11
  o => [...o].reverse(),                     // 2
  o => [o[2], o[3], o[4], o[0], o[1]],       // 0
  o => [o[0], o[1], o[2], o[4], o[3]],       // 11
  o => [o[0], o[2], o[1], o[3], o[4]],       // 12
];

// ============================== HOT SEAT ==============================
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.removeItem('rank_me_seen'); sessionStorage.clear(); });
await seedRoster(['Asha', 'Ben']);
await openGame();
await shot('rankme-setup');
const overflow = await page.evaluate(() => [...document.querySelectorAll('[data-deck]')].filter(e => e.getBoundingClientRect().right > window.innerWidth).map(e => e.getAttribute('data-deck')));
check(overflow.length === 0, `deck tiles overflow the screen: ${overflow}`);
check(await deckPressed('afterdark') === 'false', 'After Dark is selected without the PIN');
check(await page.evaluate(() => Boolean(document.querySelector('[data-deck="afterdark"] svg.lucide-lock'))), 'After Dark shows no lock');
check(await clickSel('[data-deck="afterdark"]'), 'no After Dark tile');
await sleep(300);
check(/PIN/.test(await text()), 'After Dark did not ask for the PIN');
await clickText('button', 'Cancel'); await sleep(200);
check(await deckPressed('afterdark') === 'false', 'cancelled PIN still selected After Dark');
await clickSel('[data-cta]');
check(await clickText('button', 'Start'), 'no Start button'); await sleep(300);
check(await stage() === 'SETUP' && /at least 3 names/.test(await text()), 'Hot Seat started with 2 names');

const HS = ['Asha', 'Ben', 'Chitra'];
await seedRoster(HS);
await openGame();
check(await clickText('button', 'Start'), 'no Start'); await sleep(300);
const hsPlays = [];
for (let t = 0; t < 6; t++) {
  const p = await playTurn({
    label: `hotseat ${t + 1}`, ranker: HS[t % 3], reader: 'The room',
    predict: PREDICTORS[t % PREDICTORS.length], dragFirst: t === 0, tapFirst: t === 1,
  });
  check(p.card.deck !== 'afterdark', `hotseat ${t + 1}: After Dark dealt without the PIN`);
  hsPlays.push(p);
  if (t <= 2) { await sleep(1400); await shot(`rankme-reveal-${t}`); }
  await clickSel('[data-next]'); await sleep(300);
}
check(await stage() === 'END', 'hot seat did not end after 6 cards');
await shot('rankme-hotseat-end');
const hsEnd = await text();
for (const n of HS) {
  const mine = hsPlays.filter(p => p.ranker === n);
  const r = avg(mine.map(p => pct(p.pts)));
  check(new RegExp(`${n}\\s*\\n?\\s*2 cards in the hot seat\\s*\\n?\\s*${r}%`).test(hsEnd), `hot seat end: ${n} should read ${r}%`);
}
const roomTotal = hsPlays.reduce((s, p) => s + p.pts, 0);
check(await page.evaluate(() => Number(document.querySelector('[data-room-total]')?.getAttribute('data-room-total'))) === roomTotal, `hot seat end: room total should be ${roomTotal}`);
// Seat carries across rounds: round 2 opens on whoever is next.
check(await clickText('button', 'Play again'), 'no Play again'); await sleep(300);
check((await text()).includes('Pass to Asha') || (await text()).includes('Pass to\nAsha'), 'round 2 did not carry the seat on (expected Asha after Chitra)');
const round2 = await playTurn({ label: 'hotseat r2', ranker: 'Asha', reader: 'The room', predict: PREDICTORS[0] });
check(!hsPlays.some(p => p.id === round2.id), 'round 2 repeated a round 1 card');
check(new Set(allDealt).size === allDealt.length, `hot seat: a card repeated in the session ${allDealt}`);
const seenAfterHotSeat = await page.evaluate(() => JSON.parse(localStorage.getItem('rank_me_seen') || '[]'));
check(allDealt.every(id => seenAfterHotSeat.includes(id)), 'dealt cards were not remembered on the device');

// ============================== KNOW ME ==============================
// We are mid-card (a reveal), so reloading must ask before throwing the game away.
await seedRoster(['Mira', 'Dev']);
await openGame();
check(dialogs.length === 1 && dialogs[0] === 'beforeunload', `leaving mid-game should prompt once, got ${JSON.stringify(dialogs)}`);
check(await clickSel('[data-mode="knowme"]'), 'no Know Me tab'); await sleep(200);
await clickSel('[data-deck="afterdark"]'); await sleep(300);
await page.keyboard.type('0438'); await sleep(900);
check(await deckPressed('afterdark') === 'true', 'After Dark not selected after 0438');
await clickSel('[data-deck="reallife"]'); await clickSel('[data-deck="whatif"]'); await sleep(100);
check(await deckPressed('reallife') === 'false' && await deckPressed('whatif') === 'false', 'could not deselect decks');
await clickSel('[data-sweet]'); await sleep(100);
check(await page.evaluate(() => document.querySelector('[data-sweet]')?.getAttribute('aria-pressed')) === 'true', 'keep it sweet did not switch on');
check(await clickText('button[aria-pressed]', '6'), 'no 6-card option'); await sleep(100);
await shot('rankme-knowme-setup');
check(await clickText('button', 'Start'), 'no Start'); await sleep(300);
const kmPlays = [];
const KM = ['Mira', 'Dev'];
for (let t = 0; t < 6; t++) {
  const p = await playTurn({ label: `knowme ${t + 1}`, ranker: KM[t % 2], reader: KM[(t + 1) % 2], predict: PREDICTORS[(t + 2) % PREDICTORS.length] });
  check(p.card.deck === 'afterdark', `knowme ${t + 1}: dealt ${p.card.deck} with only After Dark picked`);
  check(!p.card.ex, `knowme ${t + 1}: dealt an ex card with keep-it-sweet on (${p.id})`);
  check(!seenAfterHotSeat.includes(p.id), `knowme ${t + 1}: re-dealt a card this device had already seen`);
  kmPlays.push(p);
  await clickSel('[data-next]'); await sleep(300);
}
check(await stage() === 'END', 'Know Me did not end after 6 cards');
await shot('rankme-knowme-end');
const knows = n => avg(kmPlays.filter(p => p.reader === n).map(p => pct(p.pts)));
const [km, kd] = [knows('Mira'), knows('Dev')];
const headline = await page.evaluate(() => document.querySelector('[data-headline]')?.innerText || '');
check(km === kd ? /Dead heat/.test(headline) : headline.includes(km > kd ? 'Mira knows Dev better' : 'Dev knows Mira better'), `know me headline "${headline}" (Mira ${km}%, Dev ${kd}%)`);
const kmEnd = await text();
check(kmEnd.includes(`Mira knows Dev`) && kmEnd.includes(`${km}%`) && kmEnd.includes(`${kd}%`), 'know me: per-player % missing');
const deckSplit = await page.evaluate(() => document.querySelector('[data-deck-split]')?.innerText || '');
check(deckSplit === `After Dark ${avg(kmPlays.map(p => pct(p.pts)))}%`, `know me deck split "${deckSplit}"`);
check(/Best read/i.test(kmEnd) && /Biggest miss/i.test(kmEnd), 'know me: best read / biggest miss missing');

// ============================== COUPLES ==============================
const CV = ['Ann', 'Raj', 'Lee', 'Sam'];
await seedRoster(CV);
await openGame();
check(await clickSel('[data-mode="couples"]'), 'no Couples tab'); await sleep(200);
check(await deckPressed('afterdark') === 'true', 'After Dark should default on once unlocked this session');
check((await text()).includes('Team 1: Ann & Raj') && (await text()).includes('Team 2: Lee & Sam'), 'teams not paired side by side');
check(await clickText('button[aria-pressed]', '4'), 'no 4-round option');
check(await clickText('button', 'Start'), 'no Start'); await sleep(300);
const teams = [['Ann', 'Raj'], ['Lee', 'Sam']];
const totals = [0, 0];
for (let r = 0; r < 4; r++) {
  const ids = [];
  for (let k = 0; k < 2; k++) {
    const ranker = teams[k][r % 2], reader = teams[k][(r + 1) % 2];
    const p = await playTurn({ label: `couples r${r + 1} t${k + 1}`, ranker, reader, predict: PREDICTORS[(r * 2 + k) % PREDICTORS.length] });
    ids.push(p.id);
    totals[k] += p.pts;
    await clickSel('[data-next]'); await sleep(300);
  }
  check(ids[0] === ids[1], `couples round ${r + 1}: teams got different cards ${ids}`);
  check(await stage() === 'BOARD', `couples round ${r + 1}: no leaderboard`);
  const board = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-team-row]')].map(e => [e.getAttribute('data-team-row'), Number(e.getAttribute('data-team-points'))])));
  check(board['0'] === totals[0] && board['1'] === totals[1], `couples round ${r + 1}: board ${JSON.stringify(board)}, expected ${totals}`);
  if (r === 0) await shot('rankme-couples-board');
  await clickSel('[data-next]'); await sleep(300);
}
check(await stage() === 'END', 'Couples did not end after 4 rounds');
await shot('rankme-couples-end');
const cvHead = await page.evaluate(() => document.querySelector('[data-headline]')?.innerText || '');
check(totals[0] === totals[1] ? /tie/.test(cvHead) : cvHead.includes(totals[0] > totals[1] ? 'Team 1 wins' : 'Team 2 wins'), `couples headline "${cvHead}" for totals ${totals}`);
check(/Best read of the night/i.test(await text()), 'couples: no best read of the night');

check(dialogs.length === 1, `only the mid-game reload should prompt; saw ${dialogs.length} prompts`);

await browser.close();
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log(`OK — Hot Seat (7 cards), Know Me (6, After Dark + sweet), Couples (4 rounds x 2 teams); ${allDealt.length} turns, every score matched the rule`);
