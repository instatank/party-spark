// Deep regression drive for "Nerve" (dev-only, not in CI).
// Plays a full best-of-three in headless Chromium and asserts the chicken
// mechanic end to end: turn alternation, ladder ORDER PRESERVATION (a ladder
// must always escalate), the fold branch with its price + "what was next"
// tease, a full ladder clear, the once-per-round swap, the round tally, and
// that After Dark stays behind PIN 2525.
//
// Usage:  npm run build && npx vite preview --port 4173 &
//         node scripts/drive-nerve.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const DECK = JSON.parse(fs.readFileSync(new URL('../src/data/nerve.json', import.meta.url), 'utf8'));

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
await page.evaluateOnNewDocument(() => {
  // Adult gate open (not what this drive tests); Intimate gate left LOCKED so
  // the After Dark PIN is exercised for real.
  sessionStorage.setItem('partyspark_adult_unlocked', 'true');
  sessionStorage.removeItem('partyspark_intimate_unlocked');
});

const text = () => page.evaluate(() => document.body.innerText);
const lower = async () => (await text()).toLowerCase();
const clickText = async (t, sel = 'button') => {
  const ok = await page.evaluate(({ sel, t }) => {
    const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if (el) { el.click(); return true; }
    return false;
  }, { sel, t });
  if (!ok) throw new Error(`click failed: "${t}"`);
  await sleep(260);
};
// the big serif line on the turn card is the current rung
const rungText = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('p')].find(p => p.className.includes('font-serif') && p.className.includes('text-[27px]'));
  return el?.textContent || '';
});
const whoseTurn = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('p')].find(p => p.textContent.toLowerCase().includes(", you're up"));
  return el ? el.textContent.replace(/,.*$/, '').trim() : '';
});

console.log('\nNerve — deep drive\n');

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')), { timeout: 15000 });
await clickText('Truth or Drink', '.game-card h3');
await sleep(1200);
await clickText('Nerve');
await sleep(1200);

let t = await text();
check(t.includes('Who blinks first'), 'setup screen renders');
check(t.includes('Sips') && t.includes('After Dark'), 'both decks listed');

await clickText('Sips');
await sleep(700);
check((await lower()).includes('round 1 of 3'), 'round 1 intro renders');
check((await text()).includes(DECK.sips.tiers[0].name), 'round 1 uses tier 1');

const tally = { fold: 0, cleared: 0 };
const openers = [];

for (let round = 1; round <= 3; round++) {
  if (round > 1) {
    check((await lower()).includes(`round ${round} of 3`), `round ${round} intro renders`);
    check((await text()).includes(DECK.sips.tiers[round - 1].name), `round ${round} uses tier ${round}`);
  }
  await clickText('Start climbing');
  await sleep(400);

  const authored = DECK.sips.tiers[round - 1].rungs.map(r => r.t);
  const seen = [];
  const turns = [];
  openers.push(await whoseTurn());

  // Round 1: fold immediately. Round 2: clear the whole ladder. Round 3: fold late.
  const plan = round === 1 ? 'fold-early' : round === 2 ? 'clear' : 'fold-late';
  let guard = 0;

  while (guard++ < 12) {
    const r = await rungText();
    if (!r) break;
    seen.push(r);
    turns.push(await whoseTurn());

    const bodyLower = await lower();
    const idxLine = bodyLower.match(/rung (\d+) of (\d+)/);
    const rungNo = idxLine ? Number(idxLine[1]) : -1;
    const rungTotal = idxLine ? Number(idxLine[2]) : -1;
    if (round === 1 && rungNo === 1) check(rungTotal === 6, 'ladder is 6 rungs');

    // exercise the swap once, on round 2 rung 2
    if (round === 2 && rungNo === 2) {
      const before = r;
      await clickText('swap it');
      await sleep(350);
      const after = await rungText();
      check(after !== before && authored.includes(after), 'swap replaces the rung with another from the tier');
      check((await lower()).includes('no swaps left'), 'swap is spent after one use');
      seen[seen.length - 1] = after;
    }

    if (plan === 'fold-early' && rungNo === 1) { await clickText('fold'); tally.fold++; break; }
    if (plan === 'fold-late' && rungNo === 4) { await clickText('fold'); tally.fold++; break; }
    if (plan === 'clear' && rungNo === rungTotal) {
      check((await lower()).includes('top rung'), 'top rung is flagged before you take it');
      await clickText('do it'); tally.cleared++; break;
    }
    await clickText('do it');
    await sleep(200);
  }
  await sleep(450);

  // turns must alternate between the two players
  if (turns.length > 1) {
    const alternating = turns.every((n, i) => i === 0 || n !== turns[i - 1]);
    check(alternating, `round ${round}: turns alternate between players`);
  }

  // THE property that matters: a ladder must never present a lower rung after
  // a higher one, or the escalation premise breaks.
  const positions = seen.map(x => authored.indexOf(x));
  check(positions.every(p => p >= 0), `round ${round}: every rung came from tier ${round}`);
  const ascending = positions.every((p, i) => i === 0 || p > positions[i - 1]);
  check(ascending, `round ${round}: ladder escalates (authored order preserved)`);

  t = await text();
  if (plan === 'clear') {
    check(t.includes('cleared it'), `round ${round}: clearing the ladder wins the round`);
    check(t.includes(DECK.sips.tiers[round - 1].top.slice(0, 22)), `round ${round}: clear shows the tier's payment`);
  } else {
    check(t.includes('folds'), `round ${round}: folding ends the round`);
    const folded = seen[seen.length - 1];
    const rec = DECK.sips.tiers[round - 1].rungs.find(x => x.t === folded);
    check(t.includes(rec.f.slice(0, 22)), `round ${round}: fold shows the price on the refused rung`);
    if (plan === 'fold-late') check(/and what was next/i.test(t), 'fold reveals the rung you dodged');
  }

  await clickText(round === 3 ? 'See how it ended' : 'Round ');
  await sleep(450);
}

check(openers[0] !== openers[1], 'the opening player alternates between rounds');

t = await text();
check(t.toLowerCase().includes('best of three'), 'end screen renders');
const scores = await page.evaluate(() => [...document.querySelectorAll('p')]
  .filter(p => p.className.includes('text-[30px]')).map(p => Number(p.textContent)));
check(scores.length === 2, 'end screen shows two scores');
check(scores.reduce((a, b) => a + b, 0) === 3, `rounds won sums to 3 (got ${scores.join('+')})`);
check(tally.fold === 2 && tally.cleared === 1, 'exercised both fold and full-clear endings');

// ---- After Dark stays gated (from the end screen — no exit guard there) ----
await clickText('Switch deck');
await sleep(600);
await clickText('After Dark');
await sleep(500);
t = await text();
check(/PIN/i.test(t) && !t.includes('Start climbing'), 'After Dark prompts for a PIN');
await page.keyboard.type('9999'); await sleep(800);
check(!(await text()).includes('Start climbing'), 'wrong PIN does not open After Dark');
await page.keyboard.type('2525'); await sleep(900);
t = await text();
check(t.includes('Start climbing'), 'correct PIN (2525) opens After Dark');
check(t.includes(DECK.skin.tiers[0].name), 'After Dark starts on its own tier 1');

console.log(`\nconsole/page errors: ${errors.length}`);
for (const e of errors) console.log(`    ${e}`);
await browser.close();
const bad = fails.length + errors.length;
console.log(bad ? `\n✗ ${fails.length} assertion(s) failed, ${errors.length} error(s)` : '\n✓ Nerve drove clean end-to-end');
process.exit(bad ? 1 : 0);
