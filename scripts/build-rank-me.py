"""Builds and validates the PartySpark 'Rank Me' dataset -> src/data/rank_me.json

The founder's authoring script, committed so the deck can be regenerated
rather than hand-edited:  python3 scripts/build-rank-me.py
"""
import json, sys, itertools, re, os
from collections import Counter

T, F = True, False

DECKS = [
    {"id": "reallife", "name": "Real Life", "emoji": "☀️", "spicy": False,
     "description": "Food, habits, travel, screens and pet peeves. How you actually live."},
    {"id": "whatif", "name": "What If", "emoji": "✨", "spicy": False,
     "description": "Superpowers, time machines and wild hypotheticals."},
    {"id": "afterdark", "name": "After Dark", "emoji": "🌙", "spicy": True,
     "description": "Dating, drinks and awkward moments. Adults only."},
]
# Sub-topics are kept as a hidden 'theme' tag so the shuffle can avoid
# serving several same-theme cards in a row. Not shown to players.
THEME_TO_DECK = {"food": "reallife", "life": "reallife", "peeves": "reallife",
                 "downtime": "reallife", "whatif": "whatif", "afterdark": "afterdark"}
# Cards written under a real-life theme but framed as imagined situations
MOVE_TO_WHATIF = {"One cuisine for a whole year", "Desert-island fruit", "Fire! Everyone's safe. Grab:"}

