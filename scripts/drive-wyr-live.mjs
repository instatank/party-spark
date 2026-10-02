// Three-browser drive for Would You Rather on separate phones — dev only.
//
// What this mode claims, and so what must be proved:
//   1. Every phone deals the SAME ten cards from the seed alone, from the deck
//      the host picked in the lobby (which only works if lobby changes reach
//      the room — a bug Ballpark had).
//   2. Votes are BLIND: before a phone has answered, it shows nobody's vote.
//      In Hot Seat the seat's pick must not show on a guesser's phone before
//      the reveal. Both are negative assertions; a happy-path drive would
//      pass just as well on a build that leaked them.
//   3. The reveal waits for the whole room, and the host can stop waiting.
//   4. The split, the verdicts and the end tallies match an independent
//      re-count of the taps this drive made.
//   5. An 18+ deck asks EACH phone for the PIN — the gate is per device.
//
// Usage:  npm run build && node scripts/serve-with-api.mjs 4173 &
//         node scripts/drive-wyr-live.mjs [http://localhost:4173]
import fs from 'node:fs';
import { makeDrive, sleep } from './lib/live-drive.mjs';

const BASE = process.argv[2] || 'http://localhost:4173';
const DATA = JSON.parse(fs.readFileSync(new URL('../src/data/would_you_rather.json', import.meta.url), 'utf8'));
const deckOf = id => DATA.categories.find(c => c.items.some(q => q.id === id))?.id;

const D = makeDrive(BASE);
const { check, attr, attrs, exists, clickText, clickSel, waitFor, text } = D;
await D.launch();
console.log(`\nWould You Rather live drive → ${BASE}\n`);

const NAMES = ['Ankit', 'Priya', 'Sam'];
const phones = [];
for (const n of NAMES) phones.push(await D.newPhone(n));
const [A, B, C] = phones;

const openLive = async page => {
    await D.clickNewTab(page);
    await clickText(page, 'Would You Rather', '.game-card h3');
    await waitFor(page, () => document.querySelector('[data-live-entry]'));
    await clickSel(page, '[data-live-entry]');
    await waitFor(page, () => document.querySelector('input[placeholder="Ankit"]'));
};
for (const p of phones) await openLive(p);

// ---------------------------------------------------------------- VOTE mode
await D.formRoom(A, [B, C], NAMES);
await clickSel(A, '[data-live-deck="couples"]');
const lobbySawDeck = await waitFor(B, () => (document.querySelector('[data-room-config]')?.innerText || '').includes('Couples'));
check(lobbySawDeck, "a guest's lobby shows the deck the host picked AFTER creating the room");

await clickText(A, 'Start the round');
const allOnCard = async t => {
    const ok = await Promise.all(phones.map(p => waitFor(p, t => document.querySelector(`[data-live-turn="${t}"]`), t)));
    return ok.every(Boolean);
};
check(await allOnCard(0), 'all three phones are on card 1');

const cardIds = async () => Promise.all(phones.map(p => attr(p, '[data-live-card]', 'data-live-card')));
let ids = await cardIds();
check(ids.every(x => x && x === ids[0]), `same card on every phone from the seed alone (${ids[0]})`);
check(deckOf(ids[0]) === 'couples', 'and it comes from the Couples deck the host picked');

// --- blind voting: the negative assertions --------------------------------
const tap = (page, side) => clickSel(page, `[data-live-option="${side}"]`);
await tap(A, 'A');
await sleep(2200);   // more than a poll — B has certainly heard about A's vote
check(!(await exists(B, '[data-live-count]')), "a phone that hasn't voted sees no counts");
const bText = await text(B);
check(!bText.includes('your pick') && !/Ankit/.test(bText.split('Question')[1] || ''), "and no sign of Ankit's vote anywhere on the card");
const waitingA = await attr(A, '[data-live-waiting]', 'data-live-waiting');
check(waitingA === 'Priya,Sam', `the voter is told who the room waits on (${waitingA})`);

await tap(B, 'B');
await tap(C, 'A');
const revealed = await Promise.all(phones.map(p => waitFor(p, () => document.querySelector('[data-live-count]'))));
check(revealed.every(Boolean), 'all three phones reveal once the last vote lands');
const counts = await Promise.all(phones.map(p => attrs(p, '[data-live-count]', 'data-live-count')));
check(counts.every(c => c.join() === '2,1'), `every phone shows the real split 2–1 (${counts.map(c => c.join('-')).join(' / ')})`);
const vA = await text(A), vB = await text(B);
check(/with the room, 2 of 3/.test(vA), "Ankit's verdict: with the room, 2 of 3");
check(/on your own/.test(vB), "Priya's verdict: on her own");
check(await exists(B, '[data-live-await-host]') && !(await exists(B, '[data-live-next]')), 'only the host can move the room on');

