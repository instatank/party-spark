// Categories + sample prompts for each of the 4 focus games

const GAME_CATEGORIES = {
  mostLikely: [
    { id: 'custom',      label: 'Create Your Vibe',   desc: 'AI cards tailored to YOUR group.',    tone: 'custom', tileKey: 'mostLikely' },
    { id: 'family',      label: 'Family Friendly',    desc: 'Wholesome, funny memories. PG.',      tone: 'clean',  tileKey: 'ice' },
    { id: 'fun',         label: 'Fun & Light',        desc: 'Witty, PG-13 scenarios.',             tone: 'clean',  tileKey: 'wyr' },
    { id: 'scandalous',  label: 'Scandalous',         desc: 'Spill the tea. Gossipy & dramatic.',  tone: 'spicy',  tileKey: 'fact' },
    { id: 'adult',       label: 'X-Rated',            desc: 'Spice level: high. 18+ only.',        tone: 'adult',  tileKey: 'truth' },
    { id: 'chaos',       label: 'Chaos Mode',         desc: 'Absurd, surreal, unhinged.',          tone: 'spicy',  tileKey: 'mostLikely' },
  ],
  never: [
    { id: 'custom',      label: 'Create Your Vibe',   desc: 'AI-built around your group.',         tone: 'custom', tileKey: 'never' },
    { id: 'classic',     label: 'Classic',            desc: 'The timeless set. Dinner-party safe.', tone: 'clean', tileKey: 'never' },
    { id: 'travel',      label: 'Travel Tales',       desc: 'Passports, hostels, misadventure.',   tone: 'clean',  tileKey: 'ice' },
    { id: 'workplace',   label: 'Work From Home',     desc: 'Slack slips & camera-off confessions.', tone: 'clean', tileKey: 'wyr' },
    { id: 'adult',       label: 'After Hours',        desc: 'Drinks in hand. 18+ only.',           tone: 'adult',  tileKey: 'truth' },
    { id: 'wild',        label: 'Wild Nights',        desc: 'Things that left a scar (emotional).', tone: 'spicy',  tileKey: 'fact' },
  ],
  wyr: [
    { id: 'custom',      label: 'Create Your Vibe',   desc: 'AI dilemmas picked for your crew.',   tone: 'custom', tileKey: 'wyr' },
    { id: 'silly',       label: 'Silly & Absurd',     desc: 'No stakes, all laughs.',              tone: 'clean',  tileKey: 'wyr' },
    { id: 'hypothetical',label: 'Deep Hypotheticals', desc: 'Existential, brain-melting.',         tone: 'clean',  tileKey: 'lie' },
    { id: 'ethical',     label: 'Ethical Dilemmas',   desc: 'Tell me you\u2019re a sociopath without…', tone: 'spicy', tileKey: 'fact' },
    { id: 'travel',      label: 'Travel & Food',      desc: 'Bucket lists & last meals.',          tone: 'clean',  tileKey: 'ice' },
    { id: 'adult',       label: 'Spicy',              desc: 'Bedroom edition. 18+ only.',          tone: 'adult',  tileKey: 'truth' },
  ],
  forecast: [
    { id: 'custom',      label: 'Create Your Vibe',   desc: 'AI prompts for where YOU\u2019RE at.',     tone: 'custom', tileKey: 'forecast' },
    { id: 'early',       label: 'Early Days',         desc: 'First month. Getting the gist.',      tone: 'clean',  tileKey: 'ice' },
    { id: 'datenight',   label: 'Date Night',         desc: 'Sit-down dinner. Real talk.',         tone: 'clean',  tileKey: 'forecast' },
    { id: 'movingin',    label: 'Moving In',          desc: 'Sharing a sink. Syncing lives.',      tone: 'clean',  tileKey: 'wyr' },
    { id: 'deep',        label: 'Deep Dive',          desc: 'Values, fears, childhood ghosts.',    tone: 'clean',  tileKey: 'lie' },
    { id: 'spicy',       label: 'Between Us',         desc: 'Intimate & honest. 18+ only.',        tone: 'adult',  tileKey: 'truth' },
  ],
};

const GAME_SAMPLE_CARDS = {
  mostLikely: {
    headline: 'Most Likely To',
    prompts: [
      'Who is most likely to become a viral TikTok star by accident?',
      'Who is most likely to marry for the plot?',
      'Who is most likely to start a cult \u2014 accidentally?',
      'Who is most likely to ghost their own wedding?',
      'Who is most likely to cry at a sad commercial?',
    ],
    verb: 'Point to who fits.',
  },
  never: {
    headline: 'Never Have I Ever',
    prompts: [
      'Never have I ever pretended to know someone at a party.',
      'Never have I ever fake-laughed through an entire dinner.',
      'Never have I ever stalked an ex\u2019s new partner online.',
      'Never have I ever left a group chat without saying bye.',
      'Never have I ever lied about reading the book.',
    ],
    verb: 'Drink if you have. Fold a finger if you\u2019re counting.',
  },
  wyr: {
    headline: 'Would You Rather',
    prompts: [
      'Would you rather lose your phone for a month, or lose your favourite playlist forever?',
      'Would you rather always be 10 minutes late, or always 20 minutes early?',
      'Would you rather read every mind for a day, or have everyone read yours?',
      'Would you rather live in a perpetual autumn, or a permanent July?',
    ],
    verb: 'Pick one. Defend it.',
  },
  forecast: {
    headline: 'The Forecast',
    prompts: [
      'What\u2019s a version of me you wish you saw more of?',
      'What do you think I\u2019m most afraid of \u2014 but won\u2019t say?',
      'If we moved cities tomorrow, what would you miss first?',
      'What\u2019s one thing I do that you find quietly beautiful?',
    ],
    verb: 'Answer honestly. Then compare.',
  },
};

// Which icon + tile color belongs to each game's headline
const GAME_META = {
  mostLikely: { title: 'Most Likely To\u2026',  short: 'Most Likely',   iconKey: 'mostLikely', icon: 'users' },
  never:      { title: 'Never Have I Ever',    short: 'Never Ever',    iconKey: 'never',      icon: 'hand' },
  wyr:        { title: 'Would You Rather',     short: 'Would You',     iconKey: 'wyr',        icon: 'split' },
  forecast:   { title: 'The Forecast',         short: 'Forecast',      iconKey: 'forecast',   icon: 'heart' },
};

window.GAME_CATEGORIES = GAME_CATEGORIES;
window.GAME_SAMPLE_CARDS = GAME_SAMPLE_CARDS;
window.GAME_META = GAME_META;
