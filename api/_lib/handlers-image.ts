// Image-related handlers — Roast Me image analysis (vision-in, text-out)
// and caricature image editing (image-in, image-out).
//
// NOTE ON VERCEL LIMITS:
//   - Hobby tier: 10s max duration, 4.5MB request body cap
//   - Pro tier: 60s max duration
// Image generation (editImage) can take 15-30s. On Hobby it may time out.
// If that happens in practice, this handler can be moved to an Edge Function
// or the user can upgrade the Vercel plan.

import { getGemini } from './clients.js';

const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-3-pro-image-preview';

// Team metadata for the WORLDCUP theme — keeps the jersey + flag specifics in
// one place so both the caricature and the roast prompt stay in sync.
const WORLDCUP_TEAMS: Record<string, { name: string; jersey: string; fans: string; angle: string }> = {
    argentina: {
        name: 'Argentina',
        jersey: 'the official Argentina national-team home jersey — light-blue and white vertical stripes, dark navy collar, with the AFA crest on the chest',
        fans: 'a sea of fans in light-blue and white, waving Argentine flags and scarves',
        angle: "their bandwagon-fan energy post-2022, their inability to name three current Argentine players, the gap between their cheering and any actual knowledge of the game",
    },
    brazil: {
        name: 'Brazil',
        jersey: 'the official Brazil national-team home jersey — bright canary-yellow with green collar trim and the CBF crest on the chest',
        fans: 'a sea of fans in yellow and green, waving Brazilian flags and beating samba drums',
        angle: "their over-the-top samba celebrations despite zero rhythm, the fact that they only know about Neymar, and how they'd cry if asked who plays right-back",
    },
    england: {
        name: 'England',
        jersey: 'the official England national-team home jersey — plain white with the Three Lions crest on the chest',
        fans: 'a sea of fans in white, waving St. George\'s Cross flags and singing "Three Lions"',
        angle: "their unshakeable belief that football is coming home (it isn't), their pre-emptive sense of grievance, their tactical takes based entirely on commentary they half-listened to",
    },
    india: {
        name: 'India',
        jersey: 'the official India national-team football jersey — sky-blue and white with the AIFF crest on the chest',
        fans: 'a confused crowd around them — India did not qualify for the 2026 World Cup, so this is wishful thinking made manifest',
        angle: "the small fact that India isn't even at this World Cup, their commitment to a team that watched the tournament on TV at home, the sheer audacity of celebrating a goal that doesn't involve them",
    },
};
const DEFAULT_WORLDCUP_TEAM = 'argentina';

