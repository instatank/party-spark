import { GameType, type GameMeta } from './types';

import { Ban, Brain, Mic, Sparkles, Camera, Flame, Zap, VenetianMask, Split, Users, Hand, Compass, CheckCircle2, Wine, Heart } from 'lucide-react';

export const GAMES: GameMeta[] = [
    {
        id: GameType.ROAST,
        title: "Roast Me",
        description: "Upload a pic for a brutal AI roast!",
        icon: "flame",
        color: "bg-orange-600",
        minPlayers: 1
    },
    {
        id: GameType.IMPOSTER,
        title: "Imposter",
        description: "Find the fake among your friends!",
        icon: "spy",
        color: "bg-red-500",
        minPlayers: 3
    },
    {
        id: GameType.TABOO,
        title: "Taboo",
        description: "Describe it without forbidden words.",
        icon: "ban",
        color: "bg-[#F0656D]",
        minPlayers: 4
    },
    {
        id: GameType.FACT_OR_FICTION,
        title: "Fact or Fiction",
        description: "Beat the clock identifying true facts!",
        icon: "check_circle",
        color: "bg-rose-500",
        minPlayers: 2
    },
    {
        id: GameType.MOST_LIKELY_TO,
        title: "Most Likely To...",
        description: "Point fingers & expose friends!",
        icon: "users",
        color: "bg-purple-600",
        minPlayers: 3
    },
    {
        id: GameType.CHARADES,
        title: "Charades",
        description: "Act out words silently!",
        icon: "drama",
        color: "bg-[#EFC050]",
        minPlayers: 4
    },
    {
        id: GameType.MINI_MAFIA,
        title: "The Traitors",
        description: "Pass-and-play betrayal!",
        icon: "spy",
        color: "bg-slate-800",
        minPlayers: 5
    },
    {
        id: GameType.NEVER_HAVE_I_EVER,
        title: "Never Have I Ever",
        description: "Stand up if you've done it!",
        icon: "hand",
        color: "bg-cyan-600",
        minPlayers: 3
    },
    {
        id: GameType.WOULD_YOU_RATHER,
        title: "Would You Rather",
        description: "This or that? Make tough choices!",
        icon: "split",
        color: "bg-indigo-500",
        minPlayers: 1
    },
    {
        id: GameType.ICEBREAKERS,
        title: "Icebreakers",
        description: "Truths, dares, and deep questions.",
        icon: "mic",
        color: "bg-[#65F096]",
        minPlayers: 2
    },
    {
        id: GameType.WOULD_I_LIE_TO_YOU,
        title: "Would I Lie To You?",
        description: "Tell a true story or a bold lie.",
        icon: "drama",
        color: "bg-teal-500",
        minPlayers: 3
    },
    {
        id: GameType.TRUTH_OR_DRINK,
        title: "Truth or Drink",
        description: "Confess or take a sip. No escape.",
        icon: "wine",
        color: "bg-red-500",
        minPlayers: 2
    },
    {
        id: GameType.COMPATIBILITY_TEST,
        title: "The Forecast",
        description: "How well do you really know each other?",
        icon: "heart",
        color: "bg-pink-500",
        minPlayers: 2
    },
];

// =============================================================================
// Rich metadata + filter chips for the Home Menu search/filter feature.
// =============================================================================

export interface GameRichMeta {
    vibe: string;        // one-word mood (Wild, Strategy, Confess, …)
    duration: string;    // "2 min" / "5 min" / "10 min" / "15 min" / "20 min"
    players: string;     // "2+" / "3–8" / "Solo" — display only
    tags: string[];      // searchable + chip-filter keywords
}

