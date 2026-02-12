import { GameType, type GameMeta } from './types';

import { Ban, Brain, Mic, Sparkles, Camera, Flame, Zap, Globe, Clapperboard, Film, Plane, VenetianMask, Split } from 'lucide-react';

export const GAMES: GameMeta[] = [
    {
        id: GameType.CHARADES,
        title: "Charades",
        description: "Act out words silently. No speaking allowed!",
        icon: "drama",
        color: "bg-[#EFC050]",
        minPlayers: 4
    },
    {
        id: GameType.TABOO,
        title: "Taboo",
        description: "Describe the word without using the forbidden words.",
        icon: "ban",
        color: "bg-[#F0656D]",
        minPlayers: 4
    },
    {
        id: GameType.TRIVIA,
        title: "Blitz Trivia",
        description: "Fast-paced trivia rounds generated instantly.",
        icon: "brain",
        color: "bg-[#65B7F0]",
        minPlayers: 2
    },
    {
        id: GameType.ICEBREAKERS,
        title: "Icebreakers",
        description: "Pass the phone. Truths, dares, and deep questions.",
        icon: "mic",
        color: "bg-[#65F096]",
        minPlayers: 2
    },
    {
        id: GameType.SIMPLE_SELFIE,
        title: "Simple Selfie",
        description: "Snap a pic. Get Roasted or Toasted by AI.",
        icon: "camera",
        color: "bg-[#A78BFA]",
        minPlayers: 1
    },
    {
        id: GameType.ROAST,
        title: "Roast Me",
        description: "Upload a pic and let AI roast (or toast) you!",
        icon: "flame",
        color: "bg-orange-600",
        minPlayers: 1
    },
    {
        id: GameType.IMPOSTER,
        title: "Imposter",
        description: "Find the fake! One of you doesn't know the word.",
        icon: "spy",
        color: "bg-red-500",
        minPlayers: 3
    },
    {
        id: GameType.WOULD_YOU_RATHER,
        title: "Would You Rather",
        description: "This or That? Make the tough choice!",
        icon: "split",
        color: "bg-indigo-500",
        minPlayers: 1
    }
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
        default: return <Sparkles size={size} />;
    }
};

export const CHARADES_CATEGORIES = [
    { id: 'hollywood_movies', label: 'Hollywood', color: 'bg-party-accent' },
    { id: 'bollywood_movies', label: 'Bollywood', color: 'bg-pink-600' },
    { id: 'mix_movies', label: 'All / Mix', color: 'bg-slate-700' }
];

export const TABOO_CATEGORIES = [
    { id: 'easy', label: 'Easy Mode', icon: <Sparkles size={20} />, color: 'bg-green-500' },
    { id: 'medium', label: 'Medium Mode', icon: <Zap size={20} />, color: 'bg-yellow-500' },
    { id: 'hard', label: 'Hard Mode', icon: <Flame size={20} />, color: 'bg-red-500' }
];

export const TRIVIA_CATEGORIES = [
    { id: 'Hollywood', label: 'Hollywood', icon: <Film size={24} />, color: 'text-purple-400' },
    { id: 'Bollywood', label: 'Bollywood', icon: <Film size={24} />, color: 'text-pink-400' },
    { id: 'Travel', label: 'Travel', icon: <Plane size={24} />, color: 'text-blue-400' },
    { id: 'General Knowledge', label: 'General Knowledge', icon: <Globe size={24} />, color: 'text-emerald-400' },
    { id: 'mix', label: 'All / Mix', icon: <Sparkles size={24} />, color: 'text-white' }
];

export const IMPOSTER_CATEGORIES = [
    { id: 'animals', label: 'Animals', color: 'bg-green-500', words: ['Lion', 'Penguin', 'Giraffe', 'Elephant', 'Monkey', 'Shark', 'Eagle', 'Whale', 'Kangaroo', 'Zebra'] },
    { id: 'food', label: 'Food', color: 'bg-orange-400', words: ['Pizza', 'Sushi', 'Burger', 'Taco', 'Ice Cream', 'Pasta', 'Steak', 'Salad', 'Donut', 'Popcorn'] },
    { id: 'locations', label: 'Places', color: 'bg-blue-500', words: ['School', 'Hospital', 'Airport', 'Library', 'Gym', 'Park', 'Cinema', 'Beach', 'Museum', 'Restaurant'] },
    { id: 'objects', label: 'Objects', color: 'bg-purple-500', words: ['Phone', 'Laptop', 'Chair', 'Umbrella', 'Clock', 'Camera', 'Guitar', 'Shoe', 'Bicycle', 'Book'] },
    { id: 'jobs', label: 'Jobs', color: 'bg-red-500', words: ['Doctor', 'Teacher', 'Artist', 'Chef', 'Pilot', 'Firefighter', 'Police', 'Actor', 'Scientist', 'Soldier'] }
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
