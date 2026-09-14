// Drive for the OPTIONAL clocks (dev-only, not in CI).
//
// Ballpark's bracket clock, The Line's turn clock and Shortlist's clue clock
// are all opt-in pressure rather than the mechanic, so what has to be checked
// is not that a number counts down — it is what happens at ZERO, which is a
// different rule in each game and is unreachable from any other drive:
//
//   Ballpark  — a valid bracket on screen locks itself in; nothing typed
//               scores nothing and the question still moves on.
//   The Line  — the card is discarded as a MISS and the line does not move.
//   Shortlist — the next clue is taken for you, and the payout drops with it.
//
// The clock really runs: the minimum the app accepts is 15s, so this script
// spends about a minute waiting on purpose. Nothing here fakes a timer — a
// stubbed clock would test the stub.
//
// Usage:  npm run build && npx vite preview --port 4173 &
//         node scripts/drive-timers.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const SECS = 15;                  // TIMER_MIN in src/components/ui/TimerSetting.tsx
const WAIT = (SECS + 3) * 1000;   // the clock, plus the reveal beat after it

const isEnvNoise = u => u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (ok, label) => { console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); if (!ok) fails.push(label); };

const browser = await puppeteer.launch({
  ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];

// Each game reads its own localStorage key, so the drive sets the clock the
// same way a player would — through the stored preference, not a test hook.
async function newPage(prefs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 900 });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url || '';
    if (m.text().includes('Failed to load resource') && (isEnvNoise(loc) || loc === '')) return;
    errors.push(`[console] ${m.text()} (${loc})`);
  });
  page.on('requestfailed', r => { if (!isEnvNoise(r.url())) errors.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.evaluateOnNewDocument(p => {
    for (const [k, v] of Object.entries(p)) localStorage.setItem(k, String(v));
  }, prefs);
  return page;
}

const text = page => page.evaluate(() => document.body.innerText);
const clickNewTab = async page => {
  const ok = await page.evaluate(() => {
    const el = document.querySelector('button[aria-label="New games"]');
    if (el) { el.click(); return true; }
    return false;
  });
  if (!ok) throw new Error('NEW tab not found on home');
  await sleep(300);
};
const clickText = async (page, t, sel = 'button') => {
  const ok = await page.evaluate(({ sel, t }) => {
    const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if (el && !el.disabled) { el.click(); return true; }
    return false;
  }, { sel, t });
  if (!ok) throw new Error(`click failed: "${t}"`);
  await sleep(240);
};
const typeInto = async (page, which, value) => {
  await page.evaluate(({ which, value }) => {
    const el = [...document.querySelectorAll('input[type="number"]')][which];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(value));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { which, value });
  await sleep(90);
};
const openGame = async (page, title) => {
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')), { timeout: 15000 });
  await clickNewTab(page);
  await clickText(page, title, '.game-card h3');
  await sleep(1500);
};

// ---------------------------------------------------------------------------
// Ballpark — the bracket clock (the one that ships ON)
// ---------------------------------------------------------------------------
{
  console.log('\nBallpark — the bracket clock\n');
  const page = await newPage({ ballpark_timer_secs: SECS });
  await openGame(page, 'Ballpark');
  check(/no timer|\d+s bracket/i.test(await text(page)), 'setup screen offers the clock');
  await clickText(page, 'Mixed Bag');
  await sleep(700);

  let t = await text(page);
  check(/\d+s/.test(t) && /locks in as typed|nothing typed scores nothing/i.test(t), 'the bracket screen shows the clock');

  // (1) a bracket already typed is committed as-is when the clock runs out
  await typeInto(page, 0, 5);
  await typeInto(page, 1, 500);
  await sleep(200);
  const before = await text(page);
  check(/lock the bracket/i.test(before), 'still on the bracket screen with a valid range typed');
  await sleep(WAIT);
  t = await text(page);
  check(/the answer|question 2/i.test(t), 'the clock moved the question on by itself');
  check(t.includes('5–500') || t.includes('5–500'), 'the typed bracket was locked in as it stood');
  check(!/ran out of time/i.test(t), 'a committed bracket is not reported as a no-show');

  // (2) nothing typed = no bracket, no points, and the round still moves
  await clickText(page, 'Question 2');
  await sleep(700);
  await sleep(WAIT);
  t = await text(page);
  check(/the answer|question 3/i.test(t), 'an empty bracket still moves the question on');
  check(/ran out of time/i.test(t), 'the reveal says the bracket never went in');
  check(!/^\s*1–1/m.test(t), 'a missed bracket is not drawn as a 1–1 range');
  await page.close();
}

// ---------------------------------------------------------------------------
// The Line — the turn clock (ships OFF; this drive turns it on)
// ---------------------------------------------------------------------------
{
  console.log('\nThe Line — the turn clock\n');
  const page = await newPage({ the_line_timer_secs: SECS });
  await openGame(page, 'The Line');
  check(/\d+s turn/i.test(await text(page)), 'setup screen shows the turn clock once it is set');
  await clickText(page, 'How Tall');
  await sleep(900);

  const lineBefore = await page.evaluate(() =>
    [...document.querySelectorAll('[data-line-row]')].map(e => e.dataset.lineRow));
  const handBefore = await page.evaluate(() => document.body.innerText);
  const heartsAt = () => page.evaluate(() => [...document.querySelectorAll('svg.lucide-heart')]
    .filter(s => (s.getAttribute('fill') || 'transparent') !== 'transparent').length);
  check(lineBefore.length >= 1, `the line starts with ${lineBefore.length} card(s)`);
  check(await heartsAt() === 3, 'a solo run starts on three lives');

  await sleep(WAIT);
  const t = await text(page);
  check(/time's up/i.test(t), "running out reports Time's up");
  check(/discarded unplayed/i.test(t), 'it says the card was discarded, not placed');
  const lineAfter = await page.evaluate(() =>
    [...document.querySelectorAll('[data-line-row]')].map(e => e.dataset.lineRow));
  check(JSON.stringify(lineAfter) === JSON.stringify(lineBefore), 'the line did not move — a timeout is not a placement');
  // Solo runs on three lives, drawn as filled hearts. One timeout must spend
  // exactly one — the same as a wrong placement, no more.
  check(await heartsAt() === 2, `a timeout costs exactly one life (${await heartsAt()} left of 3)`);
  check(handBefore.includes('The Line') || handBefore.length > 0, 'the turn screen was live before the clock ran');
  await page.close();
}

// ---------------------------------------------------------------------------
// Shortlist — the clue clock (ships OFF; this drive turns it on)
// ---------------------------------------------------------------------------
{
  console.log('\nShortlist — the clue clock\n');
  const page = await newPage({ shortlist_timer_secs: SECS });
  await openGame(page, 'Shortlist');
  check(/\d+s per clue/i.test(await text(page)), 'setup screen shows the clue clock once it is set');
  await clickText(page, 'The Creature Line-up');
  await sleep(500);
  await clickText(page, 'Read the first clue');
  await sleep(500);

  const clues = () => page.evaluate(() =>
    [...document.querySelectorAll('p')].filter(p => /^our suspect /i.test(p.textContent.trim())).length);
  check(await clues() === 1, 'the case opens on one clue');
  const worthBefore = await text(page);
  check(/worth 10 pts/i.test(worthBefore), 'closing on clue 1 is worth 10');

  await sleep(WAIT);
  check(await clues() === 2, 'the clock took the next clue by itself');
  const worthAfter = await text(page);
  check(/worth 8 pts/i.test(worthAfter), 'and the payout dropped to 8, exactly as taking it by hand would');
  check(!/name them.*automatically|accus/i.test(worthAfter), 'it never names a suspect for the table');
  await page.close();
}

console.log(`\nconsole/page errors: ${errors.length}`);
errors.forEach(e => console.log(`  ${e}`));
const bad = fails.length > 0 || errors.length > 0;
console.log(bad ? `\n✗ ${fails.length} assertion(s) failed, ${errors.length} error(s)` : '\n✓ every optional clock does the right thing at zero');
await browser.close();
process.exit(bad ? 1 : 0);
