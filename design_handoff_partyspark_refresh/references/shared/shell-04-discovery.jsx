// Shell Direction 04 — Discovery Rails (App Store-style)
// Horizontal-scroll rows grouped by curated themes.
// Discovery-first; browse by occasion, not by alphabetized grid.

function ShellDiscoveryRails({ mode = 'dark' }) {
  const T = SHELL_TOKENS[mode];
  const byKey = (key) => GAMES.find(g => g.key === key) || COMING_SOON.find(g => g.key === key);

  return (
    <div style={{
      background: T.bg, color: T.ink, minHeight: '100%',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{ padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 800, fontSize: 24, margin: 0,
            color: T.ink, letterSpacing: '-0.02em', lineHeight: 1,
          }}>
            PartySpark
          </h1>
          <span style={{ fontSize: 15, color: T.accent, transform: 'translateY(-1px)' }}>✨</span>
        </div>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: mode === 'dark' ? T.surface : T.accent,
          color: mode === 'dark' ? T.accent : '#FFFFFF',
          display: 'grid', placeItems: 'center',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
          border: `1px solid ${T.border}`,
        }}>
          A
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 20 }}>
        {/* Featured banner */}
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{
            position: 'relative',
            borderRadius: 20,
            padding: '20px 20px 22px',
            background: mode === 'dark'
              ? `linear-gradient(135deg, ${T.tiles.forecast.solid} 0%, ${T.tiles.mostLikely.solid} 100%)`
              : `linear-gradient(135deg, ${T.tiles.forecast.solid} 0%, ${T.tiles.mostLikely.solid} 100%)`,
            overflow: 'hidden',
            color: '#FFFFFF',
            boxShadow: mode === 'dark' ? 'none' : `0 8px 24px ${T.tiles.forecast.solid}30`,
          }}>
            <div style={{
              position: 'absolute', right: -20, bottom: -30, width: 140, height: 140,
              borderRadius: '50%', background: 'rgba(255,255,255,0.12)',
              pointerEvents: 'none',
            }} />
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
              background: 'rgba(0,0,0,0.22)', padding: '4px 9px', borderRadius: 5,
              display: 'inline-block', marginBottom: 14,
              whiteSpace: 'nowrap',
            }}>
              NEW · FOR TWO
            </span>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 800, fontSize: 26, margin: '0 0 6px',
              letterSpacing: '-0.02em', lineHeight: 1.05, position: 'relative',
            }}>
              The Forecast
            </h2>
            <p style={{
              margin: '0 0 14px', fontSize: 13,
              color: 'rgba(255,255,255,0.9)', maxWidth: 220,
              lineHeight: 1.35, position: 'relative',
            }}>
              Three rounds. One question: how well do you really know each other?
            </p>
            <button style={{
              background: '#FFFFFF', color: T.tiles.forecast.ink || '#4a1336',
              border: 'none', padding: '9px 16px', borderRadius: 10,
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit', position: 'relative',
            }}>
              Open <Icon name="arrow" size={13} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Rails */}
        {HOME_RAILS.map((rail) => (
          <div key={rail.id} style={{ marginBottom: 24 }}>
            <div style={{
              padding: '0 20px 10px',
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{
                  fontFamily: "'Playfair Display', serif",
                  fontWeight: 700, fontSize: 19, margin: 0,
                  color: T.ink, letterSpacing: '-0.015em',
                }}>
                  {rail.title}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: T.muted, letterSpacing: '0.01em' }}>
                  {rail.caption}
                </p>
              </div>
              <button style={{
                background: 'transparent', border: 'none',
                fontSize: 12, fontWeight: 600, color: T.accent, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
                See all
              </button>
            </div>

            <div style={{
              display: 'flex', gap: 12, overflowX: 'auto',
              padding: '0 20px 6px', scrollSnapType: 'x mandatory',
            }}>
              {rail.games.map(key => {
                const g = byKey(key);
                if (!g) return null;
                const tile = T.tiles[g.key];
                const meta = GAME_META_RICH[g.key];
                return (
                  <button key={g.id} style={{
                    flexShrink: 0,
                    width: 160,
                    background: mode === 'dark' ? T.surface : '#FFFFFF',
                    border: `1px solid ${T.border}`,
                    borderRadius: 16, padding: 14,
                    cursor: 'pointer', fontFamily: 'inherit',
                    textAlign: 'left', scrollSnapAlign: 'start',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{
                      width: '100%', aspectRatio: '1.15 / 1',
                      borderRadius: 12,
                      background: mode === 'dark'
                        ? `linear-gradient(140deg, ${tile.solid} 0%, ${tile.solid}dd 100%)`
                        : `linear-gradient(140deg, ${tile.solid} 0%, ${tile.solid}cc 100%)`,
                      display: 'grid', placeItems: 'center',
                      color: '#FFFFFF', position: 'relative',
                      overflow: 'hidden',
                      boxShadow: mode === 'dark' ? 'none' : `0 3px 10px ${tile.solid}30`,
                    }}>
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'linear-gradient(160deg, rgba(255,255,255,0.15) 0%, transparent 50%)',
                      }} />
                      <Icon name={GAME_ICON[g.key]} size={32} strokeWidth={2.1} color="#FFFFFF" />
                    </div>
                    <div>
                      <h4 style={{
                        margin: '0 0 3px', fontSize: 13.5, fontWeight: 700,
                        color: T.ink, letterSpacing: '-0.005em', lineHeight: 1.15,
                      }}>
                        {g.title}
                      </h4>
                      <p style={{
                        margin: 0, fontSize: 11, color: T.muted,
                      }}>
                        {meta?.duration || '10 min'} · {meta?.players || `${g.minPlayers}+`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 10, color: T.muted, padding: '8px 0 18px', letterSpacing: '0.12em' }}>
          POWERED BY CLAUDE & GEMINI
        </div>
      </div>
    </div>
  );
}

window.ShellDiscoveryRails = ShellDiscoveryRails;