# (prompt, top label, bottom label, [5 items], desi flavour)
CARDS = {
"food": [
    ("Would miss most if it vanished", "Miss most", "Wouldn't notice", ["Cheese", "Chocolate", "Coffee", "Bread", "Spicy food"], F),
    ("Your 2am craving", "Craving it", "Hard pass", ["Instant noodles", "Ice cream", "Leftover pizza", "Chips", "Butter toast"], F),
    ("Dream breakfast", "Dream", "Skip it", ["Aloo paratha", "Pancakes", "Eggs any style", "Poha", "Cereal"], T),
    ("Best pizza topping", "Best", "Worst", ["Pineapple", "Mushrooms", "Extra cheese", "Olives", "Jalapeños"], F),
    ("Hot drink of choice", "Always", "Never", ["Masala chai", "Filter coffee", "Hot chocolate", "Green tea", "Black coffee"], T),
    ("Street food champion", "Champion", "Last place", ["Golgappe", "Momos", "Chole bhature", "Pav bhaji", "Aloo tikki"], T),
    ("One cuisine for a whole year", "Easy yes", "Nightmare", ["Italian", "Chinese", "Mexican", "Japanese", "Thai"], F),
    ("Dessert that wins", "Winner", "Loser", ["Gulab jamun", "Brownie", "Cheesecake", "Ice cream", "Rasmalai"], T),
    ("Most overrated", "Most overrated", "Worth the hype", ["Avocado toast", "Sushi", "Truffle fries", "Bubble tea", "Kale"], F),
    ("Fast food run", "Take me there", "Only if desperate", ["McDonald's", "KFC", "Domino's", "Subway", "Burger King"], F),
    ("Fries dip of choice", "Best dip", "Worst dip", ["Ketchup", "Mayo", "Mustard", "Hot sauce", "Cheese sauce"], F),
    ("What you'd cook for guests", "Nail it", "Disaster", ["Pasta", "Omelette", "Biryani", "Grilled sandwich", "Fried rice"], T),
    ("Texture you can't stand", "Can't stand", "Don't mind", ["Soggy fries", "Slimy okra", "Lumpy porridge", "Chewy squid", "Mushy pasta"], F),
    ("Perfect movie snack", "Perfect", "Pointless", ["Popcorn", "Nachos", "Fries", "Chocolate", "Hot dog"], F),
    ("Desert-island fruit", "Take it", "Leave it", ["Grapes", "Watermelon", "Strawberry", "Banana", "Pineapple"], F),
    ("Comfort food after a bad day", "Pure comfort", "Won't help", ["Rajma chawal", "Mac and cheese", "Instant noodles", "Khichdi", "Pizza delivery"], T),
    ("Chips flavour", "Best", "Worst", ["Classic salted", "Cream & onion", "Magic Masala", "Sour cream", "Peri peri"], T),
    ("Weird combo you'd try", "Try first", "Never", ["Fries in ice cream", "Chilli chocolate", "Achaar sandwich", "Watermelon with salt", "Maggi with ketchup"], T),
    ("Buffet: what hits your plate", "First", "Last", ["Salad", "Starters", "Main course", "Desserts", "Live counter"], F),
    ("Kitchen job you'd dodge", "Dodge most", "Don't mind", ["Washing dishes", "Chopping onions", "Cleaning the fridge", "Grocery run", "Cooking dinner"], F),
],
"life": [
    ("Give up first for a month", "Give up first", "Never", ["Chai or coffee", "Sugar", "Social media", "Hot showers", "Takeout"], F),
    ("First thing after waking up", "First", "Last", ["Check phone", "Chai or coffee", "Shower", "Workout", "Hit snooze"], F),
    ("Chore you hate most", "Hate most", "Weirdly enjoy", ["Laundry", "Dishes", "Ironing", "Cleaning bathroom", "Making the bed"], F),
    ("Biggest time-waster", "Wastes most", "Wastes least", ["Instagram", "YouTube", "WhatsApp groups", "Netflix", "Online shopping"], F),
    ("Can't live without at home", "Can't live without", "Could manage", ["AC", "WiFi", "Hot water", "Fridge", "Washing machine"], F),
    ("Perfect Sunday", "Perfect", "Not for me", ["Sleeping in", "Brunch with friends", "Family lunch", "Binge-watching", "Gym or sport"], F),
    ("Fire! Everyone's safe. Grab:", "Grab first", "Let it burn", ["Phone", "Laptop", "Photo albums", "Passport", "Jewellery"], F),
    ("Best part of school", "Loved it", "Meh", ["Sports day", "Annual function", "Canteen", "Field trips", "Last-bench chaos"], T),
    ("Most nostalgic snack", "Pure nostalgia", "Never cared", ["Parle-G", "Kurkure", "Cadbury Gems", "Hajmola", "Poppins"], T),
    ("Best childhood game", "Best", "Worst", ["Hide and seek", "Gully cricket", "Video games", "Carrom", "Chor police"], T),
    ("Most useful adult skill", "Most useful", "Overrated", ["Cooking", "Driving", "Budgeting", "Saying no", "Fixing things"], F),
    ("Where your money goes", "Splurge most", "Spend least", ["Gadgets", "Clothes", "Travel", "Eating out", "Home decor"], F),
    ("Worst way to be woken up", "Worst", "Not bad", ["Alarm clock", "Mom yelling", "Blinding sunlight", "Doorbell", "Pet on your face"], F),
    ("How well does it describe you?", "Most me", "Least me", ["Planner", "Procrastinator", "Overthinker", "Chill", "Perfectionist"], F),
    ("How well does it describe you?", "Most me", "Least me", ["Foodie", "Homebody", "Party animal", "Workaholic", "Gym freak"], F),
    ("Most stressful", "Most stressful", "Easy", ["Moving house", "Job interview", "Planning a wedding", "Filing taxes", "Hosting guests"], F),
    ("Best gift to get", "Love it", "Meh", ["Cash", "New gadget", "Handwritten letter", "An experience", "Something handmade"], F),
    ("Surprise day off", "Do this", "Not this", ["Sleep all day", "Meet friends", "Catch up on chores", "Solo movie", "Road trip"], F),
    ("Where you'd rather live", "Dream", "No way", ["Big city", "Hill station", "Beach town", "Farmhouse", "Abroad"], F),
    ("Go-to way to unwind", "Always works", "Never works", ["Music", "Long shower", "Power nap", "Evening walk", "Scrolling"], F),
],
"whatif": [
    ("Pick a superpower", "Want most", "Keep it", ["Invisibility", "Flying", "Mind reading", "Teleporting", "Time travel"], F),
    ("Era you'd live in", "Take me there", "No thanks", ["The 1960s", "The 1980s", "The 1990s", "Today", "The year 2080"], F),
    ("Won ₹10 crore. First move?", "First", "Last", ["Buy a house", "Travel the world", "Invest it all", "Quit your job", "Spoil the family"], T),
    ("Famous job for a day", "Dream day", "Pass", ["Movie star", "Cricketer", "Astronaut", "Rock star", "Top chef"], F),
    ("Animal for a day", "Be this", "Not this", ["Cat", "Eagle", "Dolphin", "Dog", "Lion"], F),
    ("Stranded on an island, you bring", "Bring first", "Leave behind", ["Knife", "Lighter", "Fishing net", "Hammock", "Endless snacks"], F),
    ("Zombie apocalypse teammate", "Pick first", "Pick last", ["Doctor", "Army veteran", "Mechanic", "Farmer", "Your mom"], F),
    ("Instant skill, no practice", "Want most", "Don't need", ["Every language", "Any instrument", "Chef-level cooking", "Coding", "Pro dancing"], F),
    ("Give up forever", "Give up first", "Never", ["Music", "Movies", "Sweets", "Travel", "Social media"], F),
    ("Survive a year without", "Easy", "Impossible", ["Internet", "Your car", "Eating out", "New clothes", "AC"], F),
    ("Time machine: first stop", "Go first", "Go last", ["Dinosaur era", "Ancient Egypt", "Mughal court", "Your own childhood", "500 years ahead"], T),
    ("World you'd live in", "Move in", "Stay away", ["Magic school", "Space colony", "Superhero city", "Medieval kingdom", "Underwater city"], F),
    ("Be famous for", "Dream", "Nightmare", ["Acting", "Sports", "Singing", "Writing", "Going viral"], F),
    ("Send your clone to", "Send first", "Go myself", ["Work", "Chores", "The gym", "Family functions", "Paperwork"], F),
    ("Pet, if anything were legal", "Want it", "No thanks", ["Tiger cub", "Penguin", "Monkey", "Owl", "Red panda"], F),
    ("Unlimited free", "Want most", "Don't need", ["Flights", "Food", "Clothes", "Books", "Massages"], F),
    ("Curse or gift?", "Biggest curse", "Best gift", ["Hearing every thought", "Never forgetting", "Can't tell a lie", "Never needing sleep", "Seeing the future"], F),
    ("Swap lives for a week", "Swap now", "No way", ["A monk", "A billionaire", "A rock star", "A farmer", "An astronaut"], F),
    ("Move abroad to", "Pack my bags", "Never", ["USA", "UK", "Dubai", "Japan", "Australia"], F),
    ("Dream house must have", "Must have", "Don't need", ["Pool", "Home theatre", "Library", "Huge kitchen", "Rooftop garden"], F),
],
"peeves": [
    ("Everyday annoyances", "Most annoying", "Can live with it", ["Loud chewing", "Late replies", "Voice notes", "People running late", "Slow walkers"], F),
    ("On a flight", "Most annoying", "Can live with it", ["Seat kickers", "Armrest hogs", "Crying babies", "Clapping on landing", "Full recliners"], F),
    ("On the road", "Most annoying", "Can live with it", ["Nonstop honking", "Lane cutters", "Wrong-side drivers", "High beams", "Bikes on footpaths"], T),
    ("Texting sins", "Worst sin", "Forgivable", ['"K" replies', "Seen, no reply", "Paragraph texts", "Too many emojis", "Typing... then nothing"], F),
    ("Social sins", "Worst sin", "Forgivable", ["Spoilers", "Humblebragging", "Oversharing", "Name-dropping", "Interrupting"], F),
    ("Work sins", "Worst sin", "Forgivable", ["Reply-all chains", "Could've been an email", "Late-night calls", "Micromanaging", "Weekend emails"], F),
    ("House guests who...", "Most annoying", "Can live with it", ["Show up unannounced", "Overstay", "Wear shoes inside", "Judge your home", "Stay glued to phone"], F),
    ("Eating out", "Most annoying", "Can live with it", ["Slow service", "Wrong order", "Loud tables", "Bill-splitting maths", "Hidden service charge"], F),
    ("Relatives' questions", "Most annoying", "Can dodge it", ['"When\'s the wedding?"', '"Salary kitna hai?"', '"Why not a doctor?"', '"Any good news?"', '"Sharma ji\'s son..."'], T),
    ("At the movies", "Most annoying", "Can live with it", ["Phone screens", "Talkers", "Late arrivals", "Loud crunchers", "Kids kicking seats"], F),
    ("At home", "Most annoying", "Can live with it", ["Wet towel on bed", "Dishes in the sink", "Cap off toothpaste", "Lights left on", "Empty bottle in fridge"], F),
    ("Phone etiquette fails", "Most annoying", "Can live with it", ["Speakerphone calls", "Reels on speaker", "Good morning forwards", "Unmuted group calls", "Autoplay videos"], T),
    ("Internet evils", "Most annoying", "Can live with it", ["Pop-up ads", "Cookie banners", "Captchas", "Paywalls", '"Download our app"'], F),
    ("Grammar crimes", "Worst crime", "Forgivable", ["Your vs you're", "Its vs it's", '"Could of"', "RANDOM CAPS", "no punctuation"], F),
    ("At the gym", "Most annoying", "Can live with it", ["Weight hoggers", "Mirror selfies", "Loud grunters", "Not re-racking", "Sweaty benches"], F),
    ("Shopping", "Most annoying", "Can live with it", ["Long queues", "Pushy salespeople", "No trial rooms", "Out of stock", '"Change nahi hai"'], T),
    ("Party guests who...", "Most annoying", "Can live with it", ["Scroll their phone", "Get loud drunk", "Hijack the music", "Leave early", "Won't dance"], F),
    ("The friend who's always...", "Most annoying", "Can live with it", ["Broke", "Late", "On their phone", "Complaining", "Cancelling"], F),
    ("Weather you hate", "Hate most", "Bring it on", ["Humidity", "Dust storms", "Heatwaves", "Dense fog", "Waterlogged roads"], T),
    ("In a queue", "Most annoying", "Can live with it", ["Line cutters", "Standing too close", "Loud phone talkers", "Slow payers", "Spot-savers"], F),
],
"downtime": [
    ("Holiday vibe", "Dream trip", "Not for me", ["Beach", "Mountains", "City break", "Road trip", "Staycation"], F),
    ("Travel with", "Best", "Worst", ["Solo", "Partner", "Family", "Friends gang", "Tour group"], F),
    ("On holiday you mostly...", "Most", "Least", ["Sightsee", "Hunt for food", "Shop", "Try adventure sports", "Laze at the hotel"], F),
    ("Indian getaway", "Go now", "Go last", ["Goa", "Ladakh", "Kerala", "Rajasthan", "The Northeast"], T),
    ("Worst travel hassle", "Worst", "Can handle", ["Flight delays", "Lost luggage", "Dirty hotel room", "Tourist scams", "Getting lost"], F),
    ("Movie genre", "Favourite", "Avoid", ["Comedy", "Horror", "Romance", "Action", "Thriller"], F),
    ("Music on repeat", "On repeat", "Skip", ["Bollywood", "Pop", "Rock", "Hip-hop", "Old classics"], T),
    ("What you watch most", "Most", "Least", ["Movies", "Series", "YouTube", "Reels", "Live sports"], F),
    ("Sport to watch", "Glued", "Channel change", ["Cricket", "Football", "Tennis", "F1", "Olympics"], F),
    ("Hobby to pick up", "Start now", "Never", ["Painting", "Guitar", "Pottery", "Photography", "Gardening"], F),
    ("Saturday night", "Perfect", "No thanks", ["House party", "Clubbing", "Dinner out", "Movie at home", "Early night"], F),
    ("Game night pick", "Best", "Worst", ["Cards", "Board games", "Charades", "Video games", "Antakshari"], T),
    ("Road trip must-have", "Must have", "Optional", ["Playlist", "Snacks", "Good company", "Dhaba stops", "No fixed plan"], T),
    ("Where you'd stay", "Book it", "Never", ["Luxury hotel", "Homestay", "Hostel", "Camping tent", "Treehouse"], F),
    ("Book you'd pick up", "Grab it", "Leave it", ["Thriller", "Self-help", "Biography", "Fantasy", "Comics"], F),
    ("Party theme", "Best theme", "Worst theme", ["Bollywood night", "Retro 80s", "Pyjama party", "Costume party", "Pool party"], T),
    ("Adventure you'd try", "Sign me up", "No chance", ["Skydiving", "Scuba diving", "Bungee jump", "River rafting", "Paragliding"], F),
    ("What you photograph most", "Most", "Least", ["Food", "Selfies", "Scenery", "Buildings", "Nothing, just vibes"], F),
    ("Best night out", "Best", "Worst", ["Live concert", "Stand-up show", "Theatre play", "Sports stadium", "Music festival"], F),
    ("Workout you'd stick to", "Would stick", "Would quit", ["Gym", "Yoga", "Running", "Dance class", "A team sport"], F),
],
"afterdark": [
    ("Ideal first date", "Ideal", "Awkward", ["Coffee", "Dinner", "Drinks", "Movie", "Long walk"], F),
    ("Dating profile red flag", "Swipe left fastest", "Can overlook", ["Only group pics", "Gym mirror selfies", 'Bio: "just ask"', "Holding a fish", "Sunglasses everywhere"], F),
    ("First date turn-off", "Instant no", "Can forgive", ["30 minutes late", "On phone all night", "Talks about their ex", "Splits to the rupee", "Brags nonstop"], T),
    ("Party drink", "Order first", "Never", ["Beer", "Wine", "Cocktails", "Whisky", "Tequila shots"], F),
    ("Most romantic gesture", "Swoon", "Meh", ["Surprise trip", "Handwritten letter", "Cooking dinner", "Flowers", "Remembering details"], F),
    ("Hangover cure", "Works", "Useless", ["Sleep", "Greasy food", "Nimbu pani", "Coconut water", "More drinks"], T),
    ("Most awkward moment", "Most awkward", "Laughed it off", ["Waving at a stranger", "Forgetting a name", "Text to wrong chat", "Fly down all day", "Calling teacher mom"], F),
    ("Your love language", "Most me", "Least me", ["Kind words", "Gifts", "Quality time", "Hugs", "Acts of service"], F),
    ("Worst way to be dumped", "Worst", "Least bad", ["Ghosting", "By text", "Via a friend", "In public", "On social media"], F),
    ("Dealbreaker", "Instant no", "Can live with it", ["Smoking", "Bad texter", "Loud snoring", "Messy room", "Mama's boy / girl"], F),
    ("Hardest to hide from parents", "Hardest", "Easy", ["A tattoo", "A partner", "Bad grades", "Late-night parties", "Credit card bill"], F),
    ("Best place to meet someone", "Best", "Worst", ["Dating app", "Through friends", "At work", "At a wedding", "At the gym"], F),
    ("After 3 drinks, you...", "Most likely", "Never", ["Dance", "Cry", "Text an ex", "Order food", "Fall asleep"], F),
    ("Best wedding function", "Best party", "Skip it", ["Sangeet", "Mehendi", "Baraat", "Reception", "Cocktail night"], T),
    ("Top partner trait", "Must have", "Nice bonus", ["Humour", "Looks", "Brains", "Ambition", "Cooking skills"], F),
    ("Worst to be caught doing", "Mortifying", "Who cares", ["Singing in the car", "Talking to yourself", "Stalking an ex", "Rehearsing arguments", "Dancing alone"], F),
    ("Date night at home", "Perfect", "Boring", ["Cook together", "Movie night", "Board games", "Deep talks", "Takeout and wine"], F),
    ("Biggest relationship crime", "Worst crime", "Forgivable", ["Liking ex's posts", "Checking their phone", "Forgetting anniversary", "Leaving on read", "Stealing the blanket"], F),
    ("Best flirting move", "Works on me", "Never works", ["Eye contact", "Cheesy lines", "Humour", "Compliments", "Sending memes"], F),
    ("Post-party food", "Best", "Worst", ["Shawarma", "Maggi", "Parantha", "Burger", "Momos"], T),
    # --- v2 additions ---
    ("Worst date activity", "Worst", "Actually fun", ["Karaoke", "Bowling", "Meeting their family", "Hiking", "Cooking class"], F),
    ("At a party you're usually", "Most me", "Least me", ["On the dance floor", "In the kitchen", "Taking photos", "Controlling music", "Balcony deep talks"], F),
    ("Worst thing to hear on a date", "Instant ick", "Fine", ['"My ex used to..."', '"Let\'s split it"', '"I\'m into crypto"', '"My mom says..."', '"I don\'t watch films"'], F),
    ("Biggest ick", "Biggest ick", "Cute actually", ["Baby voice", "Socks with sandals", "Too much cologne", 'Replies "hehe"', "Talks in 3rd person"], F),
    ("Dream proposal", "Dream", "Cringe", ["Beach at sunset", "Mountain top", "Candlelit dinner", "Flash mob", "At home in PJs"], F),
    ("Drinking game", "Best", "Worst", ["Never Have I Ever", "Beer pong", "Kings cup", "Truth or dare", "Flip cup"], F),
    ("Hardest to say sorry for", "Hardest", "Easy", ["Forgot their birthday", "Drunk texting", "Reading their chats", "Missing their event", "Flirting with a friend"], F),
    ("Worst ex behaviour", "Worst", "Harmless", ["Watching your stories", "Late-night \"hey\"", "Dating your friend", "Keeping your hoodie", "Badmouthing you"], F),
    ("Pick-up line style", "Works on me", "Cringe", ["Cheesy pun", "Straight honesty", "Food-based", "Nerdy", "Bollywood dialogue"], T),
    ("Most likely to lose at 3am", "Most likely", "Never", ["Your phone", "Your keys", "Your dignity", "Your friends", "Your shoes"], F),
    ("Couples who...", "Most annoying", "Cute", ["PDA everywhere", "Matching outfits", "Baby talk", "Share one Instagram", "Fight in public"], F),
    ("Honeymoon pick", "Book it", "Pass", ["Maldives", "Europe tour", "Swiss Alps", "Bali", "Safari"], F),
    ("Fib about on a first date", "Most likely", "Never", ["Your age", "Your job", "Cooking skills", "Number of exes", "Gym habits"], F),
    ("Worst to find your dating app", "Worst", "Who cares", ["Your mom", "Your boss", "Your ex", "Your cousin", "Your neighbour"], F),
    ("First thing you notice", "First", "Last", ["Smile", "Confidence", "Voice", "Style", "Sense of humour"], F),
    ("Night out ends with", "Perfect end", "Worst end", ["Dancing till close", "Street food run", "Deep talks on the curb", "Early cab home", "Karaoke"], F),
    ("Hardest secret to keep", "Hardest", "Easy", ["A surprise party", "A friend's affair", "Your salary", "A crush", "A spoiler"], F),
    ("Relationship step you'd rush", "Rush it", "Slow down", ["Moving in", "Meeting parents", 'Saying "I love you"', "Sharing passwords", "First trip together"], F),
    ("Truth or dare you'd dodge", "Dodge first", "Easy", ["Show last search", "Read last text", "Call your ex", "Room posts a story", "Show your gallery"], F),
    ("Best first-kiss spot", "Best", "Worst", ["Rooftop", "Beach", "In the car", "Doorstep", "Back row, cinema"], F),
],
}

