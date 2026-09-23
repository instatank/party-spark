// DEV-only drive of Would You Rather: plays a full 10-card round and a second.
//   npm run build && npx vite preview --port 4173
//   node scripts/drive-would-you-rather.mjs [http://localhost:4173] [--shots DIR]
// Asserts: the single-deck game skips the picker; every card on screen is a
// card from would_you_rather.json with the JSON's own split; the verdict line
// quotes the chosen side's split; no psychoanalysis copy survives; the footnote
// does not claim the numbers are votes; round two deals no card from round one.
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:4173';
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > -1 ? process.argv[shotsAt + 1] : null;
const data = JSON.parse(fs.readFileSync(new URL('../src/data/would_you_rather.json', import.meta.url)));
const byA = new Map(data.categories.flatMap(c => c.items).map(q => [q.optionA, q]));

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

const played = [];
for (let round = 1; round <= 2; round++) {
  for (let i = 0; i < 10; i++) {
    const [a, b] = await cardOptions();
    const q = byA.get(a);
    check(q && q.optionB === b, `round ${round} card ${i + 1}: not from the JSON: "${a}"`);
    if (round === 1 && i === 0) await shot('wyr-card');
    if (round === 2) check(!played.includes(a), `round 2 repeated a round 1 card: "${a}"`);
    played.push(a);
    const side = i % 2; // alternate A / B
    await page.evaluate(s => [...document.querySelectorAll('button')].filter(x => x.querySelector('h3'))[s].click(), side);
    await sleep(350);
    const body = await page.evaluate(() => document.body.innerText);
    if (q) {
      const mine = side === 0 ? q.stats.a : q.stats.b;
      check(body.includes(`${q.stats.a}%`) && body.includes(`${q.stats.b}%`), `card ${q.id}: split not shown`);
      check(mine === 50 ? /50\/50/.test(body) : body.includes(`${mine}%.`) || body.includes(`${mine}% pick`), `card ${q.id}: verdict does not quote ${mine}%`);
    }
    check(!/psychoanalysis/i.test(body), 'psychoanalysis copy still on screen');
    check(!/player votes/i.test(body), 'footnote still claims the splits are votes');
    if (round === 1 && i === 0) await shot('wyr-voted');
    check(await click('button', i === 9 ? 'Finish Round' : 'Next Question'), `round ${round}: no next button on card ${i + 1}`);
    await sleep(300);
  }
  const end = await page.evaluate(() => document.body.innerText);
  check(/went with the crowd on \d+ of 10/.test(end), `round ${round}: no round-end summary`);
  if (round === 1) { await shot('wyr-end'); check(await click('button', 'Ten more'), 'no Ten more button'); await sleep(500); }
}
check(new Set(played).size === 20, 'a card repeated across the two rounds');

await browser.close();
if (fails.length) { console.log('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log(`OK — 20 cards over 2 rounds, all from the JSON, no repeats (${played[0]} …)`);