// Caricature theme → image generation prompt
const getCaricaturePrompt = (theme: string, team?: string, variant?: string): string => {
    const randomSubTheme = (options: string[]) => ` ${options[Math.floor(Math.random() * options.length)]}`;

    switch (theme) {
        case 'tabloid': {
            const modifiers = [
                'The background features an aggressive paparazzi mob.',
                'The background shows a messy, chaotic courtroom exit.',
                'The lighting should feel like a cheap camera flash in a dark restaurant.',
                'Add subtle, dramatic motion blur to the edges as if they are running away.',
            ];
            return `Edit this photo to look like a scandalous, trashy supermarket tabloid magazine cover. Apply a gritty, high-contrast 'paparazzi flash' aesthetic. Add bold, sensationalized magazine text overlays in bright yellow and neon pink. Exaggerate the person's expression to look guilty or shocked. The overall style should scream 'celebrity scandal' with a cheap, printed magazine texture.${randomSubTheme(modifiers)}`;
        }
        case 'movie': {
            const modifiers = [
                'Make it a neon-lit, rainy alleyway in a dystopian megacity.',
                'Make it a dusty, sun-scorched post-apocalyptic wasteland.',
                'Make it a dramatic, fiery explosion in an underground bunker.',
                'Make it a smoky, shadows-heavy underworld boss lair.',
            ];
            return `Transform the person in this photo into the star of a gritty, high-stakes action-thriller or cyberpunk movie poster. IT IS CRITICAL TO RETAIN THE EXACT FACIAL IDENTITY of the persons in the original photo—do not change their face. Upgrade their outfit into a rugged, battle-worn survivor or sleek undercover rogue aesthetic. Add polished, professional movie poster text overlays: invent a bold, gritty Movie Title that suits their look, and include a subtle, hilariously underwhelming or mundane tagline underneath it. Use dramatic chiaroscuro lighting, heavy film grain, and a cinematic color grading.${randomSubTheme(modifiers)}`;
        }
        case 'rock': {
            // 4 scene variants — 2 punk (basement / pit) and 2 classic rock
            // (stadium / backstage). Client passes a `variant` ('punk' or
            // 'classic') so the chosen image and the chosen roast caption
            // both belong to the same vibe. Falls back to all-four when no
            // variant is given.
            const punkScenes = [
                {
                    label: 'late-70s punk pit',
                    look: 'a black leather jacket plastered with band patches and safety pins, ripped black skinny jeans, scuffed Doc Martens, a torn band t-shirt, and a spiked-up or freshly bleached mohawk haircut. Black eyeliner smudged from sweat',
                    pose: 'mid-shout in the middle of a packed pit, one fist raised, mouth open in a snarl, sweat-soaked',
                    set: 'a tiny dimly-lit basement venue, plaster walls behind them covered in flyers and graffiti, bodies pressed close, low ceiling, single bare bulb overhead casting harsh shadows. Style of London 1977 — Sex Pistols / Clash era — gritty, grainy, photographic',
                },
                {
                    label: 'punk band onstage',
                    look: 'a battered Gibson SG slung low on a leather strap, a sleeveless ripped band shirt, black jeans, studded belt, snarl curl on the lip, smudged eyeliner, hair lacquered into spikes',
                    pose: 'leaning into a vintage SM58 mic on a boom stand, knees bent, guitar pointed at the audience, mid-roar',
                    set: 'a low basement stage, beer-sticky floor, single red wash from a cheap par can, a chaotic crowd silhouetted at the lip of the stage. Style of CBGB 1978 — gritty, harsh flash, grainy, photographic',
                },
            ];
            const classicScenes = [
                {
                    label: 'stadium-rock anthem',
                    look: 'a denim jacket with embroidered band patches over a faded vintage tour t-shirt, tight worn jeans, brown leather boots, hair big and feathered, leather wrist cuff. Aviator sunglasses pushed up on the head',
                    pose: 'fist raised high, head tipped back, mouth open in a triumphant shout, mid-anthem',
                    set: 'a packed open-air stadium late afternoon, golden-hour sunlight, a sea of upraised hands and flickering lighters in the crowd behind them, a massive stage rigged with par cans glowing in the distance. Style of Wembley Live Aid 1985 — warm, cinematic, photographic',
                },
                {
                    label: 'classic-rock backstage',
                    look: 'leather pants, an open silk shirt over a band tee, layered chains and pendants, big tousled 70s rock hair, statement rings on every finger, a Les Paul slung over the shoulder',
                    pose: 'leaning against a dressing-room counter looking straight at the camera, half a smirk, mid-pose like a tour-doc still',
                    set: 'a cluttered backstage dressing room, bulb-lit makeup mirror behind them, setlist taped to the wall, a battered flight case on the floor, beer bottles, hand-towels. Style of Cameron Crowe 1973 — warm tungsten light, slightly grainy, photographic',
                },
            ];
            const pool = variant === 'punk' ? punkScenes
                : variant === 'classic' ? classicScenes
                : [...punkScenes, ...classicScenes];
            const scene = pool[Math.floor(Math.random() * pool.length)];
            const modifiers = [
                'A bit of motion blur on the edges suggests the movement of the moment.',
                'Faint stage haze drifts in from one side.',
                'A single dramatic rim-light catches their silhouette from behind.',
                'Grain texture across the whole frame suggests film stock.',
            ];
            return `IDENTITY LOCK — TOP PRIORITY: You must preserve the EXACT facial identity of the person in the uploaded photo. Do not generate a new face. Do not idealise, beautify, slim, or "improve" their features. Keep the same face shape, jaw line, nose, eyes, eye spacing, eyebrows, lips, ears, hairline (unless the hair style explicitly changes), skin tone, facial hair, and any visible distinguishing marks (moles, scars, freckles, glasses if present). A friend looking at the result must say "that's clearly them" — not "that looks like a version of them". A change of expression (snarling, shouting, smirking) is fine AS LONG AS THE UNDERLYING FACE IS UNMISTAKABLY THE SAME PERSON. If you cannot preserve the face exactly, prefer to keep the original face untouched and only re-render the outfit, hair, and background around it.

Re-render the photo as a ${scene.label} portrait. The subject is wearing ${scene.look}. ${scene.pose}. Background and setting: ${scene.set}. Sharp focus on the subject, shallow depth of field on the background.${randomSubTheme(modifiers)}`;
        }
        case 'agra': {
            const modifiers = [
                'Include a random, extremely judgmental royal peacock staring at them.',
                'Have heavily-armed, annoyed historical palace guards side-eying them in the background.',
                'The lighting should be a dramatic, golden-hour sunset casting long shadows.',
                'Have a lavish but overly massive, confusing feast set up on a rug next to them.',
            ];
            return `CRITICAL INSTRUCTION: Perfectly preserve the exact facial identities, bone structure, and likeness of every person in the uploaded photo. Do not generate new faces. Edit the people into an over-the-top, majestic Mughal-era portrait set at the Taj Mahal. Dress them in flamboyant, overly-ornate historical Mughal royalty attire—think heavy jewel-encrusted sherwanis, oversized jeweled turbans, and heavily embroidered lehengas. They should look completely out of place, like modern tourists trying way too hard to look like an emperor or empress. The background MUST be a stunning, grand view of the Taj Mahal with intricate marble arches and reflecting pools.${randomSubTheme(modifiers)}`;
        }
        case 'worldcup': {
            const t = WORLDCUP_TEAMS[team || DEFAULT_WORLDCUP_TEAM] || WORLDCUP_TEAMS[DEFAULT_WORLDCUP_TEAM];
            // Three distinct scene variants so repeated generations don't all
            // converge on the same shot. Each defines the action + camera vibe;
            // jersey / crowd / branding stay consistent across all three.
            const scenes = [
                {
                    action: 'Their arms are raised high mid-celebration, mouth open in a joyful shout, eyes wide as a goal is scored',
                    camera: 'shot from low and slightly to the side as if a fellow fan grabbed it on a phone, tight on them with the celebrating pitch visible past their shoulder',
                    detail: 'In the middle distance, players in the same team kit are celebrating the goal; floodlights blaze overhead',
                },
                {
                    action: 'They are holding up a phone for a stadium selfie, beaming, scarf draped around their neck, the pitch visible behind them mid-match',
                    camera: 'shot at eye level, slight wide-angle lens distortion suggesting a real selfie, the stadium curving away behind them',
                    detail: 'A play is unfolding on the pitch behind them — figures in motion, ball in the air — and the giant scoreboard glows in the background',
                },
                {
                    action: 'They are standing for the national anthem before kickoff, scarf held high above their head with both hands, mouth open mid-song, expression proud and a little emotional',
                    camera: 'shot from below as if by someone seated in front of them, the stadium lights glowing behind their silhouette',
                    detail: 'The teams are lined up on the pitch in the distance facing the centre, the floodlit grass green and pristine, and a sea of scarves rises across the section',
                },
            ];
            const scene = scenes[Math.floor(Math.random() * scenes.length)];
            const modifiers = [
                'Confetti and bits of streamer fall through the floodlights overhead.',
                'A red-orange flare smokes in the row behind them.',
                'The closest pitch-side advertising hoarding has the FIFA World Cup 2026 logo glowing.',
                'A giant team flag is being passed across the section behind their head.',
            ];
            return `IDENTITY LOCK — TOP PRIORITY: You must preserve the EXACT facial identity of the person in the uploaded photo. Do not generate a new face. Do not idealise, beautify, slim, or "improve" their features. Keep the same face shape, jaw line, nose, eyes, eye spacing, eyebrows, lips, ears, hairline, hair colour and texture, skin tone, facial hair, and any visible distinguishing marks (moles, scars, freckles, glasses if present). A friend looking at the result must say "that's clearly them" — not "that looks like a version of them". A change of expression (open mouth, shouting, smiling, eyes wider) is fine AS LONG AS THE UNDERLYING FACE IS UNMISTAKABLY THE SAME PERSON. If you cannot preserve the face exactly, prefer to keep the original face untouched and only re-render the outfit and background around it.

Re-render the photo as a vivid, photorealistic shot of them inside the stadium crowd at a 2026 FIFA World Cup match. They are wearing ${t.jersey}. ${scene.action}. Around them: ${t.fans}. ${scene.detail}. The official FIFA World Cup 2026 LED branding glows on the pitch-side advertising boards. Stadium architecture and crowd extend into the background. ${scene.camera}. Cinematic lighting, vibrant colours, sharp focus on the person, shallow depth of field on the background.${randomSubTheme(modifiers)}`;
        }
        case 'animate':
        default: {
            const modifiers = [
                'Exaggerate their nose or hair in a silly way.',
                'Make them hold a tiny cup of coffee or a prop.',
                'Give them an overly dramatic or goofy facial expression.',
                'Place them in a bustling, abstract street background.',
            ];
            return `Transform this person into a funny cartoon caricature with exaggerated features. Classic street artist caricature style.${randomSubTheme(modifiers)}`;
        }
    }
};

