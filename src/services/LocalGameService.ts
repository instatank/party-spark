import gamesDataRaw from '../data/games_data.json';
const gamesData = gamesDataRaw as any;

export const getLocalCharadesWords = (categoryId: string, count: number = 20): string[] => {
    try {
        const categoryCallback = (cat: any) => cat.id === categoryId;
        const category = gamesData.games.charades.categories.find(categoryCallback);

        if (!category || !category.items) {
            // Handle mix case for Charades if needed, though usually explicit in data
            if (categoryId === 'mix_movies') {
                const all = gamesData.games.charades.categories
                    .filter((c: any) => c.id !== 'mix_movies')
                    .flatMap((c: any) => c.items);
                const shuffled = [...all].sort(() => 0.5 - Math.random());
                return shuffled.slice(0, count);
            }
            console.warn(`Category ${categoryId} not found in local data.`);
            return [];
        }

        // Shuffle and slice
        const shuffled = [...category.items].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    } catch (e) {
        console.error("Error reading local game data", e);
        return [];
    }
};

export const getLocalTabooCards = (categoryId: string, count: number = 20): any[] => {
    try {
        if (categoryId === 'mix_taboo') {
            const allCards = gamesData.games.taboo.categories
                .filter((c: any) => c.id !== 'mix_taboo')
                .flatMap((c: any) => c.items);

            const shuffled = [...allCards].sort(() => 0.5 - Math.random());
            return shuffled.slice(0, count);
        }

        const category = gamesData.games.taboo.categories.find((c: any) => c.id === categoryId);

        if (!category || !category.items) {
            console.warn(`Taboo Category ${categoryId} not found locally.`);
            return [];
        }

        const shuffled = [...category.items].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    } catch (e) {
        console.error("Error reading local taboo data", e);
        return [];
    }
};
