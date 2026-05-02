// Direction D — LIGHT MODE V2 (Sleeker, matches Dark V2)
// Same hero stickers (theme tiles, polaroid, BRUTAL tag, hero title) — but
// chrome (action buttons, refine card, sheet) drops the heavy ink outlines + offset shadows
// for subtle 1px borders + soft accent glows. Mirrors Dark V2 conceptually.

const D_LIGHT2_TYPE = {
  display: "'Bebas Neue', 'Inter', sans-serif",
  body: "'Inter', system-ui, sans-serif",
};

// ─── LIGHT V2 IDLE ───────────────────────────────────────
function DirectionD_LightV2_Idle() {
  // IDLE keeps sticker hero treatment — tiles, hero title, upload card
  // are the personality moments. Just reuse C's IDLE (which already has the centered tiles + bigger emoji from earlier fix).
  return <DirectionC_Idle />;
}

// ─── LIGHT V2 COMPLETE ───────────────────────────────────
function DirectionD_LightV2_Complete({ roastText, expanded = false, long = false }) {
  const T = AZURE; // light tokens from shared
  const clamped = long
    ? (roastText.length > 80 ? roastText.slice(0, 78).trim() + '…' : roastText)
    : roastText;

  return (
    <div style={{ width: '100%', height: '100%', background: T.bg, fontFamily: D_LIGHT2_TYPE.body, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <GameHeader />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '14px 16px 14px', gap: 12 }}>
        {/* Polaroid — KEEPS sticker treatment (it's the hero) */}
        <div style={{
          background: '#FFFFFF',
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
              background: '#FFFFFF', color: T.ink,
              padding: '4px 9px', borderRadius: 6,
              fontFamily: D_LIGHT2_TYPE.display, fontSize: 12, letterSpacing: 1,
              border: `2px solid ${T.ink}`,
              transform: 'rotate(-3deg)',
              boxShadow: `2px 2px 0 ${T.ink}`,
            }}>
              ★ ANIMATE
            </div>

            <div style={{
              position: 'absolute', top: 10, right: 10,
              background: T.roastRed, color: '#FFFFFF',
              padding: '4px 7px', borderRadius: 6,
              border: `2px solid ${T.ink}`,
              transform: 'rotate(3deg)',
              boxShadow: `2px 2px 0 ${T.ink}`,
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
                fontFamily: D_LIGHT2_TYPE.display, fontWeight: 400,
                fontSize: 22, lineHeight: 0.98, letterSpacing: 0.3,
                color: '#FFFFFF',
                textShadow: `2px 2px 0 ${T.ink}, -1px -1px 0 ${T.ink}`,
                textAlign: 'center',
                textTransform: 'uppercase',
                textWrap: 'balance',
              }}>
                {clamped}
              </div>
              {long && (
                <button style={{
                  display: 'block', margin: '8px auto 0',
                  background: T.roastEmber, color: T.ink,
                  padding: '5px 11px', borderRadius: 999,
                  border: `2px solid ${T.ink}`,
                  fontFamily: D_LIGHT2_TYPE.display, fontSize: 12, letterSpacing: 0.6,
                  boxShadow: `2px 2px 0 ${T.ink}`,
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
            <div style={{ fontFamily: D_LIGHT2_TYPE.display, fontSize: 11, letterSpacing: 1, color: '#3A3A3A' }}>
              GEMINI 3 PRO
            </div>
          </div>
        </div>

        {/* Action row — SLEEK */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{
            flex: 1, padding: '12px', borderRadius: 12,
            background: T.surface, color: T.ink,
            border: `1px solid ${T.border}`,
            fontFamily: D_LIGHT2_TYPE.display, fontSize: 14, letterSpacing: 0.6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <RoastIcons.Save size={14} color={T.ink} />
            <span>SAVE</span>
          </button>
          <button style={{
            flex: 1, padding: '12px', borderRadius: 12,
            background: T.roastEmber, color: T.ink,
            border: `1px solid ${T.roastEmber}`,
            boxShadow: `0 4px 16px rgba(240,139,58,0.35)`,
            fontFamily: D_LIGHT2_TYPE.display, fontSize: 14, letterSpacing: 0.6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <RoastIcons.Share size={14} color={T.ink} />
            <span>SHARE</span>
          </button>
          <button style={{
            flex: 1, padding: '12px', borderRadius: 12,
            background: 'transparent', color: T.roastRed,
            border: `1px solid ${T.roastRed}`,
            fontFamily: D_LIGHT2_TYPE.display, fontSize: 14, letterSpacing: 0.6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <RoastIcons.Refresh size={14} color={T.roastRed} />
            <span>REDO</span>
          </button>
        </div>

        {/* Refine card — SLEEK */}
        <div style={{
          background: T.surface, borderRadius: 14,
          border: `1px solid ${T.border}`,
          padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RoastIcons.Wand size={14} color={T.roastRed} />
              <span style={{ fontFamily: D_LIGHT2_TYPE.display, fontSize: 14, letterSpacing: 0.8, color: T.ink }}>
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
                fontFamily: D_LIGHT2_TYPE.display, fontSize: 12, letterSpacing: 0.6,
                padding: '6px 11px', borderRadius: 999,
                background: c.active ? T.gold : T.surfaceAlt,
                color: c.active ? T.ink : T.inkSoft,
                border: c.active ? `1px solid ${T.gold}` : `1px solid ${T.border}`,
              }}>{c.label}</span>
            ))}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 10px', borderRadius: 10,
            background: '#FFFFFF',
            border: `1px solid ${T.border}`,
          }}>
            <input
              placeholder="Custom: make it a 1920s gangster…"
              style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 12, color: T.ink, fontWeight: 500 }}
            />
            <button style={{
              padding: '6px 12px', borderRadius: 8,
              background: T.roastRed, color: '#FFFFFF',
              fontFamily: D_LIGHT2_TYPE.display, fontSize: 12, letterSpacing: 1,
              border: 'none',
            }}>GO</button>
          </div>
        </div>
      </div>

      {/* Expanded sheet — SLEEK */}
      {expanded && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(15,30,51,0.55)',
          display: 'flex', alignItems: 'flex-end',
          backdropFilter: 'blur(6px)',
          zIndex: 100,
        }}>
          <div style={{
            width: '100%',
            background: '#FFFFFF',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            border: `1px solid ${T.border}`,
            borderBottom: 'none',
            padding: '12px 20px 28px',
            maxHeight: '78%',
            display: 'flex', flexDirection: 'column',
            boxShadow: `0 -16px 40px rgba(15,30,51,0.18)`,
          }}>
            <div style={{
              width: 44, height: 5, borderRadius: 999,
              background: T.borderSoft, margin: '0 auto 14px',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RoastIcons.Skull size={16} color={T.roastRed} />
                <span style={{ fontFamily: D_LIGHT2_TYPE.display, fontSize: 18, letterSpacing: 1, color: T.ink }}>
                  THE FULL VERDICT
                </span>
              </div>
              <button style={{
                width: 28, height: 28, borderRadius: 999,
                background: T.surfaceAlt,
                border: `1px solid ${T.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <RoastIcons.Close size={14} color={T.muted} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
              <span style={{
                fontFamily: D_LIGHT2_TYPE.display, fontSize: 11, letterSpacing: 0.8,
                padding: '4px 9px', borderRadius: 6,
                background: T.goldSoft, color: T.ink,
                border: `1px solid ${T.gold}`,
              }}>ANIMATE</span>
              <span style={{
                padding: '4px 8px', borderRadius: 6,
                background: 'rgba(216,58,58,0.10)',
                border: `1px solid ${T.roastRed}`,
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                {[1,2,3,4,5].map(i => <RoastIcons.Skull key={i} size={9} color={T.roastRed} />)}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{
                fontFamily: D_LIGHT2_TYPE.display, fontSize: 11, letterSpacing: 0.8,
                color: T.muted,
              }}>GEMINI 3 PRO</span>
            </div>

            <div style={{
              flex: 1, overflowY: 'auto',
              fontSize: 17, lineHeight: 1.42, color: T.ink,
              fontWeight: 500, textWrap: 'pretty',
              padding: '4px 0 12px',
            }}>
              <span style={{ fontFamily: D_LIGHT2_TYPE.display, fontSize: 38, lineHeight: 0, color: T.roastRed, verticalAlign: '-12px', marginRight: 4 }}>"</span>
              {roastText}
              <span style={{ fontFamily: D_LIGHT2_TYPE.display, fontSize: 38, lineHeight: 0, color: T.roastRed, verticalAlign: '-12px', marginLeft: 2 }}>"</span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={{
                flex: 1, padding: '12px', borderRadius: 12,
                background: T.roastEmber, color: T.ink,
                border: `1px solid ${T.roastEmber}`,
                boxShadow: `0 4px 20px rgba(240,139,58,0.4)`,
                fontFamily: D_LIGHT2_TYPE.display, fontSize: 14, letterSpacing: 0.6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <RoastIcons.Share size={14} color={T.ink} />
                <span>SHARE QUOTE</span>
              </button>
              <button style={{
                flex: 1, padding: '12px', borderRadius: 12,
                background: T.surfaceAlt, color: T.ink,
                border: `1px solid ${T.border}`,
                fontFamily: D_LIGHT2_TYPE.display, fontSize: 14, letterSpacing: 0.6,
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

function DirectionD_LightV2_Complete_Short() { return <DirectionD_LightV2_Complete roastText={SAMPLE_ROAST_SHORT} />; }
function DirectionD_LightV2_Complete_Long() { return <DirectionD_LightV2_Complete roastText={SAMPLE_ROAST} long />; }
function DirectionD_LightV2_Complete_Expanded() { return <DirectionD_LightV2_Complete roastText={SAMPLE_ROAST} long expanded />; }

window.DirectionD_LightV2_Idle = DirectionD_LightV2_Idle;
window.DirectionD_LightV2_Complete_Short = DirectionD_LightV2_Complete_Short;
window.DirectionD_LightV2_Complete_Long = DirectionD_LightV2_Complete_Long;
window.DirectionD_LightV2_Complete_Expanded = DirectionD_LightV2_Complete_Expanded;