# --- v2 additions to What If and Real Life ---
CARDS["whatif"] += [
    ("Live inside a movie genre", "Move in", "Never", ["Rom-com", "Horror", "Action", "Sci-fi", "Musical"], F),
    ("Do it for ₹1 crore", "Easy money", "No amount", ["Shave your head", "No phone for a year", "Only dal for a year", "Move to a village", "Boss's name tattoo"], T),
    ("Stuck in a lift 5 hours with", "Fine by me", "Nightmare", ["Your boss", "Your ex", "A chatterbox", "A crying baby", "A mime"], F),
    ("Pick a tiny superpower", "Want most", "Pass", ["Always find parking", "Perfect toast always", "Never lose socks", "Always know the time", "Infinite phone battery"], F),
    ("You rule for a day. First:", "Do first", "Do last", ["Free food everywhere", "Four-day work week", "No traffic", "No homework", "Mandatory nap breaks"], F),
    ("Only one app, forever", "Keep it", "Lose it", ["WhatsApp", "Instagram", "Spotify", "Google Maps", "Food delivery"], F),
    ("Relive one age", "Relive it", "Never again", ["Age 5", "Age 13", "Age 18", "Age 25", "Right now"], F),
    ("Swap bodies for a day with", "Swap now", "No way", ["Your pet", "A toddler", "Your sibling", "Your best friend", "A celebrity"], F),
    ("Forever, everything tastes of", "Bliss", "Torture", ["Butter chicken", "Pizza", "Biryani", "Mango", "Popcorn"], T),
    ("Live a year in", "Sign me up", "No chance", ["Space station", "Antarctica base", "Tiny island", "Himalayan monastery", "Cruise ship"], F),
    ("Your life gets a soundtrack", "Yes please", "Please no", ["Bollywood", "Jazz", "Heavy metal", "Lo-fi", "Classical"], T),
    ("Robot butler's main job", "Most needed", "Least needed", ["Groceries", "Cleaning", "Driving", "Laundry", "Admin and bills"], F),
    ("Dinner guest", "Most fun", "Least fun", ["A comedian", "A scientist", "A sports legend", "A movie star", "A historical figure"], F),
    ("Cross the country by", "Best", "Worst", ["Train", "Motorbike", "Campervan", "Luxury bus", "Horseback"], F),
    ("World's best at", "Want most", "Pass", ["Singing", "Storytelling", "Dancing", "Arguing", "Napping"], F),
    ("Zombie apocalypse hideout", "Hide here", "Doomed", ["Mall", "Supermarket", "Army base", "Farmhouse", "Your own home"], F),
    ("Magic door opens to", "Walk through", "Stay shut", ["Any beach", "Your childhood home", "A full fridge", "A 10-min nap room", "Tomorrow"], F),
]
CARDS["life"] += [
    ("Monsoon mood", "Most me", "Least me", ["Pakoras and chai", "Long drive", "Dancing in rain", "Stay in bed", "Cancel all plans"], T),
    ("Emoji you use most", "Use most", "Never", ["😂", "🙏", "❤️", "👍", "🔥"], F),
    ("Where you do your best thinking", "Best", "Worst", ["Shower", "Commute", "Late at night", "On a walk", "In the loo"], F),
]