export const GAME_RICH_META: Record<GameType, GameRichMeta> = {
    [GameType.HOME]:                { vibe: '',         duration: '',       players: '',     tags: [] },
    [GameType.ROAST]:               { vibe: 'Wild',     duration: '2 min',  players: 'Solo', tags: ['ai', 'quick', 'solo', 'couples', 'spicy'] },
    [GameType.IMPOSTER]:            { vibe: 'Strategy', duration: '10 min', players: '3–8',  tags: ['social', 'deduction', 'crowd', 'spicy'] },
    [GameType.TABOO]:               { vibe: 'Classic',  duration: '5 min',  players: '4+',   tags: ['teams', 'fast', 'crowd'] },
    [GameType.FACT_OR_FICTION]:     { vibe: 'Trivia',   duration: '5 min',  players: '2+',   tags: ['quick', 'learn', 'couples'] },
    [GameType.MOST_LIKELY_TO]:      { vibe: 'Gossip',   duration: '15 min', players: '3+',   tags: ['point', 'expose', 'crowd', 'spicy'] },
    [GameType.CHARADES]:            { vibe: 'Classic',  duration: '10 min', players: '4+',   tags: ['teams', 'active', 'crowd'] },
    [GameType.MINI_MAFIA]:          { vibe: 'Strategy', duration: '20 min', players: '5+',   tags: ['betrayal', 'long', 'crowd', 'spicy'] },
    [GameType.NEVER_HAVE_I_EVER]:   { vibe: 'Confess',  duration: '10 min', players: '3+',   tags: ['classic', 'reveal', 'crowd', 'spicy'] },
    [GameType.WOULD_YOU_RATHER]:    { vibe: 'Debate',   duration: '10 min', players: '1+',   tags: ['quick', 'any', 'couples', 'spicy'] },
    [GameType.ICEBREAKERS]:         { vibe: 'Warm-up',  duration: '5 min',  players: '2+',   tags: ['quick', 'meet', 'gentle', 'couples'] },
    [GameType.WOULD_I_LIE_TO_YOU]:  { vibe: 'Bluff',    duration: '10 min', players: '3+',   tags: ['story', 'read', 'crowd'] },
    [GameType.TRUTH_OR_DRINK]:      { vibe: 'Deep',     duration: '15 min', players: '2+',   tags: ['adult', 'honest', 'spicy', 'couples'] },
    [GameType.COMPATIBILITY_TEST]:  { vibe: 'Connect',  duration: '15 min', players: '2',    tags: ['couple', 'know', 'couples', 'spicy'] },
};

export const HOME_FILTERS = [
    { id: 'all',     label: 'All' },
    { id: 'quick',   label: 'Quick' },
    { id: 'couples', label: 'Couples' },
    { id: 'crowd',   label: 'Crowd' },
    { id: 'spicy',   label: 'Spicy' },
] as const;

export type HomeFilter = typeof HOME_FILTERS[number]['id'];

// Decides whether a game matches the currently-selected chip.
// "quick" matches by short duration; everything else by tag.
export const gameMatchesFilter = (gameId: GameType, filter: HomeFilter): boolean => {
    if (filter === 'all') return true;
    const meta = GAME_RICH_META[gameId];
    if (!meta) return false;
    if (filter === 'quick') return meta.duration === '2 min' || meta.duration === '5 min';
    return meta.tags.includes(filter);
};

// Sub-category search index. Each game lists its decks/categories with a
// human label (shown in the "Matches:" hint on a search result card) and
// a list of search tags (synonyms the query is checked against).
// Edit this when a game adds or renames a deck.
export interface SubcatEntry {
    label: string;
    tags: string[];
}