// Roast caption system prompt per theme
const getRoastSystemPrompt = (theme: string, team?: string, variant?: string): string => {
    const randomVibe = (options: string[]) => ` ${options[Math.floor(Math.random() * options.length)]}`;

    switch (theme) {
        case 'tabloid': {
            const vibes = [
                "Focus on insulting their 'outfit choices' as a tragic mistake.",
                "Focus on implying they were caught sneaking out of a D-list celebrity's house.",
                "Focus on their 'shocking' expression revealing their guilt.",
                'Mock them for looking like they just got fired from a reality TV show.',
            ];
            return `You are a ruthless gossip columnist writing a scandalous tabloid headline and short article about the person in this photo. Make up a ridiculous, embarrassing, and highly dramatic celebrity-style rumor based purely on their appearance, expression, or background. Start with a sensational all-caps HEADLINE, followed by the shocking 'exclusive' story. Be funny, dramatic, and petty. Keep it under 280 characters.${randomVibe(vibes)}`;
        }
        case 'movie': {
            const vibes = [
                'Focus on how they would definitely be the first character to die in the movie.',
                "Suggest their 'mission' involves something incredibly boring, like doing taxes.",
                'Focus on their lack of intimidating aura despite the gritty movie setting.',
                'Imply that they are just a confused bystander who wandered onto the set.',
            ];
            return `You are a gravelly-voiced, overly-serious movie trailer narrator pitching a gritty, dark action-thriller starring the person in this photo. Based purely on their outfit, expression, or background in the image, invent a hilariously mundane "fatal flaw" or anticlimactic mission for them. Write a short, punchy, cinematic teaser trailer script. Start with an epic overarching statement, followed by the absurd reality of their role. Be funny, slightly roasting, and dramatic. Keep it under 280 characters.${randomVibe(vibes)}`;
        }
        case 'rock': {
            // The client picks `variant` ('punk' or 'classic') and sends the
            // SAME value to both the image and the roast call, so the
            // generated photo and the caption sit on the same side of the
            // genre line. Default to picking randomly if no variant arrived.
            const chosen = variant === 'punk' || variant === 'classic'
                ? variant
                : (Math.random() < 0.5 ? 'punk' : 'classic');
            if (chosen === 'punk') {
                const vibes = [
                    "Frame it as a snarling NME live-review pull-quote.",
                    "Mock their commitment to the bit — suburban kid LARPing as Sid Vicious.",
                    "Imply they only own one Clash record and it's the greatest-hits CD.",
                    "Roast the pose as something they practised in the bathroom mirror.",
                ];
                return `You are a snarling late-70s punk-zine critic — bitter, fast-typing, allergic to pretension. Write a single short caption mocking the person in the photo, who is dressed and posed as a 70s punk (mohawk, leather, patches, basement venue). Voice: sneering, contemptuous, "you wouldn't have lasted one song" energy. STRICT FORMAT: one or two sentences MAX. Under 240 characters. No emoji. No hashtags. No quotes around the line. Do not mention classic rock, stadium rock, or "the 80s" — stay fully in the punk lane.${randomVibe(vibes)}`;
            }
            const vibes = [
                "Frame it as a world-weary 'back in my day' Rolling Stone retrospective line.",
                "Mock the pose as a try-hard album-cover audition.",
                "Imply they couldn't name a Zeppelin song that wasn't Stairway.",
                "Hit them as a Pitchfork mini-review (5.7 / 10, faint praise, fatal damning).",
            ];
            return `You are a world-weary classic-rock critic — Cameron Crowe written by Lester Bangs after three whiskies. Write a single short caption mocking the person in the photo, who is dressed and posed as a stadium-era classic rock star (denim, leather pants, big hair, Les Paul, golden-hour or backstage). Voice: nostalgic eye-roll, "kid, you wouldn't have made it past the soundcheck" energy. STRICT FORMAT: one or two sentences MAX. Under 240 characters. No emoji. No hashtags. No quotes around the line. Do not mention punk, mohawks, or "the kids today" — stay fully in the classic-rock lane.${randomVibe(vibes)}`;
        }
        case 'agra': {
            const vibes = [
                "Insult them as looking like a court jester who stole the Emperor's clothes.",
                'Complain that their mere presence is disrespecting the architecture.',
                'Mock their expression as someone who just lost all their gold at the market.',
                'Say they look like a time-traveler who clearly failed to blend in.',
            ];
            return `You are a hilariously strict, easily-offended royal court historian from the Mughal Empire. Roast the people in this photo who are clearly just tourists pretending to be royalty during their trip to Agra. Brutally mock their "cheap modern fabrics," their total lack of royal grace, or their absurd expressions as an insult to the dynasty and the Taj Mahal. Throw in some dramatically petty but historically-flavored insults. Keep it under 280 characters.${randomVibe(vibes)}`;
        }
        case 'worldcup': {
            const t = WORLDCUP_TEAMS[team || DEFAULT_WORLDCUP_TEAM] || WORLDCUP_TEAMS[DEFAULT_WORLDCUP_TEAM];
            const vibes = [
                "Phrase it as a TV broadcast chyron at the bottom of the screen.",
                "Phrase it as a one-line punditry verdict, like Roy Keane half-listening at half-time.",
                "Phrase it as a stadium-cam caption you'd see flash up under their face.",
                "Phrase it as a confused commentator's aside that wasn't supposed to go on air.",
            ];
            return `You are a sardonic football pundit / TV broadcast operator writing a single short caption to flash under a fan-cam shot at the 2026 FIFA World Cup. The person in the image is in the ${t.name} section, jersey on, mid-celebration as a goal goes in. Roast them in a punchy, affectionate-but-ribbing tone. Go after ${t.angle}. Light to medium roast — they're a fan, not the enemy. STRICT FORMAT: one or two sentences MAX. Under 220 characters. No emoji. No hashtags. No quotes around the line.${randomVibe(vibes)}`;
        }
        case 'animate':
        default: {
            const vibes = [
                'Zone in purely on their hairstyle and roast it.',
                'Mock the aesthetic of whatever room or background they are in.',
                'Focus entirely on their deeply unserious facial expression.',
                'Compare them to a very obscure, funny cartoon character.',
            ];
            return `You are a legendary roast master at a comedy club.
Look at this image and write a brutal, hilarious, and edgy roast caption.
Make fun of the person's expression, clothes, vibe, or background.
Be savage and sarcastic, like an x-rated roast.
Keep it under 280 characters.${randomVibe(vibes)}`;
        }
    }
};

