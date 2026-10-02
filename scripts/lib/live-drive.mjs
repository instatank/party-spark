// Shared plumbing for the multi-browser "separate phones" drives — dev only.
//
// Each phone is its own incognito browser context, so storage (the PIN unlock,
// the saved room name, the room session) never leaks between them, exactly as
// it would not between two real phones. Waits are condition-based rather than
// fixed sleeps: the room polls once a second, and a fixed sleep is either too
// short on a cold server (the baseline Ballpark drive timed out once that way)
// or wastes minutes across a whole game.
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function makeDrive(base) {
    const fails = [];
    const errors = [];
    let browser;
    const isEnvNoise = u => u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com');

    const check = (ok, label) => { console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); if (!ok) fails.push(label); return ok; };

    async function launch() {
        browser = await puppeteer.launch({
            ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
            headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
        });
    }

    async function newPhone(label) {
        const ctx = await browser.createBrowserContext();
        const page = await ctx.newPage();
        page.label = label;
        await page.setViewport({ width: 390, height: 900 });
        page.on('console', m => {
            if (m.type() !== 'error') return;
            const loc = m.location()?.url || '';
            if (m.text().includes('Failed to load resource') && (isEnvNoise(loc) || loc === '')) return;
            errors.push(`[${label}] ${m.text()}`);
        });
        page.on('pageerror', e => errors.push(`[${label}] ${e.message}`));
        page.on('dialog', d => d.accept().catch(() => {}));
        await page.goto(base, { waitUntil: 'networkidle2' });
        await page.waitForFunction(
            () => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')),
            { timeout: 30000 },
        );
        return page;
    }

    const text = page => page.evaluate(() => document.body.innerText);

    const clickText = async (page, t, sel = 'button') => {
        const ok = await page.evaluate(({ sel, t }) => {
            const el = [...document.querySelectorAll(sel)]
                .find(e => (e.innerText || '').toLowerCase().includes(t.toLowerCase()) && !e.disabled);
            if (el) { el.click(); return true; }
            return false;
        }, { sel, t });
        await sleep(250);
        return ok;
    };

    const clickSel = async (page, sel) => {
        const ok = await page.evaluate(s => {
            const el = document.querySelector(s);
            if (el && !el.disabled) { el.click(); return true; }
            return false;
        }, sel);
        await sleep(250);
        return ok;
    };

    const typeInto = async (page, placeholder, value) => {
        const sel = `input[placeholder="${placeholder}"]`;
        await page.waitForSelector(sel, { timeout: 15000 });
        await page.click(sel, { clickCount: 3 });
        await page.type(sel, String(value), { delay: 15 });
        await sleep(100);
    };

    /** Wait until `fn` (run in the page) is truthy; returns false on timeout. */
    const waitFor = async (page, fn, arg, timeout = 12000) => {
        try {
            await page.waitForFunction(fn, { timeout, polling: 200 }, arg);
            return true;
        } catch { return false; }
    };

    const attr = (page, sel, name) => page.evaluate(({ sel, name }) => document.querySelector(sel)?.getAttribute(name) ?? null, { sel, name });
    const attrs = (page, sel, name) => page.evaluate(({ sel, name }) => [...document.querySelectorAll(sel)].map(e => e.getAttribute(name)), { sel, name });
    const exists = (page, sel) => page.evaluate(s => Boolean(document.querySelector(s)), sel);

    const clickNewTab = async page => {
        const ok = await clickSel(page, 'button[aria-label="New games"]');
        if (!ok) throw new Error('NEW tab not found on home');
        await sleep(300);
    };

    // The PIN modal autofocuses its first box and advances on each digit.
    const enterPin = async (page, pin = '0438') => {
        await sleep(300);
        await page.keyboard.type(pin, { delay: 60 });
        await sleep(700);
    };

    /** Host creates, guests join. Returns the room code. */
    async function formRoom(host, guests, names) {
        await typeInto(host, 'Ankit', names[0]);
        await clickText(host, 'Start a room');
        await clickText(host, 'Create the room');
        await waitFor(host, () => /Room code/i.test(document.body.innerText));
        const code = await host.evaluate(() => document.querySelector('[aria-label="Copy room code"]')?.innerText.trim());
        for (let i = 0; i < guests.length; i++) {
            await typeInto(guests[i], 'Ankit', names[i + 1]);
            await clickText(guests[i], 'Join a room');
            await typeInto(guests[i], '0000', code);
            await clickText(guests[i], 'Join');
        }
        const all = await waitFor(host, n => n.every(x => document.body.innerText.includes(x)), names);
        check(Boolean(code) && all, `room ${code} formed with ${names.join(', ')}`);
        return code;
    }

    /** Drop console errors matching `pred` — for a failure the drive caused
     *  on purpose (an aborted request logs "Failed to load resource"). */
    const ignoreErrors = pred => { for (let i = errors.length - 1; i >= 0; i--) if (pred(errors[i])) errors.splice(i, 1); };

    async function finish() {
        check(errors.length === 0, `no console errors (${errors.length})`);
        errors.slice(0, 10).forEach(e => console.log(`      ${e}`));
        await browser.close();
        console.log(fails.length ? `\n✗ ${fails.length} failed\n` : '\n✓ all checks passed\n');
        process.exit(fails.length ? 1 : 0);
    }

    return { ignoreErrors, launch, newPhone, text, clickText, clickSel, typeInto, waitFor, attr, attrs, exists, clickNewTab, enterPin, formRoom, check, finish };
}
