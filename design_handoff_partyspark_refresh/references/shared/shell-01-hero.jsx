// Shell Direction 01 — Hero + Bottom Nav
// A big featured "spotlight" card, a curated list below, and a 4-slot bottom tab bar.
// Playful, discovery-leaning, higher information density.

function ShellHeroBottomNav({ mode = 'dark' }) {
  const T = SHELL_TOKENS[mode];
  const [activeTab, setActiveTab] = React.useState('play');

  // Spotlight game (featured)
  const spotlight = GAMES.find(g => g.id === 'mostLikely');
  const spotTile = T.tiles.mostLikely;
  const otherGames = GAMES.filter(g => g.id !== 'mostLikely');

  return (
    <div style={{
      background: T.bg, color: T.ink, minHeight: '100%',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Compact header */}
      <header style={{ padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 800, fontSize: 26, margin: 0,
            color: T.ink, letterSpacing: '-0.02em', lineHeight: 1,
          }}>
            PartySpark
          </h1>
          <span style={{ fontSize: 16, color: T.accent, transform: 'translateY(-2px)' }}>✨</span>
        </div>
        <button style={{
          width: 38, height: 38, borderRadius: 12,
          background: mode === 'dark' ? T.surface : T.surfaceAlt,
          border: `1px solid ${T.border}`,
          color: T.inkSoft, display: 'grid', placeItems: 'center', cursor: 'pointer',
        }}>
          <Icon name="search" size={18} />
        </button>
      </header>

      {/* Greeting */}
      <div style={{ padding: '0 20px 14px' }}>
        <p style={{ margin: 0, fontSize: 13, color: T.muted, letterSpacing: '0.02em' }}>
          Saturday night · 4 friends on the couch
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
        {/* HERO SPOTLIGHT CARD */}
        <div style={{
          position: 'relative',
          borderRadius: 24,
          padding: 22,
          background: mode === 'dark'
            ? `linear-gradient(145deg, ${spotTile.solid} 0%, #5b3a9a 100%)`
            : `linear-gradient(145deg, ${spotTile.solid} 0%, #6b45b0 100%)`,
          color: '#FFFFFF',
          overflow: 'hidden',
          marginBottom: 20,
          boxShadow: mode === 'dark'
            ? `0 10px 30px rgba(139,92,224,0.25)`
            : `0 10px 30px rgba(139,92,224,0.2)`,
        }}>
          {/* decorative rings */}
          <div style={{
            position: 'absolute', right: -40, top: -40, width: 180, height: 180,
            border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: '50%', pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', right: -80, top: -80, width: 260, height: 260,
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '50%', pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', right: 20, top: 20,
            fontSize: 9, letterSpacing: '0.16em', fontWeight: 700,
            background: 'rgba(0,0,0,0.22)', padding: '4px 9px', borderRadius: 6,
            color: '#FFFFFF', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            Tonight’s pick
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, position: 'relative' }}>
            <div style={{
              width: 54, height: 54, borderRadius: 16,
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.25)',
              display: 'grid', placeItems: 'center',
              backdropFilter: 'blur(12px)',
            }}>
              <Icon name="users" size={24} color="#FFFFFF" strokeWidth={2.4} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 600, letterSpacing: '0.05em' }}>
                GOSSIP · 15 MIN · 3+
              </span>
            </div>
          </div>

          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 800, fontSize: 34, margin: '0 0 8px',
            letterSpacing: '-0.02em', lineHeight: 1.02, position: 'relative',
          }}>
            Most Likely<br/>To…
          </h2>
          <p style={{
            margin: '0 0 18px', fontSize: 14,
            color: 'rgba(255,255,255,0.85)',
            maxWidth: 230, lineHeight: 1.4, position: 'relative',
          }}>
            Point fingers at the friend most likely to text their ex at 2am.
          </p>

          <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
            <button style={{
              background: '#FFFFFF',
              color: '#3A2363',
              border: 'none',
              padding: '12px 20px',
              borderRadius: 12,
              fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
              fontFamily: 'inherit',
            }}>
              <Icon name="lightning" size={15} strokeWidth={2.5} /> Start playing
            </button>
            <button style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#FFFFFF',
              border: '1px solid rgba(255,255,255,0.25)',
              padding: '12px 16px',
              borderRadius: 12,
              fontSize: 13, fontWeight: 600,
              cursor: 'pointer', backdropFilter: 'blur(8px)',
              fontFamily: 'inherit',
            }}>
              Pick another
            </button>
          </div>
        </div>

        {/* Section heading */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{
            margin: 0, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.14em', color: T.muted, textTransform: 'uppercase',
          }}>
            More Games
          </h3>
          <span style={{ fontSize: 12, color: T.muted }}>12 total</span>
        </div>

        {/* Dense game list — 2 per row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingBottom: 24 }}>
          {otherGames.map(g => {
            const tile = T.tiles[g.key];
            const meta = GAME_META_RICH[g.key];
            return (
              <button key={g.id} style={{
                background: mode === 'dark' ? T.surface : T.bgElev,
                border: `1px solid ${T.border}`,
                borderRadius: 16,
                padding: 14,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 10,
                fontFamily: 'inherit',
                minHeight: 132,
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11,
                  background: tile.solid,
                  display: 'grid', placeItems: 'center',
                  color: '#FFFFFF',
                  boxShadow: mode === 'dark' ? 'none' : `0 3px 8px ${tile.solid}35`,
                }}>
                  <Icon name={GAME_ICON[g.key]} size={18} strokeWidth={2.3} />
                </div>
                <div>
                  <h4 style={{
                    margin: '0 0 3px', fontSize: 14, fontWeight: 700,
                    color: T.ink, letterSpacing: '-0.005em', lineHeight: 1.15,
                  }}>
                    {g.title}
                  </h4>
                  <p style={{
                    margin: 0, fontSize: 11, color: T.muted,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {meta?.duration || '10 min'} · {meta?.players || `${g.minPlayers}+`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom nav */}
      <nav style={{
        background: mode === 'dark' ? T.bgInset : '#FFFFFF',
        borderTop: `1px solid ${T.border}`,
        padding: '10px 12px 22px',
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
      }}>
        {[
          { id: 'play', label: 'Play', icon: 'lightning' },
          { id: 'saved', label: 'Saved', icon: 'heart' },
          { id: 'discover', label: 'Discover', icon: 'sparkle' },
          { id: 'profile', label: 'You', icon: 'users' },
        ].map(t => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                background: 'transparent', border: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '6px 0', cursor: 'pointer', fontFamily: 'inherit',
                color: active ? T.accent : T.muted,
              }}
            >
              <Icon name={t.icon} size={20} strokeWidth={active ? 2.4 : 1.8} />
              <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

window.ShellHeroBottomNav = ShellHeroBottomNav;
