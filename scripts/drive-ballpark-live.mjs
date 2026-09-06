// Two-browser drive for Ballpark's live (separate phones) mode — dev only.
//
// The claim this mode makes is not "two phones can both play". It is that
// everybody commits BLIND and simultaneously, which is the thing pass-and-play
// cannot do: there, the HANDOFF screen means everyone after the first player
// has already watched somebody think. So the assertion that matters most here
// is a NEGATIVE one — after phone A locks, A must not be able to see B's
// bracket or the answer. A drive that only checked the happy path would pass
// just as happily on a build that leaked both.
//
// Also asserts the room invariant (same questions from a seed alone), that the
// reveal waits for the whole room, and that both phones agree on the final
// scores.
//
// Usage:  npm run build
//         node scripts/serve-with-api.mjs 4173 &
//         node scripts/drive-ballpark-live.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const DATA = JSON.parse(fs.readFileSync(new URL('../src/data/ballpark.json', import.meta.url), 'utf8'));
const ALL_Q = DATA.packs.flatMap(p => p.questions);

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

// The question currently on screen, matched back to the JSON so the drive
// knows the true answer without trusting anything the app rendered.
const currentQuestion = async page => {
    const t = await text(page);
    return ALL_Q.find(q => t.includes(q.q)) || null;
};

const lockBracket = async (page, lo, hi) => {
    await typeInto(page, 'low', lo);
    await typeInto(page, 'high', hi);
    await clickText(page, 'Lock the bracket');
    await sleep(500);
};

console.log(`\nBallpark live drive → ${BASE}\n`);

const A = await newPhone('phoneA');
const B = await newPhone('phoneB');

for (const [page, name] of [[A, 'Ankit'], [B, 'Priya']]) {
    await clickNewTab(page);
    await clickText(page, 'Ballpark', '.game-card h3');
    await sleep(1800);
    await clickText(page, 'Play live on separate phones');
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
await sleep(2600);

// --- the room invariant, on screen ---------------------------------------
const qA = await currentQuestion(A);
const qB = await currentQuestion(B);
check(Boolean(qA), `host is on a real question ("${qA?.q.slice(0, 48)}…")`);
check(Boolean(qA && qB && qA.id === qB.id), 'both phones got the SAME question from the seed alone');

// --- blind commit: the negative assertion --------------------------------
// Phone A locks a deliberately distinctive bracket. Until B also locks, B must
// not be able to see it, and A must not be able to see the answer.
const A_LOW = 1234567, A_HIGH = 7654321;
await lockBracket(A, A_LOW, A_HIGH);
await sleep(2400);   // more than one poll cycle — B has definitely heard from the server

const bDuringWait = await text(B);
check(!bDuringWait.includes('1,234,567') && !bDuringWait.includes('1234567'),
    "guest CANNOT see the host's bracket before committing their own");
const aDuringWait = await text(A);
check(/Waiting on/i.test(aDuringWait), 'host is told who the room is still waiting on');
check(!aDuringWait.includes(String(qA.a)) || String(qA.a).length < 3,
    'the answer is NOT on screen while anyone is still bracketing');

// --- the reveal waits for the room ---------------------------------------
await lockBracket(B, Math.max(1, Math.round(qA.a * 0.8)), Math.round(qA.a * 1.2));
await sleep(3000);

const revealA = await text(A);
const revealB = await text(B);
const answerShown = t => t.includes(qA.a.toLocaleString('en-US')) || t.includes(String(qA.a));
check(answerShown(revealA) && answerShown(revealB), 'both phones revealed together, same answer');
check(revealA.includes('Priya') && revealB.includes('Ankit'), 'each phone can now see the other on the line');

// --- play out the rest ----------------------------------------------------
// Questions are 0-indexed; the reveal's button reads "Question N+2". So the
// last advance out of a reveal is "Question 8", and only the reveal of the
// EIGHTH question offers the calibration read.
const TOTAL_Q = 8;
for (let i = 1; i < TOTAL_Q; i++) {
    const advanced = await clickText(A, `Question ${i + 1}`);
    if (!advanced) { check(false, `advance to question ${i + 1}`); break; }
    await sleep(2400);

    const q = await currentQuestion(A);
    if (!q) { check(false, `question ${i + 1} rendered`); break; }
    // A brackets tight (should score), B brackets wide but still correct.
    await lockBracket(A, Math.max(1, Math.round(q.a * 0.95)), Math.round(q.a * 1.05));
    await lockBracket(B, Math.max(1, Math.round(q.a * 0.5)), Math.round(q.a * 2));
    await sleep(2800);
}

await clickText(A, 'See the calibration read');
await sleep(3000);
const endA = await text(A);
const endB = await text(B);
check(/calibration read/i.test(endA), 'host reached the calibration read');
check(/calibration read/i.test(endB) || /Ballpark/i.test(endB), 'guest reached the end screen');

// --- both phones agree on the scores -------------------------------------
// Parse the leaderboard by LINES rather than by regex over the whole page —
// the calibration read below it is full of numbers ("62% landed at 3.1x"), and
// a loose match happily picks one of those up and calls it a score.
const scoreOf = (t, name) => {
    const lines = t.split('\n').map(l => l.trim());
    const i = lines.findIndex(l => l === name);
    if (i < 0) return null;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (/^\d+$/.test(lines[j])) return Number(lines[j]);
    }
    return null;
};
const aAnkit = scoreOf(endA, 'Ankit'), aPriya = scoreOf(endA, 'Priya');
const bAnkit = scoreOf(endB, 'Ankit'), bPriya = scoreOf(endB, 'Priya');
console.log(`    host board: Ankit=${aAnkit} Priya=${aPriya}   guest board: Ankit=${bAnkit} Priya=${bPriya}`);
check(aAnkit !== null && bAnkit !== null && aAnkit === bAnkit && aPriya === bPriya,
    'both phones show the SAME final scores');

check(errors.length === 0, `no console errors (${errors.length})`);
errors.slice(0, 8).forEach(e => console.log(`      ${e}`));

await browser.close();
console.log(fails.length ? `\n✗ ${fails.length} failed\n` : '\n✓ all checks passed\n');
process.exit(fails.length ? 1 : 0);