export const GAME_SUBCATEGORIES: Partial<Record<GameType, SubcatEntry[]>> = {
    [GameType.MOST_LIKELY_TO]: [
        { label: 'Family Friendly', tags: ['wholesome', 'pg', 'family', 'clean', 'kids'] },
        { label: 'Fun & Light',     tags: ['fun', 'light', 'casual', 'pg13'] },
        { label: 'Scandalous',      tags: ['scandalous', 'gossip', 'drama', 'juicy', 'saucy'] },
        { label: 'X-Rated',         tags: ['adult', 'spicy', 'saucy', 'naughty', '18+', 'nsfw', 'x-rated'] },
        { label: 'Chaos Mode',      tags: ['chaos', 'absurd', 'unhinged', 'wild'] },
        { label: 'For BBF',         tags: ['family', 'indian', 'bbf'] },
    ],
    [GameType.TRUTH_OR_DRINK]: [
        { label: 'Classic',    tags: ['classic', 'party', 'chaos', 'petty'] },
        { label: 'Spicy',      tags: ['spicy', 'saucy', 'flirty', 'scandalous', 'naughty'] },
        { label: 'Deep Cuts',  tags: ['deep', 'vulnerable', 'heartfelt', 'real'] },
        { label: 'Ex Files',   tags: ['exes', 'dating', 'ex', 'relationships', 'drama'] },
        { label: 'Chaos',      tags: ['chaos', 'absurd', 'surreal', 'weird'] },
    ],
    [GameType.NEVER_HAVE_I_EVER]: [
        { label: 'Rehaan Answers',    tags: ['rehaan', 'family', 'indian'] },
        { label: 'Rehaan Asks',       tags: ['rehaan', 'family', 'indian'] },
        { label: 'Agra Confessions',  tags: ['agra', 'mughal', 'history', 'indian'] },
        { label: 'For BBF',           tags: ['family', 'indian', 'bbf'] },
        { label: 'Classic Party',     tags: ['classic', 'party', 'fun'] },
        { label: 'Guilty Pleasures',  tags: ['guilty', 'embarrassing', 'spicy', 'saucy', 'naughty'] },
    ],
    [GameType.CHARADES]: [
        { label: 'Mix Movies',        tags: ['mix', 'movies', 'films', 'chaos'] },
        { label: 'Family Mix',        tags: ['family', 'wholesome', 'pg'] },
        { label: 'Bollywood Movies',  tags: ['bollywood', 'hindi', 'indian', 'movies'] },
        { label: 'Hollywood Movies',  tags: ['hollywood', 'american', 'movies'] },
    ],
    [GameType.IMPOSTER]: [
        { label: 'Animals', tags: ['animals', 'nature', 'wildlife'] },
        { label: 'Food',    tags: ['food', 'cooking', 'cuisine'] },
        { label: 'Places',  tags: ['places', 'locations', 'travel'] },
        { label: 'Objects', tags: ['objects', 'things'] },
        { label: 'Jobs',    tags: ['jobs', 'careers', 'work', 'professions'] },
    ],
    [GameType.WOULD_YOU_RATHER]: [
        { label: 'Classic Chaos',      tags: ['classic', 'fun', 'hypothetical', 'chaos'] },
        { label: 'Deep & Revealing',   tags: ['deep', 'vulnerable', 'philosophical', 'real'] },
        { label: 'Travel & Living',    tags: ['travel', 'food', 'living', 'lifestyle'] },
        { label: 'Pop Culture',        tags: ['pop', 'culture', 'movies', 'music', 'tv', 'fandom'] },
        { label: 'Spicy',              tags: ['spicy', 'saucy', 'dating', 'intimate', '18+'] },
    ],
    [GameType.COMPATIBILITY_TEST]: [
        { label: 'Friends', tags: ['friends', 'platonic'] },
        { label: 'Couples', tags: ['couples', 'dating', 'romance', 'partners'] },
        { label: 'Bunny',   tags: ['bunny', 'intimate', 'spicy', '18+', 'saucy'] },
    ],
    [GameType.TABOO]: [
        { label: 'Easy Mode',   tags: ['easy', 'casual', 'simple'] },
        { label: 'Medium Mode', tags: ['medium'] },
        { label: 'Hard Mode',   tags: ['hard', 'challenging'] },
    ],
};

