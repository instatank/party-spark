// PartySpark regression drive (dev-only): the Roast Me theme picker and the
// Roast Lab comparison screen.
//
// drive-games.mjs proves Roast Me OPENS. It cannot see whether the picker
// actually rendered the themes the catalog offers, and it never visits the lab
// at all (the lab is not a game and deliberately has no Home tile). Both are
// exactly the kind of thing that breaks silently: a theme whose season lapsed,
// a grid that overflows, a hash route that stopped matching.
//
// Usage:  npm run build && npx vite preview --port 4173 &
//         node scripts/drive-roast-lab.mjs [http://localhost:4173]
import fs from 'node:fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://localhost:4173';
const SHOTS = process.env.SHOT_DIR || null;

const isEnvNoise = (url) => url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');

const browser = await puppeteer.launch({
  ...(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  headless: 'new',
  args: ['--no-sandbox'],
});

const failures = [];
const note = (msg) => { console.log(msg); };
const fail = (msg) => { failures.push(msg); console.log(`✗ ${msg}`); };

const newPage = async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // "Failed to load resource" messages carry no URL in their text — the URL
    // is on the location. Checking only the text lets blocked Google Fonts
    // requests (unreachable from this sandbox) read as app errors.
    const where = m.location()?.url || '';
    if (isEnvNoise(m.text()) || isEnvNoise(where)) return;
    fail(`console error: ${m.text().slice(0, 160)} @ ${where.slice(0, 80)}`);
  });
  page.on('pageerror', (e) => fail(`page error: ${String(e).slice(0, 200)}`));
  return page;
};

