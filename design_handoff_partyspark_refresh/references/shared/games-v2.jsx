// V2 — Tactile Deck
// Category: 2-column grid of bold colored tiles
// Play: stacked physical card-deck metaphor

function V2Category({ mode, gameKey }) {
  const T = SHELL_TOKENS[mode];
  const meta = GAME_META[gameKey];
  const cats = GAME_CATEGORIES[gameKey];
  const isLight = mode === 'light';
  const heroTile = T.tiles[meta.iconKey];

  return (
    <div style={{ background: T.bg, color: T.ink, width: '100%', height: '100%', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px' }}>
        <button style={{ background: 'transparent', border: 'none', color: T.inkSoft, padding: 6, marginLeft: -6, display: 'flex', cursor: 'pointer' }}>
          <Icon name="back" size={22} strokeWidth={2.2} />
        </button>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: T.muted,
        }}>
          Step 1 of 2 — Pick a pack
        </div>
        <div style={{ width: 22 }} />
      </div>

      <div style={{ padding: '12px 20px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 54, height: 54, borderRadius: 14,
          background: heroTile.solid,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#FFFFFF',
          boxShadow: isLight ? `0 6px 16px ${heroTile.solid}40` : 'none',
        }}>
          <Icon name={meta.icon} size={26} strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: T.ink }}>
            {meta.title}
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: T.muted }}>
            Each pack = 52 cards. Tap to load.
          </p>
        </div>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', padding: '0 14px 18px',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignContent: 'start',
      }}>
        {cats.map((c, i) => {
          const tile = T.tiles[c.tileKey];
          const isCustom = c.tone === 'custom';
          const isAdult = c.tone === 'adult';
          // Wide custom tile takes 2 cols
          const span = isCustom ? 'span 2' : 'span 1';
          return (
            <button key={c.id} style={{
              gridColumn: span,
              background: tile.solid,
              border: 'none',
              borderRadius: 18,
              padding: isCustom ? '18px 18px' : '16px 14px 14px',
              minHeight: isCustom ? 96 : 138,
              color: '#FFFFFF',
              textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              position: 'relative', overflow: 'hidden',
              display: 'flex', flexDirection: isCustom ? 'row' : 'column',
              alignItems: isCustom ? 'center' : 'stretch',
              gap: isCustom ? 14 : 8,
              boxShadow: isLight
                ? `0 2px 6px ${tile.solid}30, 0 10px 24px ${tile.solid}20`
                : '0 2px 12px rgba(0,0,0,0.3)',
            }}>
              {/* Decorative number ghost */}
              <div aria-hidden style={{
                position: 'absolute',
                right: isCustom ? 14 : -18, bottom: isCustom ? -24 : -34,
                fontFamily: "'Playfair Display', serif",
                fontSize: isCustom ? 110 : 130,
                fontWeight: 700,
                color: '#FFFFFF',
                opacity: 0.12,
                lineHeight: 1,
                pointerEvents: 'none',
              }}>
                {String(i + 1).padStart(2, '0')}
              </div>

              <div style={{
                width: isCustom ? 46 : 36, height: isCustom ? 46 : 36,
                borderRadius: isCustom ? 12 : 10,
                background: 'rgba(255,255,255,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#FFFFFF',
                backdropFilter: 'blur(4px)',
                position: 'relative', zIndex: 1,
                flexShrink: 0,
              }}>
                {isCustom ? <Icon name="sparkle" size={isCustom ? 22 : 18} strokeWidth={2} /> :
                 isAdult ? <Icon name="flame" size={18} strokeWidth={2} /> :
                 <Icon name="spark" size={18} strokeWidth={2} />}
              </div>

              <div style={{ flex: isCustom ? 1 : 'none', position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: isCustom ? 17 : 15,
                    fontWeight: 800, letterSpacing: '-0.01em',
                    color: '#FFFFFF',
                  }}>{c.label}</h3>
                  {isAdult && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                      color: '#FFFFFF', background: 'rgba(0,0,0,0.22)',
                      padding: '2px 6px', borderRadius: 4,
                    }}>18+</span>
                  )}
                </div>
                <p style={{
                  margin: 0,
                  fontSize: isCustom ? 12.5 : 11.5,
                  color: 'rgba(255,255,255,0.85)',
                  lineHeight: 1.35,
                  maxWidth: isCustom ? 200 : undefined,
                }}>{c.desc}</p>
              </div>

              {!isCustom && (
                <div style={{
                  marginTop: 'auto', position: 'relative', zIndex: 1,
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                  color: 'rgba(255,255,255,0.75)',
                  textTransform: 'uppercase',
                }}>52 cards · Pack {String(i + 1).padStart(2, '0')}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function V2Play({ mode, gameKey, categoryLabel = 'Scandalous', cardIndex = 1 }) {
  const T = SHELL_TOKENS[mode];
  const meta = GAME_META[gameKey];
  const sample = GAME_SAMPLE_CARDS[gameKey];
  const tile = T.tiles[meta.iconKey];
  const total = sample.prompts.length;
  const prompt = sample.prompts[cardIndex % sample.prompts.length];
  const isLight = mode === 'light';

  // Offset card positions (behind cards in the deck)
  const deckCards = [
    { offX: -10, offY: 16, rot: -4, op: 0.35, scale: 0.92 },
    { offX: 8,   offY: 10, rot: 3,  op: 0.55, scale: 0.96 },
  ];

  return (
    <div style={{ background: T.bg, color: T.ink, width: '100%', height: '100%', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 10px' }}>
        <button style={{ background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 10, padding: 7, color: T.inkSoft, display: 'flex', cursor: 'pointer' }}>
          <Icon name="back" size={18} strokeWidth={2.2} />
        </button>
        <div style={{
          background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 999,
          padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: tile.solid }} />
          <span style={{ fontSize: 11.5, fontWeight: 700, color: T.ink }}>{categoryLabel}</span>
          <span style={{ fontSize: 11, color: T.muted }}>·</span>
          <span style={{ fontSize: 11, color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
            {cardIndex + 1} / {total}
          </span>
        </div>
        <button style={{ background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 10, padding: 7, color: T.inkSoft, display: 'flex', cursor: 'pointer' }}>
          <Icon name="close" size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 22px 14px', position: 'relative' }}>
        {/* Back deck cards */}
        {deckCards.map((c, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: `translate(calc(-50% + ${c.offX}px), calc(-50% + ${c.offY}px)) rotate(${c.rot}deg) scale(${c.scale})`,
            width: 'calc(100% - 44px)', maxWidth: 320,
            aspectRatio: '3 / 4',
            maxHeight: 440,
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 22,
            opacity: c.op,
            boxShadow: isLight ? '0 8px 24px rgba(20,50,90,0.06)' : '0 8px 30px rgba(0,0,0,0.3)',
          }} />
        ))}

        {/* Front card */}
        <div style={{
          position: 'relative', zIndex: 2,
          width: 'calc(100% - 44px)', maxWidth: 320,
          aspectRatio: '3 / 4', maxHeight: 440,
          background: tile.solid,
          color: '#FFFFFF',
          borderRadius: 22,
          padding: '24px 22px',
          display: 'flex', flexDirection: 'column',
          boxShadow: isLight
            ? `0 4px 14px ${tile.solid}45, 0 22px 44px ${tile.solid}30`
            : `0 10px 40px rgba(0,0,0,0.55), 0 0 0 1px ${tile.solid}`,
          overflow: 'hidden',
        }}>
          {/* Big number watermark */}
          <div aria-hidden style={{
            position: 'absolute', right: -14, bottom: -30,
            fontFamily: "'Playfair Display', serif",
            fontSize: 180, fontWeight: 700, lineHeight: 1,
            color: '#FFFFFF', opacity: 0.13, pointerEvents: 'none',
          }}>
            {String(cardIndex + 1).padStart(2, '0')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.85)',
            }}>{sample.headline}</div>
            <div style={{
              background: 'rgba(255,255,255,0.22)',
              padding: '3px 8px', borderRadius: 999,
              fontSize: 10, fontWeight: 700, color: '#FFFFFF',
              backdropFilter: 'blur(4px)',
            }}>#{String(cardIndex + 1).padStart(2, '0')}</div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative', zIndex: 1 }}>
            <p style={{
              margin: 0, fontFamily: "'Playfair Display', serif",
              fontSize: 24, fontWeight: 600, lineHeight: 1.18,
              color: '#FFFFFF', letterSpacing: '-0.015em', textWrap: 'pretty',
            }}>{prompt}</p>
          </div>
          <div style={{
            position: 'relative', zIndex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 11, color: 'rgba(255,255,255,0.8)',
          }}>
            <span>{sample.verb}</span>
            <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic' }}>PartySpark</span>
          </div>
        </div>
      </div>

      {/* Swipe hint */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 20px 10px', gap: 20, fontSize: 11, color: T.muted }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 13 }}>←</span> Skip
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          Tap to flip
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          Next <span style={{ fontSize: 13 }}>→</span>
        </span>
      </div>

      <div style={{ padding: '0 18px 22px', display: 'flex', gap: 10 }}>
        <button style={{
          width: 54, height: 54, borderRadius: 16,
          background: T.surfaceAlt, color: T.inkSoft,
          border: `1px solid ${T.border}`, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="back" size={20} strokeWidth={2.2} /></button>
        <button style={{
          flex: 1, padding: '14px 20px',
          background: tile.solid, color: '#FFFFFF',
          border: 'none', borderRadius: 16,
          fontWeight: 800, fontSize: 14, letterSpacing: '0.02em',
          fontFamily: 'inherit', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          Draw next card
          <Icon name="arrow" size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

window.V2Category = V2Category;
window.V2Play = V2Play;
