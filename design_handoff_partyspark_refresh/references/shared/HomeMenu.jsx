// HomeMenu — renders the home screen in any of the 3 directions
// Props: dir (one of DIRECTIONS), onSelect(gameId)

function HomeMenu({ dir, onSelect }) {
  const [tab, setTab] = React.useState('active');
  const D = DIRECTIONS[dir];
  const list = tab === 'active' ? GAMES : COMING_SOON;

  const isPaper = dir === 'paper';
  const isCream = dir === 'cream';
  const isAzure = dir === 'azure';

  // Wordmark color: cream = ink with gold ✨; paper = ink with coral ✨; azure = ink with blue ✨
  const wordmarkColor = D.ink;
  const sparkleColor = isCream ? D.gold : isPaper ? D.accent : D.accent;

  return (
    <div style={{ background: D.bg, color: D.ink, minHeight: '100%', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ padding: '20px 20px 0', textAlign: 'center' }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 800,
          fontSize: 40,
          letterSpacing: '-0.02em',
          margin: 0,
          color: wordmarkColor,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          lineHeight: 1,
        }}>
          PartySpark
          <span style={{ fontSize: 26, color: sparkleColor, display: 'inline-block', transform: 'translateY(-4px)' }}>✨</span>
        </h1>
        <p style={{ margin: '6px 0 18px', color: D.muted, fontSize: 13, letterSpacing: '0.02em' }}>
          <span style={{ color: sparkleColor, fontWeight: 700 }}>A</span>lways{' '}
          <span style={{ color: sparkleColor, fontWeight: 700 }}>I</span>nvited
        </p>

        {/* Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', borderBottom: `1px solid ${D.border}`, position: 'relative' }}>
          {[
            { id: 'active', label: 'Play Now' },
            { id: 'comingSoon', label: 'Coming Soon' },
          ].map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '10px 0 14px',
                  fontSize: t.id === 'active' ? 17 : 14,
                  fontWeight: 600,
                  color: active ? D.ink : D.muted,
                  cursor: 'pointer',
                  position: 'relative',
                  fontFamily: 'inherit',
                }}
              >
                {t.label}
                {active && (
                  <span style={{
                    position: 'absolute',
                    bottom: -1,
                    left: '15%',
                    right: '15%',
                    height: 2.5,
                    background: isCream ? D.gold : D.accent,
                    borderRadius: 2,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Game list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((g) => (
          <GameCard key={g.id} game={g} dir={dir} onClick={() => onSelect && onSelect(g.id)} />
        ))}
      </div>

      {/* Footer */}
      <footer style={{ textAlign: 'center', fontSize: 10.5, color: D.muted, padding: '0 0 14px', letterSpacing: '0.04em' }}>
        POWERED BY CLAUDE & GEMINI
      </footer>
    </div>
  );
}

function GameCard({ game, dir, onClick }) {
  const D = DIRECTIONS[dir];
  const t = D.tiles[game.key];
  const iconName = GAME_ICON[game.key] || 'spark';

  const isPaper = dir === 'paper';
  const isCream = dir === 'cream';
  const isAzure = dir === 'azure';

  // Card background
  const cardBg = isPaper ? D.surface : D.surface;
  const cardShadow = isPaper
    ? '0 1px 2px rgba(17,17,17,0.04)'
    : isCream
    ? '0 1px 2px rgba(101, 71, 20, 0.06), 0 4px 12px rgba(101, 71, 20, 0.03)'
    : '0 1px 2px rgba(20, 50, 90, 0.06), 0 4px 12px rgba(20, 50, 90, 0.03)';

  // Tile style: saturated in cream/azure, outlined in paper
  const tileBg = isPaper ? D.surface : t.solid;
  const tileBorder = isPaper ? `1.5px solid ${D.border}` : 'none';
  const iconColor = isPaper ? t.iconOn : '#FFFFFF';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        background: cardBg,
        border: `1px solid ${D.border}`,
        borderRadius: 14,
        boxShadow: cardShadow,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Soft bg blob for cream/azure */}
      {!isPaper && (
        <div style={{
          position: 'absolute',
          right: -20, top: -20,
          width: 110, height: 110,
          borderRadius: '50%',
          background: t.tint,
          opacity: 0.55,
          filter: 'blur(18px)',
          pointerEvents: 'none',
        }} />
      )}

      {/* Icon tile */}
      <div style={{
        width: 48, height: 48,
        borderRadius: 14,
        background: tileBg,
        border: tileBorder,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: iconColor,
        flexShrink: 0,
        boxShadow: isPaper ? 'none' : `0 3px 8px ${t.solid}40`,
        position: 'relative',
        zIndex: 1,
      }}>
        <Icon name={iconName} size={22} strokeWidth={2.2} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: D.ink, letterSpacing: '-0.01em' }}>
            {game.title}
          </h3>
          <span style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: isCream ? D.gold : isPaper ? D.muted : D.accent,
            background: isCream ? D.goldSoft : isPaper ? D.bgTint : D.accentSoft,
            padding: '3px 7px',
            borderRadius: 5,
            flexShrink: 0,
            textTransform: 'uppercase',
          }}>
            {game.minPlayers}+ Players
          </span>
        </div>
        <p style={{
          margin: 0,
          fontSize: 12.5,
          color: D.muted,
          lineHeight: 1.35,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {game.desc}
        </p>
      </div>
    </button>
  );
}

window.HomeMenu = HomeMenu;
