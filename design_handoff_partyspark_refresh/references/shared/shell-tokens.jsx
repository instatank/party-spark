// Dark + Azure-Mist light token sets for the shell explorations.
// These are tuned to be directly comparable side-by-side.

const SHELL_TOKENS = {
  dark: {
    name: 'Dark',
    // Slate palette matching src/index.css — --color-party-dark #1e293b etc.
    bg: '#1E293B',            // slate-800 (party-dark)
    bgElev: '#263449',
    bgInset: '#162032',
    surface: '#334155',       // slate-700 (party-surface)
    surfaceAlt: '#2C3B52',
    ink: '#FFFFFF',
    inkSoft: '#E2E8F0',       // slate-200
    muted: '#94A3B8',         // slate-400
    mutedDeep: '#64748B',     // slate-500
    border: '#3E4C64',
    borderSoft: '#2C3B52',
    accent: '#EFC050',        // gold (party-secondary)
    accentSoft: 'rgba(239,192,80,0.15)',
    accentInk: '#1E293B',
    sparkle: '#EFC050',
    // per-game tile colors (saturated, for dark bg)
    tiles: {
      roast:      { solid: '#EA7A3F', tint: 'rgba(234,122,63,0.15)',  ink: '#FFF1E5' },
      imposter:   { solid: '#E25353', tint: 'rgba(226,83,83,0.15)',   ink: '#FFE5E5' },
      taboo:      { solid: '#F0656D', tint: 'rgba(240,101,109,0.15)', ink: '#FFE5E7' },
      fact:       { solid: '#E84A82', tint: 'rgba(232,74,130,0.15)',  ink: '#FFE0EC' },
      mostLikely: { solid: '#8B5CE0', tint: 'rgba(139,92,224,0.15)',  ink: '#EDE0FC' },
      charades:   { solid: '#EFC050', tint: 'rgba(239,192,80,0.15)',  ink: '#FFF4D9' },
      traitors:   { solid: '#3D4558', tint: 'rgba(61,69,88,0.35)',    ink: '#E1E4EC' },
      never:      { solid: '#35B4C8', tint: 'rgba(53,180,200,0.15)',  ink: '#E0F5F8' },
      wyr:        { solid: '#6D72DD', tint: 'rgba(109,114,221,0.15)', ink: '#E5E6FA' },
      ice:        { solid: '#52C988', tint: 'rgba(82,201,136,0.15)',  ink: '#E1F7EC' },
      lie:        { solid: '#3EC0AE', tint: 'rgba(62,192,174,0.15)',  ink: '#E0F5F1' },
      truth:      { solid: '#D14444', tint: 'rgba(209,68,68,0.15)',   ink: '#FBE0E0' },
      forecast:   { solid: '#E66AA3', tint: 'rgba(230,106,163,0.15)', ink: '#FCE3EE' },
    },
  },
  light: {
    name: 'Azure Mist',
    bg: '#F3F6FA',
    bgElev: '#FFFFFF',
    bgInset: '#E9EDF3',
    surface: '#FFFFFF',
    surfaceAlt: '#F8FAFD',
    ink: '#0F1E33',
    inkSoft: '#344660',
    muted: '#7A8BA3',
    mutedDeep: '#AEB8C7',
    border: '#DDE4EC',
    borderSoft: '#EAEEF4',
    accent: '#2C7CD4',
    accentSoft: '#D7E6F6',
    accentInk: '#FFFFFF',
    sparkle: '#C99A26',
    tiles: {
      roast:      { solid: '#F08B3A', tint: '#FCE6D2', ink: '#5A2C0A' },
      imposter:   { solid: '#E05858', tint: '#F8DCDC', ink: '#5A1A1A' },
      taboo:      { solid: '#E5707A', tint: '#F9DEE1', ink: '#5A1E25' },
      fact:       { solid: '#E15B82', tint: '#F8DDE6', ink: '#5A1E38' },
      mostLikely: { solid: '#9266D2', tint: '#E5DAF5', ink: '#2F1A58' },
      charades:   { solid: '#E5B547', tint: '#F9EDC6', ink: '#503B0A' },
      traitors:   { solid: '#3B4660', tint: '#DEE2EB', ink: '#0F1530' },
      never:      { solid: '#4CBDCE', tint: '#D8F0F4', ink: '#10454D' },
      wyr:        { solid: '#7781DB', tint: '#E0E2F7', ink: '#1E2362' },
      ice:        { solid: '#4CBE86', tint: '#D7F0E1', ink: '#104A2E' },
      lie:        { solid: '#43B2A4', tint: '#D4EEE9', ink: '#0E3D38' },
      truth:      { solid: '#D94D4B', tint: '#F9DBDB', ink: '#5A1716' },
      forecast:   { solid: '#E56AA0', tint: '#F9DFEA', ink: '#5A1E40' },
    },
  },
};

// Rich metadata for games — used by the editorial/discover variations
const GAME_META_RICH = {
  roast:      { vibe: 'Wild',      duration: '2 min',   players: 'Solo',   tags: ['AI', 'Quick', 'Solo OK'] },
  imposter:   { vibe: 'Strategy',  duration: '10 min',  players: '3–8',    tags: ['Social', 'Deduction'] },
  taboo:      { vibe: 'Classic',   duration: '5 min',   players: '4+',     tags: ['Teams', 'Fast'] },
  fact:       { vibe: 'Trivia',    duration: '5 min',   players: '2+',     tags: ['Quick', 'Learn'] },
  mostLikely: { vibe: 'Gossip',    duration: '15 min',  players: '3+',     tags: ['Point', 'Expose'] },
  charades:   { vibe: 'Classic',   duration: '10 min',  players: '4+',     tags: ['Teams', 'Active'] },
  traitors:   { vibe: 'Strategy',  duration: '20 min',  players: '5+',     tags: ['Betrayal', 'Long'] },
  never:      { vibe: 'Confess',   duration: '10 min',  players: '3+',     tags: ['Classic', 'Reveal'] },
  wyr:        { vibe: 'Debate',    duration: '10 min',  players: '1+',     tags: ['Quick', 'Any'] },
  ice:        { vibe: 'Warm-up',   duration: '5 min',   players: '2+',     tags: ['Meet', 'Gentle'] },
  lie:        { vibe: 'Bluff',     duration: '10 min',  players: '3+',     tags: ['Story', 'Read'] },
  truth:      { vibe: 'Deep',      duration: '15 min',  players: '2+',     tags: ['Adult', 'Honest'] },
  forecast:   { vibe: 'Connect',   duration: '15 min',  players: '2',      tags: ['Couple', 'Know'] },
};

// Home row groupings for the discovery variant (App Store-style rails)
const HOME_RAILS = [
  { id: 'classics', title: 'Party Classics', caption: 'The ones everyone knows', games: ['mostLikely', 'never', 'charades', 'taboo'] },
  { id: 'couples',  title: 'For Two',        caption: 'Pairs, dates, long drives',  games: ['forecast', 'wyr', 'lie'] },
  { id: 'wild',     title: 'Wild Cards',     caption: 'Higher spice, bigger laughs', games: ['roast', 'imposter', 'traitors', 'fact'] },
  { id: 'warmup',   title: 'Warm Ups',       caption: 'Gentle starters',             games: ['ice', 'fact', 'wyr'] },
];

window.SHELL_TOKENS = SHELL_TOKENS;
window.GAME_META_RICH = GAME_META_RICH;
window.HOME_RAILS = HOME_RAILS;