// Returns the labels of any sub-categories whose label or tags match the
// query. Empty query → empty array. Used by Home search to (a) include
// games whose decks match (even if the game-level fields don't), and
// (b) render the "Matches: X, Y" hint on the result card.
export const getSubcategoryMatches = (gameId: GameType, query: string): string[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const subcats = GAME_SUBCATEGORIES[gameId];
    if (!subcats) return [];
    return subcats
        .filter(s => {
            const haystack = [s.label, ...s.tags].join(' ').toLowerCase();
            return haystack.includes(q);
        })
        .map(s => s.label);
};

export const getIcon = (name: string, size: number = 24) => {
    switch (name) {
        case 'drama': return <Sparkles size={size} />;
        case 'ban': return <Ban size={size} />;
        case 'brain': return <Brain size={size} />;
        case 'mic': return <Mic size={size} />;
        case 'camera': return <Camera size={size} />;
        case 'flame': return <Flame size={size} />;
        case 'spy': return <VenetianMask size={size} />;
        case 'split': return <Split size={size} />;
        case 'users': return <Users size={size} />;
        case 'hand': return <Hand size={size} />;
        case 'compass': return <Compass size={size} />;
        case 'check_circle': return <CheckCircle2 size={size} />;
        case 'wine': return <Wine size={size} />;
        case 'heart': return <Heart size={size} />;
        default: return <Sparkles size={size} />;
    }
};

export const CHARADES_CATEGORIES = [
    { id: 'mix_movies', label: '🎬 Movie Mix', color: 'bg-slate-700' },
    { id: 'family_mix', label: '👨‍👩‍👧‍👦 Family Mix', color: 'bg-party-secondary text-slate-900' },
    { id: 'bollywood_movies', label: '🎭 Bollywood', color: 'bg-pink-600' },
    { id: 'hollywood_movies', label: '⭐ Hollywood', color: 'bg-party-accent' }
];

export const TABOO_CATEGORIES = [
    { id: 'easy', label: 'Easy Mode', icon: <Sparkles size={20} />, color: 'bg-green-500', borderColor: 'border-green-500/50 hover:border-green-500' },
    { id: 'medium', label: 'Medium Mode', icon: <Zap size={20} />, color: 'bg-yellow-500', borderColor: 'border-yellow-500/50 hover:border-yellow-500' },
    { id: 'hard', label: 'Hard Mode', icon: <Flame size={20} />, color: 'bg-red-500', borderColor: 'border-red-500/50 hover:border-red-500' }
];

export const MOST_LIKELY_TO_CATEGORIES = [
    { id: 'custom_vibe', label: 'Create Your Vibe', description: 'Personalised cards, powered by AI.', color: 'bg-gradient-to-r from-violet-600 to-fuchsia-500', isCustom: true },
    { id: 'family_friendly', label: 'Family Friendly', description: 'Wholesome & funny. PG.', color: 'bg-emerald-500' },
    { id: 'fun', label: 'Fun & Light', description: 'Witty & light. PG-13.', color: 'bg-blue-500' },
    { id: 'scandalous', label: 'Scandalous', description: 'Gossipy & dramatic.', color: 'bg-pink-600' },
    { id: 'adult', label: 'X-Rated', description: 'High spice. 18+ only.', color: 'bg-red-600' },
    { id: 'chaos', label: 'Chaos Mode', description: 'Absurd & unhinged.', color: 'bg-purple-600' },
    { id: 'bbf', label: 'For BBF', description: 'Decades of love, chaos & secrets.', color: 'bg-purple-600' }
];

export const NEVER_HAVE_I_EVER_CATEGORIES = [
    { id: 'custom_vibe', label: 'Create Your Vibe', description: 'Personalised statements, powered by AI.', color: 'bg-gradient-to-r from-violet-600 to-fuchsia-500', isCustom: true },
    { id: 'rehaan', label: 'Rehaan Answers', description: 'Rehaan in the hot seat.', color: 'bg-cyan-600' },
    { id: 'rehaan_asks', label: 'Rehaan Asks', description: 'Rehaan grills the adults.', color: 'bg-orange-500' },
    { id: 'agra', label: 'Agra Confessions', description: 'Mughal secrets & Agra history.', color: 'bg-amber-600' },
    { id: 'bbf', label: 'For BBF', description: 'For the core family crew.', color: 'bg-purple-600' },
    { id: 'classic', label: 'Classic Party', description: 'Fun, relatable scenarios.', color: 'bg-emerald-500' },
    { id: 'guilty_pleasures', label: 'Guilty Pleasures', description: 'Slightly embarrassing stuff.', color: 'bg-pink-600' }
];