// =============================================================================
// Roast caption from image
// =============================================================================

export const handleGenerateRoast = async (params: { base64Image: string; theme?: string; team?: string; variant?: string }): Promise<string> => {
    const gemini = await getGemini();
    if (!gemini) return "🔥 ROAST PROTOCOL DISABLED: API Key missing on server.";
    const { base64Image, theme = 'animate', team, variant } = params;

    try {
        const systemPrompt = getRoastSystemPrompt(theme, team, variant);
        const response = await gemini.models.generateContent({
            model: TEXT_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: systemPrompt },
                ],
            },
        });
        return response.text || "I'm literally speechless. You managed to break the AI.";
    } catch (err) {
        console.error('[ai/roast] error:', err);
        return 'Roast failed (API Error).';
    }
};

// =============================================================================
// Caricature image edit (image in → image out)
// =============================================================================

export const handleEditImage = async (params: { base64Image: string; theme?: string; team?: string; variant?: string; prompt?: string }): Promise<string | null> => {
    const gemini = await getGemini();
    if (!gemini) return null;
    const { base64Image, theme, team, variant, prompt } = params;

    // Allow either an explicit prompt or a theme key. Theme takes precedence if
    // both are given (themes drive the existing UI flow). `team` only matters
    // for the worldcup theme; `variant` only for the rock theme.
    const effectivePrompt = theme ? getCaricaturePrompt(theme, team, variant) : (prompt || getCaricaturePrompt('animate'));

    try {
        const response = await gemini.models.generateContent({
            model: IMAGE_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: effectivePrompt },
                ],
            },
        });

        const candidates = response.candidates;
        if (candidates && candidates.length > 0) {
            const parts = candidates[0].content?.parts;
            if (parts) {
                for (const part of parts) {
                    if (part.inlineData && part.inlineData.data) {
                        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                    }
                }
            }
        }
        return null;
    } catch (err) {
        console.error('[ai/edit_image] error:', err);
        return null;
    }
};

// =============================================================================
// Roast or Toast (legacy text-based variant)
// =============================================================================

export const handleRoastOrToast = async (params: { image: string; type: 'roast' | 'toast' }): Promise<string> => {
    const gemini = await getGemini();
    if (!gemini) return params.type === 'roast' ? "I'm speechless... literally." : 'Cheers to you!';
    const { image, type } = params;

    const prompt = type === 'roast'
        ? 'You are a savage comedian. Roast this person based on their selfie. Be funny, edgy, but keep it friendly enough for a wide audience. Max 2 sentences.'
        : 'You are a kind, poetic friend. Give a generous, humorous toast to this person. Max 2 sentences.';

    try {
        const response = await gemini.models.generateContent({
            model: TEXT_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { inlineData: { data: image.split(',')[1] || image, mimeType: 'image/jpeg' } },
                    ],
                },
            ],
        });
        return response.text || (type === 'roast' ? "I'm speechless... literally." : 'Cheers to you!');
    } catch (err) {
        console.error('[ai/roast_or_toast] error:', err);
        return type === 'roast' ? "Couldn't roast — API error." : "Couldn't toast — API error.";
    }
};
