// Three-browser drive for Truth or Drink on separate phones — dev only.
//
// Claims proved here:
//   1. Every phone shows the same question, dealt from the deck the host
//      picked, with no content sent — only a seed.
//   2. It is TURN-BASED and the turn is derived, not announced: only the
//      player whose card it is gets the buttons, and every phone moves on the
//      instant they answer, without the host doing anything.
//   3. The host can skip a quiet player, and a player who LEAVES has their
//      cards passed over rather than dragging the game back to their first
//      card (their record, answers included, is deleted when they go).
//   4. The tally on every phone matches the drive's own ledger of taps.
//   5. Create Your Vibe with no AI available (no keys here) fails gracefully:
//      the host is told, and can fall back to a ready-made deck for everyone.
//
// Usage:  npm run build && node scripts/serve-with-api.mjs 4173 &
//         node scripts/drive-tod-live.mjs [http://localhost:4173]
import fs from 'node:fs';
import { makeDrive, sleep } from './lib/live-drive.mjs';

const BASE = process.argv[2] || 'http://localhost:4173';
const DATA = JSON.parse(fs.readFileSync(new URL('../src/data/truth_or_drink.json', import.meta.url), 'utf8'));
const deckOf = q => Object.keys(DATA).find(k => Array.isArray(DATA[k]) && DATA[k].includes(q));

const D = makeDrive(BASE);
const { check, attr, exists, clickText, clickSel, waitFor } = D;
await D.launch();
console.log(`\nTruth or Drink live drive → ${BASE}\n`);

const NAMES = ['Ankit', 'Priya', 'Sam'];
const phones = [];
for (const n of NAMES) phones.push(await D.newPhone(n));
const [A, B, C] = phones;

const openLive = async page => {
    await clickText(page, 'Truth or Drink', '.game-card h3');
    // Truth or Drink is 18+ as a whole: each phone clears the Home gate itself.
    if (await waitFor(page, () => /PIN/.test(document.body.innerText), null, 4000)) await D.enterPin(page);
    await waitFor(page, () => document.querySelector('[data-live-entry]'));
    await clickSel(page, '[data-live-entry]');
    await waitFor(page, () => document.querySelector('input[placeholder="Ankit"]'));
};
for (const p of phones) await openLive(p);

await D.formRoom(A, [B, C], NAMES);
await clickSel(A, '[data-live-deck="deep"]');
check(await waitFor(B, () => /Deep Cuts/.test(document.querySelector('[data-room-config]')?.innerText || '')), 'guest lobby shows the deck the host picked (Deep Cuts)');
await clickText(A, 'Start the round');

const onTurn = async t => (await Promise.all(phones.map(p => waitFor(p, t => document.querySelector(`[data-live-turn="${t}"]`), t)))).every(Boolean);
const snapshot = () => Promise.all(phones.map(async p => ({
    q: await attr(p, '[data-live-turn]', 'data-live-question'),
    who: await attr(p, '[data-live-turn]', 'data-live-player'),
    buttons: await exists(p, '[data-live-choice]'),
})));

const ledger = Object.fromEntries(NAMES.map(n => [n, { truths: 0, drinks: 0 }]));
const tap = async (page, c) => { await clickSel(page, `[data-live-choice="${c}"]`); ledger[page.label][c === 'truth' ? 'truths' : 'drinks']++; };

// --- turn 1: Ankit -----------------------------------------------------------
check(await onTurn(0), 'every phone is on round 1');
let s = await snapshot();
check(s.every(x => x.q && x.q === s[0].q), 'same question on every phone');
check(deckOf(s[0].q) === 'deep', 'and it comes from Deep Cuts');
check(s.every(x => x.who === 'Ankit'), "it's Ankit's turn on every phone");
check(s[0].buttons && !s[1].buttons && !s[2].buttons, "only Ankit's phone has Truth / Drink");
await tap(A, 'truth');

// --- turn 2: Priya — no host action needed to get here -----------------------
check(await onTurn(1), "Ankit's answer moved every phone on, with no host tap");
s = await snapshot();
check(s.every(x => x.who === 'Priya') && s[1].buttons && !s[0].buttons, "Priya's turn, Priya's buttons");
check(/Ankit told the truth/.test(await D.text(C)), 'every phone announces what just happened');
await tap(B, 'drink');

