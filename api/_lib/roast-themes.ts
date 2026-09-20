// Roast Me — the theme registry.
//
// ONE place that owns every theme's two prompts: the caricature prompt (what
// the image model is told to draw) and the roast prompt (the voice that writes
// the caption). Previously both lived as parallel `switch` statements inside
// handlers-image.ts, which meant adding or retiring a theme touched two
// far-apart blocks and the IDENTITY LOCK paragraph was copy-pasted verbatim
// into each theme that bothered to include it.
//
// DELIBERATELY IMPORT-FREE. handlers-image.ts reaches this through
// './roast-themes.js' (the api/ extension landmine — see CLAUDE.md), and
// tests/roastThemes.test.ts imports the .ts path directly. Keeping the module
// dependency-free means both resolutions work and neither drags the Gemini SDK
// into a test process.
//
// Seasonality lives CLIENT-side in src/data/roastThemes.ts — the picker decides
// what a user may choose. This file still holds prompts for retired themes on
// purpose: the PWA service worker precaches the app shell, so a client from
// before a retirement can still POST an old theme key weeks later. Serving that
// request is strictly better than 500-ing it.

export type PickFn = <T>(arr: readonly T[]) => T;

export interface ThemeCtx {
    /** Only meaningful for 'worldcup' (retired). */
    team?: string;
    /** Only meaningful for 'rock' ('punk' | 'classic'). */
    variant?: string;
    /** Injected so tests can make prompt selection deterministic. */
    pick: PickFn;
}

export interface RoastThemeDef {
    key: string;
    /** Prompt for the image model (image in → image out). */
    caricature: (ctx: ThemeCtx) => string;
    /** System prompt for the caption model (vision in → text out). */
    roast: (ctx: ThemeCtx) => string;
}

export const DEFAULT_THEME = 'animate';

/** Uniform random pick — the production PickFn. */
export const randomPick: PickFn = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------------------
// The identity lock
// ---------------------------------------------------------------------------
// The single most important paragraph in this file. Roast Me's whole promise is
// that the person in the output is recognisably the person who uploaded the
// photo — "that's clearly them", not "that looks like a version of them". Image
// models drift toward idealised, symmetrical, generic faces unless told very
// firmly not to, and the drift is worst on exactly the themes that change the
// most around the face (costume, era, lighting).
//
// Every theme gets this. No exceptions — even the ones where the face ends up
// small in frame, where it matters most.
export const IDENTITY_LOCK = `IDENTITY LOCK — TOP PRIORITY: Preserve the EXACT facial identity of the person in the uploaded photo. Do not generate a new face. Do not idealise, beautify, slim, smooth, or otherwise "improve" their features. Keep the same face shape, jaw line, nose, eyes, eye spacing, eyebrows, lips, teeth, ears, hairline, skin tone and texture, facial hair, and any visible distinguishing marks — moles, scars, freckles, glasses, piercings. If there are several people in the photo, this applies to every one of them. A friend looking at the result must say "that's clearly them". A change of expression is fine AS LONG AS THE UNDERLYING FACE IS UNMISTAKABLY THE SAME PERSON. If you cannot preserve the face exactly, prefer to leave the face untouched and re-render only the clothing, hair, and background around it.`;

/** Caption-format rules shared by the short one-liner themes. */
const ONE_LINER = `STRICT FORMAT: one or two sentences MAX. Under 240 characters. No emoji. No hashtags. No quotation marks around the line.`;

// Retired, kept only so PWA-cached clients still resolve. See header.
const WORLDCUP_TEAMS: Record<string, { name: string; jersey: string; fans: string; angle: string }> = {
    argentina: {
        name: 'Argentina',
        jersey: 'the Argentina national-team home jersey — light-blue and white vertical stripes, navy collar, AFA crest',
        fans: 'a sea of fans in light-blue and white waving flags and scarves',
        angle: 'their bandwagon energy, their inability to name three current Argentine players',
    },
    brazil: {
        name: 'Brazil',
        jersey: 'the Brazil national-team home jersey — canary yellow, green collar trim, CBF crest',
        fans: 'a sea of fans in yellow and green beating samba drums',
        angle: 'their samba celebrations despite zero rhythm, the fact they only know Neymar',
    },
    england: {
        name: 'England',
        jersey: 'the England national-team home jersey — plain white with the Three Lions crest',
        fans: "a sea of fans in white waving St George's Cross flags",
        angle: "their belief that football is coming home (it isn't), their pre-emptive sense of grievance",
    },
    india: {
        name: 'India',
        jersey: 'the India national-team football jersey — sky blue and white with the AIFF crest',
        fans: 'a confused crowd around them — India did not qualify, so this is wishful thinking made manifest',
        angle: "the small fact that India isn't even at this tournament",
    },
};