MAX_ITEM_CHARS = 22
MAX_PROMPT_CHARS = 34
MAX_LABEL_CHARS = 18

errors, warnings = [], []
cards_out = []
seen_itemsets = {}


rows_all = []
for theme, rows in CARDS.items():
    for row in rows:
        deck = "whatif" if row[0] in MOVE_TO_WHATIF else THEME_TO_DECK[theme]
        rows_all.append((deck, theme, row))

for missing in MOVE_TO_WHATIF - {r[0] for _, _, r in rows_all}:
    errors.append(f"MOVE_TO_WHATIF prompt not found: {missing}")

spicy_of = {d["id"]: d["spicy"] for d in DECKS}
for d in DECKS:
    n = 0
    for deck, theme, (prompt, top, bottom, items, desi) in rows_all:
        if deck != d["id"]:
            continue
        n += 1
        card_id = f"{deck}-{n:03d}"
        if len(items) != 5:
            errors.append(f"{card_id}: {len(items)} items")
        if len(set(i.lower() for i in items)) != len(items):
            errors.append(f"{card_id}: duplicate item")
        for it in items:
            if len(it) > MAX_ITEM_CHARS:
                errors.append(f"{card_id}: item too long ({len(it)}): {it}")
        if len(prompt) > MAX_PROMPT_CHARS:
            errors.append(f"{card_id}: prompt too long ({len(prompt)}): {prompt}")
        for lab in (top, bottom):
            if len(lab) > MAX_LABEL_CHARS:
                errors.append(f"{card_id}: label too long: {lab}")
        key = frozenset(i.lower() for i in items)
        if key in seen_itemsets:
            errors.append(f"{card_id}: same items as {seen_itemsets[key]}")
        seen_itemsets[key] = card_id
        cards_out.append({
            "id": card_id, "deck": deck, "theme": theme, "prompt": prompt,
            "top": top, "bottom": bottom, "items": items,
            "desi": desi, "spicy": spicy_of[deck],
            "ex": bool(re.search(r"\b(ex|ex's|exes)\b", " ".join([prompt] + items), re.I)),
        })