// --- turn 3: Sam goes quiet; the host skips -----------------------------------
check(await onTurn(2), 'round 3');
check((await snapshot()).every(x => x.who === 'Sam'), "Sam's turn");
check(!(await exists(B, '[data-live-skip]')), 'only the host can skip');
await clickSel(A, '[data-live-skip]');
check(await onTurn(3), 'host skipped Sam: every phone on round 4');
check((await snapshot()).every(x => x.who === 'Ankit'), "back round to Ankit");
await tap(A, 'drink');
check(await onTurn(4), 'round 5');
await tap(B, 'truth');

// --- Sam answers once, then LEAVES -------------------------------------------
check(await onTurn(5), 'round 6');
check((await snapshot()).every(x => x.who === 'Sam'), "Sam's turn again");
await tap(C, 'truth');
check(await onTurn(6), 'round 7');
await tap(A, 'truth');
check(await Promise.all([A, B].map(p => waitFor(p, () => document.querySelector('[data-live-turn="7"]')))).then(x => x.every(Boolean)), 'round 8');
// Sam walks out through the header with the confirm dialog.
await C.evaluate(() => document.querySelector('button')?.click());
await sleep(300);
await clickText(C, 'Quit');
ledger.Sam = null;   // their answers leave with them
// Seats are Ankit 0, Priya 1, Sam 2, so round 8 (t=7) is Priya's and round 9
// (t=8) would be Sam's: it must be passed over straight to Ankit's round 10.
await tap(B, 'drink');
const jumped = await waitFor(A, () => document.querySelector('[data-live-turn="9"]'));
check(jumped, "Sam's card after he left is passed over (round 9 → round 10)");
const stillAhead = await A.evaluate(() => Number(document.querySelector('[data-live-turn]')?.getAttribute('data-live-turn')));
check(stillAhead === 9, `and the game did not jump BACK to an earlier card of his (on round ${stillAhead + 1})`);
await tap(A, 'drink');

// --- end: everyone left agrees on the tally -----------------------------------
const ended = await Promise.all([A, B].map(p => waitFor(p, () => document.querySelector('[data-live-end]'))));
check(ended.every(Boolean), 'the last answer ends the game on every phone');
for (const p of [A, B]) {
    const got = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-tod-row]')].map(e => [e.getAttribute('data-tod-row'), [Number(e.getAttribute('data-truths')), Number(e.getAttribute('data-drinks'))]])));
    const want = { Ankit: [ledger.Ankit.truths, ledger.Ankit.drinks], Priya: [ledger.Priya.truths, ledger.Priya.drinks] };
    check(JSON.stringify(got) === JSON.stringify(want), `${p.label}'s tally matches the ledger ${JSON.stringify(want)} (got ${JSON.stringify(got)})`);
}

// --- Create Your Vibe, with no AI reachable -----------------------------------
// The host walks out: the room must pass to the longest-standing player,
// or nobody left behind could ever deal again.
check(!(await exists(B, '[data-live-again]')), 'before the host leaves, the guest has no Play again');
await clickText(A, 'Leave room');
check(await waitFor(B, () => document.querySelector('[data-live-again]')), 'host left: hosting passes to Priya, who can now deal again');
await clickText(B, 'Leave room');
for (const p of [A, B]) {
    await waitFor(p, () => document.querySelector('[data-live-entry]'));
    await clickSel(p, '[data-live-entry]');
    await waitFor(p, () => document.querySelector('input[placeholder="Ankit"]'));
}
await D.formRoom(A, [B], ['Ankit', 'Priya']);
await clickSel(A, '[data-live-deck="custom"]');
await clickText(A, 'Start the round');
check(await waitFor(A, () => document.querySelector('[data-live-custom-form]')), 'Create Your Vibe: the host gets the vibe form after the start');
check(await waitFor(B, () => document.querySelector('[data-live-custom-wait]')), 'and the guest waits for the host to write it');
await A.type('[data-live-context]', 'Two old flatmates, first reunion in years, one just moved to Lisbon.', { delay: 5 });
await clickSel(A, '[data-live-generate]');
check(await waitFor(A, () => document.querySelector('[data-live-ai-error]'), null, 20000), 'no AI here: the host is told plainly');
await clickSel(A, '[data-live-fallback="classic"]');
const fell = await Promise.all([A, B].map(p => waitFor(p, () => document.querySelector('[data-live-turn="0"]'))));
check(fell.every(Boolean), 'falling back to Classic deals for both phones');
const q = await attr(B, '[data-live-turn]', 'data-live-question');
check(deckOf(q) === 'classic', 'and the cards are Classic');

await D.finish();