// Independent ledger of every tap, for the end-screen re-count.
const ledger = [{ Ankit: 'A', Priya: 'B', Sam: 'A' }];

// --- the host's "don't wait" ----------------------------------------------
await clickSel(A, '[data-live-next]');
check(await allOnCard(1), 'host advanced: everyone on card 2');
ids = await cardIds();
check(ids.every(x => x === ids[0]) && deckOf(ids[0]) === 'couples', 'card 2 identical everywhere, still Couples');
await tap(A, 'B'); await tap(B, 'B');
await waitFor(A, () => document.querySelector('[data-live-force]'));
await clickSel(A, '[data-live-force]');
const forced = await Promise.all(phones.map(p => waitFor(p, () => document.querySelector('[data-live-count]'))));
check(forced.every(Boolean), "host's \"don't wait\" reveals without Sam, on every phone");
check(!(await exists(C, '[data-live-option="A"]:not([disabled])')), "Sam can no longer vote on a revealed card");
ledger.push({ Ankit: 'B', Priya: 'B' });

// --- the rest of the round, scripted so the tallies are predictable --------
// Sam always disagrees with Ankit and Priya → the contrarian.
for (let t = 2; t < 10; t++) {
    await clickSel(A, '[data-live-next]');
    if (!(await allOnCard(t))) { check(false, `card ${t + 1} reached`); break; }
    const side = t % 2 ? 'A' : 'B', other = side === 'A' ? 'B' : 'A';
    // Card 3: Priya's vote write is lost on the network. Her phone shows the
    // vote; unless the log re-publishes itself, the room waits on her forever.
    let dropped = 0;
    const drop = req => {
        if (!dropped && req.method() === 'POST' && req.url().includes('/api/room') && (req.postData() || '').includes('"action":"patch"')) { dropped++; req.abort(); }
        else req.continue();
    };
    if (t === 2) { await B.setRequestInterception(true); B.on('request', drop); }
    await tap(A, side); await tap(B, side); await tap(C, other);
    const healed = await Promise.all(phones.map(p => waitFor(p, () => document.querySelector('[data-live-count]'))));
    if (t === 2) {
        check(dropped === 1, "Priya's vote write was dropped on the network");
        check(healed.every(Boolean), 'the room still reveals: her log re-published itself on the next poll');
        B.off('request', drop); await B.setRequestInterception(false);
        D.ignoreErrors(e => e.startsWith('[Priya]') && /Failed to load resource|ERR_FAILED/.test(e));
    }
    ledger.push({ Ankit: side, Priya: side, Sam: other });
}
await clickSel(A, '[data-live-next]');
const ended = await Promise.all(phones.map(p => waitFor(p, () => document.querySelector('[data-live-end]'))));
check(ended.every(Boolean), 'all three phones reach the round-end screen');

// Re-count from the ledger: with-the-room = sided with a strict majority.
const expectWith = Object.fromEntries(NAMES.map(n => [n, 0]));
for (const row of ledger) {
    const a = Object.values(row).filter(v => v === 'A').length, b = Object.values(row).filter(v => v === 'B').length;
    const maj = a > b ? 'A' : b > a ? 'B' : null;
    for (const [n, v] of Object.entries(row)) if (v === maj) expectWith[n]++;
}
for (const p of phones) {
    const rows = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-vote-row]')].map(e => [e.getAttribute('data-vote-row'), Number(e.getAttribute('data-with-room'))])));
    check(NAMES.every(n => rows[n] === expectWith[n]), `${p.label}'s tally matches the re-count ${JSON.stringify(expectWith)} (got ${JSON.stringify(rows)})`);
}
const head = await A.evaluate(() => document.querySelector('[data-headline]')?.innerText);
// Closest pair, re-counted from the ledger over cards both of them voted on.
const agree = (x, y) => {
    const both = ledger.filter(r => r[x] && r[y]);
    return { agreed: both.filter(r => r[x] === r[y]).length, of: both.length };
};
const ap = agree('Ankit', 'Priya');
check((head || '').includes(`Ankit & Priya agreed on ${ap.agreed} of ${ap.of}`), `headline names the closest pair, ${ap.agreed} of ${ap.of} by re-count (${head})`);

