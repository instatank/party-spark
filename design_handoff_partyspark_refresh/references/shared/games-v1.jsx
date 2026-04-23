// V1 — Editorial List
// Category: horizontal list cards with accent bar and icon chip
// Play: portrait card centered, serif prompt, bottom CTA

function V1Category({ mode, gameKey }) {
  const T = SHELL_TOKENS[mode];
  const meta = GAME_META[gameKey];
  const cats = GAME_CATEGORIES[gameKey];
  const isLight = mode === 'light';

  return (
    <div style={{ background: T.bg, color: T.ink, width: '100%', height: '100%', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px' }}>
        <button style={{ background: 'transparent', border: 'none', color: T.inkSoft, padding: 6, marginLeft: -6, cursor: 'pointer', display: 'flex' }}>
          <Icon name="back" size={22} strokeWidth={2.2} />
        </button>
        <button style={{ background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 10, padding: 7, color: T.inkSoft, cursor: 'pointer', display: 'flex' }}>
          <Icon name="home" size={18} strokeWidth={2} />
        </button>
      </div>
      <div style={{ padding: '4px 20px 16px' }}>
        <h1 style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, letterSpacing: '-0.015em', color: T.ink }}>
          {meta.title}
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
          Pick a category to begin. Swap anytime.
        </p>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {cats.map((c) => {
          const tile = T.tiles[c.tileKey];
          const isCustom = c.tone === 'custom';
          const isAdult = c.tone === 'adult';
          return (
            <button key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 14px',
              background: isCustom ? (isLight ? T.surface : `linear-gradient(135deg, ${tile.tint} 0%, ${T.surface} 100%)`) : T.surface,
              border: isCustom ? `1.5px solid ${tile.solid}60` : `1px solid ${T.border}`,
              borderRadius: 14,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%',
              boxShadow: isLight ? '0 1px 2px rgba(17,17,17,0.04)' : 'none',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', left: 0, top: 12, bottom: 12,
                width: 3, background: tile.solid, borderRadius: 2,
              }} />
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: isLight ? tile.tint : tile.tint,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: tile.solid, flexShrink: 0, marginLeft: 6,
              }}>
                {isCustom ? <Icon name="wand" size={22} strokeWidth={2} /> :
                 isAdult ? <Icon name="flame" size={22} strokeWidth={2} /> :
                 <Icon name={GAME_META[gameKey].icon} size={22} strokeWidth={2} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: T.ink, letterSpacing: '-0.005em' }}>
                    {c.label}
                  </h3>
                  {isAdult && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                      color: T.tiles.truth.solid, background: T.tiles.truth.tint,
                      padding: '2px 6px', borderRadius: 4,
                    }}>18+</span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: T.muted, lineHeight: 1.35 }}>{c.desc}</p>
              </div>
              <Icon name="chevron" size={18} color={T.muted} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function V1Play({ mode, gameKey, categoryLabel = 'Scandalous', cardIndex = 1 }) {
  const T = SHELL_TOKENS[mode];
  const meta = GAME_META[gameKey];
  const sample = GAME_SAMPLE_CARDS[gameKey];
  const tile = T.tiles[meta.iconKey];
  const total = sample.prompts.length;
  const prompt = sample.prompts[cardIndex % sample.prompts.length];
  const isLight = mode === 'light';

  return (
    <div style={{ background: T.bg, color: T.ink, width: '100%', height: '100%', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 10px' }}>
        <button style={{ background: 'transparent', border: 'none', color: T.inkSoft, padding: 6, marginLeft: -6, display: 'flex' }}>
          <Icon name="back" size={22} strokeWidth={2.2} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: T.muted, textTransform: 'uppercase' }}>
            {meta.title}
          </div>
          <div style={{ fontSize: 11.5, color: tile.solid, fontWeight: 600 }}>{categoryLabel}</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, minWidth: 44, textAlign: 'right' }}>
          {cardIndex + 1}<span style={{ color: T.muted, fontWeight: 500 }}>/{total}</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, padding: '4px 20px 14px' }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            height: 3, flex: 1, maxWidth: 32, borderRadius: 2,
            background: i <= cardIndex ? tile.solid : T.border,
          }} />
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 18px 18px' }}>
        <div style={{
          width: '100%', aspectRatio: '3 / 4', maxHeight: 460,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 22, padding: '26px 24px',
          display: 'flex', flexDirection: 'column',
          boxShadow: isLight
            ? '0 2px 8px rgba(20,50,90,0.08), 0 16px 36px rgba(20,50,90,0.05)'
            : '0 10px 40px rgba(0,0,0,0.5)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -60, right: -60,
            width: 160, height: 160, borderRadius: '50%',
            background: tile.tint, opacity: isLight ? 0.8 : 1,
          }} />
          <div style={{
            alignSelf: 'flex-start',
            background: tile.tint, color: tile.solid,
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            padding: '5px 10px', borderRadius: 6, position: 'relative', zIndex: 1,
          }}>
            {sample.headline}
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative', zIndex: 1 }}>
            <p style={{
              margin: 0, fontFamily: "'Playfair Display', serif",
              fontSize: 24, fontWeight: 600, lineHeight: 1.2, color: T.ink,
              letterSpacing: '-0.015em', textWrap: 'pretty',
            }}>{prompt}</p>
          </div>
          <div style={{
            fontSize: 11, color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'relative', zIndex: 1,
          }}>
            <span>{sample.verb}</span>
            <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 12, color: tile.solid }}>
              PartySpark
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 18px 22px', display: 'flex', gap: 10 }}>
        <button style={{
          flex: 1, padding: '14px 20px',
          background: T.surfaceAlt, color: T.inkSoft,
          border: `1px solid ${T.border}`, borderRadius: 14,
          fontWeight: 600, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
        }}>Skip</button>
        <button style={{
          flex: 2, padding: '14px 20px',
          background: T.ink, color: T.bg,
          border: 'none', borderRadius: 14,
          fontWeight: 700, fontSize: 14, letterSpacing: '0.02em', fontFamily: 'inherit', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          Reveal & Next
          <Icon name="arrow" size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

window.V1Category = V1Category;
window.V1Play = V1Play;
