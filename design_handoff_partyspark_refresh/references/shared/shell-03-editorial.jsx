// Shell Direction 03 — Editorial List + Segmented Control
// Flat vertical list with rich metadata (vibe, duration, players, tags).
// Restrained, magazine-like. Reads like a menu rather than an app.

function ShellEditorialList({ mode = 'dark' }) {
  const T = SHELL_TOKENS[mode];
  const [segment, setSegment] = React.useState('play');

  const segments = [
    { id: 'play',   label: 'Play Now' },
    { id: 'soon',   label: 'Coming Soon' },
  ];

  const list = segment === 'play' ? GAMES : COMING_SOON;

  return (
    <div style={{
      background: T.bg, color: T.ink, minHeight: '100%',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Editorial header */}
      <header style={{ padding: '24px 24px 10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14, fontSize: 10.5, fontWeight: 700,
          letterSpacing: '0.16em', color: T.muted, textTransform: 'uppercase',
        }}>
          <span>Vol. 01 · Issue 04</span>
          <span>Sat · 9:42 PM</span>
        </div>

        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 800, fontSize: 44, margin: 0,
          color: T.ink, letterSpacing: '-0.035em', lineHeight: 0.95,
        }}>
          Party<span style={{ fontStyle: 'italic', fontWeight: 500 }}>Spark</span>
          <span style={{ color: T.accent, marginLeft: 4, fontSize: 32, verticalAlign: 'top' }}>✦</span>
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 13, color: T.inkSoft, maxWidth: 280, lineHeight: 1.4 }}>
          Thirteen games. One awkward dinner. Begin anywhere.
        </p>
      </header>

      {/* Segmented control */}
      <div style={{ padding: '16px 24px 14px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${segments.length}, 1fr)`,
          background: mode === 'dark' ? T.bgInset : T.bgInset,
          border: `1px solid ${T.border}`,
          borderRadius: 10, padding: 3, gap: 2,
        }}>
          {segments.map(s => {
            const active = segment === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSegment(s.id)}
                style={{
                  background: active ? (mode === 'dark' ? T.surface : '#FFFFFF') : 'transparent',
                  color: active ? T.ink : T.muted,
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Editorial list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 24px' }}>
        {list.map((g, i) => {
          const tile = T.tiles[g.key];
          const meta = GAME_META_RICH[g.key];
          return (
            <button key={g.id} style={{
              width: '100%',
              background: 'transparent', border: 'none',
              padding: '16px 24px',
              borderBottom: i < list.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
              display: 'flex', alignItems: 'center', gap: 14,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}>
              {/* Numeric index */}
              <span style={{
                width: 26,
                fontSize: 14,
                fontWeight: 600,
                color: T.inkSoft,
                letterSpacing: '0.02em',
                fontFamily: "'Playfair Display', serif",
                fontStyle: 'italic',
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>

              {/* Color dot indicator */}
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: tile.solid, flexShrink: 0,
                boxShadow: `0 0 0 3px ${mode === 'dark' ? tile.solid + '25' : tile.solid + '20'}`,
              }} />

              {/* Main content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{
                  margin: '0 0 4px', fontSize: 17, fontWeight: 700,
                  color: T.ink, letterSpacing: '-0.01em', lineHeight: 1.15,
                  fontFamily: "'Playfair Display', serif",
                }}>
                  {g.title}
                </h3>
                <p style={{
                  margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.35,
                  display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                }}>
                  <span>{meta?.vibe || '—'}</span>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: T.mutedDeep }} />
                  <span>{meta?.duration || '—'}</span>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: T.mutedDeep }} />
                  <span>{meta?.players || '—'}</span>
                </p>
              </div>

              {/* Arrow */}
              <Icon name="chevron" size={16} color={T.mutedDeep} />
            </button>
          );
        })}
      </div>

      <footer style={{ textAlign: 'center', fontSize: 10, color: T.muted, padding: '12px 0 16px', letterSpacing: '0.12em' }}>
        POWERED BY CLAUDE & GEMINI
      </footer>
    </div>
  );
}

window.ShellEditorialList = ShellEditorialList;
