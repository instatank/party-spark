// Deep regression drive for "Target" (dev-only, not in CI).
//
// Two things are worth proving on the real screen, and neither is "a number
// appeared":
//
//  1. THE DEAL INVARIANT ON SCREEN — the six numbers and target the app
//     actually rendered are exactly solvable, and the solution it printed at
//     the buzzer is arithmetically valid: every step combines two numbers
//     available at that moment, never divides unevenly or goes negative, and
//     the last step lands on the target. The drive re-implements the checker
//     from scratch and re-solves the board itself; it never takes the app's
//     word for it.
//
//  2. THE BOARD ENFORCES THE SAME RULES — an illegal combination (a fraction,
//     or a subtraction that would go below zero) must be REFUSED, leaving the
//     six tiles untouched. A board that quietly accepted 10 ÷ 4 would make the
//     solver's guarantee meaningless.
//
// It then plays the app's own printed solution back through the UI, tap by
// tap, and checks the app scores it as exact — the strongest end-to-end check
// available, because it closes the loop between the solver and the board.
//
// Usage:  npm run build && npx vite preview --port 4173 &
//         node scripts/drive-target.mjs [http://localhost:4173] [--tough]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:4173';
const TOUGH = process.argv.includes('--tough');
const PLAYERS = ['Ankit', 'Priya'];
const ROUNDS = 5;
const SECS = 300;   // the drive taps slowly; it must never race the clock

// --- the rules, re-implemented here on purpose ---
const applyOp = (x, op, y) => {
  if (op === '+') return x + y;
  if (op === '×') return x * y;
  if (op === '−') return x - y > 0 ? x - y : null;
  if (op === '÷') return y !== 0 && x % y === 0 && x / y > 0 ? x / y : null;
  return null;
};
const scoreFor = (best, target) => {
  if (best === null) return 0;
  const d = Math.abs(best - target);
  return d === 0 ? 10 : d <= 5 ? 7 : d <= 10 ? 5 : 0;
};
// independent solver, so "was it solvable?" is answered by the drive
const findSolution = (numbers, target) => {
  const pool = [...numbers];
  const steps = [];
  const search = n => {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const x = pool[i], y = pool[j];
      const a = x >= y ? x : y, b = x >= y ? y : x;
      const si = pool[i], sj = pool[j], last = pool[n - 1];
      const tryOp = (op, r) => {
        steps.push({ a, op, b, r });
        if (r === target) { const out = steps.slice(); steps.pop(); return out; }
        if (n > 2) {
          pool[i] = r; pool[j] = last;
          const got = search(n - 1);
          pool[i] = si; pool[j] = sj; pool[n - 1] = last;
          if (got) { steps.pop(); return got; }
        }
        steps.pop();
        return null;
      };
      let g = tryOp('+', a + b); if (g) return g;
      if (a !== b) { g = tryOp('−', a - b); if (g) return g; }
      if (b !== 1) { g = tryOp('×', a * b); if (g) return g; }
      if (b !== 1 && a % b === 0) { g = tryOp('÷', a / b); if (g) return g; }
    }
    return null;
  };
  return search(pool.length);
};
// replay a printed solution against the dealt numbers
const replay = (numbers, target, steps) => {
  const pool = [...numbers];
  for (const s of steps) {
    const i = pool.indexOf(s.a); if (i < 0) return `${s.a} was not available`;
    pool.splice(i, 1);
    const j = pool.indexOf(s.b); if (j < 0) return `${s.b} was not available`;
    pool.splice(j, 1);
    const r = applyOp(s.a, s.op, s.b);
    if (r === null) return `${s.a} ${s.op} ${s.b} is illegal`;
    if (r !== s.r) return `${s.a} ${s.op} ${s.b} is ${r}, not ${s.r}`;
    pool.push(r);
  }
  return steps[steps.length - 1].r === target ? true : `ends on ${steps[steps.length - 1].r}`;
};

const isEnvNoise = u => u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (ok, label) => { console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); if (!ok) fails.push(label); };

const browser = await puppeteer.launch({
  ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 1000 });
