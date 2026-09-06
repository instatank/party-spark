// Two-browser drive for Target's live (separate phones) mode — dev only.
//
// Target's whole payoff is the reveal: at the buzzer the phone shows the way in,
// and knowing the answer was always there is what makes a near miss sting. That
// only works if nobody sees it early — and an EXACT hit ends a turn on the spot,
// so somebody always finishes while others are still hunting. The negative
// assertion below is therefore the important one: while any player is still
// playing, the solution must not be on the finished player's screen.
//
// Also asserts the room invariant (same six numbers and target from a seed
// alone — dealPuzzle runs its own search on each device), the live distance
// ticker, host-only round advance, and that both phones agree on the scores.
//
// Usage:  npm run build
//         node scripts/serve-with-api.mjs 4173 &
//         node scripts/drive-target-live.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const ROUNDS = 5;

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
    await page.evaluateOnNewDocument(() => localStorage.setItem('target_timer_secs', '90'));
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
        () => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')),
        { timeout: 20000 },
    );
    return page;
}

const text = page => page.evaluate(() => document.body.innerText);
// Home parks the newest games behind a NEW tab, so their card is not in the
// DOM until that tab is clicked. Matched by aria-label — the visible label is
// an icon + "NEW" + a count badge.
const clickNewTab = async (page) => {
  const ok = await page.evaluate(() => {
    const el = document.querySelector('button[aria-label="New games"]');
    if (el) { el.click(); return true; }
    return false;
  });
  if (!ok) throw new Error('NEW tab not found on home');
  await new Promise(r => setTimeout(r, 300));
};

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

// The six tiles and the target, read straight off the board.
const readBoard = page => page.evaluate(() => {
    const grid = document.querySelector('.grid-cols-3');
    const tiles = grid ? [...grid.querySelectorAll('button')].map(b => Number(b.innerText.trim())) : [];
    // innerText comes back AFTER css text-transform, so the styled "Target"
    // label arrives as "TARGET" (notes/04). Match case-insensitively.
    const t = document.body.innerText.match(/target\s*\n\s*(\d+)/i);
    return { tiles, target: t ? Number(t[1]) : null };
});

// One legal combine: first tile, '+', second tile. Enough to move this player's
// best off the shared starting value so the two phones' scores can differ.
const combineFirstTwo = async page => {
    await page.evaluate(() => {
        const grid = document.querySelector('.grid-cols-3');
        grid?.querySelectorAll('button')[0]?.click();
    });
    await sleep(200);
    await page.evaluate(() => {
        const ops = document.querySelector('.grid-cols-4');
        [...(ops?.querySelectorAll('button') ?? [])].find(b => b.innerText.trim() === '+')?.click();
    });
    await sleep(200);
    await page.evaluate(() => {
        const grid = document.querySelector('.grid-cols-3');
        grid?.querySelectorAll('button')[1]?.click();
    });
    await sleep(400);
};

console.log(`\nTarget live drive → ${BASE}\n`);

const A = await newPhone('phoneA');
const B = await newPhone('phoneB');

