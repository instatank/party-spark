// Two-browser drive for The Line's live (separate phones) mode — dev only.
//
// The Line is the one game where separate phones do something pass-and-play
// physically cannot: your hand stays yours. Passing one phone around means
// every player sees every hand, or everybody politely looks away. So the
// headline assertion here is a NEGATIVE — none of phone A's hand labels may
// appear anywhere on phone B's screen. The happy-path checks would pass
// perfectly well on a build that leaked every card.
//
// It also asserts the harder structural claim: The Line is turn-based, so a
// shared seed is not enough on its own — the board depends on what people DID.
// Each move is published as (turn number → card, gap) and every device replays
// the same log through the same pure placeCard. The drive checks the two
// phones' rendered lines are identical after each turn, and that the line only
// ever grows — the same LINE INVARIANT the engine holds, verified across two
// devices instead of one process.
//
// Usage:  npm run build
//         node scripts/serve-with-api.mjs 4173 &
//         node scripts/drive-the-line-live.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const DATA = JSON.parse(fs.readFileSync(new URL('../src/data/the_line.json', import.meta.url), 'utf8'));
// The host's lobby defaults to the first deck.
const DECK = DATA.decks[0];
const VALUE = new Map(DECK.cards.map(c => [c.label, c.value]));
const MAX_TURNS = 24;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (ok, label) => { console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); if (!ok) fails.push(label); };
const isEnvNoise = u => u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com');

const browser = await puppeteer.launch({
    ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
    headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

const errors = [];
async function newPhone(label) {
    const ctx = await browser.createBrowserContext();   // isolated storage per phone
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 900 });
    page.on('console', m => {
        if (m.type() !== 'error') return;
        const loc = m.location()?.url || '';
        if (m.text().includes('Failed to load resource') && (isEnvNoise(loc) || loc === '')) return;
        errors.push(`[${label}] ${m.text()}`);
    });
    page.on('pageerror', e => errors.push(`[${label}] ${e.message}`));
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
        () => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')),
        { timeout: 20000 },
    );
    return page;
}

const text = page => page.evaluate(() => document.body.innerText);
const clickText = async (page, t, sel = 'button') => {
    const ok = await page.evaluate(({ sel, t }) => {
        const el = [...document.querySelectorAll(sel)]
            .find(e => (e.innerText || '').toLowerCase().includes(t.toLowerCase()));
        if (el) { el.click(); return true; }
        return false;
    }, { sel, t });
    await sleep(350);
    return ok;
};
const typeInto = async (page, placeholder, value) => {
    const sel = `input[placeholder="${placeholder}"]`;
    await page.waitForSelector(sel, { timeout: 8000 });
    await page.click(sel, { clickCount: 3 });
    await page.type(sel, String(value), { delay: 20 });
    await sleep(120);
};

const readLine = page => page.evaluate(() =>
    [...document.querySelectorAll('[data-line-row]')].map(el => el.getAttribute('data-line-row')));
const readHand = page => page.evaluate(() =>
    [...document.querySelectorAll('[data-hand-card]')].map(el => el.getAttribute('data-hand-card')));