// ---------------------------------------------------------------------------
// 1. The theme picker
// ---------------------------------------------------------------------------
{
  const page = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1900)); // splash is 1.5s

  const opened = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(
      (n) => n.children.length === 0 && n.textContent.trim() === 'Roast Me',
    );
    if (!el) return false;
    (el.closest('button') || el).click();
    return true;
  });
  if (!opened) fail('could not find the Roast Me card on Home');
  await new Promise((r) => setTimeout(r, 700));

  // Roast Me is one of the three adult-gated games (see ADULT_GAME_IDS in
  // App.tsx), so the PIN gate stands between Home and the theme picker.
  const gated = await page.evaluate(() => document.body.innerText.includes('Enter the 4-digit PIN'));
  if (gated) {
    const boxes = await page.$$('input[type="tel"]');
    if (boxes.length !== 4) fail(`PIN gate showed ${boxes.length} inputs, expected 4`);
    for (let i = 0; i < boxes.length; i++) await boxes[i].type('0438'[i]);
    await new Promise((r) => setTimeout(r, 900));
    note('✓ cleared the adult PIN gate');
  }
  await new Promise((r) => setTimeout(r, 1200));

  const tiles = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('*')].find(
      (n) => n.children.length === 0 && n.textContent.includes('Pick your sticker'),
    );
    const grid = heading?.parentElement?.querySelector('div[class*="grid"]');
    if (!grid) return null;
    return [...grid.querySelectorAll('button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
  });

  if (!tiles) {
    fail('theme grid not found on the Roast Me screen');
  } else {
    note(`  picker tiles (${tiles.length}): ${tiles.join(', ')}`);
    if (tiles.length < 9) fail(`picker shows ${tiles.length} themes, below the floor of 9`);
    else note(`✓ picker renders ${tiles.length} themes`);

    if (tiles.some((t) => /FIFA/i.test(t))) fail('retired FIFA theme is still on the picker');
    else note('✓ retired FIFA theme is gone');

    // A tile that wraps to two lines means the label overflowed its box; the
    // grid stays visually aligned only while every tile is one row tall.
    const overflow = await page.evaluate(() => {
      const heading = [...document.querySelectorAll('*')].find(
        (n) => n.children.length === 0 && n.textContent.includes('Pick your sticker'),
      );
      const grid = heading?.parentElement?.querySelector('div[class*="grid"]');
      return [...grid.querySelectorAll('button')]
        .filter((b) => b.scrollHeight > b.clientHeight + 2 || b.scrollWidth > b.clientWidth + 2)
        .map((b) => b.textContent.replace(/\s+/g, ' ').trim());
    });
    if (overflow.length) fail(`tiles overflow their box: ${overflow.join(', ')}`);
    else note('✓ no tile overflows its box');
  }

  // The picker grew to four rows of larger tiles, which pushes the upload card
  // below the fold on a 667px-tall phone. That is fine ONLY as long as the page
  // actually scrolls — the containers around this screen use overflow-hidden,
  // and if one of them ever starts clipping instead, the primary action becomes
  // unreachable and the game is dead on small phones with nothing in the
  // console to say so.
  {
    const small = await browser.newPage();
    await small.setViewport({ width: 375, height: 667 });
    await small.goto(BASE, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1900));
    await small.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find(
        (n) => n.children.length === 0 && n.textContent.trim() === 'Roast Me',
      );
      (el?.closest('button') || el)?.click();
    });
    await new Promise((r) => setTimeout(r, 700));
    const pin = await small.$$('input[type="tel"]');
    for (let i = 0; i < pin.length; i++) await pin[i].type('0438'[i]);
    await new Promise((r) => setTimeout(r, 1600));

    await small.evaluate(() => window.scrollTo(0, 99999));
    await new Promise((r) => setTimeout(r, 400));
    const reachable = await small.evaluate(() => {
      const up = [...document.querySelectorAll('*')].find(
        (n) => n.children.length === 0 && n.textContent.trim() === 'UPLOAD',
      );
      if (!up) return false;
      const b = up.getBoundingClientRect();
      return b.top >= 0 && b.bottom <= window.innerHeight;
    });
    if (!reachable) fail('UPLOAD is unreachable at 375x667 even after scrolling');
    else note('✓ upload stays reachable at 375x667 (below the fold, but scrollable)');
    await small.close();
  }

  // Tapping a theme must not throw and must visibly select.
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll('*')].find(
      (n) => n.children.length === 0 && n.textContent.includes('Pick your sticker'),
    );
    heading?.parentElement?.querySelector('div[class*="grid"] button:nth-child(5)')?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  note('✓ theme selection does not throw');

  // --- COLLAGE tab -------------------------------------------------------
  const chipsOf = () => page.evaluate(() => {
    const h = [...document.querySelectorAll('*')].find(
      (n) => n.children.length === 0 && n.textContent.includes("Tonight's four"),
    );
    const grid = h?.closest('div')?.parentElement?.querySelector('div[class*="grid-cols-2"]');
    return grid ? [...grid.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()) : null;
  });

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('COLLAGE'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  const chips = await chipsOf();
  if (!chips) {
    fail('COLLAGE tab did not render the four-theme draw');
  } else if (chips.length !== 4) {
    fail(`COLLAGE drew ${chips.length} themes, expected 4`);
  } else {
    note(`✓ COLLAGE draws 4 themes: ${chips.map((c) => c.split(' ')[0]).join(', ')}`);
    const labels = chips.map((c) => c.replace(/TOP LEFT|TOP RIGHT|LOWER LEFT|LOWER RIGHT/g, '').trim());
    if (new Set(labels).size !== labels.length) fail(`COLLAGE drew a duplicate theme: ${labels.join(', ')}`);
    else note('✓ the four drawn themes are distinct');
  }

  // Reshuffle must actually redraw. Two identical draws in a row is possible
  // (1 in 495) but five is not, so retry before calling it stuck.
  let reshuffled = false;
  for (let i = 0; i < 5 && !reshuffled; i++) {
    const before = JSON.stringify(await chipsOf());
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Reshuffle'));
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 250));
    if (JSON.stringify(await chipsOf()) !== before) reshuffled = true;
  }
  if (!reshuffled) fail('Reshuffle did not change the draw in 5 attempts');
  else note('✓ Reshuffle redraws the four');

  if (SHOTS) await page.screenshot({ path: `${SHOTS}/collage-tab.png` });

  // Back to SINGLE so the screenshot matches the default screen.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'SINGLE');
    b?.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  if (SHOTS) await page.screenshot({ path: `${SHOTS}/picker.png` });
  await page.close();
}

// ---------------------------------------------------------------------------
// 2. The Roast Lab
// ---------------------------------------------------------------------------
{
  const page = await newPage();
  await page.goto(`${BASE}/#roast-lab`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));

  const loaded = await page.evaluate(() => document.body.innerText.includes('ROAST LAB'));
  if (!loaded) fail('#roast-lab did not render the lab');
  else note('✓ #roast-lab renders without a splash wait');

  const chips = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('*')].find(
      (n) => n.children.length === 0 && n.textContent.includes('riskiest first'),
    );
    const grid = heading?.parentElement?.querySelector('div[class*="grid"]');
    return grid ? grid.querySelectorAll('button').length : 0;
  });
  if (chips < 9) fail(`lab offers ${chips} themes, expected the full available set`);
  else note(`✓ lab offers ${chips} selectable themes`);

  // The run button must be disabled until a photo is chosen — it costs money.
  const guarded = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('RUN COMPARISON'));
    return btn ? btn.disabled : null;
  });
  if (guarded !== true) fail('RUN COMPARISON is not disabled without a photo');
  else note('✓ run button is disabled until a photo is supplied');

  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lab.png`, fullPage: true });
  await page.close();
}

await browser.close();

if (failures.length) {
  console.log(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nRoast picker + lab drive clean');