# Cross-card item reuse (warn only: repeated items across cards feel stale)
from collections import Counter
item_counts = Counter(i.lower() for c in cards_out for i in c["items"])
for it, k in item_counts.items():
    if k > 2:
        warnings.append(f"item used {k}x: {it}")

desi_pct = 100 * sum(c["desi"] for c in cards_out) / len(cards_out)

dataset = {
    "game": "rank-me",
    "title": "Rank Me",
    "version": "2.1.0",
    "itemsPerCard": 5,
    "modes": {
        "hotSeat": "One player ranks privately; the rest of the room agrees on ONE shared guess of that order. Room scores.",
        "knowMe": "Two players. One ranks privately, the other predicts that order. Roles swap every card. Predictor scores.",
        "couplesVsCouples": "Teams of two (extendable to bigger teams). Inside each team it is Know Me; every team plays the same card each round. Team scores add up on a leaderboard.",
    },
    "scoring": {
        "perItem": "Compare where the predictor placed each item with where the ranker placed it. Exact spot = 2 points, one spot off = 1, further = 0.",
        "endsWeighted": "Items the ranker put at #1 or #5 score double. The middle three count single.",
        "perCardMax": 14,
        "percent": "points / 14 * 100",
        "tiers": {"14": "Mind reader", "10-12": "Close", "7-9": "Getting there", "0-6": "Guesswork"},
        "reference": "Perfect = 14. Top two swapped = 11. Fully reversed = 2. A random guess averages about 5.",
        "note": "Points always go to whoever is reading the ranker, never to the ranker for being unpredictable. This keeps rankings honest.",
    },
    "uiNotes": [
        "Shuffle the starting item order separately on every ranking screen, so nobody is anchored by the listed order.",
        "Always show the card's top and bottom labels at the ends of the drag list.",
        "Hide the spicy deck unless adult mode is on.",
        "'ex' marks cards that mention an ex; a 'keep it sweet' option can leave them out (useful for couples).",
        "'desi' marks cards with Indian cultural references; can be used to filter for international groups.",
        "'theme' is a hidden sub-topic; avoid dealing the same theme twice in a row.",
    ],
    "contentRules": [
        "No consensus order: every item should plausibly be someone's #1 and someone else's #5.",
        "Balanced weight: no item obviously far above or below the others.",
        "Taste, not fact: the order depends on the person, never on knowledge.",
        "Like with like: all five items are the same kind of thing.",
        "Short: items max 22 characters, to fit a drag row on a phone.",
        "Party-safe: no looks, body, health, religion, politics or ranking people in the room.",
    ],
    "categories": [dict(d, count=sum(1 for x in cards_out if x["deck"] == d["id"])) for d in DECKS],
    "cards": cards_out,
}

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "data", "rank_me.json")
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(dataset, f, ensure_ascii=False, indent=2)

print(f"cards: {len(cards_out)}  decks: {Counter(c['deck'] for c in cards_out)}  desi: {desi_pct:.0f}%")
print("ERRORS:", *errors, sep="\n  ") if errors else print("errors: none")
print("WARNINGS:", *warnings, sep="\n  ") if warnings else print("warnings: none")
sys.exit(1 if errors else 0)
