// Direction D — DARK MODE V2 (Sleeker)
// Differences from V1:
// - Chrome (action buttons, refine card, sheet) drops the heavy white outlines + offset shadows.
//   Uses subtle 1px borders in T.border + soft glows instead. Feels like a real dark-mode app.
// - Sticker treatment is reserved for HERO elements only: theme tiles, polaroid, BRUTAL tag, hero title.
//   These keep the bold outlines/offsets — they read as deliberate sticker accents on a sleek base.
// - Overall: 80% sleek dark UI + 20% sticker punctuation = best of both.

const AZURE_DARK_V2 = {
  bg: '#0F1A2E',
  bgTint: '#162338',
  surface: '#1C2A42',
  surfaceAlt: '#243352',
  ink: '#F4F6FB',
  inkSoft: '#C8D2E4',
  muted: '#7A8BA3',
  border: '#3A4A66',
  borderSoft: '#2A3854',
  accent: '#5BA0E8',
  accentSoft: '#1F3A5C',
  gold: '#E5B547',
  goldSoft: '#3A2E10',
  roastRed: '#FF5252',
  roastEmber: '#FF9F43',
};

const D_DARK2_TYPE = {
  display: "'Bebas Neue', 'Inter', sans-serif",
  body: "'Inter', system-ui, sans-serif",
};

function GameHeaderDarkV2() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '60px 18px 14px',
      borderBottom: `1px solid ${AZURE_DARK_V2.borderSoft}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <RoastIcons.Flame size={18} color={AZURE_DARK_V2.roastRed} />
        <span style={{ fontSize: 15, fontWeight: 700, color: AZURE_DARK_V2.ink, letterSpacing: -0.2 }}>Roast Me</span>
      </div>
      <button style={{
        width: 30, height: 30, borderRadius: 999,
        background: AZURE_DARK_V2.surface,
        border: `1px solid ${AZURE_DARK_V2.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: AZURE_DARK_V2.muted,
      }}>
        <RoastIcons.Close size={14} color={AZURE_DARK_V2.muted} />
      </button>
    </div>
  );
}

// ─── DARK V2 IDLE ────────────────────────────────────────
function DirectionD_DarkV2_Idle() {
  const [selected, setSelected] = React.useState('animate');
  const T = AZURE_DARK_V2;

  return (
    <div style={{ width: '100%', height: '100%', background: T.bg, fontFamily: D_DARK2_TYPE.body, display: 'flex', flexDirection: 'column' }}>
      <GameHeaderDarkV2 />

      <div style={{ flex: 1, padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
        {/* Hero title — keeps the sticker drama */}
        <div style={{ position: 'relative' }}>
          <h1 style={{
            margin: 0, fontFamily: D_DARK2_TYPE.display, fontWeight: 400,
            fontSize: 72, lineHeight: 0.85, letterSpacing: 1, color: T.ink,
          }}>
            ROAST
            <br/>
            <span style={{
              color: T.roastRed,
              WebkitTextStroke: `2px ${T.ink}`,
              display: 'inline-block',
              transform: 'rotate(-2deg)',
            }}>
              ME!!
            </span>
          </h1>
          <div style={{
            position: 'absolute', top: 8, right: 0,
            background: T.gold, color: '#1A1300',
            padding: '6px 11px', borderRadius: 8,
            fontFamily: D_DARK2_TYPE.display, fontSize: 13, letterSpacing: 1.2,
            border: `2px solid ${T.ink}`, transform: 'rotate(6deg)',
            boxShadow: `3px 3px 0 ${T.ink}`,
          }}>
            BRUTAL!
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: T.inkSoft, fontWeight: 500 }}>
            Pick a sticker, drop a pic, get destroyed.
          </p>
        </div>

        {/* Sticker grid — keeps sticker treatment, but tiles use bigger emoji + bigger label */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: T.muted, textTransform: 'uppercase', marginBottom: 8 }}>
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
                    background: active ? t.color : T.surface,
                    border: `2px solid ${T.ink}`,
                    borderRadius: 12,
                    padding: '8px 6px 6px',
                    boxShadow: active ? `4px 4px 0 ${T.ink}` : `2px 2px 0 ${T.ink}`,
                    transform: active ? `rotate(${rotations[i]}deg) scale(1.02)` : `rotate(${rotations[i] * 0.4}deg)`,
                    transition: 'all 0.18s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                    aspectRatio: '1',
                    color: active ? '#FFFFFF' : T.ink,
                  }}
                >
                  <span style={{ fontSize: 44, lineHeight: 1 }}>{t.emoji}</span>
                  <span style={{
                    fontFamily: D_DARK2_TYPE.display, fontSize: 18, letterSpacing: 0.6, lineHeight: 1,
                  }}>
                    {t.label.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Hero upload — sticker keeps drama (it's the hero CTA) */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{
            background: T.roastEmber,
            border: `2.5px solid ${T.ink}`,
            borderRadius: 18,
            padding: '18px 18px 16px',
            boxShadow: `5px 5px 0 ${T.ink}`,
            position: 'relative',
            overflow: 'hidden',
          }}>
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
              fontFamily: D_DARK2_TYPE.display, fontSize: 26, letterSpacing: 0.8,
              color: '#FFFFFF', lineHeight: 0.95, marginBottom: 2,
              textShadow: `2px 2px 0 #1A0F00`,
            }}>
              DROP YOUR FACE
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3A1A00', marginBottom: 12 }}>
              We'll do the worst.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{
                flex: 1, padding: '11px', borderRadius: 10,
                background: '#0F1A2E', color: '#FFFFFF',
                fontSize: 12, fontWeight: 800, letterSpacing: 0.4,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                border: `2px solid ${T.ink}`,
              }}>
                <RoastIcons.Photo size={14} color="#FFFFFF" />
                <span>UPLOAD</span>
              </button>
              <button style={{
                flex: 1, padding: '11px', borderRadius: 10,
                background: '#FFFFFF', color: '#0F1A2E',
                fontSize: 12, fontWeight: 800, letterSpacing: 0.4,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                border: `2px solid ${T.ink}`,
              }}>
                <RoastIcons.Camera size={14} color="#0F1A2E" />
                <span>CAMERA</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DARK V2 COMPLETE ────────────────────────────────────
