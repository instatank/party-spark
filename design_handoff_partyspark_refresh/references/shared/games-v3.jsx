// V3 — Poster / Bold Editorial
// Category: numbered typographic list, no icons
// Play: full-bleed colored poster with massive display serif

function V3Category({ mode, gameKey }) {
  const T = SHELL_TOKENS[mode];
  const meta = GAME_META[gameKey];
  const cats = GAME_CATEGORIES[gameKey];
  const heroTile = T.tiles[meta.iconKey];
  const isLight = mode === 'light';

  return (
    <div style={{ background: T.bg, color: T.ink, width: '100%', height: '100%', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 8px' }}>
        <button style={{ background: 'transparent', border: 'none', color: T.inkSoft, padding: 6, marginLeft: -6, display: 'flex', cursor: 'pointer' }}>
          <Icon name="close" size={22} strokeWidth={2} />
        </button>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.muted }}>
          Vol. {String(Object.keys(GAME_META).indexOf(gameKey) + 1).padStart(2, '0')}
        </div>
        <div style={{ width: 22 }} />
      </div>

      {/* Big masthead */}
      <div style={{ padding: '8px 22px 6px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.22em',
          color: heroTile.solid, textTransform: 'uppercase', marginBottom: 2,
        }}>The {meta.short} Issue</div>
        <h1 style={{
          margin: 0, fontFamily: "'Playfair Display', serif",
          fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 0.95,
          color: T.ink,
        }}>{meta.title}</h1>
        <p style={{ margin: '10px 0 14px', fontSize: 12.5, color: T.muted, lineHeight: 1.4, maxWidth: 280 }}>
          Six editions. Pick the register that fits your table tonight.
        </p>
      </div>

      {/* Numbered list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {cats.map((c, i) => {
          const tile = T.tiles[c.tileKey];
          const isAdult = c.tone === 'adult';
          const isCustom = c.tone === 'custom';
          return (
            <button key={c.id} style={{
              display: 'flex', alignItems: 'baseline', gap: 16,
              width: '100%', padding: '16px 22px',
              background: 'transparent',
              border: 'none', borderBottom: `1px solid ${T.border}`,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              color: T.ink,
            }}>
              <div style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 24, fontWeight: 700,
                color: isCustom ? heroTile.solid : T.muted,
                minWidth: 34,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
              }}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <h3 style={{
                    margin: 0,
                    fontFamily: "'Playfair Display', serif",
                    fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em',
                    color: T.ink, lineHeight: 1.05,
                  }}>{c.label}</h3>
                  {isCustom && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
                      color: heroTile.solid, background: heroTile.tint,
                      padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase',
                    }}>AI</span>
                  )}
                  {isAdult && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                      color: T.tiles.truth.solid, background: T.tiles.truth.tint,
                      padding: '2px 6px', borderRadius: 3,
                    }}>18+</span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: T.muted, lineHeight: 1.4 }}>{c.desc}</p>
              </div>
              <Icon name="arrow" size={16} strokeWidth={2} color={T.muted} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function V3Play({ mode, gameKey, categoryLabel = 'Scandalous', cardIndex = 1 }) {
  const T = SHELL_TOKENS[mode];
  const meta = GAME_META[gameKey];
  const sample = GAME_SAMPLE_CARDS[gameKey];
  const tile = T.tiles[meta.iconKey];
  const total = sample.prompts.length;
  const prompt = sample.prompts[cardIndex % sample.prompts.length];

  // Full-bleed color poster — contrast text is white
  const bg = tile.solid;
  const text = '#FFFFFF';
  const softText = 'rgba(255,255,255,0.78)';
  const softBorder = 'rgba(255,255,255,0.25)';

  return (
    <div style={{ background: bg, color: text, width: '100%', height: '100%', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* Subtle grain / vignette */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 80% 0%, rgba(255,255,255,0.18), transparent 45%), radial-gradient(circle at 10% 100%, rgba(0,0,0,0.22), transparent 55%)`,
        pointerEvents: 'none',
      }} />

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', position: 'relative', zIndex: 1 }}>
        <button style={{ background: 'rgba(255,255,255,0.14)', border: `1px solid ${softBorder}`, color: text, borderRadius: 10, padding: 7, display: 'flex', cursor: 'pointer', backdropFilter: 'blur(6px)' }}>
          <Icon name="back" size={18} strokeWidth={2.2} />
        </button>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: softText }}>
          {sample.headline} · {categoryLabel}
        </div>
        <button style={{ background: 'rgba(255,255,255,0.14)', border: `1px solid ${softBorder}`, color: text, borderRadius: 10, padding: 7, display: 'flex', cursor: 'pointer', backdropFilter: 'blur(6px)' }}>
          <Icon name="close" size={18} strokeWidth={2.2} />
        </button>
      </div>

      {/* Edition number big */}
      <div style={{ padding: '6px 22px 0', position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 10,
          fontFamily: "'Playfair Display', serif",
          letterSpacing: '-0.02em',
        }}>
          <span style={{ fontSize: 72, fontWeight: 700, lineHeight: 0.85, color: text }}>
            {String(cardIndex + 1).padStart(2, '0')}
          </span>
          <span style={{ fontSize: 20, fontWeight: 500, color: softText, fontStyle: 'italic' }}>
            / {total}
          </span>
        </div>
        <div style={{
          marginTop: 8, width: 40, height: 2, background: text, opacity: 0.85,
        }} />
      </div>

      {/* Prompt */}
      <div style={{ flex: 1, padding: '18px 22px 0', position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start' }}>
        <p style={{
          margin: 0, fontFamily: "'Playfair Display', serif",
          fontSize: 34, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.025em',
          color: text, textWrap: 'balance',
        }}>
          "{prompt}"
        </p>
      </div>

      {/* Footer */}
      <div style={{ padding: '18px 22px 14px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: softText, marginBottom: 14 }}>
          <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>{sample.verb}</span>
          <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 500 }}>PartySpark</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{
            flex: 1, padding: '14px 16px',
            background: 'rgba(255,255,255,0.14)', color: text,
            border: `1px solid ${softBorder}`, borderRadius: 14,
            fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
            backdropFilter: 'blur(6px)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>Skip</button>
          <button style={{
            flex: 2, padding: '14px 20px',
            background: text, color: bg,
            border: 'none', borderRadius: 14,
            fontWeight: 800, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            Next Card
            <Icon name="arrow" size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

window.V3Category = V3Category;
window.V3Play = V3Play;