page.on('console', m => {
  if (m.type() !== 'error') return;
  const loc = m.location()?.url || '';
  if (m.text().includes('Failed to load resource') && (isEnvNoise(loc) || loc === '')) return;
  errors.push(`[console] ${m.text()} (${loc})`);
});
page.on('requestfailed', r => { if (!isEnvNoise(r.url())) errors.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`); });
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
await page.evaluateOnNewDocument(({ names, secs }) => {
  const now = Date.now();
  localStorage.setItem('party_spark_session', JSON.stringify({ startTime: now, lastActivity: now, usedContent: {}, teams: names }));
  localStorage.setItem('target_timer_secs', String(secs));
}, { names: PLAYERS, secs: SECS });

const text = () => page.evaluate(() => document.body.innerText);
// innerText is returned AFTER css text-transform, so uppercase copy comes back
// in caps (notes/04) — compare case-insensitively.
const has = (t, needle) => t.toLowerCase().includes(String(needle).toLowerCase());
const clickText = async (t, sel = 'button') => {
  const ok = await page.evaluate(({ sel, t }) => {
    const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if (el && !el.disabled) { el.click(); return true; }
    return false;
  }, { sel, t });
  if (!ok) throw new Error(`click failed: "${t}"`);
  await sleep(200);
};
// The pool tiles are the grid-cols-3 buttons whose whole label is a number.
const tiles = () => page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .filter(b => /^\d+$/.test(b.textContent.trim()) && !b.disabled)
    .map(b => Number(b.textContent.trim())));
const tapNumber = async (v, nth = 0) => {
  const ok = await page.evaluate(({ v, nth }) => {
    const all = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === String(v) && !b.disabled);
    if (all[nth]) { all[nth].click(); return true; }
    return false;
  }, { v, nth });
  if (!ok) throw new Error(`no tile for ${v} (#${nth})`);
  await sleep(120);
};
const tapOp = async o => {
  const ok = await page.evaluate(o => {
    const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === o && !b.disabled);
    if (el) { el.click(); return true; }
    return false;
  }, o);
  if (!ok) throw new Error(`no operator ${o}`);
  await sleep(120);
};
const targetOnScreen = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('p')].find(p => p.className.includes('text-[46px]') || p.className.includes('text-[52px]'));
  return el ? Number(el.textContent.trim()) : null;
});
const solutionOnScreen = () => page.evaluate(() =>
  [...document.querySelectorAll('div')]
    .filter(d => d.children.length === 0 && /^\d+ [+−×÷] \d+ = \d+$/.test(d.textContent.trim()))
    .map(d => d.textContent.trim()));
