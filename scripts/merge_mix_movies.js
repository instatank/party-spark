const fs = require('fs');

const filepath = 'src/data/games_data.json';
const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));

const charades = data.games.charades.categories;
const hollywood = charades.find(c => c.id === 'hollywood_movies');
const bollywood = charades.find(c => c.id === 'bollywood_movies');
const mix = charades.find(c => c.id === 'mix_movies');

if (hollywood && bollywood && mix) {
    const newMixItems = [...hollywood.items, ...bollywood.items];
    
    // add any existing mix items that are distinct
    for (const item of mix.items) {
      if (!newMixItems.includes(item)) {
         newMixItems.push(item);
      }
    }

    mix.items = newMixItems;
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log('Successfully updated mix_movies. New count: ' + mix.items.length);
} else {
    console.log('Error finding categories');
}
