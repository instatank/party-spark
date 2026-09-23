// Shared mechanics for the browser-drive scripts in this folder.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS
//
// LEARNINGS.md carries four cards — 2026-09-07, -09-10, -09-14 and -09-22 —
// recording the same failure four sessions running: a newly written drive
// re-acquires a trap that an older drive IN THIS FOLDER already solved. The
// last one was drive-five-alive-decks.mjs guessing the PIN modal's copy and
// clicking a keypad that does not exist, eight days after drive-roast-lab.mjs
// had both answers. Each card's fix was "remember to check the others", which
// is a fix aimed at a human, so a new file — starting with nobody remembering
// anything — paid again.
//
// Every trap those cards describe lives in SETUP, not in a drive's assertions:
//
//   1. The play screens arm a beforeunload guard (ScreenHeader confirmOnExit)
//      so a real player cannot lose a round by refreshing. Unhandled, it hangs
//      page.goto() forever and reads as "navigation timeout".
//   2. "Failed to load resource" console errors carry their URL in
//      m.location().url, NOT in the message text. Filtering on text alone lets
//      blocked Google Fonts requests read as app errors.
//   3. The adult gate is four <input type="tel"> boxes, not a keypad, and its
//      copy is "Enter the 4-digit PIN to access this content".
//   4. Six games sit behind the NEW tab and do not exist in the DOM until it is
//      clicked; the tab is matched by aria-label, because its visible text is
//      an icon plus a count badge.
//
// So that is what is in here.
//
// ---------------------------------------------------------------------------
// WHAT IS DELIBERATELY NOT IN HERE
//
// The per-drive query helpers — clickText, tileWords, currentQuestion,
// lockBracket and friends. Three incompatible signatures are in use across the
// existing drives: eight take (text, sel), six take (page, text, sel), and two
// take (sel, text) with the arguments REVERSED. Nobody has ever re-learned how
// to click an element by its text; each author simply wrote it. Unifying them
// would mean editing several hundred call sites in scripts that are NOT in CI,
// where a silent miss produces a drive that passes while testing nothing —
// which is strictly worse than the duplication it removes. Tidiness is not
// worth that trade. Traps are what this file is for.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The default adult gate (PinGate.tsx — do not change). */
export const ADULT_PIN = '0438';
/** The separate gate on Intimate Drinking / The Tell / Nerve. */
export const INTIMATE_PIN = '2525';

/** Home-screen games that live behind the NEW tab — keep in step with
 *  NEW_GAME_IDS in src/App.tsx. A drive opening one of these must click the
 *  tab first or the card is simply not in the DOM. */
export const NEW_TAB_GAMES = ['The Line', 'Target', 'Shortlist', 'Echo', 'Ballpark', 'House Rules'];

/** Requests that fail because of the sandbox, not because of the app. */
const BASE_NOISE = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/** Chromium in the agent sandbox if it is there, else puppeteer's own. */
export function launch(extra = {}) {
    return puppeteer.launch({
        ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
        headless: 'new',
        args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
        ...extra,
    });
}

/**
 * A page wired the way every drive in this folder needs one.
 *
 * Options exist where the drives genuinely differ; the defaults are the
 * majority behaviour, so a new drive that passes nothing gets the safe setup.
 *
 *   viewport       {width,height,...}  — taller for board-heavy games
 *   dialog         accept beforeunload (default true — see trap 1)
 *   requestFailed  also report failed requests (default false; 11 drives opt in
 *                  and 7 do not, so this stays opt-in rather than quietly
 *                  making seven drives stricter than they were)
 *   ignoreUrls     extra URL fragments that count as environment noise —
 *                  pass '/api/' on a drive where vite preview's missing
 *                  functions are expected
 *   ignoreText     message substrings that count as environment noise
 *   onError        (msg) => void; default collects into the returned array
 *   seed           { fn, arg } run through evaluateOnNewDocument before any
 *                  navigation — session roster, timer prefs, unlock flags
 *
 * `target` is a Browser, or a BrowserContext — the live drives give each phone
 * its own context, because shared storage would let one phone's session leak
 * into the other and quietly fake the sync. Both expose newPage().
 *
 * @returns {{page: import('puppeteer').Page, errors: string[]}}
 */