export const ROAST_THEME_PROMPTS: Record<string, RoastThemeDef> = {
    // =======================================================================
    // EVERGREEN — the five that predate this rewrite, all re-prompted
    // =======================================================================

    animate: {
        key: 'animate',
        caricature: ({ pick }) => `${IDENTITY_LOCK}

Re-draw this person as a hand-inked street-artist caricature — the kind sketched in ten minutes on a seaside boardwalk for cash. Push the proportions hard: oversized head on a small body, their single most distinctive feature (nose, jaw, hair, brow, grin) exaggerated well past flattery while every feature stays unmistakably theirs. Bold confident ink outlines, loose marker shading, cheap paper texture, a few visible construction lines left in. ${pick([
            'Give them an absurdly tiny prop to hold — a doll-sized coffee, a single grape.',
            'Push the hair into a physically impossible silhouette that is still recognisably their hairstyle.',
            'Put them mid-gesture, caught in a pose far too dramatic for whatever they are actually doing.',
            'Set them against a scribbled, chaotic street-market background in loose marker.',
        ])}`,
        roast: ({ pick }) => `You are a boardwalk caricature artist who has drawn four thousand faces this summer and has stopped pretending to be nice about any of them. Write one savage, funny caption about the person in this photo. Go after their expression, their clothes, their hair, or whatever is visible behind them. Sharp and specific, not generic — the insult should only work on THIS person. Under 280 characters. ${pick([
            'Zero in entirely on their hairstyle.',
            'Zero in on the room or background they are standing in.',
            'Zero in on their deeply unserious facial expression.',
            'Compare them to an oddly specific and unflattering cartoon character.',
        ])}`,
    },

    tabloid: {
        key: 'tabloid',
        caricature: ({ pick }) => `${IDENTITY_LOCK}

Re-render this photo as the front cover of a trashy supermarket tabloid. Harsh direct on-camera flash, blown-out highlights, gritty high contrast, the cheap ink-on-newsprint texture of a magazine that costs almost nothing. Layer bold sensationalised cover text over it in screaming yellow and hot pink — a huge all-caps headline plus two or three smaller kicker lines down the side. Push their expression toward caught-in-the-act guilt or open-mouthed shock. ${pick([
            'Fill the background with a mob of paparazzi, arms and lenses everywhere.',
            'Stage it as a chaotic exit from a courthouse, coat half-on, hand raised at the camera.',
            'Make the light feel like a single flash fired in a dim restaurant at 1am.',
            'Add motion blur at the frame edges as though they are fleeing the photographer.',
        ])}`,
        roast: ({ pick }) => `You are a gossip columnist with no legal department and no shame, writing the cover story for a supermarket tabloid. Invent a ridiculous, petty, wildly dramatic scandal about the person in this photo, built from whatever you can actually see — their outfit, their expression, the room behind them. Open with an ALL-CAPS HEADLINE, then the breathless "exclusive". Funny and mean-spirited rather than genuinely cruel. Under 280 characters. ${pick([
            'Frame their outfit as the real scandal.',
            "Imply they were photographed leaving someone far more famous's house at dawn.",
            'Treat their expression as a confession.',
            'Claim they have just been dropped from a reality show nobody watches.',
        ])}`,
    },

    movie: {
        key: 'movie',
        caricature: ({ pick }) => `${IDENTITY_LOCK}

Re-render this person as the poster star of a gritty, self-serious action thriller. Upgrade their clothing into rugged battle-worn tactical gear or a sleek, dangerous-looking coat. Hard chiaroscuro lighting, deep shadow across half the face, heavy film grain, bleak teal-and-amber colour grade. Add professional poster typography: an invented all-caps title across the lower third in a heavy condensed face, plus a small tagline above it that is hilariously mundane — the gap between the epic look and the pathetic tagline is the joke. Include a fake billing block of tiny illegible credits at the very bottom. ${pick([
            'Set it in a neon-lit rain-soaked alley in a dystopian megacity.',
            'Set it in a sun-scorched post-apocalyptic wasteland, dust in the air.',
            'Set it in an underground bunker with a fire blooming somewhere behind them.',
            'Set it in a smoke-filled underworld lair, shutters throwing hard stripes of light.',
        ])}`,
        roast: ({ pick }) => `You are a gravelly movie-trailer narrator pitching a deadly serious action thriller starring the person in this photo — except the film is clearly terrible and you know it. Open with one epic cinematic line, then undercut it completely with the pathetic reality of their role, invented from what you can see in the image. Under 280 characters. ${pick([
            'Establish that they are unmistakably the first character to die.',
            'Reveal that their high-stakes mission is something crushingly mundane, like a tax return.',
            'Dwell on their total lack of menace given the setting.',
            'Imply they are a confused bystander who wandered onto the set and nobody has told them.',
        ])}`,
    },

    rock: {
        key: 'rock',
        caricature: ({ pick, variant }) => {
            const punk = [
                {
                    label: 'late-70s basement pit',
                    look: 'a battered leather jacket crusted with band patches and safety pins, ripped black jeans, scuffed boots, a torn band shirt, hair spiked or bleached into a mohawk, eyeliner smudged with sweat',
                    pose: 'mid-shout in a packed pit, one fist up, mouth open in a snarl, soaked through',
                    set: 'a tiny low-ceilinged basement venue, plaster walls papered in flyers and graffiti, bodies pressed close, one bare bulb throwing hard shadows — London 1977, grainy and photographic',
                },
                {
                    label: 'punk band onstage',
                    look: 'a beaten-up electric guitar slung low on a leather strap, sleeveless ripped shirt, studded belt, a permanent sneer, lacquered spikes of hair',
                    pose: 'leaning into a vintage mic on a boom stand, knees bent, guitar aimed at the crowd, mid-roar',
                    set: 'a low beer-sticky stage under a single red par can, a chaotic crowd silhouetted at the stage lip — CBGB 1978, harsh flash, grainy',
                },
            ];
            const classic = [
                {
                    label: 'stadium anthem',
                    look: 'a denim jacket heavy with embroidered patches over a faded tour shirt, worn jeans, leather boots, big feathered hair, aviators pushed up on the head',
                    pose: 'fist raised, head tipped back, mouth open mid-anthem',
                    set: 'a packed open-air stadium at golden hour, a sea of raised hands and lighters, a vast rigged stage glowing behind — 1985, warm and cinematic',
                },
                {
                    label: 'backstage, 1973',
                    look: 'leather trousers, an open silk shirt over a band tee, layered chains, rings on every finger, tousled shoulder-length hair, a sunburst guitar over one shoulder',
                    pose: 'leaning on a dressing-room counter, looking straight down the lens, half a smirk',
                    set: 'a cluttered dressing room, bulb-lit mirror, setlist taped to the wall, flight case, bottles, towels — warm tungsten, slightly grainy',
                },
            ];
            const pool = variant === 'punk' ? punk : variant === 'classic' ? classic : [...punk, ...classic];
            const scene = pick(pool);
            return `${IDENTITY_LOCK}

Re-render the photo as a ${scene.label} portrait. They are wearing ${scene.look}. ${scene.pose}. Setting: ${scene.set}. Sharp focus on the subject, shallow depth of field behind. ${pick([
                'Let stage haze drift in from one side.',
                'Catch their silhouette with a single hard rim-light from behind.',
                'Push visible film grain across the whole frame.',
                'Add a touch of motion blur at the edges.',
            ])}`;
        },
        roast: ({ pick, variant }) => {
            const chosen = variant === 'punk' || variant === 'classic' ? variant : pick(['punk', 'classic'] as const);
            if (chosen === 'punk') {
                return `You are a punk fanzine critic in 1978 — bitter, fast, allergic to anything that smells of trying. Write one caption mocking the person in this photo, who is dressed and posed as a basement-era punk. Voice: sneering, contemptuous, "you would not have lasted one song". ${ONE_LINER} Stay entirely in the punk lane — no mention of stadium rock, the 80s, or classic rock. ${pick([
                    'Write it as a savage live-review pull-quote.',
                    'Mock them as a suburban kid cosplaying danger.',
                    'Imply their entire knowledge of the genre is one greatest-hits compilation.',
                    'Roast the pose as something rehearsed in a bathroom mirror.',
                ])}`;
            }
            return `You are a world-weary classic-rock critic, three whiskies in, who was actually there. Write one caption mocking the person in this photo, dressed and posed as a stadium-era rock star. Voice: nostalgic eye-roll, "kid, you would not have made it past soundcheck". ${ONE_LINER} Stay entirely in the classic-rock lane — no mention of punk or mohawks. ${pick([
                'Frame it as a weary "back in my day" retrospective line.',
                'Mock the pose as a failed album-cover audition.',
                'Imply they cannot name a single deep cut.',
                'Write it as a damning 5.7-out-of-10 review in faint praise.',
            ])}`;
        },
    },

    agra: {
        key: 'agra',
        caricature: ({ pick }) => `${IDENTITY_LOCK}

Re-render this person as an absurdly grand Mughal-era royal portrait staged at the Taj Mahal. Dress them in wildly over-ornate historical court attire — a jewel-encrusted sherwani or heavily embroidered lehenga, an oversized gem-set turban or headpiece, ropes of pearls, far too many rings. The comedy is that they are obviously a modern tourist trying much too hard: the finery is immaculate but they are wearing it like a costume. Behind them, a grand view of the Taj Mahal with its marble arches and reflecting pool. Rich saturated colour, ornate miniature-painting detail in the borders. ${pick([
            'Add a deeply judgmental peacock staring directly at them.',
            'Put bored, heavily armed palace guards side-eyeing them in the middle distance.',
            'Light it as a dramatic golden-hour sunset throwing long shadows.',
            'Lay out an enormous, confusing, untouched feast on a rug beside them.',
        ])}`,
        roast: ({ pick }) => `You are an easily-offended Mughal court historian, and the people in this photo are tourists playing dress-up in a court you take extremely seriously. Roast them for it — the cheap modern fabrics, the complete absence of royal bearing, the posture, the expression, the insult to the dynasty and the building behind them. Dramatically petty, historically flavoured. Under 280 characters. ${pick([
            'Accuse them of looking like a court jester who raided the Emperor’s wardrobe.',
            'Complain that their presence physically diminishes the architecture.',
            'Read their expression as someone who has just lost everything at the market.',
            'Call them a time traveller who has failed spectacularly to blend in.',
        ])}`,
    },

    // =======================================================================
    // ZEITGEIST — seasonal, expected to rotate out. See src/data/roastThemes.ts
    // =======================================================================

    figurine: {
        key: 'figurine',
        caricature: ({ pick }) => `${IDENTITY_LOCK} This matters MORE here, not less: the head is small in frame, which is exactly where likeness is usually lost. Render the face at full detail and resist every pull toward a generic doll face.

Re-render this person as a collectible action figure sealed in retail packaging, photographed straight-on under bright product lighting. The figure is a detailed plastic likeness of them in their own clothing, standing in a moulded blister pack on a printed cardboard backer. Their name or an invented nickname runs across the top of the card in a bold toy-brand logo. Beside the figure, in their own smaller moulded compartments, sit two or three accessories drawn from their actual life as visible in the photo. Add small print, a fake barcode, an age rating, and a scuffed corner on the card. Glossy vacuum-formed plastic, visible seams on the figure, slight sheen on the blister. ${pick([
            'Give the card a garish 1980s toy-aisle colour scheme and starburst.',
            'Make it a premium collector edition — matte black card, gold foil lettering.',
            'Add a "LIMITED EDITION — 1 OF 1" flash in one corner.',
            'Add a small inset window on the card showing an "alternate outfit" version.',
        ])}`,
        roast: ({ pick }) => `You write the back-of-the-box copy for a toy line, and this figure is a commercial catastrophe. Describe the action figure of the person in this photo the way packaging would — features, accessories, points of articulation — but make every single detail an insult drawn from what you can actually see in the image. Deadpan corporate product-copy voice; the comedy is that you are entirely sincere. Under 280 characters. ${pick([
            'List their accessories and make each one bleaker than the last.',
            'Specify their points of articulation and imply they are barely poseable.',
            'Add a warning label about what the figure cannot do.',
            'Mention what is sold separately, and make it something they obviously need.',
        ])}`,
    },

    digicam: {
        key: 'digicam',
        caricature: ({ pick }) => `${IDENTITY_LOCK}

Re-render this photo as a snapshot taken on a cheap compact digital camera at a house party around 2007. Harsh direct on-camera flash blowing out everything within two metres and falling off to near-black behind. Slightly wrong white balance pushed warm-orange, visible sensor noise in the shadows, mild barrel distortion, a touch of red-eye, faint chromatic fringing on high-contrast edges, very slight handheld motion blur. Composition should be careless in the way real snapshots are — subject a bit off-centre, head not quite centred, a stray arm or half a face at the frame edge. Burn an orange timestamp into the bottom-right corner. This must look like an unremarkable real photograph, not a stylised one: no cinematic grading, no artful lighting, no polish. ${pick([
            'Set it in a cramped kitchen, counter covered in bottles and plastic cups.',
            'Make it a mirror selfie held at arm’s length, flash blowing out in the glass.',
            'Put them on a sofa mid-sentence, someone else half-cropped beside them.',
            'Set it in a dim hallway with a doorway of bright light behind them.',
        ])}`,
        roast: ({ pick }) => `You are looking at a photo that has just surfaced from someone's 2007 camera folder after eighteen years, and you are the friend who found it. Write one caption roasting the person in it — the outfit, the pose, the hair, the expression, the room. The voice is affectionate horror: you were there, you also looked like this, and that makes it worse. ${ONE_LINER} ${pick([
            'Frame it as a caption you would post to expose them.',
            'Address them directly, as though they need to explain themselves.',
            'Treat it as evidence in a case against their entire personality that year.',
            'Note what it says about them that this photo was ever kept.',
        ])}`,
    },

    diwali: {
        key: 'diwali',
        caricature: ({ pick }) => `${IDENTITY_LOCK}

Re-render this person as a warm, cinematic Diwali festive portrait. Dress them in rich festive Indian clothing — a silk kurta, a bandhgala, or an embroidered saree or lehenga in deep jewel tones with metallic thread and fine detail work. The primary light is the warm amber glow of oil-lamp diyas placed close to them, throwing soft golden light up across the face with gentle shadow behind. Strings of small warm lights bokeh out in the background, and a rangoli pattern in coloured powder glows on the floor at the edge of frame. Marigold garlands somewhere in the scene. Shallow depth of field, rich warm colour, soft skin light — the look of a considered festive portrait rather than a snapshot. Keep it elegant; no fireworks in the subject's hands, no clutter. ${pick([
            'Set them in a doorway framed by marigolds and hanging lights.',
            'Set them on a terrace at blue hour, city lights soft behind.',
            'Have them lighting a diya, face lit from below by the new flame.',
            'Seat them beside a rangoli, lamps arranged in a warm arc around them.',
        ])}`,
        roast: ({ pick }) => `You are the relative at every Diwali gathering who compliments people so precisely that it lands as an insult. The person in this photo is dressed up for the festival and very pleased with themselves. Write one caption that opens like warm praise and closes like a knife — about the outfit, the pose, the effort, the obvious self-satisfaction. Warm, never cruel; this is family. ${ONE_LINER} ${pick([
            'Compliment the outfit and then price it.',
            'Praise the effort and then ask what the occasion really is.',
            'Admire the pose and then mention how long it clearly took.',
            'Note how well they have scrubbed up, and imply a very low baseline.',
        ])}`,
    },

    // =======================================================================
    // EVERGREEN — new
    // =======================================================================

    yearbook: {
        key: 'yearbook',
        caricature: ({ pick }) => `${IDENTITY_LOCK}

Re-render this person as a 1985 high-school yearbook glamour portrait, shot in a shopping-mall studio. Heavy soft-focus diffusion filter, dreamy glow around the highlights, warm low-contrast lighting. Big voluminous feathered hair with visible hairspray hold. Dress them in period studio-portrait clothing — a pastel blazer with strong shoulder pads over a high-collared blouse, or a knitted vest over a wide-collared shirt with a skinny tie. Put them in the classic three-quarter turn with chin slightly lifted and a stiff, slightly uncomfortable smile. The background is a mall-studio backdrop: soft mottled blue-grey cloud gradient with thin laser-beam streaks across it. Slight paper texture and the faded colour cast of a photo that has sat in a drawer for forty years. ${pick([
            'Add a second ghosted profile portrait of them faded into one corner.',
            'Add a looping handwritten signature across the lower corner in silver pen.',
            'Give it the rounded corners and thin white border of a school photo print.',
            'Add a very slight lens flare from the laser backdrop.',
        ])}`,
        roast: ({ pick }) => `You are writing the yearbook caption printed under this person's 1985 senior portrait — the kind the committee slipped past the teacher. One line, faintly polite on the surface, devastating underneath. Build it from what you can see: the hair, the collar, the expression, the effort. ${ONE_LINER} ${pick([
            'Write it as their "Most Likely To" superlative.',
            'Write it as a quote they chose for themselves that says far too much.',
            'Write it as the one-line note a classmate scrawled beside the photo.',
            'Write it as a club membership list that gets sadder as it goes.',
        ])}`,
    },


    wanted: {
        key: 'wanted',
        caricature: ({ pick }) => `${IDENTITY_LOCK}

Re-render this person as the portrait on an Old West WANTED poster. Their face, drawn large and frontal, occupies the centre of the sheet as a hand-engraved ink illustration — cross-hatched shading, confident line work, the look of 1880s letterpress. WANTED sits across the top in heavy weathered wood-type, with DEAD OR ALIVE beneath the portrait and a large dollar reward figure at the bottom in mismatched type sizes. The whole thing is printed on yellowed, foxed, water-stained paper with torn edges, a fold crease down the middle, and a nail hole at the top. Photograph it as though pinned to weathered timber. Keep the portrait large — the face is the poster. ${pick([
            'Tear one corner away entirely, taking part of the reward figure with it.',
            'Add a faded coffee-cup ring across one corner of the paper.',
            'Add a scrawled handwritten note in the margin in faded ink.',
            'Curl the paper at the edges as though it has been outdoors for months.',
        ])}`,
        roast: ({ pick }) => `You are the frontier marshal who wrote this WANTED poster, and you are tired. State the crime the person in this photo is wanted for — something petty, modern, and entirely beneath the gravity of the poster — plus the reward, which should be insultingly small. Dry Old West officialese, played completely straight. Under 280 characters. ${pick([
            'Make the crime something they obviously did in a group chat.',
            'Make the crime a social offence everyone has silently agreed to hate.',
            'Set the reward absurdly low and itemise it.',
            'Add a line noting they are considered harmless and easily caught.',
        ])}`,
    },

    anime: {
        key: 'anime',
        caricature: ({ pick }) => `${IDENTITY_LOCK} Translate their real features into the drawn style rather than replacing them — the drawing must still read as this specific person, not a generic character.

Re-draw this person as a soft-painted animation portrait in the style of hand-painted cel animation: clean confident linework, flat cel-shaded skin with soft gradient edges, luminous warm lighting, and lush painted watercolour-style backgrounds with visible brush texture. Large expressive eyes with detailed catchlights, simplified but characterful nose and mouth, hair painted in clear shaped clumps with a bright rim highlight. Warm nostalgic colour palette — golden light, soft greens, deep blues. Gentle and inviting rather than sharp or glossy. Do not imitate any specific named studio, film, or living artist; this is a generic hand-painted animation look. ${pick([
            'Set them in a sunlit meadow with wind moving through tall grass.',
            'Set them at a small cluttered kitchen window with steam rising from a cup.',
            'Set them on a quiet street at dusk, warm windows glowing behind.',
            'Set them on a hillside under an enormous painted sky of drifting cloud.',
        ])}`,
        roast: ({ pick }) => `The person in this photo has been redrawn as a gentle, soft-painted animated character, and the effect is deeply unearned. Write one caption that punctures it — the gap between the tender storybook treatment and whatever is actually going on with this person. Affectionate, wry, never cruel; the art is being sincere, you are not. ${ONE_LINER} ${pick([
            'Describe the film they are the protagonist of, and make it crushingly small.',
            'Give them a wholesome character arc they have plainly not earned.',
            'Note what the gentle art style is generously hiding.',
            'Write it as the tagline of a coming-of-age film nobody finished watching.',
        ])}`,
    },

    // The replacement for the retired LINKEDIN theme. Same "official document"
    // instinct, much better source material: a passport photo is the one
    // portrait everybody has and nobody likes, taken under rules designed to
    // remove every flattering thing about a face. The theme does not have to
    // invent the indignity — it just zooms in on it.
    //
    // The framing is the whole idea and is stated twice on purpose: a tight crop
    // on the photo panel with the printed data column bleeding in off one edge.
    // Ask for "a passport" and the model draws the whole booklet on a table,
    // where the face is 200px wide and the joke is gone.
    //
    // The fictional-issuer paragraph is NOT decoration. We are putting a real
    // person's face on an identity document, and a convincing replica of a real
    // country's data page is a forgery template whatever the caption says. An
    // invented country is also simply funnier, so nothing is traded away.
    passport: {
        key: 'passport',
        caricature: ({ pick }) => `${IDENTITY_LOCK}

Re-render this photo as an extreme close-up of the photograph panel on a passport's data page — as though someone laid the open booklet flat and zoomed all the way in on the picture.

FRAMING — THIS IS THE WHOLE SHOT: the printed passport photograph fills most of the frame, cropped in tight around the head and shoulders. Along ONE side, the machine-printed data column intrudes into shot and runs straight off the frame edge, so only the beginning of each line survives — small bold sans-serif field labels stacked above their values, four or five lines of them, the rest cut off by the image border. The booklet is NOT fully in frame and must not be: this is a zoomed detail of one corner of one page, never a whole document.

THE PHOTOGRAPH ITSELF — a real passport photo, and therefore deeply unkind. Flat, even, shadowless light straight onto the face. A completely plain pale grey or off-white backdrop with nothing in it. Squared head-on to the camera, shoulders level, both ears showing, no tilt. Neutral closed-mouth expression — no smile, no warmth, the faintly criminal look of somebody who has just been told to stop smiling. Slightly desaturated, slightly too contrasty, with the hard sharpening and mild print dot of an image reproduced at 35x45mm.

THE DOCUMENT SURFACE — the details that sell it: fine guilloche rosettes and wavy security line-work printed across and around the photograph; a faint secondary "ghost" portrait of the same face repeated small beside it; a glossy laminate overlay catching one diagonal band of light with a hint of holographic rainbow in it; the raised ring of an embossed dry stamp crossing one corner of the photo; microprinted rules; visible paper fibre and a whisper of offset misregistration; the booklet's gutter darkening one side; a slight page curve.

FICTIONAL ISSUER — REQUIRED: do not reproduce any real country's passport. The issuing state, crest, emblem, flag, colours, typography and every printed word must be invented and plainly fictional. No real national arms, no real passport design, no real document or personal numbers. ${pick([
            'Let a band of machine-readable-zone characters — monospaced capitals and rows of chevron filler — clip the very bottom edge of the frame.',
            'Land an inked entry stamp half across the photograph, its ring and date readable at an angle.',
            'Lift the laminate very slightly at one corner, a trapped bubble under it catching the light.',
            'Let the facing page intrude as a soft out-of-focus sliver of overlapping stamps down the far edge.',
        ])}`,
        roast: ({ pick }) => `You are a border control officer at the end of a very long shift. The person in this photo is standing in front of you and their passport is open in your hand, and you are looking from the photograph, to their face, and back to the photograph. Say the one thing you are thinking. Flat, bureaucratic, faintly hostile, and completely personal — built from what is actually visible: the expression, the hair, the clothes, the face they are currently making at you. The joke is that you are entirely serious and in no hurry. ${ONE_LINER} ${pick([
            'Deliver it as a question you already know the answer to.',
            'Deliver it as the reason you are going to keep them at the desk a while longer.',
            'Deliver it as a flat observation about how badly the photograph serves them — or how accurately.',
            'Deliver it as a note you are entering into the record, read aloud as you type it.',
        ])}`,
    },

    // =======================================================================
    // RETIRED — never offered by the picker; kept so PWA-cached clients resolve
    // =======================================================================

    linkedin: {
        key: 'linkedin',
        caricature: ({ pick }) => `${IDENTITY_LOCK}

Re-render this person as a corporate headshot for someone who describes themselves as a thought leader. Dress them in smart business-casual — a well-fitted blazer over a plain shirt, top button open, no tie. Bright even flattering light, clean commercial retouching, the background a softly blurred modern office: glass partitions, pale wood, a plant, a meeting room out of focus behind. They are giving the practised professional half-smile that does not reach the eyes, arms folded or one hand in a small mid-explanation gesture. Everything must look expensive, competent, and completely hollow. ${pick([
            'Have them caught mid-gesture as though making a point nobody asked about.',
            'Put a lanyard on them from a conference that is clearly beneath them.',
            'Add a whiteboard behind, softly out of focus, covered in meaningless arrows.',
            'Frame it as a speaker photo, a blurred stage and seated audience behind.',
        ])}`,
        roast: ({ pick }) => `Write the opening lines of this person's LinkedIn post. They are posting their own headshot with a "vulnerable" story that is transparently a humblebrag, and they believe it is profound. Nail the exact voice: short portentous sentences on their own lines, a hard-won lesson nobody needed, a closing question to drive engagement. The roast is that you are writing it perfectly straight. Under 280 characters. ${pick([
            'Open with a banal event framed as a turning point.',
            'Open by quoting something their driver, barista, or child supposedly said.',
            'Open by admitting a "failure" that is obviously a boast.',
            'Open with a one-word sentence, then a dramatic pause, then the lesson.',
        ])}`,
    },

    worldcup: {
        key: 'worldcup',
        caricature: ({ pick, team }) => {
            const t = WORLDCUP_TEAMS[team || 'argentina'] || WORLDCUP_TEAMS.argentina;
            return `${IDENTITY_LOCK}

Re-render the photo as a vivid shot of them in the stadium crowd at a football World Cup match. They are wearing ${t.jersey}. Around them: ${t.fans}. Floodlights blaze overhead, stadium architecture and crowd extend into the background. Cinematic lighting, vibrant colour, sharp focus on the person, shallow depth of field behind. ${pick([
                'Confetti falls through the floodlights.',
                'A red flare smokes in the row behind them.',
                'A giant team flag is being passed over their head.',
            ])}`;
        },
        roast: ({ pick, team }) => {
            const t = WORLDCUP_TEAMS[team || 'argentina'] || WORLDCUP_TEAMS.argentina;
            return `You are a sardonic football pundit writing a one-line caption to flash under a fan-cam shot at a World Cup match. The person is in the ${t.name} section, mid-celebration. Roast them affectionately. Go after ${t.angle}. ${ONE_LINER} ${pick([
                'Phrase it as a broadcast chyron.',
                'Phrase it as a weary half-time punditry verdict.',
                'Phrase it as a commentator aside that was not meant to air.',
            ])}`;
        },
    },
};

