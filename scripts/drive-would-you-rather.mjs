// DEV-only drive of Would You Rather: every deck, a full 10-card round each,
// plus a second round of Friends & Family.
//   npm run build && npx vite preview --port 4173
//   node scripts/drive-would-you-rather.mjs [http://localhost:4173] [--shots DIR]
// Asserts: the picker lists every deck in the JSON; Spicy asks for the 0438
// PIN and deals nothing until it is entered; every card on screen comes from
// THE DECK THAT WAS TAPPED, with that card's own split; the verdict line quotes
// the chosen side's split; no psychoanalysis copy survives; the footnote does
// not claim the numbers are votes; a second round deals no card from the first.
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

await browser.close();
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log(`OK — ${total} cards over ${data.categories.length} decks, each from the deck tapped, Spicy behind the PIN`);
