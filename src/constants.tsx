import { GameType, type GameMeta } from './types';

import { Ban, Brain, Mic, Sparkles, Camera, Flame, Zap, Globe, Film, Plane, VenetianMask, Split, Users, Hand, Compass, CheckCircle2, Wine, Heart } from 'lucide-react';

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
    { id: 'custom_vibe', label: '✨ Create Your Vibe', description: 'AI-powered cards tailored to YOUR group. Describe who you are!', color: 'bg-gradient-to-r from-violet-600 to-fuchsia-500', isCustom: true },
    { id: 'family_friendly', label: 'Family Friendly', description: 'Wholesome, funny memories. PG.', color: 'bg-emerald-500' },
    { id: 'fun', label: 'Fun & Light', description: 'Witty, PG-13 scenarios.', color: 'bg-blue-500' },
    { id: 'scandalous', label: 'Scandalous', description: 'Spill the tea. Gossipy & dramatic.', color: 'bg-pink-600' },
    { id: 'adult', label: 'X-Rated / Saucy', description: 'Spice level: High. 18+ only.', color: 'bg-red-600' },
    { id: 'chaos', label: 'Chaos Mode', description: 'Absurd, surreal, and unhinged.', color: 'bg-purple-600' },
    { id: 'bbf', label: 'For BBF 👨‍👩‍👧‍👦', description: 'Decades of love, chaos & secrets. You know who.', color: 'bg-purple-600' }
];

export const NEVER_HAVE_I_EVER_CATEGORIES = [
    { id: 'rehaan', label: 'Rehaan Answers 🤔', description: 'Rehaan in the hot seat! Being the young London cousin.', color: 'bg-cyan-600' },
    { id: 'rehaan_asks', label: 'Rehaan Asks 😈', description: 'Rehaan interrogates the adults. Let the chaos begin!', color: 'bg-orange-500' },
    { id: 'agra', label: 'Agra Confessions 🕌', description: 'Mughal secrets & family history in Agra.', color: 'bg-amber-600' },
    { id: 'bbf', label: 'For BBF', description: 'For the incredibly close-knit core family members.', color: 'bg-purple-600' },
    { id: 'classic', label: 'Classic Party', description: 'Fun, relatable scenarios.', color: 'bg-emerald-500' },
    { id: 'guilty_pleasures', label: 'Guilty Pleasures', description: 'Slightly embarrassing acts we all do.', color: 'bg-pink-600' }
];

export const TRIVIA_CATEGORIES = [
    { id: 'agra_trip', label: 'Taj & Mughals 🕌', icon: <Compass size={24} />, color: 'text-amber-400' },
    { id: 'Hollywood', label: 'Hollywood', icon: <Film size={24} />, color: 'text-purple-400' },
    { id: 'Bollywood', label: 'Bollywood', icon: <Film size={24} />, color: 'text-pink-400' },
    { id: 'Travel', label: 'Travel', icon: <Plane size={24} />, color: 'text-blue-400' },
    { id: 'General Knowledge', label: 'General Knowledge', icon: <Globe size={24} />, color: 'text-emerald-400' },
    { id: 'mix', label: 'All / Mix', icon: <Sparkles size={24} />, color: 'text-white' }
];