// --- play again: new deal, everyone follows ---------------------------------
const firstRoundIds = ids[0];
check(!(await exists(B, '[data-live-again]')), 'only the host sees Ten more');
await clickSel(A, '[data-live-again]');
check(await allOnCard(0), 'Ten more: every phone back on card 1 of a new round');
const again = await cardIds();
check(again.every(x => x === again[0]), 'the new round is identical on every phone');
check(again[0] !== firstRoundIds, 'and it is a fresh deal, not the last round again');

// ------------------------------------------------------------- HOT SEAT, 18+
for (const p of phones) {
    await p.goto(BASE, { waitUntil: 'networkidle2' });
    await waitFor(p, () => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')), null, 30000);
    await openLive(p);
}
await D.formRoom(A, [B, C], NAMES);
await clickSel(A, '[data-live-mode="hotseat"]');
await clickSel(A, '[data-live-deck="spicy"]');
check(/PIN/.test(await text(A)), 'host picking Spicy is asked for the PIN');
await D.enterPin(A);
check(await waitFor(B, () => (document.querySelector('[data-room-config]')?.innerText || '').includes('Spicy')), 'guests see Spicy (18+) in the lobby before it starts');
await clickText(A, 'Start the round');

// Guests have not unlocked 0438 on THEIR phones.
const gated = await Promise.all([B, C].map(p => waitFor(p, () => /The host picked Spicy/.test(document.body.innerText))));
check(gated.every(Boolean), 'each guest phone asks for its own PIN before showing an 18+ card');
check(!(await exists(B, '[data-live-card]')), 'and shows no card until it is entered');
for (const p of [B, C]) await D.enterPin(p);
check(await allOnCard(0), 'after the PIN, every phone is on card 1');
ids = await cardIds();
check(ids.every(x => x === ids[0]) && deckOf(ids[0]) === 'spicy', 'same Spicy card everywhere');

// Seat rotates through the frozen roster in join order: Ankit, Priya, Sam, ...
const hot = [];
for (let t = 0; t < 10; t++) {
    if (t > 0) {
        await clickSel(A, '[data-live-next]');
        if (!(await allOnCard(t))) { check(false, `hot seat card ${t + 1} reached`); break; }
    }
    const seatName = NAMES[t % 3];
    const seats = await Promise.all(phones.map(p => attr(p, '[data-live-seat]', 'data-live-seat')));
    if (t < 3) check(seats.every(s => s === seatName), `card ${t + 1}: ${seatName} is in the hot seat on every phone`);
    const seat = phones[t % 3];
    const guessers = phones.filter(p => p !== seat);
    const truth = t % 2 ? 'A' : 'B';
    await tap(seat, truth);
    await sleep(t === 0 ? 2200 : 300);
    if (t === 0) {
        const leaked = await Promise.all(guessers.map(g => exists(g, '[data-seat-pick]')));
        check(leaked.every(x => !x), "the seat's secret pick is NOT on any guesser's phone before the reveal");
        const gText = await text(guessers[0]);
        check(!/your pick/.test(gText), "no 'your pick' marker leaks to a guesser");
    }
    // First guesser always reads the seat right; the second always guesses wrong.
    await tap(guessers[0], truth);
    await tap(guessers[1], truth === 'A' ? 'B' : 'A');
    await Promise.all(phones.map(p => waitFor(p, () => document.querySelector('[data-seat-pick]'))));
    const picks = await Promise.all(phones.map(p => p.evaluate(() => document.querySelector('[data-seat-pick]')?.closest('[data-live-option]')?.getAttribute('data-live-option'))));
    if (t < 3) check(picks.every(x => x === truth), `card ${t + 1}: every phone marks ${seatName}'s real pick (${truth})`);
    hot.push({ right: guessers[0].label, wrong: guessers[1].label });
}
await clickSel(A, '[data-live-next]');
await Promise.all(phones.map(p => waitFor(p, () => document.querySelector('[data-live-end="hotseat"]'))));
const expRight = Object.fromEntries(NAMES.map(n => [n, 0]));
for (const h of hot) expRight[h.right]++;
for (const p of phones) {
    const rows = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-reader-row]')].map(e => [e.getAttribute('data-reader-row'), Number(e.getAttribute('data-right'))])));
    check(NAMES.every(n => rows[n] === expRight[n]), `${p.label}'s reads tally matches the re-count ${JSON.stringify(expRight)} (got ${JSON.stringify(rows)})`);
}

await D.finish();