export async function newPage(target, {
    viewport = { width: 390, height: 844 },
    dialog = true,
    requestFailed = false,
    ignoreUrls = [],
    ignoreText = [],
    onError,
    seed,
} = {}) {
    const page = await target.newPage();
    await page.setViewport(viewport);

    const errors = [];
    const report = onError || (m => errors.push(m));
    const noisyUrl = u => [...BASE_NOISE, ...ignoreUrls].some(n => u.includes(n));
    const noisyText = t => ignoreText.some(n => t.includes(n));

    page.on('console', m => {
        if (m.type() !== 'error') return;
        const text = m.text();
        // Trap 2: the URL is on the location, not in the text.
        const where = m.location()?.url || '';
        if (noisyText(text)) return;
        if (text.includes('Failed to load resource') && (noisyUrl(where) || where === '')) return;
        if (noisyUrl(where)) return;
        report(`[console] ${text} (${where})`);
    });
    page.on('pageerror', e => report(`[pageerror] ${e.message}`));
    if (requestFailed) {
        page.on('requestfailed', r => {
            if (!noisyUrl(r.url())) report(`[reqfail] ${r.url()} ${r.failure()?.errorText}`);
        });
    }
    // Trap 1: accepting is always right for a drive — the guard exists to stop
    // a human losing a round, and an unanswered dialog hangs page.goto().
    if (dialog) page.on('dialog', d => d.accept().catch(() => {}));

    if (seed) await page.evaluateOnNewDocument(seed.fn, seed.arg);

    return { page, errors };
}

/** The check / fail / exit-code bookkeeping every drive ends with. */
export function reporter({ quiet = false } = {}) {
    const fails = [];
    const check = (ok, msg) => {
        if (ok) { if (!quiet) console.log(`  ✓ ${msg}`); }
        else { fails.push(msg); console.log(`  ✗ ${msg}`); }
        return ok;
    };
    const fail = msg => { fails.push(msg); console.log(`  ✗ ${msg}`); };
    const note = msg => console.log(msg);
    const finish = (label = '') => {
        console.log(`\n${fails.length ? `${fails.length} FAILED${label ? ` — ${label}` : ''}` : 'all checks passed'}`);
        process.exit(fails.length ? 1 : 0);
    };
    return { fails, check, fail, note, finish };
}

/** True when the adult PIN modal is on screen. Trap 3: this is the gate's real
 *  copy — "Enter PIN" never appears anywhere in PinGate.tsx. */
export async function pinGateShowing(page) {
    return page.evaluate(() => document.body.innerText.includes('Enter the 4-digit PIN'));
}

/** Type a PIN into the gate. Trap 3: four <input type="tel"> boxes, no keypad.
 *  Returns false when no gate was showing, so a caller can assert either way. */
export async function clearPinGate(page, pin = ADULT_PIN) {
    if (!await pinGateShowing(page)) return false;
    const boxes = await page.$$('input[type="tel"]');
    if (boxes.length !== 4) throw new Error(`PIN gate showed ${boxes.length} inputs, expected 4`);
    for (let i = 0; i < boxes.length; i++) await boxes[i].type(pin[i]);
    await sleep(800);
    return true;
}

/** Skip the gate entirely by pre-setting its sessionStorage flags. Pass this as
 *  `seed` to newPage on a drive whose subject is not the gate itself. */
export const unlockAdultSeed = {
    fn: () => {
        sessionStorage.setItem('partyspark_adult_unlocked', 'true');
        sessionStorage.setItem('partyspark_intimate_unlocked', 'true');
    },
};

/** Home, with the splash cleared and the game cards rendered. */
export async function toHome(page, base) {
    await page.goto(base, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
        () => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')),
        { timeout: 15000 },
    );
}

/** Trap 4: the NEW tab is matched by aria-label — its visible label is an icon,
 *  "NEW" and a count badge, so matching the text hits "NEW6" or nothing. */
export async function clickNewTab(page) {
    const ok = await page.evaluate(() => {
        const el = document.querySelector('button[aria-label="New games"]');
        if (el) { el.click(); return true; }
        return false;
    });
    if (!ok) throw new Error('clickNewTab failed: no NEW tab on home');
    await sleep(300);
}

/** Home -> a game, clicking the NEW tab first when that game needs it. */
export async function openGame(page, base, title, { settle = 1400 } = {}) {
    await toHome(page, base);
    if (NEW_TAB_GAMES.includes(title)) await clickNewTab(page);
    const ok = await page.evaluate(t => {
        const el = [...document.querySelectorAll('.game-card h3')]
            .find(h => h.textContent.trim().toLowerCase().includes(t.toLowerCase()));
        if (el) { el.click(); return true; }
        return false;
    }, title);
    if (!ok) throw new Error(`openGame failed: no card for "${title}"`);
    await sleep(settle);
}
