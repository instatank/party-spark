// PartySpark dev-only drive: Charades on the ONE CLUE deck, end to end.
//
// The One Clue deck plays through the SAME loop as the Classic deck — card,
// Correct or Skip, next card, until the clock runs out. So this drive mostly
// checks the thing a screenshot cannot: that the cards actually came from
// charades_clues.json. If the deck switch ever fell through to the Classic
// word list in games_data.json, the screen would look completely fine and be
// dealing the wrong deck.
//
// It also pins the two picker rules the founder asked for: Movie Mix is
// Hollywood + Bollywood and NOTHING else, and every non-film clue lives in one
// general pack.
//
// Usage: npm run build && npx vite preview --port 4173 &
//        node scripts/drive-charades-one-clue.mjs [http://localhost:4173]
import fs from 'node:fs';
import { launch, newPage, reporter, sleep } from './_drive-kit.mjs';

const BASE = process.argv[2] || 'http://localhost:4173';
const DECK = JSON.parse(fs.readFileSync(new URL('../src/data/charades_clues.json', import.meta.url), 'utf8'));
const PACK = Object.fromEntries(DECK.packs.map(p => [p.id, new Set(p.clues.map(c => c.t))]));
const ALL = new Map(DECK.packs.flatMap(p => p.clues.map(c => [c.t, { ...c, pack: p.id }])));
const KIND = DECK.kinds;


const fail = [];
const check = (ok, msg) => { if (!ok) { fail.push(msg); console.log(`  ✗ ${msg}`); } else console.log(`  ✓ ${msg}`); };

const browser = await launch();
const { page, errors } = await newPage(browser, { ignoreUrls: ['/api/'], ignoreText: ['[ai/', '404', '501'] });

const clickText = async (sel, text) => {
  const ok = await page.evaluate(({ sel, text }) => {
    const el = [...document.querySelectorAll(sel)]
      .find(e => e.textContent.trim().toLowerCase().includes(text.toLowerCase()));
    if (el) { el.click(); return true; }
    return false;
  }, { sel, text });
  if (!ok) throw new Error(`click failed: ${sel} "${text}"`);
  await sleep(220);
};
const body = () => page.evaluate(() => document.body.innerText);
/** The clue text and the announced kind, straight off the card. */
const card = () => page.evaluate(() => {
  const h = document.querySelector('h2.font-serif');
  const pill = document.querySelector('.self-start.uppercase');
  return { text: h?.textContent.trim() ?? '', kind: pill?.textContent.trim() ?? '' };
});

const toCharades = async () => {
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.waitForFunction(
    () => [...document.querySelectorAll('h3')].some(h => h.textContent.includes('Charades')),
    { timeout: 15000 });
  await clickText('.game-card h3', 'Charades');
  await sleep(1400);
};

/** Back to the deck picker. A reload rather than the back button: the play
 *  screen guards its exit with a confirm, and the deck + clock choices persist
 *  in localStorage, so this lands right back where we were. */
const toPicker = async () => {
  await toCharades();
  await clickText('button[role="tab"]', 'One Clue');
  await sleep(600);
};

/** Play one round on `deck`, tapping through cards, and report what it dealt. */
const playRound = async (deckName, taps) => {
  await clickText('h3', deckName);
  await sleep(900);
  const seen = [];
  for (let i = 0; i < taps; i++) {
    const c = await card();
    if (!c.text) break;
    seen.push(c);
    // Correct on evens, Skip on odds — both must simply advance the card.
    await clickText('button', i % 2 === 0 ? 'Correct' : 'Skip');
    await sleep(200);
    if ((await body()).includes('Time')) break; // buzzer landed mid-round
  }
  return seen;
};