/**
 * Resolve a theme key to its definition, falling back to the default rather
 * than throwing. Unknown keys reach here from two real places: a PWA-cached
 * client built before a theme was retired, and a hand-rolled API call. Neither
 * should produce a 500 — a caricature is a better answer than an error.
 */
export const getThemeDef = (key?: string): RoastThemeDef =>
    (key && ROAST_THEME_PROMPTS[key]) || ROAST_THEME_PROMPTS[DEFAULT_THEME];

/** Every key the server can serve, retired ones included. */
export const ALL_SERVER_THEME_KEYS = Object.keys(ROAST_THEME_PROMPTS);

// ---------------------------------------------------------------------------
// Composite directives
// ---------------------------------------------------------------------------
// The Roast Lab can generate four themes as one 2x2 image. Stacking four FULL
// caricature prompts into one request does not work — they run to several
// hundred words each, and the model averages them into mush. Each theme needs a
// compact directive instead: the smallest description that still lands the look.
//
// Kept as one map rather than a field on each theme so all twelve can be read
// together. The thing that matters is whether they are DISTINCT FROM EACH OTHER
// at a glance — four panes that drift toward the same look is the failure mode,
// and you can only see that by reading them side by side.
//
// No randomisation here on purpose: a comparison run should be reproducible.
export const COMPOSITE_DIRECTIVES: Record<string, string> = {
    animate: 'a hand-inked street-artist caricature — oversized head, exaggerated features, bold ink outlines, loose marker shading on cheap paper',
    tabloid: 'a trashy tabloid magazine cover — harsh flash, blown highlights, screaming yellow and pink cover text over the image, guilty expression',
    movie: 'a gritty action-thriller movie poster — battle-worn clothing, hard shadow across half the face, teal-and-amber grade, heavy title type across the bottom',
    rock: 'a 1977 basement punk portrait — leather jacket crusted with patches, spiked hair, smudged eyeliner, mid-snarl under one bare bulb, grainy',
    agra: 'an ornate Mughal court portrait at the Taj Mahal — jewel-encrusted sherwani or lehenga, oversized gem-set turban, marble arches behind, rich saturated colour',
    figurine: 'a collectible action figure of them sealed in a blister pack on a printed cardboard backer, accessories in moulded compartments beside it, bright product lighting',
    digicam: 'a 2007 compact-camera party snapshot — harsh direct flash, background falling to black, warm wrong white balance, sensor noise, orange timestamp in the corner',
    diwali: 'a warm Diwali festive portrait — rich silk festive Indian clothing, face lit from below by oil-lamp diyas, strings of warm bokeh lights behind',
    yearbook: 'a 1985 mall-studio yearbook portrait — heavy soft-focus glow, big feathered hair, pastel blazer with shoulder pads, mottled blue backdrop with laser streaks',
    passport: 'an extreme close-up of a fictional passport data page — a flat, unsmiling, evenly lit passport photograph filling the pane, guilloche security patterning and a laminate sheen across it, a sliver of printed data column running off one edge',
    linkedin: 'a corporate thought-leader headshot — blazer over open-collar shirt, bright even light, softly blurred modern glass office behind, practised hollow half-smile',
    wanted: 'an Old West WANTED poster — their face as a large cross-hatched ink engraving centred on yellowed torn paper, heavy weathered wood-type above and below',
    anime: 'a soft-painted hand-drawn animation portrait — clean linework, cel-shaded skin, large expressive eyes, lush painted watercolour background, warm nostalgic palette',
    worldcup: 'a football stadium crowd shot — national-team jersey, floodlights overhead, a sea of fans behind, cinematic colour',
};