for (const [page, name] of [[A, 'Ankit'], [B, 'Priya']]) {
    await clickNewTab(page);
    await clickText(page, 'Target', '.game-card h3');
    await sleep(1800);
    await clickText(page, 'Race on separate phones');
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

// --- the room invariant, on screen ---------------------------------------
const boardA = await readBoard(A);
const boardB = await readBoard(B);
check(boardA.tiles.length === 6, `host dealt six numbers (${boardA.tiles.join(', ')})`);
check(
    boardA.tiles.length === 6 && boardA.tiles.join(',') === boardB.tiles.join(','),
    'both phones dealt the SAME six numbers from the seed alone',
);
check(boardA.target !== null && boardA.target === boardB.target,
    `both phones got the same target (${boardA.target})`);

// --- play round 1: A makes a move and finishes early ----------------------
await combineFirstTwo(A);
await clickText(A, "I'm done");
await sleep(2600);

// --- the solution stays hidden while B is still playing -------------------
const aWaiting = await text(A);
check(/Waiting on/i.test(aWaiting), 'the finished player is told who is still playing');
check(!/=\s*\d+\s*$/m.test(aWaiting) && !aWaiting.includes('The way in'),
    "the solution is NOT shown to the player who finished first");
const bStill = await text(B);
check(!/Waiting on/i.test(bStill), 'the still-playing phone was not dragged into the wait screen');
// The live ticker: B can see how close A got, as a distance, never a number.
check(bStill.includes('Ankit'), "the still-playing phone shows the opponent's distance ticker");

await clickText(B, "I'm done");
await sleep(3200);

const revA = await text(A);
const revB = await text(B);
check(/Round 1/i.test(revA) && /Round 1/i.test(revB), 'both phones reached the reveal together');
// The printed solution is the strongest sync check available: each device runs
// its own search in targetEngine and prints what IT found. If the seed were
// being ignored anywhere, two phones would print two different ways in.
const solutionOf = t => (t.match(/\d+\s*[+\u2212\u00d7\u00f7]\s*\d+\s*=\s*\d+/g) || []).join(' | ');
const solA = solutionOf(revA), solB = solutionOf(revB);
console.log(`    solution shown — host: ${solA || '(none)'}`);
check(solA.length > 0, 'the reveal printed a solution');
check(solA === solB, 'both phones printed the SAME solution, each solved locally');

// Each player's closest number, as rendered on the reveal ("128 · 12 away").
// Phone A combined two tiles this round and phone B did not, so these MUST
// differ — otherwise the drive is comparing two identical nothings and the
// agreement check below would pass on a build that never synced at all.
const bestsOf = t => {
    const lines = t.split('\n').map(l => l.trim());
    const out = {};
    for (const name of ['Ankit', 'Priya']) {
        const i = lines.findIndex(l => l === name);
        if (i < 0) continue;
        const m = lines.slice(i + 1, i + 4).find(l => /^(\d+|—)( ·|$)/.test(l));
        if (m) out[name] = m;
    }
    return out;
};
const bA = bestsOf(revA), bB = bestsOf(revB);
console.log(`    bests — host sees ${JSON.stringify(bA)}; guest sees ${JSON.stringify(bB)}`);
check(bA.Ankit !== undefined && bA.Priya !== undefined, 'the reveal shows both players');
check(bA.Ankit !== bA.Priya, 'the two players genuinely posted different results');
check(JSON.stringify(bA) === JSON.stringify(bB),
    "both phones show the same result for BOTH players (not just their own)");

// --- play out the remaining rounds ---------------------------------------
for (let r = 2; r <= ROUNDS; r++) {
    await sleep(4200);   // the reveal walks the solution before enabling the button
    const advanced = await clickText(A, r === ROUNDS + 1 ? 'See the results' : `Round ${r}`)
        || await clickText(A, 'Next round');
    if (!advanced) { check(false, `advance to round ${r}`); break; }
    await sleep(2800);

    const bA = await readBoard(A);
    const bB = await readBoard(B);
    check(bA.tiles.length === 6 && bA.tiles.join(',') === bB.tiles.join(','),
        `round ${r}: both phones dealt the same numbers`);

    await combineFirstTwo(A);
    await clickText(A, "I'm done");
    await sleep(600);
    await clickText(B, "I'm done");
    await sleep(3000);
}

// --- finish ---------------------------------------------------------------
await sleep(4200);
await clickText(A, 'See the results') || await clickText(A, 'result');
await sleep(3200);

const endA = await text(A);
const endB = await text(B);
const scoreOf = (t, name) => {
    const lines = t.split('\n').map(l => l.trim());
    const i = lines.findIndex(l => l === name);
    if (i < 0) return null;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (/^\d+$/.test(lines[j])) return Number(lines[j]);
    }
    return null;
};
const aA = scoreOf(endA, 'Ankit'), aP = scoreOf(endA, 'Priya');
const bA2 = scoreOf(endB, 'Ankit'), bP = scoreOf(endB, 'Priya');
console.log(`    host board: Ankit=${aA} Priya=${aP}   guest board: Ankit=${bA2} Priya=${bP}`);
check(aA !== null && bA2 !== null, 'both phones reached a leaderboard');
check(aA === bA2 && aP === bP, 'both phones show the SAME final scores');

check(errors.length === 0, `no console errors (${errors.length})`);
errors.slice(0, 8).forEach(e => console.log(`      ${e}`));

await browser.close();
console.log(fails.length ? `\n✗ ${fails.length} failed\n` : '\n✓ all checks passed\n');
process.exit(fails.length ? 1 : 0);
