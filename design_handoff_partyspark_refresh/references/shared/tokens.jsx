// Three light-mode directions for PartySpark
// Each token set covers bg, surface, ink, muted, accent, secondary (gold-equivalent), border
const DIRECTIONS = {
  cream: {
    name: 'Warm Cream',
    subtitle: 'Paper, gold & terracotta',
    bg: '#F6EFE1',         // warm ivory
    bgTint: '#EFE4CD',     // deeper paper for rails
    surface: '#FFFBF2',    // card
    surfaceAlt: '#FBF4E2', // secondary card
    ink: '#1F1A12',        // near-black warm
    inkSoft: '#4A4234',
    muted: '#8A7F6A',
    border: '#E7DCC0',
    borderSoft: '#EFE4CD',
    accent: '#C6642E',     // terracotta — replaces gold-on-white
    accentSoft: '#F5E2D2',
    gold: '#B8922F',       // deeper gold that reads on cream
    goldSoft: '#F2E4B8',
    sparkle: '#C99A26',
    // per-game tiles: desaturated, warmer
    tiles: {
      roast:       { solid: '#E2714A', tint: '#FBE5DA', ink: '#6A2A13' },
      imposter:    { solid: '#D24B4B', tint: '#FADCDC', ink: '#6B1919' },
      taboo:       { solid: '#D86770', tint: '#FADEE1', ink: '#6B1F26' },
      fact:        { solid: '#D94D74', tint: '#FADCE5', ink: '#6A1F3A' },
      mostLikely:  { solid: '#8A5CC2', tint: '#EADDF6', ink: '#3A2361' },
      charades:    { solid: '#D8A63A', tint: '#F7EBC9', ink: '#5F4710' },
      traitors:    { solid: '#3E4656', tint: '#E2E3E8', ink: '#1B202B' },
      never:       { solid: '#3FA9B8', tint: '#D6EEF1', ink: '#153E45' },
      wyr:         { solid: '#6B6FD4', tint: '#DFE0F6', ink: '#22265E' },
      ice:         { solid: '#4AB07A', tint: '#D9ECDD', ink: '#154030' },
      lie:         { solid: '#3EA296', tint: '#D4EBE7', ink: '#123B37' },
      truth:       { solid: '#C9403E', tint: '#F6D9D8', ink: '#621816' },
      forecast:    { solid: '#D85A8E', tint: '#F7DBE7', ink: '#5F1A3A' },
    },
  },
  paper: {
    name: 'Crisp Paper',
    subtitle: 'Ink, whitespace & coral',
    bg: '#FAFAF7',
    bgTint: '#F2F1EC',
    surface: '#FFFFFF',
    surfaceAlt: '#F7F6F1',
    ink: '#111111',
    inkSoft: '#3A3A3A',
    muted: '#8A8A85',
    border: '#EAE8E1',
    borderSoft: '#F2F1EC',
    accent: '#F25C4B',      // coral — the one hero accent
    accentSoft: '#FDE2DE',
    gold: '#111111',        // wordmark goes ink-black
    goldSoft: '#EAE8E1',
    sparkle: '#F25C4B',
    tiles: {
      // Minimal: neutral tile, colored icon only
      roast:       { solid: '#FFFFFF', tint: '#FFFFFF', ink: '#F05423', iconOn: '#F05423' },
      imposter:    { solid: '#FFFFFF', tint: '#FFFFFF', ink: '#D93636', iconOn: '#D93636' },
      taboo:       { solid: '#FFFFFF', tint: '#FFFFFF', ink: '#E1485A', iconOn: '#E1485A' },
      fact:        { solid: '#FFFFFF', tint: '#FFFFFF', ink: '#E23A6C', iconOn: '#E23A6C' },
      mostLikely:  { solid: '#FFFFFF', tint: '#FFFFFF', ink: '#7A3DCF', iconOn: '#7A3DCF' },
      charades:    { solid: '#FFFFFF', tint: '#FFFFFF', ink: '#C89220', iconOn: '#C89220' },
      traitors:    { solid: '#FFFFFF', tint: '#FFFFFF', ink: '#1F2634', iconOn: '#1F2634' },
      never:       { solid: '#FFFFFF', tint: '#FFFFFF', ink: '#1C96A8', iconOn: '#1C96A8' },
      wyr:         { solid: '#FFFFFF', tint: '#FFFFFF', ink: '#4A52C7', iconOn: '#4A52C7' },
      ice:         { solid: '#FFFFFF', tint: '#FFFFFF', ink: '#1E9A63', iconOn: '#1E9A63' },
      lie:         { solid: '#FFFFFF', tint: '#FFFFFF', ink: '#189585', iconOn: '#189585' },
      truth:       { solid: '#FFFFFF', tint: '#FFFFFF', ink: '#D02C2A', iconOn: '#D02C2A' },
      forecast:    { solid: '#FFFFFF', tint: '#FFFFFF', ink: '#E14580', iconOn: '#E14580' },
    },
  },
  azure: {
    name: 'Azure Sky',
    subtitle: 'Sky-blue, air & gold details',
    bg: '#EEF4FA',
    bgTint: '#E0EAF4',
    surface: '#FFFFFF',
    surfaceAlt: '#F5F9FD',
    ink: '#0F1E33',
    inkSoft: '#344660',
    muted: '#7A8BA3',
    border: '#D7E3F1',
    borderSoft: '#E8EFF8',
    accent: '#2C7CD4',       // the hero sky-blue
    accentSoft: '#D7E6F6',
    gold: '#B8922F',
    goldSoft: '#F2E4B8',
    sparkle: '#C99A26',
    tiles: {
      roast:       { solid: '#F08B3A', tint: '#FCE6D2', ink: '#5A2C0A' },
      imposter:    { solid: '#E05858', tint: '#F8DCDC', ink: '#5A1A1A' },
      taboo:       { solid: '#E5707A', tint: '#F9DEE1', ink: '#5A1E25' },
      fact:        { solid: '#E15B82', tint: '#F8DDE6', ink: '#5A1E38' },
      mostLikely:  { solid: '#9266D2', tint: '#E5DAF5', ink: '#2F1A58' },
      charades:    { solid: '#E5B547', tint: '#F9EDC6', ink: '#503B0A' },
      traitors:    { solid: '#3B4660', tint: '#DEE2EB', ink: '#0F1530' },
      never:       { solid: '#4CBDCE', tint: '#D8F0F4', ink: '#10454D' },
      wyr:         { solid: '#7781DB', tint: '#E0E2F7', ink: '#1E2362' },
      ice:         { solid: '#4CBE86', tint: '#D7F0E1', ink: '#104A2E' },
      lie:         { solid: '#43B2A4', tint: '#D4EEE9', ink: '#0E3D38' },
      truth:       { solid: '#D94D4B', tint: '#F9DBDB', ink: '#5A1716' },
      forecast:    { solid: '#E56AA0', tint: '#F9DFEA', ink: '#5A1E40' },
    },
  },
};

window.DIRECTIONS = DIRECTIONS;
