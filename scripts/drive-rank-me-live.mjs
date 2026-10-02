// Multi-browser drive for Rank Me on separate phones — dev only.
//
// Claims proved here:
//   1. Every phone deals the same cards, from the decks the host picked.
//   2. Each phone gets the right ROLE each turn: in Read mode the ranker
//      rotates through the room in join order and everyone else predicts; in
//      Couples, every team plays the same card at once with roles swapping.
//   3. Nothing is revealed until every needed phone has locked in, and the
//      host can stop waiting for a phone that has gone quiet.
//   4. Every score on every phone matches an INDEPENDENT re-implementation
//      of the scoring rule run against the orders this drive itself entered,
//      and the end boards agree with the drive's own running totals.
//
// Usage:  npm run build && node scripts/serve-with-api.mjs 4173 &
//         node scripts/drive-rank-me-live.mjs [http://localhost:4173]
import fs from 'node:fs';
import { makeDrive, sleep } from './lib/live-drive.mjs';

const BASE = process.argv[2] || 'http://localhost:4173';
const DATA = JSON.parse(fs.readFileSync(new URL('../src/data/rank_me.json', import.meta.url), 'utf8'));
const cardById = id => DATA.cards.find(c => c.id === id);

// The rule, written out again from the spec rather than imported: exact spot
// 2, one off 1, further 0; the ranker's #1 and #5 count double. Max 14.
const score = (rank, pred) => rank.reduce((s, item, i) => {
    const off = Math.abs(i - pred.indexOf(item));
    return s + (off === 0 ? 2 : off === 1 ? 1 : 0) * (i === 0 || i === rank.length - 1 ? 2 : 1);
}, 0);
const shuffle = a => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

const D = makeDrive(BASE);
const { check, attr, attrs, exists, clickText, clickSel, waitFor } = D;
await D.launch();
console.log(`\nRank Me live drive → ${BASE}\n`);

const order = page => page.evaluate(() => [...document.querySelectorAll('[data-rank-item]')].map(e => e.getAttribute('data-rank-item')));
const rowCentre = (page, i) => page.evaluate(i => {
    const el = document.querySelectorAll('[data-rank-item]')[i];
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, i);
const tapRow = async (page, i) => { const c = await rowCentre(page, i); await page.mouse.click(c.x, c.y); await sleep(120); };
const arrange = async (page, target) => {
    let cur = await order(page);
    for (let i = 0; i < target.length; i++) {
        if (cur[i] === target[i]) continue;
        await tapRow(page, i); await tapRow(page, cur.indexOf(target[i]));
        cur = await order(page);
    }
    return JSON.stringify(cur) === JSON.stringify(target);
};

const openLive = async page => {
    await D.clickNewTab(page);
    await clickText(page, 'Rank Me', '.game-card h3');
    await waitFor(page, () => document.querySelector('[data-live-entry]'));
    await clickSel(page, '[data-live-entry]');
    await waitFor(page, () => document.querySelector('input[placeholder="Ankit"]'));
};
const onTurn = async (phones, t) => (await Promise.all(phones.map(p => waitFor(p, t => document.querySelector(`[data-live-turn="${t}"]`), t)))).every(Boolean);
const role = page => attr(page, '[data-live-turn]', 'data-live-role');

// ================================================================ READ mode
const NAMES = ['Ankit', 'Priya', 'Sam'];
const phones = [];
for (const n of NAMES) phones.push(await D.newPhone(n));
for (const p of phones) await openLive(p);
const [A] = phones;
await D.formRoom(A, phones.slice(1), NAMES);
// Only What If, one lap → three cards, one per ranker.
await clickSel(A, '[data-live-deck="reallife"]');
await clickSel(A, '[data-live-length="1"]');
check(await waitFor(phones[1], () => /What If/.test(document.querySelector('[data-room-config]')?.innerText || '') && !/Real Life/.test(document.querySelector('[data-room-config]')?.innerText || '')),
    "guest lobby shows the host's deck change (What If only)");
await clickText(A, 'Start the round');

const readerTotals = Object.fromEntries(NAMES.map(n => [n, 0]));
const TURNS = 3;
for (let t = 0; t < TURNS; t++) {
    if (!(await onTurn(phones, t))) { check(false, `turn ${t + 1} reached on every phone`); break; }
    const ids = await Promise.all(phones.map(p => attr(p, '[data-live-card]', 'data-live-card')));
    const card = cardById(ids[0]);
    check(ids.every(x => x === ids[0]) && card?.deck === 'whatif', `turn ${t + 1}: same What If card on every phone (${ids[0]})`);
    const roles = await Promise.all(phones.map(role));
    const rk = t % 3;
    check(roles.every((x, i) => x === (i === rk ? 'rank' : 'read')), `turn ${t + 1}: ${NAMES[rk]} ranks, the others read (${roles.join(',')})`);

    const truth = shuffle(card.items);
    const ranker = phones[rk];
    const readers = phones.filter((_, i) => i !== rk);
    check(await arrange(ranker, truth), `turn ${t + 1}: ranker arranged their order`);
    await clickSel(ranker, '[data-lock]');
    await sleep(t === 0 ? 2200 : 300);
    if (t === 0) {
        // The ranker has locked and a poll has passed: no reader may see a reveal.
        const leaked = await Promise.all(readers.map(p => exists(p, '[data-live-read], [data-live-board]')));
        check(leaked.every(x => !x), "no reader sees any reveal while they're still predicting");
        const startsOnAnswer = await Promise.all(readers.map(async p => JSON.stringify(await order(p)) === JSON.stringify(truth)));
        check(startsOnAnswer.every(x => !x), "no reader's list starts on the ranker's answer");
        const w = await attr(ranker, '[data-live-waiting]', 'data-live-waiting');
        check(w === 'Priya,Sam', `ranker waits on the readers (${w})`);
    }

    // Reader 1 nails it; reader 2 guesses the reverse. On the last turn the
    // second reader goes quiet and the host stops waiting.
    const guesses = [truth, truth.slice().reverse()];
    const quiet = t === TURNS - 1;
    for (let k = 0; k < readers.length; k++) {
        if (quiet && k === 1) continue;
        await arrange(readers[k], guesses[k]);
        await clickSel(readers[k], '[data-lock]');
    }
    if (quiet) {
        await waitFor(A, () => document.querySelector('[data-live-force]'));
        check(await clickSel(A, '[data-live-force]'), "host can stop waiting for a quiet phone");
    }
    const expected = {};
    readers.forEach((p, k) => { if (!(quiet && k === 1)) expected[p.label] = score(truth, guesses[k]); });
    await Promise.all(phones.map(p => waitFor(p, n => document.querySelectorAll('[data-live-read]').length === n, Object.keys(expected).length)));
    for (const p of phones) {
        const got = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-live-read]')].map(e => [e.getAttribute('data-live-read'), Number(e.getAttribute('data-points'))])));
        check(JSON.stringify(Object.keys(got).sort()) === JSON.stringify(Object.keys(expected).sort()) && Object.entries(expected).every(([n, v]) => got[n] === v),
            `turn ${t + 1}: ${p.label} shows the re-scored reads ${JSON.stringify(expected)}`);
    }
    for (const [n, v] of Object.entries(expected)) readerTotals[n] += v;
    check(await exists(phones[1], '[data-live-await-host]') || rk === 1, 'guests wait on the host to move on');
    await clickSel(A, '[data-live-next]');
}
await Promise.all(phones.map(p => waitFor(p, () => document.querySelector('[data-live-end="read"]'))));
for (const p of phones) {
    const got = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-reader-row]')].map(e => [e.getAttribute('data-reader-row'), Number(e.getAttribute('data-reader-points'))])));
    check(NAMES.every(n => got[n] === readerTotals[n]), `${p.label}'s end board matches the running totals ${JSON.stringify(readerTotals)} (got ${JSON.stringify(got)})`);
}

