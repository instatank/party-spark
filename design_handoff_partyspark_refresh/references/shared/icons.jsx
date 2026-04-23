// Minimal inline SVG icons — lucide-flavored, stroke-based
const Icon = ({ name, size = 22, strokeWidth = 2, color = 'currentColor' }) => {
  const sw = strokeWidth;
  const c = color;
  const s = size;
  const base = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'flame':
      return (<svg {...base}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.5 0 2.5-1 2.5-2.5 0-1.5-1-2.5-2-4C10 9 9 7 9 5c-1 2-3 3-3 7 0 1 .5 2.5 2.5 2.5Z"/><path d="M12 21a6 6 0 0 0 6-6c0-2-1-4-3-6-1-1-2-3-2-5-2 3-4 5-4 8 0 1 1 2 2 2 0 0 0 2-1 2-2 0-3-2-3-4 0 5 2 9 5 9Z"/></svg>);
    case 'mask':
      return (<svg {...base}><path d="M3 8c0-2 1.5-3 3-3 2 0 3 1 6 1s4-1 6-1c1.5 0 3 1 3 3v4c0 5-4 8-9 8s-9-3-9-8V8Z"/><circle cx="8.5" cy="11" r="1.2"/><circle cx="15.5" cy="11" r="1.2"/></svg>);
    case 'ban':
      return (<svg {...base}><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>);
    case 'check':
      return (<svg {...base}><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5L16 9.5"/></svg>);
    case 'users':
      return (<svg {...base}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
    case 'drama':
      return (<svg {...base}><path d="M12 2l1.8 4.5L18 8l-3 3 .8 4.5L12 13l-3.8 2.5L9 11 6 8l4.2-1.5L12 2Z"/></svg>);
    case 'hand':
      return (<svg {...base}><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8"/></svg>);
    case 'split':
      return (<svg {...base}><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3 12 12l-9 9"/><path d="m15 15 6 6"/></svg>);
    case 'mic':
      return (<svg {...base}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>);
    case 'wine':
      return (<svg {...base}><path d="M8 2h8s1 8-4 11c-5-3-4-11-4-11Z"/><path d="M12 13v7"/><path d="M8 21h8"/></svg>);
    case 'heart':
      return (<svg {...base}><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/></svg>);
    case 'spark':
      return (<svg {...base}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>);
    case 'arrow':
      return (<svg {...base}><path d="M5 12h14M13 6l6 6-6 6"/></svg>);
    case 'back':
      return (<svg {...base}><path d="m15 6-6 6 6 6"/></svg>);
    case 'home':
      return (<svg {...base}><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/></svg>);
    case 'search':
      return (<svg {...base}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>);
    case 'chevron':
      return (<svg {...base}><path d="m9 6 6 6-6 6"/></svg>);
    case 'wand':
      return (<svg {...base}><path d="M15 4 20 9"/><path d="M4 20 15 9l4 4L8 24"/><path d="M18 3v2M21 6h-2M3 12v2M6 9H4"/></svg>);
    case 'sparkle':
      return (<svg {...base}><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z"/></svg>);
    case 'close':
      return (<svg {...base}><path d="M6 6l12 12M18 6 6 18"/></svg>);
    case 'lightning':
      return (<svg {...base}><path d="m13 2-9 13h7l-1 7 9-13h-7l1-7Z"/></svg>);
    default:
      return (<svg {...base}><circle cx="12" cy="12" r="3"/></svg>);
  }
};

// Map game id -> icon name & tile key
const GAME_ICON = {
  roast: 'flame', imposter: 'mask', taboo: 'ban', fact: 'check', mostLikely: 'users',
  charades: 'drama', traitors: 'mask', never: 'hand', wyr: 'split', ice: 'mic',
  lie: 'drama', truth: 'wine', forecast: 'heart',
};

window.Icon = Icon;
window.GAME_ICON = GAME_ICON;
