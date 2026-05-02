// Direction C — Sticker / Meme
// Maximum personality. Bebas Neue chunky type, sticker tile theme picker,
// verdict is a giant meme caption with skull rating.
// Globals: AZURE, ROAST_THEMES, MockPortrait, RoastIcons, GameHeader, SAMPLE_ROAST, SAMPLE_ROAST_SHORT

const C_TYPE = {
  display: "'Bebas Neue', 'Inter', sans-serif",
  body: "'Inter', system-ui, sans-serif",
};

// ─── IDLE ────────────────────────────────────────────────
function DirectionC_Idle() {
  const [selected, setSelected] = React.useState('animate');

  return (
    <div style={{ width: '100%', height: '100%', background: AZURE.bg, fontFamily: C_TYPE.body, display: 'flex', flexDirection: 'column' }}>
      <GameHeader />

      <div style={{ flex: 1, padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
        {/* Hero title */}
        <div style={{ position: 'relative' }}>
          <h1 style={{
            margin: 0, fontFamily: C_TYPE.display, fontWeight: 400,
            fontSize: 72, lineHeight: 0.85, letterSpacing: 1, color: AZURE.ink,
          }}>
            ROAST
            <br/>
            <span style={{
              color: AZURE.roastRed,
              WebkitTextStroke: `2px ${AZURE.ink}`,
              display: 'inline-block',
              transform: 'rotate(-2deg)',
            }}>
              ME!!
            </span>
          </h1>
          <div style={{
            position: 'absolute', top: 8, right: 0,
            background: AZURE.gold, color: AZURE.ink,
            padding: '6px 11px', borderRadius: 8,
            fontFamily: C_TYPE.display, fontSize: 13, letterSpacing: 1.2,
            border: `2px solid ${AZURE.ink}`, transform: 'rotate(6deg)',
            boxShadow: `3px 3px 0 ${AZURE.ink}`,
          }}>
            BRUTAL!
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: AZURE.inkSoft, fontWeight: 500 }}>
            Pick a sticker, drop a pic, get destroyed.
          </p>
        </div>

        {/* Sticker grid — 5 themes */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: AZURE.muted, textTransform: 'uppercase', marginBottom: 8 }}>
            ★ Pick your sticker
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {ROAST_THEMES.map((t, i) => {
              const active = t.key === selected;
              const rotations = [-2, 1.5, -1, 2, -1.5];
              return (
                <button
                  key={t.key}
                  onClick={() => setSelected(t.key)}
                  style={{
                    background: active ? t.color : AZURE.surface,
                    border: `2px solid ${AZURE.ink}`,
                    borderRadius: 12,
                    padding: '8px 6px 6px',
                    boxShadow: active ? `4px 4px 0 ${AZURE.ink}` : `2px 2px 0 ${AZURE.ink}`,
                    transform: active ? `rotate(${rotations[i]}deg) scale(1.02)` : `rotate(${rotations[i] * 0.4}deg)`,
                    transition: 'all 0.18s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                    aspectRatio: '1',
                    color: active ? '#FFFFFF' : AZURE.ink,
                  }}
                >
                  <span style={{ fontSize: 44, lineHeight: 1, filter: active ? 'drop-shadow(0 2px 0 rgba(0,0,0,0.25))' : 'none' }}>{t.emoji}</span>
                  <span style={{
                    fontFamily: C_TYPE.display, fontSize: 18, letterSpacing: 0.6, lineHeight: 1,
                  }}>
                    {t.label.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Hero upload — sticker style */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{
            background: AZURE.roastEmber,
            border: `2.5px solid ${AZURE.ink}`,
            borderRadius: 18,
            padding: '18px 18px 16px',
            boxShadow: `5px 5px 0 ${AZURE.ink}`,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* sparkle decorations */}
            <div style={{ position: 'absolute', top: 8, left: 12, transform: 'rotate(-15deg)' }}>
              <RoastIcons.Sparkle size={14} color="#FFFFFF" />
            </div>
            <div style={{ position: 'absolute', top: 18, right: 18, transform: 'rotate(20deg)' }}>
              <RoastIcons.Sparkle size={10} color="#FFFFFF" />
            </div>
            <div style={{ position: 'absolute', bottom: 12, right: 36 }}>
              <RoastIcons.Sparkle size={12} color="#FFFFFF" />
            </div>

            <div style={{
              fontFamily: C_TYPE.display, fontSize: 26, letterSpacing: 0.8,
              color: '#FFFFFF', lineHeight: 0.95, marginBottom: 2,
              textShadow: `2px 2px 0 ${AZURE.ink}`,
            }}>
              DROP YOUR FACE
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3A1A00', marginBottom: 12 }}>
              We'll do the worst.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{
                flex: 1, padding: '11px', borderRadius: 10,
                background: AZURE.ink, color: '#FFFFFF',
                fontSize: 12, fontWeight: 800, letterSpacing: 0.4,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                border: `2px solid ${AZURE.ink}`,
              }}>
                <RoastIcons.Photo size={14} color="#FFFFFF" />
                <span>UPLOAD</span>
              </button>
              <button style={{
                flex: 1, padding: '11px', borderRadius: 10,
                background: '#FFFFFF', color: AZURE.ink,
                fontSize: 12, fontWeight: 800, letterSpacing: 0.4,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                border: `2px solid ${AZURE.ink}`,
              }}>
                <RoastIcons.Camera size={14} />
                <span>CAMERA</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── COMPLETE ────────────────────────────────────────────
function DirectionC_Complete() {
  return (
    <div style={{ width: '100%', height: '100%', background: AZURE.bg, fontFamily: C_TYPE.body, display: 'flex', flexDirection: 'column' }}>
      <GameHeader />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px 16px 14px', gap: 12 }}>
        {/* Image with meme caption */}
        <div style={{
          position: 'relative',
          background: AZURE.ink,
          border: `2.5px solid ${AZURE.ink}`,
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: `4px 4px 0 ${AZURE.ink}`,
        }}>
          <div style={{ aspectRatio: '4/4.2', position: 'relative' }}>
            <MockPortrait variant="c" radius={0} />

            {/* Top "Animate" sticker */}
            <div style={{
              position: 'absolute', top: 10, left: 10,
              background: '#FFFFFF', color: AZURE.ink,
              padding: '4px 10px', borderRadius: 6,
              fontFamily: C_TYPE.display, fontSize: 12, letterSpacing: 1,
              border: `2px solid ${AZURE.ink}`,
              transform: 'rotate(-3deg)',
              boxShadow: `2px 2px 0 ${AZURE.ink}`,
            }}>
              ★ ANIMATE
            </div>

            {/* Skull rating */}
            <div style={{
              position: 'absolute', top: 10, right: 10,
              background: AZURE.roastRed, color: '#FFFFFF',
              padding: '4px 8px', borderRadius: 6,
              border: `2px solid ${AZURE.ink}`,
              transform: 'rotate(3deg)',
              boxShadow: `2px 2px 0 ${AZURE.ink}`,
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              {[1,2,3,4,5].map(i => <RoastIcons.Skull key={i} size={11} color="#FFFFFF" />)}
            </div>

            {/* MEME CAPTION — bottom — the punchline */}
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              padding: '60px 14px 14px',
              background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.0) 30%, rgba(0,0,0,0.92) 100%)',
            }}>
              <div style={{
                fontFamily: C_TYPE.display, fontWeight: 400,
                fontSize: 30, lineHeight: 0.95, letterSpacing: 0.4,
                color: '#FFFFFF',
                textShadow: `2.5px 2.5px 0 ${AZURE.ink}, -1px -1px 0 ${AZURE.ink}`,
                textAlign: 'center',
                textTransform: 'uppercase',
                textWrap: 'balance',
              }}>
                {SAMPLE_ROAST_SHORT}
              </div>
            </div>
          </div>
        </div>

        {/* Action row — chunky sticker buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{
            flex: 1, padding: '11px', borderRadius: 10,
            background: AZURE.surface, color: AZURE.ink,
            border: `2px solid ${AZURE.ink}`, boxShadow: `3px 3px 0 ${AZURE.ink}`,
            fontFamily: C_TYPE.display, fontSize: 14, letterSpacing: 0.6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <RoastIcons.Save size={14} />
            <span>SAVE</span>
          </button>
          <button style={{
            flex: 1, padding: '11px', borderRadius: 10,
            background: AZURE.ink, color: '#FFFFFF',
            border: `2px solid ${AZURE.ink}`, boxShadow: `3px 3px 0 ${AZURE.roastEmber}`,
            fontFamily: C_TYPE.display, fontSize: 14, letterSpacing: 0.6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <RoastIcons.Share size={14} color="#FFFFFF" />
            <span>SHARE</span>
          </button>
          <button style={{
            flex: 1, padding: '11px', borderRadius: 10,
            background: AZURE.roastRed, color: '#FFFFFF',
            border: `2px solid ${AZURE.ink}`, boxShadow: `3px 3px 0 ${AZURE.ink}`,
            fontFamily: C_TYPE.display, fontSize: 14, letterSpacing: 0.6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <RoastIcons.Refresh size={14} color="#FFFFFF" />
            <span>REDO</span>
          </button>
        </div>

        {/* Refine — sticker chips */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: AZURE.muted, textTransform: 'uppercase', marginBottom: 6 }}>
            ✦ Make it more…
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[
              { label: 'ZOMBIE', active: true },
              { label: 'ANIME' },
              { label: '80s' },
              { label: 'NOIR' },
              { label: '+ CUSTOM' },
            ].map((c, i) => {
              const rot = [-1.5, 1, -0.5, 1.5, 0][i];
              return (
                <span key={c.label} style={{
                  fontFamily: C_TYPE.display, fontSize: 13, letterSpacing: 0.6,
                  padding: '6px 12px', borderRadius: 999,
                  background: c.active ? AZURE.gold : AZURE.surface,
                  color: AZURE.ink,
                  border: `2px solid ${AZURE.ink}`,
                  boxShadow: `2px 2px 0 ${AZURE.ink}`,
                  transform: `rotate(${rot}deg)`,
                }}>{c.label}</span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

window.DirectionC_Idle = DirectionC_Idle;
window.DirectionC_Complete = DirectionC_Complete;
