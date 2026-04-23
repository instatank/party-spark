// Game catalogue — shortened to fit mobile screens
const GAMES = [
  { id: 'roast',      key: 'roast',      title: 'Roast Me',         desc: 'Upload a pic for a brutal AI roast!',  minPlayers: 1 },
  { id: 'imposter',   key: 'imposter',   title: 'Imposter',         desc: 'Find the fake among your friends!',     minPlayers: 3 },
  { id: 'taboo',      key: 'taboo',      title: 'Taboo',            desc: 'Describe it without forbidden words.',  minPlayers: 4 },
  { id: 'fact',       key: 'fact',       title: 'Fact or Fiction',  desc: 'Beat the clock identifying true facts!',minPlayers: 2 },
  { id: 'mostLikely', key: 'mostLikely', title: 'Most Likely To…',  desc: 'Point fingers & expose friends!',       minPlayers: 3 },
  { id: 'charades',   key: 'charades',   title: 'Charades',         desc: 'Act out words silently!',               minPlayers: 4 },
  { id: 'traitors',   key: 'traitors',   title: 'The Traitors',     desc: 'Pass-and-play betrayal!',                minPlayers: 5 },
  { id: 'forecast',   key: 'forecast',   title: 'The Forecast',     desc: 'How well do you know each other?',      minPlayers: 2 },
];

const COMING_SOON = [
  { id: 'lie',   key: 'lie',   title: 'Would I Lie To You?', desc: 'Tell a true story or a bold lie.',  minPlayers: 3 },
  { id: 'ice',   key: 'ice',   title: 'Icebreakers',         desc: 'Truths, dares, and deep questions.',minPlayers: 2 },
  { id: 'wyr',   key: 'wyr',   title: 'Would You Rather',    desc: 'This or that? Make tough choices!', minPlayers: 1 },
  { id: 'never', key: 'never', title: 'Never Have I Ever',   desc: "Stand up if you've done it!",       minPlayers: 3 },
  { id: 'truth', key: 'truth', title: 'Truth or Drink',      desc: 'Confess or take a sip. No escape.', minPlayers: 2 },
];

// Most Likely To categories
const ML_CATEGORIES = [
  { id: 'custom_vibe',    label: '✨ Create Your Vibe',    desc: 'AI-powered cards tailored to YOUR group. Describe who you are!', tone: 'custom' },
  { id: 'family_friendly',label: 'Family Friendly',       desc: 'Wholesome, funny memories. PG.',                                 tone: 'clean' },
  { id: 'fun',            label: 'Fun & Light',            desc: 'Witty, PG-13 scenarios.',                                        tone: 'clean' },
  { id: 'scandalous',     label: 'Scandalous',             desc: 'Spill the tea. Gossipy & dramatic.',                            tone: 'spicy' },
  { id: 'adult',          label: 'X-Rated / Saucy',        desc: 'Spice level: High. 18+ only.',                                  tone: 'adult' },
  { id: 'chaos',          label: 'Chaos Mode',             desc: 'Absurd, surreal, and unhinged.',                                tone: 'spicy' },
  { id: 'bbf',            label: 'For BBF 👨‍👩‍👧‍👦',      desc: 'Decades of love, chaos & secrets.',                             tone: 'clean' },
];

// Sample ML cards for the playing screen
const ML_SAMPLE_CARDS = [
  'Who is most likely to become a viral TikTok star by accident?',
  'Who is most likely to forget their own birthday?',
  'Who is most likely to start a podcast no one listens to?',
  'Who is most likely to marry for the plot?',
  'Who is most likely to cry at a sad commercial?',
];

window.GAMES = GAMES;
window.COMING_SOON = COMING_SOON;
window.ML_CATEGORIES = ML_CATEGORIES;
window.ML_SAMPLE_CARDS = ML_SAMPLE_CARDS;