export const IMPOSTER_CATEGORIES = [
    { id: 'animals', label: 'Animals', color: 'bg-green-500', words: ['Lion', 'Penguin', 'Giraffe', 'Elephant', 'Monkey', 'Shark', 'Eagle', 'Whale', 'Kangaroo', 'Zebra', 'Flamingo', 'Cheetah', 'Gorilla', 'Dolphin', 'Crocodile', 'Panda', 'Koala', 'Peacock', 'Jellyfish', 'Chameleon', 'Meerkat', 'Platypus', 'Toucan', 'Otter', 'Armadillo', 'Sloth', 'Narwhal', 'Axolotl', 'Capybara', 'Komodo Dragon', 'Walrus', 'Raccoon', 'Seagull', 'Squirrel', 'Moose', 'Beaver', 'Porcupine', 'Alpaca', 'Hyena', 'Ostrich', 'Fox', 'Camel', 'Snake', 'Toad', 'Bat', 'Owl', 'Pigeon', 'Rat', 'Mole', 'Skunk', 'Tiger', 'Horse', 'Sheep', 'Cow', 'Pig', 'Rooster', 'Duck', 'Tortoise', 'Frog', 'Rhino'] },
    { id: 'food', label: 'Food', color: 'bg-orange-400', words: ['Pizza', 'Sushi', 'Burger', 'Taco', 'Ice Cream', 'Pasta', 'Steak', 'Salad', 'Donut', 'Popcorn', 'Lasagne', 'Curry', 'Cheesecake', 'Waffles', 'Ramen', 'Nachos', 'Croissant', 'Dim Sum', 'BBQ Ribs', 'Tiramisu', 'Falafel', 'Paella', 'Churro', 'Pho', 'Pad Thai', 'Gyoza', 'Hummus', 'Baklava', 'Tagine', 'Ceviche', 'Burrito', 'Pancakes', 'Cupcake', 'Omelette', 'Sandwich', 'Baguette', 'Brownie', 'Smoothie', 'Shawarma', 'Pretzel', 'Spaghetti', 'Kebab', 'Hot Dog', 'Bacon', 'Sausage', 'Biscuit', 'Muffin', 'Pudding', 'Cereal', 'Toast', 'Brie', 'Macaroni', 'Caviar', 'Truffle', 'Eclair', 'Mochi', 'Samosa', 'Ratatouille', 'Gnocchi', 'Fajita'] },
    { id: 'locations', label: 'Places', color: 'bg-blue-500', words: ['School', 'Hospital', 'Airport', 'Library', 'Gym', 'Park', 'Cinema', 'Beach', 'Museum', 'Restaurant', 'Supermarket', 'Stadium', 'Casino', 'Submarine', 'Space Station', 'Lighthouse', 'Ski Resort', 'Pirate Ship', 'Volcano', 'Treehouse', 'Circus', 'Prison', 'Spa', 'Haunted House', 'Aquarium', 'Observatory', 'Igloo', 'Desert Island', 'Sewers', 'Underground Bunker', 'Bakery', 'Bank', 'Bowling Alley', 'Arcade', 'Laundromat', 'Car Wash', 'Farm', 'Orphanage', 'Courthouse', 'Graveyard', 'Post Office', 'Police Station', 'Fire Station', 'Hotel', 'Motel', 'Gas Station', 'Mall', 'Theme Park', 'Zoo', 'Pharmacy', 'Cave', 'Castle', 'Mansion', 'Apartment', 'Tent', 'Cabin', 'Palace', 'Factory', 'Warehouse', 'Office'] },
    { id: 'objects', label: 'Objects', color: 'bg-purple-500', words: ['Phone', 'Laptop', 'Chair', 'Umbrella', 'Clock', 'Camera', 'Guitar', 'Shoe', 'Bicycle', 'Book', 'Telescope', 'Compass', 'Toothbrush', 'Candle', 'Scissors', 'Passport', 'Hammock', 'Perfume', 'Magnifying Glass', 'Suitcase', 'Thermometer', 'Hourglass', 'Padlock', 'Boomerang', 'Kaleidoscope', 'Abacus', 'Megaphone', 'Periscope', 'Bubble Wrap', 'Lava Lamp', 'Keyboard', 'Headphones', 'Backpack', 'Wallet', 'Glasses', 'Keys', 'Matches', 'Sponge', 'Plunger', 'Stapler', 'Towel', 'Blanket', 'Pillow', 'Mirror', 'Comb', 'Brush', 'Soap', 'Shampoo', 'Toilet Paper', 'Trash Can', 'Television', 'Radio', 'Oven', 'Microwave', 'Refrigerator', 'Toaster', 'Blender', 'Kettle', 'Iron', 'Vacuum'] },
    { id: 'jobs', label: 'Jobs', color: 'bg-red-500', words: ['Doctor', 'Teacher', 'Artist', 'Chef', 'Pilot', 'Firefighter', 'Police', 'Actor', 'Scientist', 'Soldier', 'Magician', 'Astronaut', 'Archaeologist', 'Spy', 'Surgeon', 'Lifeguard', 'Architect', 'Sommelier', 'Stuntman', 'Zookeeper', 'Bounty Hunter', 'Ventriloquist', 'Bomb Disposal', 'Cryptographer', 'Beekeeper', 'Ghost Hunter', 'Jockey', 'Taxidermist', 'Mime', 'Rickshaw Driver', 'Mechanic', 'Plumber', 'Electrician', 'Carpenter', 'Janitor', 'Bouncer', 'Lumberjack', 'Meteorologist', 'Judge', 'Politician', 'Dentist', 'Nurse', 'Baker', 'Butcher', 'Tailor', 'Barber', 'Florist', 'Photographer', 'Journalist', 'Librarian', 'Singer', 'Dancer', 'Pianist', 'Drummer', 'Guitarist', 'Comedian', 'Writer', 'Poet', 'Director', 'Producer'] }
];

export const WOULD_YOU_RATHER_QUESTIONS = [
    { id: '1', optionA: "Be able to fly", optionB: "Be able to turn invisible", category: "Superpower" },
    { id: '2', optionA: "Always have to say everything on your mind", optionB: "Never be able to speak again", category: "Social" },
    { id: '3', optionA: "Live in a treehouse", optionB: "Live in a cave", category: "Lifestyle" },
    { id: '4', optionA: "Fight 1 horse-sized duck", optionB: "Fight 100 duck-sized horses", category: "Absurd" },
    { id: '5', optionA: "Have unlimited free food", optionB: "Have unlimited free travel", category: "Lifestyle" },
    { id: '6', optionA: "Be a famous movie star", optionB: "Be a brilliant scientist", category: "Career" },
    { id: '7', optionA: "Never have to sleep", optionB: "Never have to eat", category: "Biological" },
    { id: '8', optionA: "Have a pause button for your life", optionB: "Have a rewind button for your life", category: "Superpower" },
    { id: '9', optionA: "Be the smartest person in the world", optionB: "Be the richest person in the world", category: "Attribute" },
    { id: '10', optionA: "Explore space", optionB: "Explore the deep ocean", category: "Adventure" }
];