try {
  await toCharades();

  // --- the deck switch -----------------------------------------------------
  await clickText('button[role="tab"]', 'One Clue');
  await sleep(700); // deck chunk
  const menu = await page.evaluate(() =>
    [...document.querySelectorAll('h3')].map(h => h.textContent.trim()));
  check(
    JSON.stringify(menu) === JSON.stringify(['Movie Mix', 'Hollywood', 'Bollywood', 'Everything Else']),
    `picker is exactly the four decks asked for (${menu.join(', ')})`,
  );

  // a long clock, so the round does not buzz while the drive is tapping
  await clickText('button', 's round');
  await sleep(250);
  await clickText('button', '120');
  await sleep(350);

  // --- Movie Mix: films only, from both movie packs ------------------------
  const mix = await playRound('Movie Mix', 12);
  check(mix.length >= 8, `Movie Mix dealt ${mix.length} cards through Correct/Skip alone`);
  const strays = mix.filter(c => !ALL.has(c.text));
  check(strays.length === 0,
    strays.length ? `NOT from the One Clue deck: ${strays.map(c => c.text).join(', ')}` : 'every card came from charades_clues.json');
  const inGeneral = mix.filter(c => PACK.general.has(c.text));
  check(inGeneral.length === 0,
    inGeneral.length ? `general clues leaked into Movie Mix: ${inGeneral.map(c => c.text).join(', ')}` : 'Movie Mix holds no general clues');
  check(mix.every(c => c.kind.toLowerCase() === KIND.MOVIE.toLowerCase()),
    'every Movie Mix card is announced as a Movie');
  check(new Set(mix.map(c => c.text)).size === mix.length, 'no card repeated inside one round');

  // The mix has to actually mix — over a few rounds it must draw from both.
  const packsSeen = new Set(mix.map(c => ALL.get(c.text)?.pack));
  console.log(`  · this round drew from: ${[...packsSeen].join(' + ')}`);

  // --- the loop itself has no extra steps ----------------------------------
  // Correct must go straight to the next card: no reveal, no verdict, no
  // "next up" gate. If a screen were reinserted, the card text would not
  // change on the very next frame after the tap.
  const before = await card();
  await clickText('button', 'Correct');
  await sleep(150);
  const after = await card();
  check(after.text !== before.text && ALL.has(after.text),
    'Correct goes straight to the next card — no screen in between');

  // --- Hollywood and Bollywood stay in their lanes -------------------------
  for (const [tile, id] of [['Hollywood', 'hollywood'], ['Bollywood', 'bollywood']]) {
    await toPicker();
    const round = await playRound(tile, 6);
    const wrong = round.filter(c => !PACK[id].has(c.text));
    check(wrong.length === 0,
      wrong.length ? `${tile} dealt cards from another pack: ${wrong.map(c => c.text).join(', ')}`
                   : `${tile} deals only ${tile} films (${round.length} cards)`);
  }

  // --- Everything Else is the non-film pack --------------------------------
  await toPicker();
  const general = await playRound('Everything Else', 8);
  const films = general.filter(c => !PACK.general.has(c.text));
  check(films.length === 0,
    films.length ? `films leaked into Everything Else: ${films.map(c => c.text).join(', ')}`
                 : `Everything Else deals only non-film clues (${general.length} cards)`);
  const kinds = new Set(general.map(c => c.kind));
  check(kinds.size > 1, `it announces more than one kind of clue (${[...kinds].join(', ')})`);

  // --- and Classic is untouched --------------------------------------------
  await toCharades();
  await clickText('button[role="tab"]', 'Classic');
  await sleep(300);
  const classicMenu = await page.evaluate(() =>
    [...document.querySelectorAll('h3')].map(h => h.textContent.trim()));
  check(classicMenu.some(t => t.includes('Movie Mix')) && classicMenu.some(t => t.includes('Family Mix')),
    `Classic still lists its own decks (${classicMenu.join(', ')})`);
  const classic = await playRound('Movie Mix', 4);
  check(classic.length >= 3, `Classic still deals and advances (${classic.length} cards)`);
  // The pill is the tell: Classic cards carry no kind, so it reads "Charades".
  // (Title overlap between the decks is expected and fine — Titanic is in both.)
  check(classic.every(c => c.kind === 'Charades'),
    `Classic cards keep the plain Charades pill (${[...new Set(classic.map(c => c.kind))].join(', ')})`);
} catch (e) {
  fail.push(`[drive] ${e.message}`);
  console.log(`  ✗ [drive] ${e.message}`);
  console.log((await body()).slice(0, 500));
}

for (const e of errors) { fail.push(e); console.log(`  ✗ ${e}`); }
console.log(fail.length ? `\n${fail.length} failure(s)` : '\nOne Clue drive clean');
await browser.close();
process.exit(fail.length ? 1 : 0);
