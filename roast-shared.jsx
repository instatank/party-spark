// Shared building blocks for Roast Me redesign explorations
// Available globally: AZURE, SAMPLE_ROAST, SAMPLE_ROAST_SHORT, Phone

// Theme catalogue
const ROAST_THEMES = [
  { key: 'animate',  label: 'Animate',    emoji: '🎨', tag: 'Cartoon caricature', color: '#E15B82' },
  { key: 'tabloid',  label: 'Tabloid',    emoji: '📰', tag: 'Front-page scandal', color: '#0F1E33' },
  { key: 'movie',    label: 'Movie',      emoji: '🎬', tag: 'Action poster',      color: '#D83A3A' },
  { key: 'disco',    label: '80s Disco',  emoji: '🕺', tag: 'Glitter & funk',     color: '#9266D2' },
  { key: 'agra',     label: 'Agra Royal', emoji: '🕌', tag: 'Mughal court',       color: '#B8922F' },
];

// A faux portrait — gradient + initial — used in place of a real upload
function MockPortrait({ size = '100%', variant = 'a', radius = 16 }) {
  const gradients = {
    a: 'linear-gradient(135deg, #FFB199 0%, #FF6E7F 50%, #67577C 100%)',
    b: 'linear-gradient(135deg, #FAD0C4 0%, #FF9A9E 60%, #A18CD1 100%)',
    c: 'linear-gradient(135deg, #FBC2EB 0%, #A18CD1 50%, #2C5364 100%)',
  };
  return (
    <div style={{
      width: size, height: size,
      background: gradients[variant] || gradients.a,
      borderRadius: radius,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* soft "face" shape */}
      <div style={{
        position: 'absolute', left: '50%', top: '38%',
        transform: 'translate(-50%, -50%)',
        width: '54%', aspectRatio: '1', borderRadius: '50%',
        background: 'rgba(255,255,255,0.14)',
        backdropFilter: 'blur(2px)',
      }} />
      <div style={{
        position: 'absolute', left: '50%', top: '78%',
        transform: 'translate(-50%, -50%)',
        width: '78%', height: '40%',
        borderRadius: '50% 50% 0 0',
        background: 'rgba(0,0,0,0.18)',
      }} />
      {/* subtle grain */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.25), transparent 50%)',
        mixBlendMode: 'screen',
      }} />
    </div>
  );
}

// Soft icon strokes used across directions (no emoji where avoidable)
const Icons = {
  Camera: ({ size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5C3 7.4 3.9 6.5 5 6.5h2l1.5-2h7L17 6.5h2c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-9z"/>
      <circle cx="12" cy="13" r="3.5"/>
    </svg>
  ),
  Photo: ({ size = 20, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2"/>
      <circle cx="9" cy="10" r="1.6"/>
      <path d="m4 18 5-5 4 4 3-3 4 4"/>
    </svg>
  ),
  Share: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12"/><path d="m7 9 5-5 5 5"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>
    </svg>
  ),
  Save: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>
    </svg>
  ),
  Refresh: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 4v5h-5"/>
    </svg>
  ),
  Sparkle: ({ size = 16, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l1.8 6.5L20 10l-6.2 1.5L12 18l-1.8-6.5L4 10l6.2-1.5L12 2z"/>
    </svg>
  ),
  Close: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6 6 18"/>
    </svg>
  ),
  Flame: ({ size = 22, color = '#D83A3A' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2c0 4-4 5-4 9a4 4 0 0 0 8 0c0-1.5-.5-2.5-1-3.5 2 1 4 3 4 6.5a7 7 0 0 1-14 0c0-5 5-7 7-12z"/>
    </svg>
  ),
  Skull: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2a8 8 0 0 0-8 8v4l2 2v3h2v-2h2v2h4v-2h2v2h2v-3l2-2v-4a8 8 0 0 0-8-8zm-3 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-3 4-1-2h2l-1 2z"/>
    </svg>
  ),
  Wand: ({ size = 18, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4V2M15 10V8M19 6h2M11 6h2M17.5 8.5l1.5 1.5M11.5 2.5 13 4M3 21l9-9M14 7l3 3"/>
    </svg>
  ),
  Chevron: ({ size = 16, color = 'currentColor', dir = 'right' }) => {
    const rot = { right: 0, left: 180, down: 90, up: -90 }[dir];
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${rot}deg)` }}>
        <path d="m9 6 6 6-6 6"/>
      </svg>
    );
  },
};

// Header — used by all 3 directions
function GameHeader({ title = 'Roast Me', accent = '#D83A3A', onClose, scheme = 'light', subtle = false }) {
  const ink = scheme === 'light' ? AZURE.ink : '#FFFFFF';
  const muted = scheme === 'light' ? AZURE.muted : 'rgba(255,255,255,0.6)';
  const border = scheme === 'light' ? AZURE.border : 'rgba(255,255,255,0.12)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '60px 18px 14px',
      borderBottom: subtle ? 'none' : `1px solid ${border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icons.Flame size={18} color={accent} />
        <span style={{ fontSize: 15, fontWeight: 700, color: ink, letterSpacing: -0.2 }}>{title}</span>
      </div>
      <button style={{
        width: 30, height: 30, borderRadius: 999,
        background: scheme === 'light' ? AZURE.surface : 'rgba(255,255,255,0.1)',
        border: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: muted,
      }}>
        <Icons.Close size={14} color={muted} />
      </button>
    </div>
  );
}

window.ROAST_THEMES = ROAST_THEMES;
window.MockPortrait = MockPortrait;
window.RoastIcons = Icons;
window.GameHeader = GameHeader;