export const IMPOSTER_CATEGORIES = [
    { id: 'animals', label: 'Animals', color: 'bg-green-500', words: ['Lion', 'Penguin', 'Giraffe', 'Elephant', 'Monkey', 'Shark', 'Eagle', 'Whale', 'Kangaroo', 'Zebra', 'Flamingo', 'Cheetah', 'Gorilla', 'Dolphin', 'Crocodile', 'Panda', 'Koala', 'Peacock', 'Jellyfish', 'Chameleon', 'Meerkat', 'Platypus', 'Toucan', 'Otter', 'Armadillo', 'Sloth', 'Narwhal', 'Axolotl', 'Capybara', 'Komodo Dragon', 'Walrus', 'Raccoon', 'Seagull', 'Squirrel', 'Moose', 'Beaver', 'Porcupine', 'Alpaca', 'Hyena', 'Ostrich', 'Fox', 'Camel', 'Snake', 'Toad', 'Bat', 'Owl', 'Pigeon', 'Rat', 'Mole', 'Skunk', 'Tiger', 'Horse', 'Sheep', 'Cow', 'Pig', 'Rooster', 'Duck', 'Tortoise', 'Frog', 'Rhino'] },
    { id: 'food', label: 'Food', color: 'bg-orange-400', words: ['Pizza', 'Sushi', 'Burger', 'Taco', 'Ice Cream', 'Pasta', 'Steak', 'Salad', 'Donut', 'Popcorn', 'Lasagne', 'Curry', 'Cheesecake', 'Waffles', 'Ramen', 'Nachos', 'Croissant', 'Dim Sum', 'BBQ Ribs', 'Tiramisu', 'Falafel', 'Paella', 'Churro', 'Pho', 'Pad Thai', 'Gyoza', 'Hummus', 'Baklava', 'Tagine', 'Ceviche', 'Burrito', 'Pancakes', 'Cupcake', 'Omelette', 'Sandwich', 'Baguette', 'Brownie', 'Smoothie', 'Shawarma', 'Pretzel', 'Spaghetti', 'Kebab', 'Hot Dog', 'Bacon', 'Sausage', 'Biscuit', 'Muffin', 'Pudding', 'Cereal', 'Toast', 'Brie', 'Macaroni', 'Caviar', 'Truffle', 'Eclair', 'Mochi', 'Samosa', 'Ratatouille', 'Gnocchi', 'Fajita'] },
    { id: 'locations', label: 'Places', color: 'bg-blue-500', words: ['School', 'Hospital', 'Airport', 'Library', 'Gym', 'Park', 'Cinema', 'Beach', 'Museum', 'Restaurant', 'Supermarket', 'Stadium', 'Casino', 'Submarine', 'Space Station', 'Lighthouse', 'Ski Resort', 'Pirate Ship', 'Volcano', 'Treehouse', 'Circus', 'Prison', 'Spa', 'Haunted House', 'Aquarium', 'Observatory', 'Igloo', 'Desert Island', 'Sewers', 'Underground Bunker', 'Bakery', 'Bank', 'Bowling Alley', 'Arcade', 'Laundromat', 'Car Wash', 'Farm', 'Orphanage', 'Courthouse', 'Graveyard', 'Post Office', 'Police Station', 'Fire Station', 'Hotel', 'Motel', 'Gas Station', 'Mall', 'Theme Park', 'Zoo', 'Pharmacy', 'Cave', 'Castle', 'Mansion', 'Apartment', 'Tent', 'Cabin', 'Palace', 'Factory', 'Warehouse', 'Office'] },
    { id: 'objects', label: 'Objects', color: 'bg-purple-500', words: ['Phone', 'Laptop', 'Chair', 'Umbrella', 'Clock', 'Camera', 'Guitar', 'Shoe', 'Bicycle', 'Book', 'Telescope', 'Compass', 'Toothbrush', 'Candle', 'Scissors', 'Passport', 'Hammock', 'Perfume', 'Magnifying Glass', 'Suitcase', 'Thermometer', 'Hourglass', 'Padlock', 'Boomerang', 'Kaleidoscope', 'Abacus', 'Megaphone', 'Periscope', 'Bubble Wrap', 'Lava Lamp', 'Keyboard', 'Headphones', 'Backpack', 'Wallet', 'Glasses', 'Keys', 'Matches', 'Sponge', 'Plunger', 'Stapler', 'Towel', 'Blanket', 'Pillow', 'Mirror', 'Comb', 'Brush', 'Soap', 'Shampoo', 'Toilet Paper', 'Trash Can', 'Television', 'Radio', 'Oven', 'Microwave', 'Refrigerator', 'Toaster', 'Blender', 'Kettle', 'Iron', 'Vacuum'] },
    { id: 'jobs', label: 'Jobs', color: 'bg-red-500', words: ['Doctor', 'Teacher', 'Artist', 'Chef', 'Pilot', 'Firefighter', 'Police', 'Actor', 'Scientist', 'Soldier', 'Magician', 'Astronaut', 'Archaeologist', 'Spy', 'Surgeon', 'Lifeguard', 'Architect', 'Sommelier', 'Stuntman', 'Zookeeper', 'Bounty Hunter', 'Ventriloquist', 'Bomb Disposal', 'Cryptographer', 'Beekeeper', 'Ghost Hunter', 'Jockey', 'Taxidermist', 'Mime', 'Rickshaw Driver', 'Mechanic', 'Plumber', 'Electrician', 'Carpenter', 'Janitor', 'Bouncer', 'Lumberjack', 'Meteorologist', 'Judge', 'Politician', 'Dentist', 'Nurse', 'Baker', 'Butcher', 'Tailor', 'Barber', 'Florist', 'Photographer', 'Journalist', 'Librarian', 'Singer', 'Dancer', 'Pianist', 'Drummer', 'Guitarist', 'Comedian', 'Writer', 'Poet', 'Director', 'Producer'] }
];

