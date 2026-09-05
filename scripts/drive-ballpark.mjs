// Deep regression drive for "Ballpark" (dev-only, not in CI).
// Plays a full 8-question game with 3 players AND a full solo game, and
// asserts the scoring rules that are easy to get subtly wrong: the tier a
// bracket falls into is priced off its RATIO (high/low), a miss scores zero
// however close it was, an exact single-number bracket is a 20-point
// bullseye, the live badge prices the bracket before you commit it, the
// reveal shows the true answer from the deck, and the calibration verdict at
// the end matches the hit rate the drive computed for itself.
//
// Every expected number here is recomputed from src/data/ballpark.json — the
// script never trusts what the app displayed to decide what it should be.
//
// Usage:  npm run build && npx vite preview --port 4173 &
//         node scripts/drive-ballpark.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const DATA = JSON.parse(fs.readFileSync(new URL('../src/data/ballpark.json', import.meta.url), 'utf8'));
const ALL = DATA.packs.flatMap(p => p.questions);
const BY_Q = new Map(ALL.map(q => [q.q, q]));
const PLAYERS = ['Ankit', 'Priya', 'Sam'];
const ROUNDS = 8;

// --- the app's scoring rules, re-derived here on purpose ---
const TIERS = [
  { maxRatio: 1.25, pts: 10, label: 'Sniper' },
  { maxRatio: 2, pts: 6, label: 'Sharp' },
  { maxRatio: 4, pts: 4, label: 'Solid' },
  { maxRatio: 10, pts: 2, label: 'Loose' },
  { maxRatio: Infinity, pts: 1, label: 'Wild' },
];
const BULLSEYE = 20;
const tierFor = (lo, hi) => TIERS.find(t => hi / lo <= t.maxRatio);
const hit = (lo, hi, a) => a >= lo && a <= hi;
const scoreFor = (lo, hi, a) => (!hit(lo, hi, a) ? 0 : lo === hi ? BULLSEYE : tierFor(lo, hi).pts);

const isEnvNoise = u => u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (ok, label) => { console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); if (!ok) fails.push(label); };

