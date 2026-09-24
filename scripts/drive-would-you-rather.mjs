// DEV-only drive of Would You Rather: every deck, a full 10-card round each,
// plus a second round of Friends & Family.
//   npm run build && npx vite preview --port 4173
//   node scripts/drive-would-you-rather.mjs [http://localhost:4173] [--shots DIR]
// Asserts: the picker lists every deck in the JSON; Spicy asks for the 0438
// PIN and deals nothing until it is entered; every card on screen comes from
// THE DECK THAT WAS TAPPED, with that card's own split; the verdict line quotes
// the chosen side's split; no psychoanalysis copy survives; the footnote does
// not claim the numbers are votes; a second round deals no card from the first.
// Then HOT SEAT: refuses to start without names; with three it rotates the seat
// through them in order; the secret pick leaves no trace on screen (no gold,
// no split, no verdict) until the room has called it; the verdict agrees with
// what was actually tapped; and the round-end tally matches the drive's own.
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:4173';
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > -1 ? process.argv[shotsAt + 1] : null;
const data = JSON.parse(fs.readFileSync(new URL('../src/data/would_you_rather.json', import.meta.url)));
const deckOf = new Map(data.categories.flatMap(c => c.items.map(q => [q.optionA, { q, deck: c.id }])));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

const browser = await puppeteer.launch({
  ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  headless: 'new', args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
page.on('pageerror', e => fails.push(`[pageerror] ${e.message}`));
const shot = async name => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
const click = (sel, text) => page.evaluate((sel, text) => {
  const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().toLowerCase().includes(text.toLowerCase()));
  if (el) el.click(); return Boolean(el);
}, sel, text);
const cardOptions = () => page.evaluate(() => [...document.querySelectorAll('button h3')].map(h => h.textContent.trim()));

await page.goto(BASE, { waitUntil: 'networkidle2' });
await page.waitForFunction(() => document.querySelector('button[aria-label="New games"]'), { timeout: 15000 });
await page.click('button[aria-label="New games"]'); await sleep(400);
check(await click('.game-card h3', 'Would You Rather'), 'no Would You Rather card under the NEW tab');
await sleep(2000);

const playRound = async (deckId, label) => {
  const played = [];
  for (let i = 0; i < 10; i++) {
    const [a, b] = await cardOptions();
    const hit = deckOf.get(a);
    const q = hit?.q;
    check(q && q.optionB === b, `${label} card ${i + 1}: not from the JSON: "${a}"`);
    check(hit?.deck === deckId, `${label} card ${i + 1}: dealt from "${hit?.deck}", expected "${deckId}"`);
    played.push(a);
    const side = i % 2; // alternate A / B
    await page.evaluate(s => [...document.querySelectorAll('button')].filter(x => x.querySelector('h3') && !x.closest('.grid'))[s].click(), side);
    await sleep(350);
    const body = await page.evaluate(() => document.body.innerText);
    if (q) {
      const mine = side === 0 ? q.stats.a : q.stats.b;
      check(body.includes(`${q.stats.a}%`) && body.includes(`${q.stats.b}%`), `card ${q.id}: split not shown`);
      check(mine === 50 ? /50\/50/.test(body) : body.includes(`${mine}%.`) || body.includes(`${mine}% pick`), `card ${q.id}: verdict does not quote ${mine}%`);
    }
    check(!/psychoanalysis/i.test(body), 'psychoanalysis copy still on screen');
    check(!/player votes/i.test(body), 'footnote still claims the splits are votes');
    if (i === 0) await shot(`wyr-${deckId}-voted`);
    check(await click('button', i === 9 ? 'Finish Round' : 'Next Question'), `${label}: no next button on card ${i + 1}`);
    await sleep(300);
  }
  const end = await page.evaluate(() => document.body.innerText);
  check(/went with the crowd on \d+ of 10/.test(end), `${label}: no round-end summary`);
  check(new Set(played).size === 10, `${label}: a card repeated inside the round`);
  return played;
};

const picker = async () => {
  const names = await page.evaluate(() => [...document.querySelectorAll('.grid button h3')].map(h => h.textContent.trim()));
  check(data.categories.every(c => names.some(n => n.startsWith(c.name))), `picker shows ${JSON.stringify(names)}`);
};

await picker();
await shot('wyr-picker');
let total = 0;
for (const deck of data.categories) {
  check(await click('.grid button h3', deck.name), `no tile for ${deck.name}`);
  await sleep(600);
  if (deck.adult) {
    const gate = await page.evaluate(() => document.body.innerText);
    check(/PIN/.test(gate), `${deck.name}: no PIN prompt`);
    const early = (await cardOptions()).filter(a => deckOf.has(a));
    check(early.length === 0, `${deck.name}: dealt a card before the PIN`);
    await shot('wyr-pin');
    await page.keyboard.type('0438');
    await sleep(800);
  }
  const first = await playRound(deck.id, deck.name);
  total += 10;
  if (deck.id === 'general') {
    check(await click('button', 'Ten more'), 'no Ten more button'); await sleep(500);
    const second = await playRound(deck.id, `${deck.name} round 2`);
    check(!second.some(a => first.includes(a)), 'round 2 repeated a round 1 card');
    total += 10;
  }
  await shot(`wyr-${deck.id}-end`);
  check(await click('button', 'Change deck'), `${deck.name}: no Change deck button`);
  await sleep(500);
  await picker();
}

// ---------------- HOT SEAT ----------------
const HS_NAMES = ['Asha', 'Ben', 'Chitra'];
check(await click('[role=tab]', 'Hot Seat'), 'no Hot Seat tab');
await sleep(300);
await page.evaluate(() => { try { const k = 'party_spark_session'; const d = JSON.parse(localStorage.getItem(k) || '{}'); delete d.teams; localStorage.setItem(k, JSON.stringify(d)); } catch { /* */ } });
// Without names the deck must refuse to start. (The component read the roster
// on mount, so this only holds if none was saved; the next step seeds one.)
const namesBefore = await page.evaluate(() => document.body.innerText);
if (!/Asha|Ben|Chitra/.test(namesBefore)) {
  await click('.grid button h3', data.categories[0].name); await sleep(400);
  check(/Add at least 2 names/.test(await page.evaluate(() => document.body.innerText)), 'Hot Seat started with no names');
}
await page.evaluate(names => {
  const k = 'party_spark_session'; const d = JSON.parse(localStorage.getItem(k) || '{}');
  d.teams = names; d.lastActivity = Date.now(); d.startTime = d.startTime || Date.now(); d.usedContent = d.usedContent || {};
  localStorage.setItem(k, JSON.stringify(d));
}, HS_NAMES);
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction(() => document.querySelector('button[aria-label="New games"]'), { timeout: 15000 });
await page.click('button[aria-label="New games"]'); await sleep(400);
await click('.game-card h3', 'Would You Rather'); await sleep(1500);
check(await click('[role=tab]', 'Hot Seat'), 'no Hot Seat tab after reload'); await sleep(300);
await shot('wyr-hotseat-picker');
check(await click('.grid button h3', data.categories[0].name), 'no Friends & Family tile in Hot Seat'); await sleep(600);
const expected = Object.fromEntries(HS_NAMES.map(n => [n, { sat: 0, fooled: 0 }]));
const phase = () => page.evaluate(() => document.querySelector('[data-seat-phase]')?.getAttribute('data-seat-phase'));
const optionButtons = s => page.evaluate(i => [...document.querySelectorAll('button')].filter(x => x.querySelector('h3'))[i].click(), s);
for (let i = 0; i < 10; i++) {
  const seat = HS_NAMES[i % HS_NAMES.length];
  const body0 = await page.evaluate(() => document.body.innerText);
  check(body0.includes(`${seat} is in the hot seat`.toUpperCase()) || body0.includes(`${seat} is in the hot seat`), `card ${i + 1}: expected ${seat} in the seat`);
  check(await phase() === 'SECRET', `card ${i + 1}: did not open on the secret pick`);
  const secret = i % 2 ? 'B' : 'A';
  await optionButtons(secret === 'A' ? 0 : 1); await sleep(300);
  check(await phase() === 'GUESS', `card ${i + 1}: secret tap did not move to the room's guess`);
  const leak = await page.evaluate(() => ({
    gold: [...document.querySelectorAll('button')].filter(x => x.querySelector('h3')).some(b => b.className.includes('bg-gold/15')),
    pct: [...document.querySelectorAll('button')].filter(x => x.querySelector('h3')).some(b => /\d+%/.test(b.innerText)),
    verdict: /sided with \d+%/.test(document.body.innerText),
  }));
  check(!leak.gold && !leak.pct && !leak.verdict, `card ${i + 1}: secret pick visible before the room called it ${JSON.stringify(leak)}`);
  if (i === 0) await shot('wyr-hotseat-guess');
  const fool = i % 3 === 0;
  const guess = fool ? (secret === 'A' ? 'B' : 'A') : secret;
  await optionButtons(guess === 'A' ? 0 : 1); await sleep(350);
  check(await phase() === 'REVEAL', `card ${i + 1}: no reveal after the room's call`);
  const body = await page.evaluate(() => document.body.innerText);
  check(fool ? body.includes(`${seat} fooled the room`) : body.includes(`read ${seat} perfectly`), `card ${i + 1}: verdict disagrees with the taps`);
  check(/room's call/.test(body), `card ${i + 1}: no room's-call marker`);
  expected[seat].sat++; if (fool) expected[seat].fooled++;
  if (i === 0) await shot('wyr-hotseat-reveal');
  check(await click('button', i === 9 ? 'Finish Round' : 'Next Question'), `hot seat: no next on card ${i + 1}`);
  await sleep(300);
}
const endText = await page.evaluate(() => document.body.innerText);
await shot('wyr-hotseat-end');
for (const n of HS_NAMES) {
  const re = new RegExp(`${n}\\s*fooled the room\\s*${expected[n].fooled}\\s*of\\s*${expected[n].sat}`);
  check(re.test(endText), `round end: ${n} should read fooled ${expected[n].fooled} of ${expected[n].sat}`);
}
check(endText.includes('Asha is the hardest to read'), 'round end: wrong hardest-to-read');

await browser.close();
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log(`OK — ${total} cards over ${data.categories.length} decks, each from the deck tapped, Spicy behind the PIN; Hot Seat round clean`);