function DirectionD_DarkV2_Complete({ roastText, expanded = false, long = false }) {
  const T = AZURE_DARK_V2;
  const clamped = long
    ? (roastText.length > 80 ? roastText.slice(0, 78).trim() + '…' : roastText)
    : roastText;

  return (
    <div style={{ width: '100%', height: '100%', background: T.bg, fontFamily: D_DARK2_TYPE.body, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <GameHeaderDarkV2 />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '14px 16px 14px', gap: 12 }}>
        {/* Polaroid — KEEPS sticker treatment (it's the hero) */}
        <div style={{
          background: '#F4EFE5',
          border: `2.5px solid ${T.ink}`,
          borderRadius: 10,
          padding: '10px 10px 0',
          boxShadow: `5px 5px 0 ${T.ink}`,
          transform: 'rotate(-1.4deg)',
          margin: '0 6px',
        }}>
          <div style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', aspectRatio: '4/4.2' }}>
            <MockPortrait variant="c" radius={0} />

            <div style={{
              position: 'absolute', top: 10, left: 10,
              background: '#FFFFFF', color: '#0F1A2E',
              padding: '4px 9px', borderRadius: 6,
              fontFamily: D_DARK2_TYPE.display, fontSize: 12, letterSpacing: 1,
              border: `2px solid #0F1A2E`,
              transform: 'rotate(-3deg)',
              boxShadow: `2px 2px 0 #0F1A2E`,
            }}>
              ★ ANIMATE
            </div>

            <div style={{
              position: 'absolute', top: 10, right: 10,
              background: T.roastRed, color: '#FFFFFF',
              padding: '4px 7px', borderRadius: 6,
              border: `2px solid #0F1A2E`,
              transform: 'rotate(3deg)',
              boxShadow: `2px 2px 0 #0F1A2E`,
              display: 'flex', alignItems: 'center', gap: 2,
            }}>
              {[1,2,3,4,5].map(i => <RoastIcons.Skull key={i} size={10} color="#FFFFFF" />)}
            </div>

            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              padding: '50px 12px 12px',
              background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.0) 25%, rgba(0,0,0,0.92) 95%)',
            }}>
              <div style={{
                fontFamily: D_DARK2_TYPE.display, fontWeight: 400,
                fontSize: 22, lineHeight: 0.98, letterSpacing: 0.3,
                color: '#FFFFFF',
                textShadow: `2px 2px 0 #000, -1px -1px 0 #000`,
                textAlign: 'center',
                textTransform: 'uppercase',
                textWrap: 'balance',
              }}>
                {clamped}
              </div>
              {long && (
                <button style={{
                  display: 'block', margin: '8px auto 0',
                  background: T.roastEmber, color: '#1A0F00',
                  padding: '5px 11px', borderRadius: 999,
                  border: `2px solid #0F1A2E`,
                  fontFamily: D_DARK2_TYPE.display, fontSize: 12, letterSpacing: 0.6,
                  boxShadow: `2px 2px 0 #0F1A2E`,
                }}>
                  ▾ READ FULL ROAST
                </button>
              )}
            </div>
          </div>

          <div style={{
            padding: '10px 4px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontFamily: 'Brush Script MT, cursive', fontStyle: 'italic', fontSize: 14, color: '#1F1F1F' }}>
              — roasted, april '26
            </div>
            <div style={{ fontFamily: D_DARK2_TYPE.display, fontSize: 11, letterSpacing: 1, color: '#3A3A3A' }}>
              GEMINI 3 PRO
            </div>
          </div>
        </div>

        {/* Action row — SLEEK: subtle 1px borders, no offset shadows */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{
            flex: 1, padding: '12px', borderRadius: 12,
            background: T.surface, color: T.ink,
            border: `1px solid ${T.border}`,
            fontFamily: D_DARK2_TYPE.display, fontSize: 14, letterSpacing: 0.6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <RoastIcons.Save size={14} color={T.ink} />
            <span>SAVE</span>
          </button>
          <button style={{
            flex: 1, padding: '12px', borderRadius: 12,
            background: T.roastEmber, color: '#1A0F00',
            border: `1px solid ${T.roastEmber}`,
            boxShadow: `0 0 20px rgba(255,159,67,0.25)`,
            fontFamily: D_DARK2_TYPE.display, fontSize: 14, letterSpacing: 0.6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <RoastIcons.Share size={14} color="#1A0F00" />
            <span>SHARE</span>
          </button>
          <button style={{
            flex: 1, padding: '12px', borderRadius: 12,
            background: 'transparent', color: T.roastRed,
            border: `1px solid ${T.roastRed}`,
            fontFamily: D_DARK2_TYPE.display, fontSize: 14, letterSpacing: 0.6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <RoastIcons.Refresh size={14} color={T.roastRed} />
            <span>REDO</span>
          </button>
        </div>

        {/* Refine card — SLEEK: subtle border, no offset shadow */}
        <div style={{
          background: T.surface, borderRadius: 14,
          border: `1px solid ${T.border}`,
          padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RoastIcons.Wand size={14} color={T.roastRed} />
              <span style={{ fontFamily: D_DARK2_TYPE.display, fontSize: 14, letterSpacing: 0.8, color: T.ink }}>
                REFINE THE VERDICT
              </span>
            </div>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>or pick a chip</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {[
              { label: 'ZOMBIE', active: true },
              { label: 'ANIME' },
              { label: '80s' },
              { label: 'NOIR' },
              { label: 'RENAISSANCE' },
            ].map((c) => (
              <span key={c.label} style={{
                fontFamily: D_DARK2_TYPE.display, fontSize: 12, letterSpacing: 0.6,
                padding: '6px 11px', borderRadius: 999,
                background: c.active ? T.gold : T.surfaceAlt,
                color: c.active ? '#1A1300' : T.inkSoft,
                border: c.active ? `1px solid ${T.gold}` : `1px solid ${T.border}`,
              }}>{c.label}</span>
            ))}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 10px', borderRadius: 10,
            background: T.bg,
            border: `1px solid ${T.border}`,
          }}>
            <input
              placeholder="Custom: make it a 1920s gangster…"
              style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 12, color: T.ink, fontWeight: 500 }}
            />
            <button style={{
              padding: '6px 12px', borderRadius: 8,
              background: T.roastRed, color: '#FFFFFF',
              fontFamily: D_DARK2_TYPE.display, fontSize: 12, letterSpacing: 1,
              border: 'none',
            }}>GO</button>
          </div>
        </div>
      </div>

      {/* Expanded sheet — SLEEK: subtle borders, no offset shadow */}
      {expanded && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'flex-end',
          backdropFilter: 'blur(6px)',
          zIndex: 100,
        }}>
          <div style={{
            width: '100%',
            background: T.surface,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            border: `1px solid ${T.border}`,
            borderBottom: 'none',
            padding: '12px 20px 28px',
            maxHeight: '78%',
            display: 'flex', flexDirection: 'column',
            boxShadow: `0 -16px 40px rgba(0,0,0,0.6)`,
          }}>
            <div style={{
              width: 44, height: 5, borderRadius: 999,
              background: T.border, margin: '0 auto 14px',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RoastIcons.Skull size={16} color={T.roastRed} />
                <span style={{ fontFamily: D_DARK2_TYPE.display, fontSize: 18, letterSpacing: 1, color: T.ink }}>
                  THE FULL VERDICT
                </span>
              </div>
              <button style={{
                width: 28, height: 28, borderRadius: 999,
                background: T.bg,
                border: `1px solid ${T.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <RoastIcons.Close size={14} color={T.muted} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
              <span style={{
                fontFamily: D_DARK2_TYPE.display, fontSize: 11, letterSpacing: 0.8,
                padding: '4px 9px', borderRadius: 6,
                background: T.goldSoft, color: T.gold,
                border: `1px solid ${T.gold}`,
              }}>ANIMATE</span>
              <span style={{
                padding: '4px 8px', borderRadius: 6,
                background: 'rgba(255,82,82,0.12)',
                border: `1px solid ${T.roastRed}`,
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                {[1,2,3,4,5].map(i => <RoastIcons.Skull key={i} size={9} color={T.roastRed} />)}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{
                fontFamily: D_DARK2_TYPE.display, fontSize: 11, letterSpacing: 0.8,
                color: T.muted,
              }}>GEMINI 3 PRO</span>
            </div>

            <div style={{
              flex: 1, overflowY: 'auto',
              fontSize: 17, lineHeight: 1.42, color: T.ink,
              fontWeight: 500, textWrap: 'pretty',
              padding: '4px 0 12px',
            }}>
              <span style={{ fontFamily: D_DARK2_TYPE.display, fontSize: 38, lineHeight: 0, color: T.roastRed, verticalAlign: '-12px', marginRight: 4 }}>"</span>
              {roastText}
              <span style={{ fontFamily: D_DARK2_TYPE.display, fontSize: 38, lineHeight: 0, color: T.roastRed, verticalAlign: '-12px', marginLeft: 2 }}>"</span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={{
                flex: 1, padding: '12px', borderRadius: 12,
                background: T.roastEmber, color: '#1A0F00',
                border: `1px solid ${T.roastEmber}`,
                boxShadow: `0 0 24px rgba(255,159,67,0.3)`,
                fontFamily: D_DARK2_TYPE.display, fontSize: 14, letterSpacing: 0.6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <RoastIcons.Share size={14} color="#1A0F00" />
                <span>SHARE QUOTE</span>
              </button>
              <button style={{
                flex: 1, padding: '12px', borderRadius: 12,
                background: T.surfaceAlt, color: T.ink,
                border: `1px solid ${T.border}`,
                fontFamily: D_DARK2_TYPE.display, fontSize: 14, letterSpacing: 0.6,
              }}>
                COPY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DirectionD_DarkV2_Complete_Short() { return <DirectionD_DarkV2_Complete roastText={SAMPLE_ROAST_SHORT} />; }
function DirectionD_DarkV2_Complete_Long() { return <DirectionD_DarkV2_Complete roastText={SAMPLE_ROAST} long />; }
function DirectionD_DarkV2_Complete_Expanded() { return <DirectionD_DarkV2_Complete roastText={SAMPLE_ROAST} long expanded />; }

window.DirectionD_DarkV2_Idle = DirectionD_DarkV2_Idle;
window.DirectionD_DarkV2_Complete_Short = DirectionD_DarkV2_Complete_Short;
window.DirectionD_DarkV2_Complete_Long = DirectionD_DarkV2_Complete_Long;
window.DirectionD_DarkV2_Complete_Expanded = DirectionD_DarkV2_Complete_Expanded;