// ============================================================= COUPLES mode
const CN = ['Ankit', 'Priya', 'Sam', 'Jo'];
const cp = [phones[0], phones[1], phones[2], await D.newPhone('Jo')];
for (const p of cp.slice(0, 3)) {
    await p.goto(BASE, { waitUntil: 'networkidle2' });
    await waitFor(p, () => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')), null, 30000);
}
for (const p of cp) await openLive(p);
cp[3].label = 'Jo';
await D.formRoom(cp[0], cp.slice(1), CN);
await clickSel(cp[0], '[data-live-mode="couples"]');
await clickSel(cp[0], '[data-live-length="4"]');
await clickText(cp[0], 'Start the round');

const teams = [[0, 1], [2, 3]];
const teamTotals = [0, 0];
for (let t = 0; t < 4; t++) {
    if (!(await onTurn(cp, t))) { check(false, `couples round ${t + 1} reached`); break; }
    const ids = await Promise.all(cp.map(p => attr(p, '[data-live-card]', 'data-live-card')));
    check(ids.every(x => x === ids[0]), `round ${t + 1}: every team on the same card`);
    const card = cardById(ids[0]);
    const roles = await Promise.all(cp.map(role));
    const expectRoles = cp.map((_, i) => (i % 2 === t % 2 ? 'rank' : 'read'));
    check(roles.join() === expectRoles.join(), `round ${t + 1}: roles swap inside each team (${roles.join(',')})`);
    const expected = {};
    for (const [k, [a, b]] of teams.entries()) {
        const rIdx = t % 2 === 0 ? a : b, dIdx = t % 2 === 0 ? b : a;
        const truth = shuffle(card.items);
        const guess = k === 0 ? truth : shuffle(card.items);
        await arrange(cp[rIdx], truth); await clickSel(cp[rIdx], '[data-lock]');
        await arrange(cp[dIdx], guess); await clickSel(cp[dIdx], '[data-lock]');
        expected[CN[dIdx]] = score(truth, guess);
        teamTotals[k] += expected[CN[dIdx]];
    }
    await Promise.all(cp.map(p => waitFor(p, () => document.querySelectorAll('[data-live-read]').length === 2)));
    for (const p of cp) {
        const got = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-live-read]')].map(e => [e.getAttribute('data-live-read'), Number(e.getAttribute('data-points'))])));
        check(Object.entries(expected).every(([n, v]) => got[n] === v), `round ${t + 1}: ${p.label} shows both teams' re-scored reads ${JSON.stringify(expected)}`);
    }
    await clickSel(cp[0], '[data-live-next]');
}
await Promise.all(cp.map(p => waitFor(p, () => document.querySelector('[data-live-end="couples"]'))));
for (const p of cp) {
    const got = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-team-row]')].map(e => [e.getAttribute('data-team-row'), Number(e.getAttribute('data-team-points'))])));
    check(got['0'] === teamTotals[0] && got['1'] === teamTotals[1], `${p.label}'s couples board matches ${teamTotals.join(' / ')} (got ${JSON.stringify(got)})`);
}

await D.finish();