const whoseTurn = async page => {
    const t = await text(page);
    if (/your turn/i.test(t)) return 'me';
    const m = t.match(/(\w+)'s turn/i);
    return m ? m[1] : '?';
};

// Take a turn on whichever phone is active. `want` = 'right' places the card
// where it actually belongs (looked up in the JSON, never trusted from the
// screen — the hand's values are hidden by design), 'wrong' deliberately puts
// it somewhere else so the miss path gets exercised too.
const takeTurn = async (page, want) => {
    // Every phone sees the previous placement land and dismisses it with "Got
    // it" — including the player about to move. That is deliberate (you should
    // see what just happened before you choose), so the drive has to clear it
    // too or it finds no hand to play from.
    await clickText(page, 'Got it');
    await sleep(300);

    const line = await readLine(page);
    const hand = await readHand(page);
    if (!hand.length) return null;
    const label = hand[0];
    const v = VALUE.get(label);
    if (v === undefined) return null;

    // The line is ascending by value, so the correct gap is how many cards on
    // it are smaller. Derived from the JSON, exactly as the engine would.
    const lineValues = line.map(l => VALUE.get(l)).filter(x => x !== undefined);
    const rightGap = lineValues.filter(x => x < v).length;
    const gapCount = line.length + 1;
    const gap = want === 'right'
        ? rightGap
        : (rightGap + 1) % gapCount;

    await page.evaluate(l => {
        [...document.querySelectorAll('[data-hand-card]')]
            .find(el => el.getAttribute('data-hand-card') === l)?.click();
    }, label);
    await sleep(400);

    const clicked = await page.evaluate(g => {
        const el = document.querySelector(`[data-line-gap="${g}"]`);
        if (!el) return false;
        el.click();
        return true;
    }, gap);
    if (!clicked) return null;
    await sleep(1200);
    return { label, want, expectedCorrect: want === 'right' };
};

console.log(`\nThe Line live drive → ${BASE}\n`);

const A = await newPhone('phoneA');
const B = await newPhone('phoneB');

for (const [page, name] of [[A, 'Ankit'], [B, 'Priya']]) {
    await clickText(page, 'The Line', '.game-card h3');
    await sleep(1800);
    await clickText(page, 'Play on separate phones');
    await sleep(500);
    await typeInto(page, 'Ankit', name);
}

await clickText(A, 'Start a room');
await clickText(A, 'Create the room');
await sleep(1300);
const code = ((await text(A)).match(/\b(\d{4})\b/) || [])[1];
check(Boolean(code), `host got a room code (${code})`);

await clickText(B, 'Join a room');
await typeInto(B, '0000', code);
await clickText(B, 'Join');
await sleep(1600);
check((await text(A)).includes('Priya'), 'host sees the guest in the lobby');

await clickText(A, 'Start the round');
await sleep(2800);

// --- the deal is identical on both phones --------------------------------
const line0A = await readLine(A);
const line0B = await readLine(B);
check(line0A.length >= 1, `the line opened with a starter card (${line0A.join(' | ')})`);
check(line0A.join('|') === line0B.join('|'), 'both phones opened on the SAME line from the seed alone');

// --- THE headline claim: hands are private -------------------------------
const handA = await readHand(A);
const handB = await readHand(B);
check(handA.length === 4 && handB.length === 4, `each phone holds four cards (A: ${handA.length}, B: ${handB.length})`);
check(handA.join('|') !== handB.join('|'), 'the two phones hold DIFFERENT hands');

const bodyB = await text(B);
const leakedToB = handA.filter(label => bodyB.includes(label));
console.log(`    host holds: ${handA.join(' · ')}`);
check(leakedToB.length === 0,
    `none of the host's cards appear on the guest's screen${leakedToB.length ? ` — LEAKED: ${leakedToB.join(', ')}` : ''}`);

const bodyA = await text(A);
const leakedToA = handB.filter(label => bodyA.includes(label));
check(leakedToA.length === 0,
    `none of the guest's cards appear on the host's screen${leakedToA.length ? ` — LEAKED: ${leakedToA.join(', ')}` : ''}`);

// --- turn order is derived, not announced --------------------------------
check(await whoseTurn(A) === 'me', 'host is told it is their turn');
check(await whoseTurn(B) === 'Ankit', 'guest is told whose turn it is');

// --- play out turns, checking both boards agree after each ---------------
// The host plays correctly every time and so empties a hand of four first; the
// guest misses its first card on purpose so the discard-and-redraw path is
// exercised rather than assumed.
let prevLen = line0A.length;
let boardsAlwaysMatched = true;
let turnsPlayed = 0;
let ended = false;
let sawMiss = false;
let sawHit = false;

for (let t = 0; t < MAX_TURNS; t++) {
    const isHost = t % 2 === 0;
    const active = isHost ? A : B;
    const other = isHost ? B : A;
    const activeName = isHost ? 'host' : 'guest';

    if (await whoseTurn(active) !== 'me') { check(false, `turn ${t + 1}: ${activeName} has the turn`); break; }

    // The waiting phone must not be able to act.
    const otherCanAct = await other.evaluate(() => Boolean(document.querySelector('[data-line-gap]')));
    if (otherCanAct) { check(false, `turn ${t + 1}: the waiting phone was offered gaps`); break; }

    const want = (!isHost && t === 1) ? 'wrong' : 'right';
    const played = await takeTurn(active, want);
    if (!played) { check(false, `turn ${t + 1}: the active phone could take its turn`); break; }
    turnsPlayed++;
    if (want === 'right') sawHit = true; else sawMiss = true;

    await sleep(2600);   // the other phone learns about it on a poll

    const lineActive = await readLine(active);
    const lineOther = await readLine(other);
    if (lineActive.join('|') !== lineOther.join('|')) {
        boardsAlwaysMatched = false;
        check(false, `turn ${t + 1}: both phones show the same line`);
        console.log(`      ${activeName}: ${lineActive.join(' | ')}`);
        console.log(`      other:  ${lineOther.join(' | ')}`);
        break;
    }

    // THE LINE INVARIANT across two devices: the line only ever grows, by at
    // most one — a correct placement adds a card, a wrong one adds nothing —
    // and it must actually be ascending by the JSON's values.
    const grew = lineActive.length - prevLen;
    if (grew < 0 || grew > 1) { check(false, `turn ${t + 1}: the line changed by ${grew} (must be 0 or 1)`); break; }
    if (want === 'right' && grew !== 1) { check(false, `turn ${t + 1}: a correct placement did not extend the line`); break; }
    if (want === 'wrong' && grew !== 0) { check(false, `turn ${t + 1}: a wrong placement extended the line anyway`); break; }
    prevLen = lineActive.length;

    const vals = lineActive.map(l => VALUE.get(l));
    if (vals.some(v => v === undefined)) { check(false, `turn ${t + 1}: the line shows a card not in this deck`); break; }
    if (!vals.every((v, i) => i === 0 || v > vals[i - 1])) {
        check(false, `turn ${t + 1}: the line is not ascending — ${lineActive.join(' | ')}`);
        break;
    }

    // "Final scores" is the BUTTON on the move panel, not the end screen —
    // the game is won but nobody has tapped through yet.
    if (/final scores/i.test(await text(active))) { ended = true; break; }
}

check(boardsAlwaysMatched, `both phones matched after every one of ${turnsPlayed} turns`);
check(sawHit && sawMiss, 'both a correct placement and a miss were exercised');
check(ended, `somebody emptied their hand within ${MAX_TURNS} turns`);

// --- both phones tap through to the result -------------------------------
// Each device decides the game is over from its own replayed board — there is
// no host signal here, because winnerSeat() is a property of the shared move
// log rather than an announcement. So BOTH phones must arrive on their own.
for (const page of [A, B]) {
    for (let i = 0; i < 3; i++) {
        if (/play again|new line/i.test(await text(page))) break;
        if (!(await clickText(page, 'Final scores'))) await clickText(page, 'Got it');
        await sleep(1200);
    }
}
await sleep(2600);
const endA = await text(A);
const endB = await text(B);
// Compare the whole ordered leaderboard rather than fishing a name out of the
// winner sentence — the name and the sentence are separate elements, so
// innerText puts a newline between them and a single regex misses it.
// Compare the end screens as a whole rather than fishing values out with a
// regex — the layout puts names, scores and the winner sentence in separate
// elements, and every guess at that shape is one refactor from silently
// matching nothing and "passing".
const norm = t => t.replace(/\s+/g, ' ').trim();
console.log(`    host end: ${norm(endA).slice(0, 110)}…`);
check(/emptied their hand/i.test(endA), 'the host reached the result screen');
check(endA.includes('Ankit') && endA.includes('Priya'), 'the result screen lists both players');
check(norm(endA) === norm(endB), 'both phones show an IDENTICAL result screen');

// --- hands still private after several turns -----------------------------
const handA2 = await readHand(A);
const bodyB2 = await text(B);
const lateLeak = handA2.filter(label => bodyB2.includes(label));
check(lateLeak.length === 0,
    `hands stayed private for the whole game${lateLeak.length ? ` — LEAKED: ${lateLeak.join(', ')}` : ''}`);

check(errors.length === 0, `no console errors (${errors.length})`);
errors.slice(0, 8).forEach(e => console.log(`      ${e}`));

await browser.close();
console.log(fails.length ? `\n✗ ${fails.length} failed\n` : '\n✓ all checks passed\n');
process.exit(fails.length ? 1 : 0);