/** Compact directive for a pane, falling back to the default theme's. */
export const getCompositeDirective = (key: string): string =>
    COMPOSITE_DIRECTIVES[key] || COMPOSITE_DIRECTIVES[DEFAULT_THEME];

const QUADRANT_NAMES = ['TOP-LEFT', 'TOP-RIGHT', 'BOTTOM-LEFT', 'BOTTOM-RIGHT'] as const;

/**
 * Build the prompt for an N-pane composite (N is 2 or 4; 4 is the real case).
 *
 * The grid geometry paragraph is load-bearing. The panes get cropped apart
 * client-side by slicing the image at its exact midpoints, so anything the
 * model adds between them — a border, a gutter, a caption strip, a drop shadow,
 * a title bar — shifts the real content off the mathematical quarters and every
 * crop comes out misaligned. Hence the very explicit, very repetitive
 * instructions about edges and seams.
 */
export const buildCompositePrompt = (themeKeys: string[]): string => {
    const panes = themeKeys
        .slice(0, 4)
        .map((key, i) => `${QUADRANT_NAMES[i]}: ${getCompositeDirective(key)}.`)
        .join('\n');

    return `${IDENTITY_LOCK}

Produce ONE single image containing FOUR different portraits of this same person, arranged as a 2x2 grid.

GRID GEOMETRY — FOLLOW EXACTLY:
- The image is divided into four equal quadrants by one vertical line at the exact horizontal centre and one horizontal line at the exact vertical centre.
- Each quadrant is filled edge to edge with its own portrait. The artwork runs all the way to the image border and all the way to the centre seams.
- NO borders, NO frames, NO white gutters, NO padding, NO rounded corners, NO drop shadows between panes.
- NO text labels, NO captions, NO titles, NO numbering, NO watermark anywhere on the image.
- The four panes must be exactly equal in size. Do not make one larger or offset the seams.
- Each pane is a separate self-contained portrait, not one scene spanning the grid.

THE FOUR PANES:
${panes}

In every pane it is the SAME PERSON from the uploaded photo, with the identity rules above applied in full. Each pane should be framed as a portrait — head and shoulders large in that pane — so the face carries the most detail in all four.`;
};
