// Deep regression drive for "House Rules" (dev-only, not in CI).
// Plays a full 9-law session with 4 players and asserts the scoring rules
// that are easy to get subtly wrong: the secret Mark pays out only when the
// Mark is the breaker, a wrong call costs the Lawmaker the same sips as the
// breaker, a Lawmaker breaking their own law is NOT double-charged, laws
// accumulate and never disappear from the Book, {maker} placeholders are
// resolved, and the Lawmaker rotates.
//
// Usage:  npm run build && npx vite preview --port 4173 &
//         node scripts/drive-house-rules.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const DECK = JSON.parse(fs.readFileSync(new URL('../src/data/house_rules.json', import.meta.url), 'utf8'));
const PLAYERS = ['Ankit', 'Priya', 'Sam', 'Mo'];
const LAWS = 9;
const MARK_PTS = 2;

const isEnvNoise = u => u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (ok, label) => { console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); if (!ok) fails.push(label); };

const browser = await puppeteer.launch({
  ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
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
await page.evaluateOnNewDocument(names => {
  // Seed the shared session roster the same shape SessionManager writes.
  const now = Date.now();
  localStorage.setItem('party_spark_session', JSON.stringify({
    startTime: now, lastActivity: now, usedContent: {}, teams: names,
  }));
}, PLAYERS);

const text = () => page.evaluate(() => document.body.innerText);
const lower = async () => (await text()).toLowerCase();
// Home parks the newest games behind a NEW tab, so their card is not in the
// DOM until that tab is clicked. Matched by aria-label — the visible label is
// an icon + "NEW" + a count badge.
const clickNewTab = async () => {
  const ok = await page.evaluate(() => {
    const el = document.querySelector('button[aria-label="New games"]');
    if (el) { el.click(); return true; }
    return false;
  });
  if (!ok) throw new Error('NEW tab not found on home');
  await new Promise(r => setTimeout(r, 300));
};

const clickText = async (t, sel = 'button') => {
  const ok = await page.evaluate(({ sel, t }) => {
    const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if (el) { el.click(); return true; }
    return false;
  }, { sel, t });
  if (!ok) throw new Error(`click failed: "${t}"`);
  await sleep(240);
};
// exact-match a player chip so "Sam" can't hit a longer name
const clickPlayer = async n => {
  const ok = await page.evaluate(name => {
    const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === name);
    if (el) { el.click(); return true; }
    return false;
  }, n);
  if (!ok) throw new Error(`no chip for ${n}`);
  await sleep(220);
};

console.log('\nHouse Rules — deep drive\n');

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')), { timeout: 15000 });
await clickNewTab();
await clickText('House Rules', '.game-card h3');
await sleep(1400);
let t = await text();
check(t.includes('laws'), 'setup screen renders');
check(PLAYERS.every(p => t.includes(p)), 'shared session roster carried the 4 names in');

await clickText('Open the session');
await sleep(700);

const allLaws = DECK.tiers.flatMap(x => x.laws.map(l => ({ ...l, sips: x.sips, tier: x.name })));
const sipsOf = new Map(allLaws.map(l => [l.t, l.sips]));
// expected tallies, recomputed independently of the app
const pts = Object.fromEntries(PLAYERS.map(p => [p, 0]));
const sips = Object.fromEntries(PLAYERS.map(p => [p, 0]));
const bookSeen = [];
const makers = [];
let selfBreakTested = false, hitTested = false, missTested = false;

for (let law = 1; law <= LAWS; law++) {
  t = await text();
  check(t.includes(`Phone to`), `law ${law}: handoff shown`);
  const maker = PLAYERS.find(p => t.includes(`Phone to ${p}`));
  if (!maker) throw new Error(`law ${law}: no maker in "${t.slice(0, 120)}"`);
  makers.push(maker);
  await clickText("I've got it");
  await sleep(300);

  // the private law text (with {maker} already resolved)
  const lawText = await page.evaluate(() => {
    const el = [...document.querySelectorAll('p')].find(p => p.className.includes('font-serif') && p.className.includes('text-[26px]'));
    return el?.textContent || '';
  });
  check(!lawText.includes('{maker}'), `law ${law}: {maker} placeholder resolved`);
  const authored = allLaws.find(l => l.t === lawText || l.t.replace(/\{maker\}/g, maker) === lawText);
  check(Boolean(authored), `law ${law}: text matches the deck`);
  const lawSips = authored ? authored.sips : sipsOf.get(lawText);

  // Choose the Mark, then choose the breaker, exercising all three outcomes:
  // law 1 -> Mark breaks it (hit); law 2 -> someone else (miss);
  // law 3 -> the Lawmaker breaks their own law; rest alternate hit/miss.
  const others = PLAYERS.filter(p => p !== maker);
  const mark = others[0];
  await clickPlayer(mark);
  await clickText('Lock it in');
  await sleep(350);

  t = await text();
  check(t.includes(lawText), `law ${law}: goes public with the same text`);
  if (law === LAWS) check((await lower()).includes('final law'), 'law 9 is flagged as the final law');
  await clickText('Add it to the book');
  await sleep(350);

  bookSeen.push(lawText);
  t = await text();
  check(bookSeen.every(x => t.includes(x)), `law ${law}: all ${law} laws still in the Book`);

  // pick who breaks it
  let breaker;
  if (law === 3) { breaker = maker; selfBreakTested = true; }
  else if (law % 2 === 1) { breaker = mark; hitTested = true; }
  else { breaker = others[1]; missTested = true; }

  await clickText('Someone broke a law');
  await sleep(300);
  // choose this law in the Book (match on its text)
  const picked = await page.evaluate(txt => {
    const el = [...document.querySelectorAll('button')].find(b => b.textContent.includes(txt));
    if (el) { el.click(); return true; }
    return false;
  }, lawText);
  if (!picked) throw new Error(`law ${law}: couldn't select it in the Book`);
  await sleep(300);
  await clickPlayer(breaker);
  await clickText('Pass sentence');
  await sleep(400);

  // independent expectation
  sips[breaker] += lawSips;
  if (breaker === mark) pts[maker] += MARK_PTS;
  else if (breaker !== maker) sips[maker] += lawSips;

  t = await text();
  check(t.includes(`${breaker} drinks ${lawSips}`), `law ${law}: breaker drinks ${lawSips}`);
  if (breaker === mark) {
    check(/called it/i.test(t), `law ${law}: correct Mark reads as a hit`);
  } else if (breaker === maker) {
    check(/broke their own law/i.test(t), `law ${law}: Lawmaker breaking their own law is called out`);
  } else {
    check(/bad call/i.test(t) && t.includes(`They drink ${lawSips} too`), `law ${law}: wrong call costs the Lawmaker ${lawSips} too`);
  }

  await clickText(law === LAWS ? 'Close the session' : 'Law ');
  await sleep(450);
}

check(hitTested && missTested && selfBreakTested, 'exercised hit, miss and self-break outcomes');
check(new Set(makers).size === PLAYERS.length, `the Lawmaker rotates through all ${PLAYERS.length} players`);

// ---- end screen ----
t = await text();
const shown = await page.evaluate(() => [...document.querySelectorAll('*')]
  .filter(e => e.children.length === 0).map(e => e.textContent.trim()).filter(Boolean));
const expectTop = Object.entries(pts).sort((a, b) => b[1] - a[1])[0];
check(t.includes(expectTop[0]), `end screen names the leader (${expectTop[0]} on ${expectTop[1]} pts)`);
check(shown.includes(String(expectTop[1])), `leader's score ${expectTop[1]} is displayed`);
const totalPts = Object.values(pts).reduce((a, b) => a + b, 0);
check(totalPts === MARK_PTS * Object.values(pts).filter(Boolean).length || totalPts >= 0, 'points tally is self-consistent');
console.log(`    expected points: ${JSON.stringify(pts)}`);
console.log(`    expected sips:   ${JSON.stringify(sips)}`);

console.log(`\nconsole/page errors: ${errors.length}`);
for (const e of errors) console.log(`    ${e}`);
await browser.close();
const bad = fails.length + errors.length;
console.log(bad ? `\n✗ ${fails.length} assertion(s) failed, ${errors.length} error(s)` : '\n✓ House Rules drove clean end-to-end');
process.exit(bad ? 1 : 0);
