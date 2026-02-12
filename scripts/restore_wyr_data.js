
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, '../src/data/would_you_rather.json');

const CLASSIC_QUESTIONS = [
    {
        optionA: "Fight 100 duck-sized horses",
        optionB: "Fight 1 horse-sized duck",
        category: "Absurd",
        stats: { a: 45, b: 55 },
        analysisA: "You think quantity is easier than quality. You're wrong. You're just going to get nibbled to death.",
        analysisB: "You prefer a boss battle. You have main character energy, but you might underestimate the power of a giant beak."
    },
    {
        optionA: "Always say everything on your mind",
        optionB: "Never be able to speak again",
        category: "Social",
        stats: { a: 40, b: 60 },
        analysisA: "You're a chaos agent. You value truth over tact and probably have zero secrets.",
        analysisB: "You're a secretive observer. You'd rather suffer in silence than accidentally reveal your dark thoughts."
    },
    {
        optionA: "Have pause buttons for your life",
        optionB: "Have rewind buttons for your life",
        category: "Superpowers",
        stats: { a: 30, b: 70 },
        analysisA: "You're overwhelmed. You just need a break. Procrastinator energy.",
        analysisB: "You live in the past. You regret things easily and want a do-over. Perfectionist."
    },
    {
        optionA: "Be invisible for a day",
        optionB: "Can fly for a day",
        category: "Superpowers",
        stats: { a: 55, b: 45 },
        analysisA: "You're nosy. You want to snoop. Trust issues detected.",
        analysisB: "You crave freedom. You feel trapped and just want to escape it all."
    },
    {
        optionA: "Lose all your money and valuables",
        optionB: "Lose all the pictures you have ever taken",
        category: "Deep",
        stats: { a: 20, b: 80 },
        analysisA: "You're sentimental. You value memories over material wealth. Or you're just broke anyway.",
        analysisB: "You're a materialist. You'd rather buy new memories than keep the old ones."
    },
    {
        optionA: "Be famous when you are alive and forgotten when you die",
        optionB: "Go down in history when you die but be unknown while alive",
        category: "Ego",
        stats: { a: 60, b: 40 },
        analysisA: "You thrive on validation. You need the likes *now*. Instant gratification junkie.",
        analysisB: "You're an artist. You care about legacy more than comfort. Or you're just a martyr."
    },
    {
        optionA: "Live in a house that is always too hot",
        optionB: "Live in a house that is always too cold",
        category: "Comfort",
        stats: { a: 25, b: 75 },
        analysisA: "You're a lizard. You like to bake.",
        analysisB: "You can always put on more layers. Practical thinker."
    },
    {
        optionA: "Explore space",
        optionB: "Explore the ocean",
        category: "Adventure",
        stats: { a: 65, b: 35 },
        analysisA: "You look up. You're a dreamer, an optimist, maybe a bit flighty.",
        analysisB: "You look down. You're grounded, curious about the depths, maybe a bit dark."
    },
    {
        optionA: "Be able to talk with the animals",
        optionB: "Speak all foreign languages",
        category: "Superpowers",
        stats: { a: 50, b: 50 },
        analysisA: "You prefer pets to people. Socially awkward but pure heart.",
        analysisB: "You want to connect with humans. Or just eavesdrop on tourists."
    },
    {
        optionA: "Have a rewind button",
        optionB: "Have a pause button",
        category: "Time",
        stats: { a: 68, b: 32 },
        analysisA: "Regret guides you.",
        analysisB: "Stress guides you."
    },
    {
        optionA: "Be Batman",
        optionB: "Be Iron Man",
        category: "Fandom",
        stats: { a: 45, b: 55 },
        analysisA: "You're brooding and edgy. You think trauma makes you interesting.",
        analysisB: "You're flashy and arrogant. You think money solves everything."
    },
    {
        optionA: "Give up social media forever",
        optionB: "Give up movies and TV forever",
        category: "Lifestyle",
        stats: { a: 30, b: 70 },
        analysisA: "You're addicted to the scroll. You need validation.",
        analysisB: "You value connection over content. Or you just really like memes."
    },
    {
        optionA: "Be a reverse centaur (human legs, horse top)",
        optionB: "Be a standard centaur (horse legs, human top)",
        category: "Absurd",
        stats: { a: 10, b: 90 },
        analysisA: "You're a monster. Why would you choose this? Pure chaos.",
        analysisB: "You want the speed but keep the brain. Logical choice."
    },
    {
        optionA: "Sneeze every time you hide",
        optionB: "Laugh every time you lie",
        category: "Inconvenience",
        stats: { a: 40, b: 60 },
        analysisA: "You're terrible at stealth games.",
        analysisB: "You're a terrible liar. But at least you're jolly."
    },
    {
        optionA: "See 10 minutes into the future",
        optionB: "See 100 years into the future",
        category: "Superpowers",
        stats: { a: 60, b: 40 },
        analysisA: "You're anxious. You want to control the immediate outcome.",
        analysisB: "You're curious about the big picture. Or you just want to know if we survive."
    },
    {
        optionA: "Have unlimited free food",
        optionB: "Have unlimited free travel",
        category: "Lifestyle",
        stats: { a: 40, b: 60 },
        analysisA: "You're a homebody. Comfort food is your love language.",
        analysisB: "You're an explorer. Experiences over calories."
    },
    {
        optionA: "Be the smartest person in the room",
        optionB: "Be the funniest person in the room",
        category: "Social",
        stats: { a: 35, b: 65 },
        analysisA: "You need to be right. Intellectual vanity.",
        analysisB: "You need to be liked. Social butterfly."
    },
    {
        optionA: "Wear a clown wig every day",
        optionB: "Wear clown shoes every day",
        category: "Absurd",
        stats: { a: 50, b: 50 },
        analysisA: "You want people to look at your face. Attention seeker.",
        analysisB: "You hope people don't look down. Shuffler."
    },
    {
        optionA: "Accidentally send a spicy text to your boss",
        optionB: "Accidentally send a mean text about your mom to your mom",
        category: "Cringe",
        stats: { a: 70, b: 30 },
        analysisA: "Career suicide is better than family emotional damage.",
        analysisB: "You're heartless. Or you just really hate your job."
    },
    {
        optionA: "Have to read every Terms of Service",
        optionB: "Have to create a password with a special character, number, and uppercase letter for every thought you have",
        category: "Tech",
        stats: { a: 40, b: 60 },
        analysisA: "You're a masochist for boredom.",
        analysisB: "You're mentally exhausted just thinking about it."
    },
    {
        optionA: "Be an unknown superhero",
        optionB: "Be a famous villain",
        category: "Moral",
        stats: { a: 65, b: 35 },
        analysisA: "Altruistic. You do good for good's sake.",
        analysisB: "You want the credit. You'd burn the world to be known."
    },
    {
        optionA: "Live without music",
        optionB: "Live without TV",
        category: "Lifestyle",
        stats: { a: 20, b: 80 },
        analysisA: "You have no soul.",
        analysisB: "You can make your own entertainment."
    },
    {
        optionA: "Find true love",
        optionB: "Find a suitcase with 5 million dollars",
        category: "Love vs Money",
        stats: { a: 45, b: 55 },
        analysisA: "You're a hopeless romantic.",
        analysisB: "You're a realist. You can buy a lot of dates with 5 mil."
    },
    {
        optionA: "Only communicate with emojis",
        optionB: "Only communicate in rhymes",
        category: "Social",
        stats: { a: 55, b: 45 },
        analysisA: "You're basic. 🍆🍑",
        analysisB: "You're a poet / and you know it."
    }
];

// Add IDs
const dataWithIds = CLASSIC_QUESTIONS.map((item, index) => ({
    id: `classic_${index}`,
    ...item
}));

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dataWithIds, null, 2));
console.log(`Restored ${dataWithIds.length} classic questions to ${OUTPUT_FILE}`);