export const WOULD_YOU_RATHER_CATEGORIES = [
    { id: 'classic_chaos', title: 'Classic Chaos', tagline: 'Absurd hypotheticals & superpowers. Easy laughs.', accentText: 'text-indigo-400', gradient: 'from-indigo-600 to-violet-500', shadow: 'shadow-indigo-900/30', adult: false },
    { id: 'deep_revealing', title: 'Deep & Revealing', tagline: 'Values, regret, legacy. Accidental therapy.', accentText: 'text-violet-400', gradient: 'from-violet-600 to-fuchsia-500', shadow: 'shadow-violet-900/30', adult: false },
    { id: 'travel_living', title: 'Travel & Living', tagline: 'Food, drink, cities, daily-life dilemmas.', accentText: 'text-emerald-400', gradient: 'from-emerald-600 to-teal-500', shadow: 'shadow-emerald-900/30', adult: false },
    { id: 'pop_culture', title: 'Pop Culture & Fandom', tagline: 'Franchises, celebs, music, TV.', accentText: 'text-pink-400', gradient: 'from-pink-600 to-rose-500', shadow: 'shadow-pink-900/30', adult: false },
    { id: 'spicy', title: 'Spicy', tagline: 'Dating, intimacy, taboo. PIN required.', accentText: 'text-rose-400', gradient: 'from-rose-600 to-orange-500', shadow: 'shadow-rose-900/30', adult: true }
];
