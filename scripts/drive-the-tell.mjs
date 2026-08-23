// Deep regression drive for "The Tell" (dev-only, not in CI).
// Plays a full 12-round Sips game in headless Chromium — asserting the
// hold-to-reveal blur, one real timer expiry, both accusation branches
// (correct guess → Caught, wrong guess → Clean getaway), the bottled-it
// path, the Double Down badge, and the final tally arithmetic. Also checks
// that After Dark stays behind PIN 2525.
//
// Usage:  npm run build && npx vite preview --port 4173 &
//         node scripts/drive-the-tell.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const DECK = JSON.parse(fs.readFileSync(new URL('../src/data/the_tell.json', import.meta.url), 'utf8'));
const ROUND_SECS = 15; // TIMER_MIN — keeps the one real-expiry round short

// brief -> accusation title, so the drive knows the right answer every round
const ANSWER = new Map();
for (const mode of ['sips', 'skin'])
  for (const tier of DECK[mode].tiers)
    for (const m of tier.missions) ANSWER.set(m.b, m.t);

const isEnvNoise = url => url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (ok, label) => { console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); if (!ok) fails.push(label); };

const browser = await puppeteer.launch({
  ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('console', m => {
  if (m.type() !== 'error') return;
  const loc = m.location()?.url || '';
  if (m.text().includes('Failed to load resource') && (isEnvNoise(loc) || loc === '')) return;
  errors.push(`[console] ${m.text()} (${loc})`);
});
page.on('requestfailed', r => { if (!isEnvNoise(r.url())) errors.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`); });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
await page.evaluateOnNewDocument(secs => {
  // Adult gate open (that's not what this drive tests); Intimate gate left
  // LOCKED on purpose so the After Dark PIN is exercised for real.
  sessionStorage.setItem('partyspark_adult_unlocked', 'true');
  sessionStorage.removeItem('partyspark_intimate_unlocked');
  localStorage.setItem('the_tell_timer_secs', String(secs));
}, ROUND_SECS);

const text = () => page.evaluate(() => document.body.innerText);
const clickText = async (t, sel = 'button') => {
  const ok = await page.evaluate(({ sel, t }) => {
    const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if (el) { el.click(); return true; }
    return false;
  }, { sel, t });
  if (!ok) throw new Error(`click failed: "${t}"`);
  await sleep(260);
};
const waitFor = async (t, timeout = 20000) => {
  await page.waitForFunction(s => document.body.innerText.includes(s), { timeout }, t);
};

console.log('\nThe Tell — deep drive\n');

// ---- reach the game -------------------------------------------------------
await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')), { timeout: 15000 });
await clickText('Truth or Drink', '.game-card h3');
await sleep(1200);
await clickText('The Tell');
await sleep(1200);
let t = await text();
check(t.includes('secret agenda'), 'setup screen renders');
check(t.includes('Sips') && t.includes('After Dark'), 'both decks listed');
check(t.includes(`${ROUND_SECS} seconds`), 'timer pref is read from localStorage');

// ---- full 12-round Sips game ---------------------------------------------
await clickText('Sips');
await sleep(700);
check((await text()).includes('Phone to'), 'Sips deck starts at the handoff');

let expected = { clean: 0, caught: 0, bust: 0 };
let sawDoubled = false, sawExpiry = false;

for (let round = 1; round <= 12; round++) {
  t = await text();
  if (!t.includes('Phone to')) throw new Error(`round ${round}: expected handoff, got: ${t.slice(0, 120)}`);
  check(t.toLowerCase().includes(`round ${round} of 12`), `round ${round}: handoff numbered correctly`);
  await clickText("I've got it");

  // BRIEF — assert the mission is blurred until held
  const blurBefore = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(d => d.style.filter?.includes('blur'));
    return Boolean(el);
  });
  if (round === 1) check(blurBefore, 'mission is blurred before hold');
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find(d => d.className.includes('touch-none') && d.className.includes('select-none'));
    card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await sleep(320);
  const blurAfter = await page.evaluate(() => Boolean([...document.querySelectorAll('div')].find(d => d.style.filter?.includes('blur'))));
  if (round === 1) check(!blurAfter, 'hold reveals the mission');

  const brief = await page.evaluate(() => {
    const el = [...document.querySelectorAll('p')].find(p => p.className.includes('font-serif') && p.className.includes('text-[27px]'));
    return el?.textContent || '';
  });
  let answer = ANSWER.get(brief);
  if (!answer) throw new Error(`round ${round}: brief not found in deck: "${brief.slice(0, 60)}"`);
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find(d => d.className.includes('touch-none') && d.className.includes('select-none'));
    card.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await sleep(200);

  // Swap the mission once, mid-game, and make sure the round carries on with
  // the replacement (a different mission that's still in the deck).
  if (round === 5) {
    await clickText('swap it');
    await sleep(400);
    const swapped = await page.evaluate(() => {
      const el = [...document.querySelectorAll('p')].find(p => p.className.includes('font-serif') && p.className.includes('text-[27px]'));
      return el?.textContent || '';
    });
    check(swapped !== brief && ANSWER.has(swapped), 'swap replaces the mission with another from the deck');
    answer = ANSWER.get(swapped);
  }

  // Double Down on round 2 only
  const doubling = round === 2;
  if (doubling) { await clickText('Double down'); sawDoubled = true; }

  await clickText('Start the clock');
  await sleep(400);
  check((await text()).includes('face down'), round === 1 ? 'run screen shows the clock' : `round ${round}: clock runs`);

  if (round === 1) {
    // let the real timer expire once
    await waitFor('did you pull it off', (ROUND_SECS + 8) * 1000);
    sawExpiry = true;
    check(true, `timer expired on its own after ${ROUND_SECS}s`);
  } else {
    await clickText('Done early');
  }
  await sleep(300);

  // DEBRIEF — bottle it on round 3, otherwise carry on
  if (round === 3) {
    await clickText('I bottled it');
    expected.bust++;
    await sleep(400);
    t = await text();
    check(t.includes('Bottled it'), 'bottled-it path reaches its verdict');
    check(t.includes(DECK.sips.tiers[0].bust.slice(0, 24)), 'bottled-it shows the tier forfeit');
  } else {
    await clickText('Nailed it');
    await sleep(350);
    // Guess right on even rounds, wrong on odd ones
    const guessRight = round % 2 === 0;
    const picked = await page.evaluate(({ answer, guessRight }) => {
      const opts = [...document.querySelectorAll('button')].filter(b => b.textContent.trim().startsWith('“'));
      const strip = s => s.trim().replace(/^“|”$/g, '');
      const target = guessRight
        ? opts.find(o => strip(o.textContent) === answer)
        : opts.find(o => strip(o.textContent) !== answer);
      if (!target) return null;
      const label = strip(target.textContent);
      target.click();
      return label;
    }, { answer, guessRight });
    if (picked === null) throw new Error(`round ${round}: no option matched`);
    await sleep(420);
    t = await text();
    if (guessRight) {
      expected.caught++;
      check(t.includes('Caught'), `round ${round}: correct guess → Caught`);
    } else {
      expected.clean++;
      check(t.includes('Clean getaway'), `round ${round}: wrong guess → Clean getaway`);
    }
    check(t.includes(answer), `round ${round}: verdict reveals the real mission`);
  }

  if (doubling) check((await text()).includes('doubled'), 'Double Down shows on the verdict');

  await clickText(round === 12 ? 'See how it ended' : 'Next round');
  await sleep(400);
}

// ---- end screen -----------------------------------------------------------
t = await text();
check(t.toLowerCase().includes('twelve rounds'), 'end screen renders');
const tally = await page.evaluate(() => [...document.querySelectorAll('p')]
  .filter(p => p.className.includes('text-[30px]'))
  .map(p => Number(p.textContent)));
check(tally.length === 2, 'end screen shows two scores');
const sum = tally.reduce((a, b) => a + b, 0);
check(sum === expected.clean + expected.caught,
  `tally adds up (${sum} = ${expected.clean} clean + ${expected.caught} reads; ${expected.bust} bust scores nothing)`);
check(sawDoubled && sawExpiry, 'exercised both Double Down and a real timer expiry');


// ---- After Dark stays gated (run last: the end screen has no exit guard) ---
await clickText('Switch deck');
await sleep(600);
check((await text()).includes('secret agenda'), 'Switch deck returns to the picker');
await clickText('After Dark');
await sleep(500);
t = await text();
check(/PIN/i.test(t) && !t.includes('Phone to'), 'After Dark prompts for a PIN');
await page.keyboard.type('9999'); await sleep(800);
check(!(await text()).includes('Phone to'), 'wrong PIN does not open After Dark');
await page.keyboard.type('2525'); await sleep(900);
check((await text()).includes('Phone to'), 'correct PIN (2525) opens After Dark');

console.log(`\nconsole/page errors: ${errors.length}`);
for (const e of errors) console.log(`    ${e}`);
await browser.close();

const bad = fails.length + errors.length;
console.log(bad ? `\n✗ ${fails.length} assertion(s) failed, ${errors.length} error(s)` : '\n✓ The Tell drove clean end-to-end');
process.exit(bad ? 1 : 0);