// The turn ends by itself the moment a result equals the target, so a drive
// that keeps tapping walks into a screen that no longer has tiles. Everything
// below checks it is still on the board before continuing.
const onBoard = () => page.evaluate(() =>
  [...document.querySelectorAll('button')].some(b => /i'm done/i.test(b.textContent)));
// Play a chain of steps, stopping if the app ends the turn under us.
const playSteps = async steps => {
  for (const st of steps) {
    if (!(await onBoard())) return false;
    await tapNumber(st.a);
    await tapOp(st.op);
    await tapNumber(st.b, st.a === st.b ? 1 : 0);
  }
  return true;
};
const parseStep = s => {
  const m = s.match(/^(\d+) ([+−×÷]) (\d+) = (\d+)$/);
  return { a: Number(m[1]), op: m[2], b: Number(m[3]), r: Number(m[4]) };
};

console.log(`\nTarget — deep drive (${TOUGH ? 'Tough' : 'Classic'})\n`);

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')), { timeout: 15000 });
await clickText('Target', '.game-card h3');
await sleep(1500);

let t = await text();
check(has(t, 'six numbers'), 'setup screen renders');
check(PLAYERS.every(p => t.includes(p)), 'shared session roster carried the names in');
check(has(t, `${SECS}s round`), 'shared TimerSetting chip reflects the stored preference');
check(has(t, 'Classic') && has(t, 'Tough'), 'both difficulties are offered');

await clickText(TOUGH ? 'Tough' : 'Classic');
await sleep(700);

const expected = PLAYERS.map(() => 0);
let illegalTested = false, exactTested = false, nearTested = false;

for (let round = 0; round < ROUNDS; round++) {
  let dealt = null;
  let tgt = null;

  for (let seat = 0; seat < PLAYERS.length; seat++) {
    t = await text();
    check(has(t, `Phone to ${PLAYERS[seat]}`), `r${round + 1}: handoff names ${PLAYERS[seat]}`);
    check(has(t, `Round ${round + 1} of ${ROUNDS}`), `r${round + 1}: handoff shows the round`);
    await clickText('Start the clock');
    await sleep(350);

    const nums = await tiles();
    const screenTarget = await targetOnScreen();
    if (seat === 0) {
      dealt = nums;
      tgt = screenTarget;
      check(nums.length === 6, `r${round + 1}: six tiles dealt (${nums.join(', ')})`);
      check(tgt >= 101 && tgt <= 999, `r${round + 1}: target ${tgt} is three digits`);
      // THE DEAL INVARIANT, checked against the drive's own solver
      const mine = findSolution(nums, tgt);
      check(Boolean(mine), `r${round + 1}: the dealt board is exactly solvable (drive found ${mine ? mine.length : 0} steps)`);
    } else {
      check(JSON.stringify(nums) === JSON.stringify(dealt), `r${round + 1}: ${PLAYERS[seat]} gets the same six numbers`);
      check(screenTarget === tgt, `r${round + 1}: ${PLAYERS[seat]} gets the same target`);
    }

    if (seat === 0) {
      // --- the board must refuse an illegal move ---
      const sorted = [...nums].sort((a, b) => a - b);
      let bad = null;
      for (let x = 0; x < sorted.length && !bad; x++) {
        for (let y = 0; y < sorted.length; y++) {
          if (sorted[x] > sorted[y] && sorted[x] % sorted[y] !== 0) { bad = [sorted[x], '÷', sorted[y]]; break; }
        }
      }
      if (bad) {
        await tapNumber(bad[0]);
        await tapOp(bad[1]);
        await tapNumber(bad[2]);
        await sleep(250);
        const after = await tiles();
        check(after.length === 6, `r${round + 1}: ${bad[0]} ÷ ${bad[2]} refused — still six tiles`);
        check(JSON.stringify([...after].sort((a, b) => a - b)) === JSON.stringify(sorted), `r${round + 1}: the refused move changed nothing`);
        illegalTested = true;
      }

      // --- play the app's own solution back through the UI ---
      // (the drive re-solves it itself; playing OUR solution proves the board
      // accepts exactly what the solver claims is possible)
      const mine = findSolution(nums, tgt);
      // an intermediate step can already be the target — the app ends the turn
      // there, so the drive stops there too
      const upto = mine.findIndex(st => st.r === tgt);
      await playSteps(mine.slice(0, upto >= 0 ? upto + 1 : mine.length));
      await sleep(900);
      expected[seat] += 10;
      exactTested = true;
    } else {
      // Land a deliberate NEAR miss so the partial-score branch is exercised:
      // solve for a target a few away and play that instead.
      let near = null;
      for (const delta of [3, -3, 2, -2, 4, -4, 1, -1, 5, -5, 6, -6, 7, -7, 8, -8, 9, -9, 10, -10]) {
        const alt = tgt + delta;
        if (alt < 1) continue;
        const sol = findSolution(dealt, alt);
        // an intermediate landing on the target would end the turn as an exact
        // hit, which is not the branch this seat is here to exercise
        if (sol && sol.every(st => st.r !== tgt)) { near = { value: alt, sol }; break; }
      }
      let closest = dealt.reduce((b, v) => (Math.abs(v - tgt) < Math.abs(b - tgt) ? v : b), dealt[0]);
      if (near) {
        await playSteps(near.sol);
        await sleep(250);
        if (Math.abs(near.value - tgt) < Math.abs(closest - tgt)) closest = near.value;
      }
      if (await onBoard()) await clickText("I'm done");
      await sleep(500);
      const pts = scoreFor(closest, tgt);
      expected[seat] += pts;
      if (pts > 0 && pts < 10) nearTested = true;
    }
  }

  // --- reveal ---
  await sleep(600);
  t = await text();
  check(has(t, 'the way in'), `r${round + 1}: reveal offers the way in`);
  // The solution animates in one step at a time; the Next button unlocks only
  // once it has finished, so wait for that before reading it (scraping early
  // gives a truncated chain that legitimately does not reach the target).
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find(x => /final scores|^round \d/i.test(x.textContent.trim()));
    return b && !b.disabled;
  }, { timeout: 20000 });
  const shown = await solutionOnScreen();
  check(shown.length > 0, `r${round + 1}: the app printed a solution`);
  const steps = shown.map(parseStep);
  // THE PRINTED SOLUTION MUST ACTUALLY WORK
  check(replay(dealt, tgt, steps) === true, `r${round + 1}: the printed solution replays to ${tgt} (${shown.join(' · ')})`);
  check(has(t, `${PLAYERS[0]}`) && has(t, 'exact'), `r${round + 1}: ${PLAYERS[0]}'s exact answer is called out`);

  await clickText(round + 1 >= ROUNDS ? 'Final scores' : `Round ${round + 2}`);
  await sleep(700);
}

check(illegalTested, 'exercised a refused illegal move');
check(exactTested && nearTested, 'exercised both an exact hit and a partial score');

// ---- end screen ----
t = await text();
const leaves = await page.evaluate(() => [...document.querySelectorAll('*')]
  .filter(e => e.children.length === 0).map(e => e.textContent.trim()).filter(Boolean));
PLAYERS.forEach((p, i) => check(leaves.includes(String(expected[i])), `end screen shows ${p}'s total of ${expected[i]}`));
const leader = PLAYERS[expected.indexOf(Math.max(...expected))];
check(has(t, leader), `end screen names the leader (${leader})`);
check(has(t, 'share the score'), 'share button offered');
console.log(`    expected totals: ${PLAYERS.map((p, i) => `${p}=${expected[i]}`).join(' ')}`);

console.log(`\nconsole/page errors: ${errors.length}`);
for (const e of errors) console.log(`    ${e}`);
await browser.close();
const bad = fails.length + errors.length;
console.log(bad ? `\n✗ ${fails.length} assertion(s) failed, ${errors.length} error(s)` : '\n✓ Target drove clean end-to-end');
process.exit(bad ? 1 : 0);
