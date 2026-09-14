// Two-browser regression drive for Scramble's head-to-head mode (dev-only).
//
// A single-page drive cannot test this feature at all: the whole claim of
// multiplayer is that TWO devices agree, and one page agreeing with itself
// proves nothing. So this opens two independent browser contexts (separate
// localStorage, separate sessionStorage, separate clocks as far as the app
// knows) and asserts the properties that actually matter:
//
//   1. THE ROOM INVARIANT on screen — both phones render the SAME seven
//      letters, having exchanged only a room code.
//   2. The live ticker — a word typed on phone A appears as a score on
//      phone B without B doing anything.
//   3. The shared buzzer — both rounds end together, off one server-stamped
//      deadline rather than a "go" message.
//   4. Both end screens name the SAME winner. Two phones that disagree about
//      who won is the worst possible failure and the easiest to ship.
//
// Usage:  npm run build
//         node scripts/serve-with-api.mjs 4173 &
//         node scripts/drive-versus.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const SETS = JSON.parse(fs.readFileSync(new URL('../src/data/jumble_sets.json', import.meta.url), 'utf8'));
const ROUND_SECS = 25;   // long enough to type, short enough to sit through

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
    // A separate browser context per phone — shared storage would let one
    // phone's session leak into the other and quietly fake the sync.
    const ctx = await browser.createBrowserContext();
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
    await page.evaluateOnNewDocument(secs => localStorage.setItem('jumble_timer', String(secs)), ROUND_SECS);
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    // Wait out the splash — home cards are the signal it has cleared.
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
    await page.waitForSelector(sel, { timeout: 5000 });
    await page.click(sel);
    await page.type(sel, value, { delay: 20 });
    await sleep(150);
};

// The honeycomb tiles, read off the DOM in render order.
const readTiles = page => page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
        .filter(b => /^[A-Z]$/.test((b.innerText || '').trim()));
    return btns.map(b => b.innerText.trim());
});

console.log(`\nScramble head-to-head drive → ${BASE}\n`);

// --- open both phones and get into the game -------------------------------
const A = await newPhone('phoneA');
const B = await newPhone('phoneB');

for (const [page, name] of [[A, 'Ankit'], [B, 'Priya']]) {
    // The game CARD, not Home's "Daily Scramble" quick-action tile — that one
    // deep-links straight into the Daily and skips the mode screen entirely.
    await clickText(page, 'Scramble', '.game-card h3');
    await sleep(1800);
    await clickText(page, 'Head-to-head');
    await clickText(page, 'Easy');
    await typeInto(page, 'Ankit', name);   // the name field's placeholder
}

// --- host creates, guest joins --------------------------------------------
await clickText(A, 'Start a room');
await clickText(A, 'Create the room');
await sleep(1200);

const hostText = await text(A);
const code = (hostText.match(/\b(\d{4})\b/) || [])[1];
check(Boolean(code), `host got a room code (${code})`);

await clickText(B, 'Join a room');
await typeInto(B, '0000', code);
await clickText(B, 'Join');
await sleep(1500);

check((await text(A)).includes('Priya'), 'host sees the guest arrive in the lobby');
check((await text(B)).includes('Ankit'), 'guest sees the host in the lobby');

// --- start the round ------------------------------------------------------
await clickText(A, 'Start the round');
await sleep(2500);   // guest learns via its poll, not a push

const tilesA = await readTiles(A);
const tilesB = await readTiles(B);
check(tilesA.length === 7, `host is playing 7 tiles (${tilesA.join('')})`);
check(tilesB.length === 7, `guest is playing 7 tiles (${tilesB.join('')})`);
// THE ROOM INVARIANT, on screen. Sorted because the honeycomb shuffles its
// outer ring per device — the SET must match, the layout need not.
check(
    tilesA.length === 7 && [...tilesA].sort().join('') === [...tilesB].sort().join(''),
    'both phones got the SAME seven letters (only a code crossed the wire)',
);

// --- find real words for this set from the shipped answer key -------------
const letters = [...tilesA].sort().join('');
const set = [...SETS.easy, ...SETS.hard].find(s => [...s.letters].sort().join('') === letters);
check(Boolean(set), 'the dealt set exists in the shipped pack');
const words = (set?.commonWords ?? set?.words ?? []).filter(w => w.length >= 4);

// The honeycomb fires on POINTER-DOWN, not click — deliberately, so fast taps
// in a timed game aren't swallowed by the browser's click delay. element.click()
// therefore does nothing here, which silently reads as "the player scored zero"
// rather than as a broken drive. Dispatch the event the component listens for.
const tapLetter = (page, ch) => page.evaluate(c => {
    const el = [...document.querySelectorAll('button')]
        .find(b => (b.innerText || '').trim() === c);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    return true;
}, ch);

const typeWord = async (page, word) => {
    for (const ch of word) {
        const hit = await tapLetter(page, ch);
        if (!hit) console.log(`      (no tile for "${ch}")`);
        await sleep(55);
    }
    await clickText(page, 'Enter');
    await sleep(300);
};

// --- the live ticker ------------------------------------------------------
if (words.length >= 3) {
    await typeWord(A, words[0]);
    await typeWord(A, words[1]);
    await sleep(2200);   // one poll cycle on the guest

    const bText = await text(B);
    const tickerHasHost = bText.includes('Ankit');
    const scoreOnB = (bText.match(/Ankit\s*\n?\s*(\d+)/) || [])[1];
    check(tickerHasHost, "guest's screen shows the host's name in the live ticker");
    check(Number(scoreOnB) > 0, `guest sees the host's score climb without touching anything (${scoreOnB})`);

    await typeWord(B, words[2]);
    await sleep(2200);
    const aText = await text(A);
    check(/Priya/.test(aText), "host's ticker shows the guest");
} else {
    check(false, 'not enough words in the answer key to drive the ticker');
}

// --- the shared buzzer ----------------------------------------------------
console.log('  … waiting for the shared deadline');
await sleep(ROUND_SECS * 1000 + 3500);

const endA = await text(A);
const endB = await text(B);
const ended = t => /Result|Time!/i.test(t);
check(ended(endA) && ended(endB), 'both phones ended the round');

// --- both end screens agree ----------------------------------------------
await sleep(2500);   // let the final patches land on both sides
const finalA = await text(A);
const finalB = await text(B);
const verdict = t => (t.match(/(You win\.|[A-Za-z]+ wins\.|It's a dead heat\.|Nobody scored\.)/) || [])[1] || '';
const vA = verdict(finalA), vB = verdict(finalB);
console.log(`    host sees: "${vA}"   guest sees: "${vB}"`);
check(Boolean(vA) && Boolean(vB), 'both phones reached a settled verdict');
// "You win." on one side must correspond to a named win on the other — they
// are the same fact phrased from two seats, so normalise before comparing.
const sameWinner = (vA === "It's a dead heat." && vB === "It's a dead heat.")
    || (vA === 'Nobody scored.' && vB === 'Nobody scored.')
    || (vA === 'You win.' && vB === 'Ankit wins.')
    || (vB === 'You win.' && vA === 'Priya wins.');
check(sameWinner, 'both phones name the SAME winner');

// --- console hygiene ------------------------------------------------------
check(errors.length === 0, `no console errors (${errors.length})`);
errors.slice(0, 8).forEach(e => console.log(`      ${e}`));

await browser.close();
console.log(fails.length ? `\n✗ ${fails.length} failed\n` : '\n✓ all checks passed\n');
process.exit(fails.length ? 1 : 0);
