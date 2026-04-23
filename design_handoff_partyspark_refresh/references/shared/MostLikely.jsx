// Most Likely To screens: category select + playing card view

function MostLikelyCategory({ dir, onBack, onPickCategory }) {
  const D = DIRECTIONS[dir];
  const isPaper = dir === 'paper';
  const isCream = dir === 'cream';

  return (
    <div style={{ background: D.bg, color: D.ink, minHeight: '100%', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: D.inkSoft, padding: 6, marginLeft: -6, cursor: 'pointer', display: 'flex' }}>
            <Icon name="back" size={22} strokeWidth={2.2} />
          </button>
          <h1 style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: D.ink, letterSpacing: '-0.01em' }}>
            Most Likely To…
          </h1>
        </div>
        <button style={{
          background: isPaper ? D.surface : D.surfaceAlt,
          border: `1px solid ${D.border}`,
          borderRadius: 12,
          padding: 8,
          color: D.inkSoft,
          cursor: 'pointer',
          display: 'flex',
        }}>
          <Icon name="home" size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Subtitle */}
      <div style={{ padding: '4px 20px 18px' }}>
        <p style={{ margin: 0, fontSize: 13, color: D.muted, lineHeight: 1.5 }}>
          Pick a category. Everyone points to whoever fits the prompt. Loudest vote wins the shame.
        </p>
      </div>

      {/* Category list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ML_CATEGORIES.map((c) => (
          <CategoryCard key={c.id} cat={c} dir={dir} onClick={() => onPickCategory && onPickCategory(c)} />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({ cat, dir, onClick }) {
  const D = DIRECTIONS[dir];
  const isPaper = dir === 'paper';
  const isCream = dir === 'cream';
  const isAzure = dir === 'azure';

  // Color mapping for categories
  const catColor = {
    custom_vibe: D.tiles.mostLikely,
    family_friendly: D.tiles.ice,
    fun: D.tiles.wyr,
    scandalous: D.tiles.fact,
    adult: D.tiles.truth,
    chaos: D.tiles.mostLikely,
    bbf: D.tiles.mostLikely,
  }[cat.id] || D.tiles.mostLikely;

  const isCustom = cat.id === 'custom_vibe';
  const isAdult = cat.id === 'adult';

  // Custom vibe: gradient / special treatment
  const cardBg = isCustom
    ? (isPaper
        ? D.surface
        : `linear-gradient(135deg, ${catColor.tint} 0%, ${D.surface} 100%)`)
    : D.surface;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 14px',
        background: cardBg,
        border: isCustom && !isPaper ? `1.5px solid ${catColor.solid}60` : `1px solid ${D.border}`,
        borderRadius: 14,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        width: '100%',
        boxShadow: isPaper ? '0 1px 2px rgba(17,17,17,0.04)' : 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left color bar for paper mode */}
      {isPaper && (
        <div style={{
          position: 'absolute',
          left: 0, top: 12, bottom: 12,
          width: 3,
          background: catColor.iconOn || catColor.solid,
          borderRadius: 2,
        }} />
      )}

      {/* Icon chip */}
      <div style={{
        width: 44, height: 44,
        borderRadius: 12,
        background: isPaper ? D.bgTint : catColor.solid,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isPaper ? (catColor.iconOn || catColor.solid) : '#FFFFFF',
        flexShrink: 0,
        marginLeft: isPaper ? 6 : 0,
      }}>
        {isCustom ? <Icon name="wand" size={22} strokeWidth={2} /> :
         isAdult ? <Icon name="flame" size={22} strokeWidth={2} /> :
         <Icon name="users" size={22} strokeWidth={2} />}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: D.ink }}>
            {cat.label}
          </h3>
          {isAdult && (
            <span style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '0.1em',
              color: D.tiles.truth.iconOn || D.tiles.truth.solid,
              background: D.tiles.truth.tint,
              padding: '2px 6px',
              borderRadius: 4,
            }}>
              18+
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: D.muted, lineHeight: 1.35 }}>
          {cat.desc}
        </p>
      </div>

      <Icon name="chevron" size={18} color={D.muted} />
    </button>
  );
}