const browser = await puppeteer.launch({
  ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];

async function newPage(roster) {
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
  await page.evaluateOnNewDocument(names => {
    const now = Date.now();
    localStorage.setItem('party_spark_session', JSON.stringify({
      startTime: now, lastActivity: now, usedContent: {}, teams: names,
    }));
  }, roster);
  return page;
}

const text = page => page.evaluate(() => document.body.innerText);
const clickText = async (page, t, sel = 'button') => {
  const ok = await page.evaluate(({ sel, t }) => {
    const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if (el) { el.click(); return true; }
    return false;
  }, { sel, t });
  if (!ok) throw new Error(`click failed: "${t}"`);
  await sleep(220);
};
// React controlled inputs ignore .value = x; go through the native setter so
// the change event React listens for actually carries the new value.
const typeInto = async (page, which, value) => {
  await page.evaluate(({ which, value }) => {
    const inputs = [...document.querySelectorAll('input[type="number"]')];
    const el = inputs[which];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(value));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { which, value });
  await sleep(90);
};

// The question currently on screen, matched back to the authored deck.
const currentQuestion = async page => {
  const shown = await page.evaluate(() => {
    const el = [...document.querySelectorAll('p')].find(p => p.className.includes('font-serif') && p.className.includes('text-[24px]'));
    return el?.textContent || '';
  });
  return { shown, authored: BY_Q.get(shown) };
};

// Brackets chosen to exercise every tier plus a hit, a near-miss and a
// bullseye, derived from the true answer so the outcome is known up front.
const planFor = (a, round, seat) => {
  const k = (round + seat) % 6;
  const r = Math.round;
  if (k === 0) return { low: Math.max(1, r(a * 0.5)), high: r(a * 2.5), why: 'wide hit' };            // ratio 5 -> Loose
  if (k === 1) return { low: Math.max(1, r(a * 0.8)), high: Math.max(1, r(a * 1.2)), why: 'tight hit' }; // ratio 1.5 -> Sharp
  if (k === 2) return { low: Math.max(1, r(a * 2)), high: r(a * 4), why: 'miss high' };               // answer below bracket
  if (k === 3) return { low: a, high: a, why: 'bullseye' };
  if (k === 4) return { low: Math.max(1, r(a * 0.95)), high: Math.max(1, Math.max(r(a * 0.95), r(a * 1.05))), why: 'sniper' };
  return { low: 1, high: r(a * 40) || 40, why: 'wild hit' };
};

// ---------------------------------------------------------------------------
async function playGame(label, roster, packLabel) {
  console.log(`\nBallpark — ${label}\n`);
  const page = await newPage(roster.length >= 2 ? roster : []);
  const solo = roster.length < 2;
  const seats = solo ? ['You'] : roster;

  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')), { timeout: 15000 });
  await clickText(page, 'Ballpark', '.game-card h3');
  await sleep(1400);

  let t = await text(page);
  check(/bracket/i.test(t), 'setup screen renders');
  if (!solo) check(roster.every(p => t.includes(p)), 'shared session roster carried the names in');
  else check(/solo/i.test(t), 'solo mode is announced when no roster is set');
  check(DATA.packs.every(p => t.includes(p.name)), 'all packs are offered');

  await clickText(page, packLabel);
  await sleep(700);

  const expected = seats.map(() => 0);
  const perSeat = seats.map(() => ({ hits: 0, played: 0 }));
  const tiersSeen = new Set();
  const seenIds = new Set();

  for (let round = 0; round < ROUNDS; round++) {
    const plans = [];
    for (let seat = 0; seat < seats.length; seat++) {
      if (!solo) {
        t = await text(page);
        check(t.includes(`Phone to ${seats[seat]}`), `q${round + 1}: handoff names ${seats[seat]}`);
        await clickText(page, "I've got it");
        await sleep(220);
      }
      const { shown, authored } = await currentQuestion(page);
      if (!authored) throw new Error(`q${round + 1}: on-screen question not in the deck: "${shown}"`);
      if (seat === 0) {
        check(!seenIds.has(authored.id), `q${round + 1}: question not repeated within the game`);
        seenIds.add(authored.id);
      }
      const plan = planFor(authored.a, round, seat);
      const expTier = plan.low === plan.high ? 'Bullseye' : tierFor(plan.low, plan.high).label;
      const expPts = scoreFor(plan.low, plan.high, authored.a);
      tiersSeen.add(expTier);

      await typeInto(page, 0, plan.low);
      await typeInto(page, 1, plan.high);
      await sleep(150);

      // The live badge must price the bracket BEFORE it is committed.
      const badge = await page.evaluate(() => document.body.innerText);
      const wantLabel = plan.low === plan.high ? 'bullseye' : expTier.toLowerCase();
      check(badge.toLowerCase().includes(wantLabel), `q${round + 1} ${seats[seat]}: live badge reads "${expTier}"`);
      const priced = plan.low === plan.high ? BULLSEYE : tierFor(plan.low, plan.high).pts;
      check(new RegExp(`\\b${priced}\\b`).test(badge), `q${round + 1} ${seats[seat]}: live badge prices it at ${priced}`);

      await clickText(page, 'Lock the bracket');
      await sleep(220);
      plans.push({ plan, authored, expPts });
      expected[seat] += expPts;
      perSeat[seat].played += 1;
      if (expPts > 0) perSeat[seat].hits += 1;
    }

    // ---- reveal ----
    await sleep(900);
    t = await text(page);
    const a = plans[0].authored;
    const shownAnswer = a.a.toLocaleString('en-US');
    check(t.includes(shownAnswer), `q${round + 1}: reveal shows the true answer ${shownAnswer}`);
    check(t.includes(a.note), `q${round + 1}: reveal carries the fact note`);
    for (let seat = 0; seat < seats.length; seat++) {
      const { plan, expPts } = plans[seat];
      const want = expPts > 0
        ? `${plan.low.toLocaleString('en-US')}–${plan.high.toLocaleString('en-US')} · +${expPts}`
        : `${plan.low.toLocaleString('en-US')}–${plan.high.toLocaleString('en-US')} · 0`;
      check(t.includes(want), `q${round + 1} ${seats[seat]}: line shows ${want}`);
    }
    await clickText(page, round + 1 === ROUNDS ? 'See the calibration read' : `Question ${round + 2}`);
    await sleep(650);
  }

  // ---- end screen ----
  t = await text(page);
  const leaves = await page.evaluate(() => [...document.querySelectorAll('*')]
    .filter(e => e.children.length === 0).map(e => e.textContent.trim()).filter(Boolean));
  seats.forEach((n, i) => {
    check(leaves.includes(String(expected[i])), `end screen shows ${n}'s total of ${expected[i]}`);
  });
  const topScore = Math.max(...expected);
  const leader = seats[expected.indexOf(topScore)];
  check(t.includes(leader), `end screen names the leader (${leader})`);

  // the calibration verdict has to agree with the hit rate we tracked
  const verdictFor = (hits, played) => {
    const rate = hits / played;
    if (rate >= 0.8) return ['deadly', 'playing it safe'];
    if (rate >= 0.55) return ['well calibrated'];
    if (rate >= 0.3) return ['overconfident'];
    return ['wildly overconfident'];
  };
  seats.forEach((n, i) => {
    const want = verdictFor(perSeat[i].hits, perSeat[i].played);
    const lower = t.toLowerCase();
    check(want.some(w => lower.includes(w)), `${n}: calibration verdict matches ${perSeat[i].hits}/${perSeat[i].played} hits (${want.join(' or ')})`);
    check(lower.includes(`${Math.round((perSeat[i].hits / perSeat[i].played) * 100)}% landed`), `${n}: end screen states the true hit rate`);
  });
  check(tiersSeen.size >= 4, `exercised ${tiersSeen.size} bracket tiers: ${[...tiersSeen].join(', ')}`);
  check(/share the read/i.test(t), 'share button offered on the end screen');
  console.log(`    expected totals: ${seats.map((n, i) => `${n}=${expected[i]}`).join(' ')}`);

  await page.close();
}

await playGame('3 players, Mixed Bag', PLAYERS, 'Mixed Bag');
await playGame('solo, Planet & Cosmos', [], 'Planet & Cosmos');

console.log(`\nconsole/page errors: ${errors.length}`);
for (const e of errors) console.log(`    ${e}`);
await browser.close();
const bad = fails.length + errors.length;
console.log(bad ? `\n✗ ${fails.length} assertion(s) failed, ${errors.length} error(s)` : '\n✓ Ballpark drove clean end-to-end');
process.exit(bad ? 1 : 0);
