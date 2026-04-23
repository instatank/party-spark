// Shell Direction 05 — Hybrid: Dir 02 chrome (wordmark + search + filter chips) over Dir 03 editorial list.
// Search-first navigation, but the games are rendered as a magazine-style index rather than colored tiles.

function ShellHybridSearchList({ mode = 'dark' }) {
  const T = SHELL_TOKENS[mode];
  const [filter, setFilter] = React.useState('all');

  const FILTERS = [
    { id: 'all',      label: 'All' },
    { id: 'quick',    label: 'Quick' },
    { id: 'couples',  label: 'Couples' },
    { id: 'crowd',    label: 'Crowd' },
    { id: 'spicy',    label: 'Spicy' },
  ];

  // Filter rules — lightweight, driven by GAME_META_RICH tags and player counts
  const matches = (g) => {
    if (filter === 'all') return true;
    const meta = GAME_META_RICH[g.key] || {};
    if (filter === 'quick')   return (meta.duration || '').includes('2 min') || (meta.duration || '').includes('5 min');
    if (filter === 'couples') return (meta.players || '').startsWith('2') || g.key === 'forecast';
    if (filter === 'crowd')   return /4\+|5\+|3\u20138/.test(meta.players || '');
    if (filter === 'spicy')   return ['imposter', 'roast', 'truth', 'mostLikely', 'traitors'].includes(g.key);
    return true;
  };

  const list = GAMES.filter(matches);

  return (
    <div style={{
      background: T.bg, color: T.ink, minHeight: '100%',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Dir-02 chrome: compact header */}
      <header style={{ padding: '18px 20px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 800, fontSize: 22, margin: 0,
            color: T.ink, letterSpacing: '-0.02em', lineHeight: 1,
          }}>PartySpark</h1>
          <span style={{ fontSize: 14, color: T.accent, transform: 'translateY(-1px)' }}>✨</span>
        </div>
        <button style={{
          width: 36, height: 36, borderRadius: 10,
          background: mode === 'dark' ? T.surface : T.surfaceAlt,
          border: `1px solid ${T.border}`,
          color: T.inkSoft, display: 'grid', placeItems: 'center', cursor: 'pointer',
        }}>
          <Icon name="heart" size={16} />
        </button>
      </header>

      {/* Dir-02 title + search */}
      <div style={{ padding: '6px 20px 16px' }}>
        <h2 style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 700, fontSize: 30, margin: '10px 0 14px',
          letterSpacing: '-0.025em', color: T.ink, lineHeight: 1.05,
        }}>
          What are we<br/>playing tonight?
        </h2>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: mode === 'dark' ? T.surface : '#FFFFFF',
          border: `1px solid ${T.border}`,
          borderRadius: 14, padding: '11px 14px', marginBottom: 14,
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
            background: T.bgInset, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.04em',
          }}>⌘K</span>
        </div>

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
                  padding: '7px 14px', borderRadius: 999,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >{f.label}</button>
            );
          })}
        </div>
      </div>

      {/* Dir-03 editorial list rendering */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 24px' }}>
        {list.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: T.muted, fontSize: 13 }}>
            No games match that filter. Try another.
          </div>
        )}
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
              <span style={{
                width: 26, fontSize: 14, fontWeight: 600, color: T.inkSoft,
                fontFamily: "'Playfair Display', serif", fontStyle: 'italic',
                letterSpacing: '0.02em',
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: tile.solid, flexShrink: 0,
                boxShadow: `0 0 0 3px ${tile.solid}25`,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{
                  margin: '0 0 4px', fontSize: 17, fontWeight: 700,
                  color: T.ink, letterSpacing: '-0.01em', lineHeight: 1.15,
                  fontFamily: "'Playfair Display', serif",
                }}>{g.title}</h3>
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
              <Icon name="chevron" size={16} color={T.mutedDeep} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

window.ShellHybridSearchList = ShellHybridSearchList;