function MostLikelyPlaying({ dir, onBack, cardText, cardIndex, totalCards, category, onNext }) {
  const D = DIRECTIONS[dir];
  const isPaper = dir === 'paper';
  const isCream = dir === 'cream';
  const isAzure = dir === 'azure';

  const accent = isCream ? D.accent : isAzure ? D.accent : D.accent;
  const tileColor = D.tiles.mostLikely;

  return (
    <div style={{ background: D.bg, color: D.ink, minHeight: '100%', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 10px' }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: D.inkSoft, padding: 6, marginLeft: -6, cursor: 'pointer', display: 'flex' }}>
          <Icon name="back" size={22} strokeWidth={2.2} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: D.muted, textTransform: 'uppercase' }}>
            Most Likely To
          </div>
          <div style={{ fontSize: 11.5, color: tileColor.iconOn || tileColor.solid, fontWeight: 600 }}>
            {category}
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: D.inkSoft, minWidth: 44, textAlign: 'right' }}>
          {cardIndex + 1}<span style={{ color: D.muted, fontWeight: 500 }}>/{totalCards}</span>
        </div>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, padding: '4px 20px 14px' }}>
        {Array.from({ length: totalCards }).map((_, i) => (
          <div key={i} style={{
            height: 3,
            flex: 1,
            maxWidth: 32,
            borderRadius: 2,
            background: i <= cardIndex ? (tileColor.iconOn || tileColor.solid) : D.border,
          }} />
        ))}
      </div>

      {/* Card */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 18px 18px' }}>
        <div style={{
          width: '100%',
          aspectRatio: '3 / 4',
          maxHeight: 460,
          background: isPaper ? D.surface : isCream ? D.surface : D.surface,
          border: `1px solid ${D.border}`,
          borderRadius: 22,
          padding: '26px 24px',
          display: 'flex', flexDirection: 'column',
          boxShadow: isPaper
            ? '0 2px 8px rgba(17,17,17,0.06), 0 12px 28px rgba(17,17,17,0.04)'
            : isCream
              ? '0 2px 8px rgba(101,71,20,0.08), 0 16px 36px rgba(101,71,20,0.05)'
              : '0 2px 8px rgba(20,50,90,0.08), 0 16px 36px rgba(20,50,90,0.05)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative corner for cream */}
          {isCream && (
            <div style={{
              position: 'absolute',
              top: -60, right: -60,
              width: 160, height: 160,
              borderRadius: '50%',
              background: D.goldSoft,
              opacity: 0.5,
            }} />
          )}
          {isAzure && (
            <div style={{
              position: 'absolute',
              top: -60, right: -60,
              width: 160, height: 160,
              borderRadius: '50%',
              background: D.accentSoft,
              opacity: 0.5,
            }} />
          )}

          {/* Header pill */}
          <div style={{
            alignSelf: 'flex-start',
            background: isCream ? D.goldSoft : isPaper ? D.bgTint : D.accentSoft,
            color: isCream ? D.gold : isPaper ? D.ink : D.accent,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '5px 10px',
            borderRadius: 6,
            position: 'relative',
            zIndex: 1,
          }}>
            Most Likely To
          </div>

          {/* Prompt */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            position: 'relative',
            zIndex: 1,
          }}>
            <p style={{
              margin: 0,
              fontFamily: "'Playfair Display', serif",
              fontSize: 26,
              fontWeight: 600,
              lineHeight: 1.2,
              color: D.ink,
              letterSpacing: '-0.015em',
              textWrap: 'pretty',
            }}>
              {cardText}
            </p>
          </div>

          {/* Footer */}
          <div style={{
            fontSize: 11,
            color: D.muted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
            zIndex: 1,
          }}>
            <span>Point to who fits.</span>
            <span style={{
              fontFamily: "'Playfair Display', serif",
              fontStyle: 'italic',
              fontSize: 12,
              color: isCream ? D.gold : accent,
            }}>
              PartySpark
            </span>
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div style={{ padding: '0 18px 22px', display: 'flex', gap: 10 }}>
        <button style={{
          flex: 1,
          padding: '14px 20px',
          background: isPaper ? D.surface : D.surfaceAlt,
          color: D.inkSoft,
          border: `1px solid ${D.border}`,
          borderRadius: 14,
          fontWeight: 600,
          fontSize: 14,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}>
          Skip
        </button>
        <button onClick={onNext} style={{
          flex: 2,
          padding: '14px 20px',
          background: isCream ? D.ink : isPaper ? D.ink : D.accent,
          color: isCream ? D.bg : isPaper ? D.bg : '#FFFFFF',
          border: 'none',
          borderRadius: 14,
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: '0.02em',
          fontFamily: 'inherit',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          Reveal & Next
          <Icon name="arrow" size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

window.MostLikelyCategory = MostLikelyCategory;
window.MostLikelyPlaying = MostLikelyPlaying;
