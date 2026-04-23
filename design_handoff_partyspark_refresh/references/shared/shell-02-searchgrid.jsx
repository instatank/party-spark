// Shell Direction 02 — Search-First + 2-col Grid
// Minimal nav chrome, search at the top, chip filters, equal-weight tile grid.
// For power users who know what they want.

function ShellSearchGrid({ mode = 'dark' }) {
  const T = SHELL_TOKENS[mode];
  const [filter, setFilter] = React.useState('all');

  const FILTERS = [
    { id: 'all',       label: 'All' },
    { id: 'quick',     label: 'Quick' },
    { id: 'couples',   label: 'Couples' },
    { id: 'crowd',     label: 'Crowd' },
    { id: 'spicy',     label: 'Spicy' },
  ];

  return (
    <div style={{
      background: T.bg, color: T.ink, minHeight: '100%',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header with wordmark */}
      <header style={{ padding: '18px 20px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 800, fontSize: 22, margin: 0,
            color: T.ink, letterSpacing: '-0.02em', lineHeight: 1,
          }}>
            PartySpark
          </h1>
          <span style={{ fontSize: 14, color: T.accent, transform: 'translateY(-1px)' }}>✨</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{
            width: 36, height: 36, borderRadius: 10,
            background: mode === 'dark' ? T.surface : T.surfaceAlt,
            border: `1px solid ${T.border}`,
            color: T.inkSoft, display: 'grid', placeItems: 'center', cursor: 'pointer',
          }}>
            <Icon name="heart" size={16} />
          </button>
        </div>
      </header>

      {/* Title + search */}
      <div style={{ padding: '6px 20px 16px' }}>
        <h2 style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 700, fontSize: 30, margin: '10px 0 14px',
          letterSpacing: '-0.025em', color: T.ink, lineHeight: 1.05,
        }}>
          What are we<br/>playing tonight?
        </h2>

        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: mode === 'dark' ? T.surface : '#FFFFFF',
          border: `1px solid ${T.border}`,
          borderRadius: 14,
          padding: '11px 14px',
          marginBottom: 14,
        }}>
          <Icon name="search" size={17} color={T.muted} />
          <input
            placeholder="Search games, vibes, or players…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 14, color: T.ink, fontFamily: 'inherit',
            }}
          />
          <span style={{
            fontSize: 10, fontWeight: 700, color: T.muted,
            background: mode === 'dark' ? T.bgInset : T.bgInset,
            padding: '2px 6px', borderRadius: 4, letterSpacing: '0.04em',
          }}>⌘K</span>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', margin: '0 -20px', padding: '0 20px 4px' }}>
          {FILTERS.map(f => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  flexShrink: 0,
                  background: active ? T.ink : 'transparent',
                  color: active ? (mode === 'dark' ? T.bg : T.bgElev) : T.inkSoft,
                  border: active ? `1px solid ${T.ink}` : `1px solid ${T.border}`,
                  padding: '7px 14px',
                  borderRadius: 999,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2-col grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {GAMES.map(g => {
            const tile = T.tiles[g.key];
            return (
              <button key={g.id} style={{
                background: mode === 'dark' ? tile.solid : tile.solid,
                border: 'none',
                borderRadius: 18,
                padding: 18,
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                alignItems: 'flex-start', justifyContent: 'space-between',
                minHeight: 150,
                fontFamily: 'inherit',
                textAlign: 'left',
                color: '#FFFFFF',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: mode === 'dark' ? 'none' : `0 4px 14px ${tile.solid}30`,
              }}>
                {/* subtle grain */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.1) 0%, transparent 40%)',
                  pointerEvents: 'none',
                }} />
                <Icon name={GAME_ICON[g.key]} size={30} strokeWidth={2.2} color="#FFFFFF" />
                <div style={{ position: 'relative' }}>
                  <h4 style={{
                    margin: '0 0 4px', fontSize: 16, fontWeight: 700,
                    color: '#FFFFFF', letterSpacing: '-0.01em', lineHeight: 1.15,
                  }}>
                    {g.title}
                  </h4>
                  <p style={{
                    margin: 0, fontSize: 11,
                    color: 'rgba(255,255,255,0.85)',
                    fontWeight: 500,
                  }}>
                    {g.minPlayers}+ players
                  </p>
                </div>
              </button>
            );
          })}

          {/* AI spark card */}
          <button style={{
            gridColumn: 'span 2',
            background: mode === 'dark' ? T.surface : T.bgElev,
            border: `1.5px dashed ${T.border}`,
            borderRadius: 18, padding: '18px 20px',
            display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
            fontFamily: 'inherit', textAlign: 'left',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: T.accentSoft,
              color: T.accent, display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              <Icon name="wand" size={22} strokeWidth={2.2} />
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: '0 0 2px', fontSize: 14.5, fontWeight: 700, color: T.ink }}>
                Can't decide? Spark something
              </h4>
              <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.3 }}>
                Tell us your vibe, we'll build a custom game.
              </p>
            </div>
            <Icon name="arrow" size={18} color={T.accent} />
          </button>
        </div>
      </div>
    </div>
  );
}

window.ShellSearchGrid = ShellSearchGrid;
