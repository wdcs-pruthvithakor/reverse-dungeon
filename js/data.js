'use strict';
// Static tables: ranks, pieces you can build, hero classes, traits, omens, difficulty, names and tavern talk.
(function () {
  const RD = (window.RD = window.RD || {});

  RD.COLS = 17;
  RD.ROWS = 11;
  RD.N = RD.COLS * RD.ROWS;
  RD.raidTime = (G) => (140 + 60 * G.floors) * (G.twists && G.twists.includes('rush') ? 0.6 : 1); // deeper dungeons get longer nights

  // ---------------------------------------------------------------- seeded randomness
  RD.makeRng = function (seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      state: () => a,
      setState: (s) => { a = s >>> 0; },
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      },
      weighted(obj) {
        let total = 0;
        for (const k in obj) total += Math.max(0, obj[k]);
        let r = next() * total;
        for (const k in obj) {
          r -= Math.max(0, obj[k]);
          if (r <= 0) return k;
        }
        return Object.keys(obj)[0];
      },
    };
  };

  // Stable per-tile noise that never touches the game's RNG stream.
  RD.hash = function (a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // ---------------------------------------------------------------- ranks
  // Every rank is half again as strong as the one below it. EX belongs to the Demon Lord alone.
  RD.TIERS = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'EX'];
  RD.TIER_MULT = RD.TIERS.map((_, t) => 1.5 ** t);
  RD.TIER_UNLOCK = [1, 3, 5, 8, 11, 14, 17, 20, 23, 26]; // the night each rank of blueprint opens
  RD.TIER_COLOR = ['#9a8f9c', '#86c06a', '#5fc4b4', '#7da7e8', '#b38be0', '#e05a86', '#e3b04b', '#ff8a3d', '#ff5a4a', '#f2f2f2'];
  RD.MAX_TIER = 9;

  // Floors open as the dungeon survives. Each one is a fresh level below the last.
  // Five floors in a normal run; endless and Saga runs keep digging, one floor every 50 nights (VI on night 50, VII on 100…).
  RD.BASE_FLOORS = 5;
  RD.MAX_FLOORS = 10;
  RD.DEEP_EVERY = 50;
  RD.FLOOR_UNLOCK = [1, 4, 9, 14, 19];
  RD.FLOOR_COST = [0, 40, 110, 240, 420, 650, 900, 1200, 1550, 1950];
  RD.ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  // Levels raise a piece within its rank. Lv5 is about one rank higher. Every level adds 15% to damage,
  // health and how long a trap holds a hero (pin, confuse, slow, stun), and cuts rearm time by 6%.
  RD.MAX_LEVEL = 5;
  RD.levelMult = (lv) => 1 + 0.15 * ((lv || 1) - 1);
  RD.levelCost = (it) => Math.round(RD.ITEMS[it.type].cost * 0.5 * (it.lv || 1));
  RD.lvDur = (d, key, lv) => d[key] * RD.levelMult(lv);
  RD.lvRearm = (d, lv) => d.rearm * (1 - 0.06 * ((lv || 1) - 1));

  // ---------------------------------------------------------------- difficulty
  RD.DIFF = {
    easy: { name: 'Apprentice', blurb: 'Deeper pockets, gentler heroes. Learn how the guild thinks.', gold: 160, malice: 170, income: 1.3, hero: 0.8, drift: 0.75, party: -1, rare: 0.6, growth: 0.02, win: 20 },
    normal: { name: 'Keeper', blurb: 'The game as designed.', gold: 130, malice: 150, income: 1.05, hero: 0.95, drift: 1, party: 0, rare: 1, growth: 0.03, win: 25 },
    hard: { name: 'Overlord', blurb: 'Leaner nights, tougher heroes, and the guild climbs the ranks faster.', gold: 120, malice: 140, income: 0.95, hero: 1.08, drift: 1.15, party: 0, rare: 1.5, growth: 0.04, win: 25 },
    nightmare: { name: 'Abyss', blurb: 'Bigger parties, legends walk in often, and every coin is hard won.', gold: 130, malice: 150, income: 0.95, hero: 1.05, drift: 1.25, party: 1, rare: 2.2, growth: 0.045, win: 30 },
  };

  // ---------------------------------------------------------------- modes
  // `pace` compresses progression: a Quick night counts as 2.2 campaign nights for ranks, floors,
  // guild strength and income, so a 12-night run still climbs from F to the Demon Lord.
  RD.MODES = {
    campaign: { name: 'Campaign', blurb: 'The full climb. Hold the nights your difficulty asks.', pace: 1, income: 1 },
    saga: { name: 'Saga', blurb: '100 nights. Ranks open about four times slower, so every piece earns its keep for longer and each rank of hero is a real fight. Deeper floors past V.', pace: 0.26, income: 0.28, purse: 0.2, bounty: 0.45, win: 100, deep: true },
    quick: { name: 'Quick', blurb: '12 nights, every rank unlocks about twice as fast. 15 to 25 minutes.', pace: 2.2, income: 2.5, win: 12 },
    daily: { name: 'Daily dungeon', blurb: 'Today’s seed, the same for everyone. Quick rules on Keeper. One best score per day.', pace: 2.2, income: 2.5, win: 12, diff: 'normal' },
  };

  // ---------------------------------------------------------------- trophies and pacts (kept between runs)
  RD.TROPHIES = {
    first_blood: { name: 'First Blood', desc: 'Slay your first hero.' },
    perfect: { name: 'Nobody Leaves', desc: 'A perfect night: at least two heroes and nobody escapes.' },
    survive5: { name: 'Still Standing', desc: 'Hold 5 nights in one dungeon.' },
    legend: { name: 'Legend Killer', desc: 'Slay a legend.' },
    maxed: { name: 'Masterwork', desc: 'Raise a piece to Lv5.' },
    boss: { name: 'Throne Room', desc: 'Place your first boss.' },
    deep: { name: 'Five Below', desc: 'Dig the fifth floor.' },
    hunters: { name: 'Hunt Failed', desc: 'Kill a whole strike team in one night.' },
    myth: { name: 'Mythmaker', desc: 'Place a myth boss.' },
    lord: { name: 'Crowned in Fire', desc: 'Raise the Demon Lord.' },
    chosen: { name: 'Fate Denied', desc: 'Slay the Chosen Hero.' },
    rich: { name: 'Dragon’s Hoard', desc: 'Have 500 gold in the hoard.' },
    win_any: { name: 'The Dungeon Endures', desc: 'Win any run.' },
    quick: { name: 'Quick Study', desc: 'Win a Quick or Daily run.' },
    daily: { name: 'Daily Grind', desc: 'Finish a daily dungeon, win or lose.' },
    win_hard: { name: 'Overlord', desc: 'Win on Overlord or Abyss.' },
    win_abyss: { name: 'The Abyss Gazes Back', desc: 'Win on Abyss.' },
    slay100: { name: 'Bone Pile', desc: 'Slay 100 heroes across all your dungeons.' },
    nemesis: { name: 'Settled Grudge', desc: 'Slay a nemesis: a hero who escaped you twice.' },
    twisted: { name: 'Twisted', desc: 'Win a run with three or more twists.' },
    streak7: { name: 'Seven Nights’ Vigil', desc: 'Play on seven days in a row.' },
  };
  // A pact is a perk you take into a new dungeon. Each one is earned with a trophy.
  RD.PACTS = {
    tithe: { name: 'Blood Tithe', desc: 'Start with 60 more malice.', trophy: 'first_blood' },
    purse: { name: 'Deep Pockets', desc: 'Start with 50 more gold in the hoard.', trophy: 'survive5' },
    bones: { name: 'Bone Pact', desc: 'Monsters (not bosses) cost 15% less.', trophy: 'perfect' },
    iron: { name: 'Iron Will', desc: 'Doors are 50% tougher and traps rearm 15% faster.', trophy: 'maxed' },
    market: { name: 'Black Market', desc: 'Four deals a night, and rerolls cost 5 malice.', trophy: 'legend' },
    wyrm: { name: 'Wyrm’s Debt', desc: 'Bosses cost 20% less.', trophy: 'boss' },
    silence: { name: 'Silence', desc: 'Sending Stones are half as common.', trophy: 'win_any' },
  };
  // Twists change the rules of one run. The daily dungeon rolls two; Quick and Campaign runs can pick any.
  // Every twist adds 15% to the run's score.
  RD.TWISTS = {
    greed: { name: 'Gold Fever', desc: 'Heroes carry off twice as much gold, and every kill pays double malice.' },
    swarm: { name: 'Swarm', desc: 'Every party brings two extra heroes, all a rank lower.' },
    blind: { name: 'Burned Archive', desc: 'The guild forgets your dungeon every night, but sends heroes half a rank stronger.' },
    stones: { name: 'Sending Stones', desc: 'Every hero carries a sending stone.' },
    cheap: { name: 'Buyer’s Market', desc: 'Everything costs 25% less, and income is 25% lower.' },
    thrones: { name: 'Age of Thrones', desc: 'Bosses cost 40% less, and you start with 120 more malice.' },
    dark: { name: 'Endless Night', desc: 'Every night is a Wet Torches night: heroes see one tile less.' },
    legends: { name: 'Age of Legends', desc: 'Every party that can bring a legend does.' },
    glass: { name: 'Glass Fangs', desc: 'Monsters hit 50% harder but have 30% less health.' },
    rush: { name: 'Rush', desc: 'Raids are 40% shorter and heroes move 20% faster.' },
    mortal: { name: 'Mortal Monsters', desc: 'Hardcore. A monster that dies in a raid is gone for good, bosses and hordes included, and you can keep at most 8 monsters plus 4 per floor. Summons and the raised dead don’t count.' },
  };
  RD.monsterCap = (G) => 8 + 4 * G.floors; // above a typical build (10–18 by night 30); the losses are the hardcore part

  // Ghosts: a legend who dies in your dungeon may come back, in the room where they fell.
  RD.GHOSTS = {
    haunt: { name: 'Haunting', desc: 'Heroes who come within 2 tiles of it lose their nerve for 5 seconds and run at the first scratch.' },
    whisper: { name: 'Whispering', desc: 'Every night it whispers to the guild: a trap that is not there, or a real one forgotten. Their map gets a little more wrong.' },
    vengeful: { name: 'Vengeful', desc: 'It rises every raid as a spectre at the rank it had in life and fights for you. Kill it and it is laid to rest.' },
  };
  RD.GHOST_NIGHTS = 12; // a ghost fades this many nights after its death
  RD.GHOST_MAX = 3;
  RD.twisted = (G, k) => !!(G.twists && G.twists.includes(k));

  // a run's score: nights held, heroes slain, legends, and a bonus for winning; twists multiply it
  RD.score = (G) => Math.round((20 * G.stats.held + 10 * G.stats.slain + 40 * G.stats.legends + 60 * (G.stats.nemeses || 0) + (G.result === 'won' ? 250 + G.gold : 0)) * (1 + 0.15 * (G.twists || []).length));
  // souls: the currency that carries over, earned from every run's score
  RD.souls = (G) => Math.round(RD.score(G) / 40) + 5 * (G.stats.nemeses || 0);

  // The Dungeon Heart: permanent upgrades bought with souls, three levels each.
  RD.HEART = {
    reserves: { name: 'Dark Reserves', desc: '+25 starting malice per level.', costs: [20, 45, 80] },
    vault: { name: 'Gilded Vault', desc: '+20 starting gold per level.', costs: [20, 45, 80] },
    haste: { name: 'Quickened Will', desc: 'Raid powers recharge 10% faster per level.', costs: [30, 60, 100] },
    ledger: { name: 'Black Ledger', desc: 'Rerolling tonight’s deals costs 4 less per level.', costs: [15, 35, 60] },
    grudge: { name: 'Old Grudges', desc: 'Nemesis bounties pay 50% more malice per level.', costs: [25, 50, 90] },
    delve: { name: 'Deep Delving', desc: 'New floors cost 15% less per level.', costs: [25, 50, 90] },
  };

  // ---------------------------------------------------------------- what the dungeon can build
  // Stats are listed at rank F; a piece's real numbers are multiplied by its rank and level.
  // kind: trap | turret | monster | door.  place: floor | wall.
  // sense: which hero senses can find it (mech = rogues, magic = mages/rogues, illusion = mages).
  // cat: what the guild blames when a hero dies to it.
  // elite monsters outfight a whole party of their own rank; the guild rates them a rank higher.
  RD.ITEMS = {
    // traps
    spikes: { name: 'Spike Pit', tier: 0, cost: 14, kind: 'trap', place: 'floor', hidden: true, sense: 'mech', cat: 'trap', dmg: 34, rearm: 3,
      desc: 'Hidden pit. Hurts whoever steps in, half as much if they knew it was there.' },
    snare: { name: 'Bear Trap', tier: 1, cost: 22, kind: 'trap', place: 'floor', hidden: true, sense: 'mech', cat: 'trap', dmg: 16, root: 3, rearm: 5,
      desc: 'Iron jaws. Pins the hero in place for 3s so your monsters can catch up.' },
    maze: { name: 'Wandering Rune', tier: 1, cost: 26, kind: 'trap', place: 'floor', hidden: true, sense: 'magic', cat: 'illusion', dmg: 8, confuse: 5, rearm: 6,
      desc: 'Hidden glyph. The hero who steps on it wanders aimlessly for 5s. Levels make the daze last longer. A hero who has just recovered keeps their head for 8s.' },
    vent: { name: 'Miasma Vent', tier: 2, cost: 36, kind: 'trap', place: 'floor', hidden: true, sense: 'mech', cat: 'trap', dps: 6, dur: 4, radius: 1.5, rearm: 8,
      desc: 'Hidden grate. Fills a 3×3 area with bad air for 4s.' },
    rune: { name: 'Fire Rune', tier: 2, cost: 40, kind: 'trap', place: 'floor', hidden: true, sense: 'magic', cat: 'trap', dmg: 22, radius: 1.5, oneShot: true,
      desc: 'Hidden glyph. Burns every hero within one tile. Spent after one blast per raid.' },
    chasm: { name: 'False Floor', tier: 3, cost: 72, kind: 'trap', place: 'floor', hidden: true, sense: 'illusion', cat: 'illusion', dmg: 30, stun: 2.2, rearm: 4,
      desc: 'An illusion laid over a drop. Heavy damage and a long climb out. Mages see through it.' },
    crusher: { name: 'Crusher', tier: 3, cost: 62, kind: 'trap', place: 'floor', hidden: true, sense: 'mech', cat: 'trap', dmg: 46, rearm: 10,
      desc: 'A ceiling block on a hair trigger. Enormous damage, slow to winch back up.' },
    frost: { name: 'Frost Sigil', tier: 4, cost: 96, kind: 'trap', place: 'floor', hidden: true, sense: 'magic', cat: 'trap', dmg: 12, radius: 1.5, slow: 5, rearm: 7,
      desc: 'Hidden glyph. Freezes every hero within one tile to half speed for 5s.' },
    siphon: { name: 'Soul Siphon', tier: 6, cost: 250, kind: 'trap', place: 'floor', hidden: true, sense: 'magic', cat: 'trap', dmg: 8, pct: 0.3, rearm: 9,
      desc: 'Tears away 30% of the victim’s remaining health, however strong they are. A torn soul only tears again once the hero is healed back above 80% of their health; until then siphons do their flat damage.' },
    abyss: { name: 'Abyss Gate', tier: 7, cost: 400, kind: 'trap', place: 'floor', hidden: true, sense: 'illusion', cat: 'illusion', dmg: 14, rearm: 12,
      desc: 'An illusion of open floor. Whoever steps through on the way in is thrown back out to the front gate and has to walk it all again; anyone trying to leave is thrown back into the deepest corner of the floor instead.' },
    // wall pieces
    darts: { name: 'Dart Slit', tier: 0, cost: 24, kind: 'turret', place: 'wall', cat: 'turret', dmg: 9, rate: 1.1, range: 4,
      desc: 'Set into rock beside a corridor. Shoots down straight passages up to 4 tiles away. No two side by side. Rogues who have felt it can jam it for 12s.' },
    pylon: { name: 'Storm Pylon', tier: 5, cost: 190, kind: 'turret', place: 'wall', cat: 'turret', dmg: 12, rate: 1.6, range: 3, chain: 3,
      desc: 'Set into rock. Lightning leaps between up to 3 heroes within 3 tiles it can see. Rogues who have felt it can jam it for 12s. Pylons need 4 tiles between them.' },
    // obstacles
    door: { name: 'Iron Door', tier: 0, cost: 16, kind: 'door', place: 'floor', hp: 110,
      desc: 'Holds a corridor shut until broken. Knights batter it fast, rogues pick the lock.' },
    vault: { name: 'Runed Vault Door', tier: 4, cost: 90, kind: 'door', place: 'floor', hp: 160, nopick: true,
      desc: 'No lock to pick. It has to be broken, and it takes a beating.' },
    dropgate: { name: 'Drop Gate', tier: 2, cost: 40, kind: 'door', place: 'floor', hp: 200, oneway: true, tags: ['mech'],
      desc: 'Stands open until the whole party has walked through, then crashes down behind the last of them for the rest of the night. Whoever is inside has to find another road out, and the rest of the party another road in. Pair it with an Exit Gate so the way out is the road you chose.' },
    exitgate: { name: 'Exit Gate', tier: 2, cost: 30, kind: 'door', place: 'floor', hp: 200, exit: true, tags: ['mech'],
      desc: 'Shut when the raid begins. It grinds open the moment a Drop Gate on the same floor falls, so heroes who came in one way have to leave by another, past whatever waits there. Needs a Drop Gate on its floor.' },
    // monsters
    goblin: { name: 'Goblin', tier: 0, cost: 12, kind: 'monster', place: 'floor', cat: 'monster', hp: 40, dmg: 7, rate: 0.7, speed: 2.6, leash: 3,
      desc: 'Quick, cheap and cowardly. Better in a pack.' },
    skeleton: { name: 'Skeleton', tier: 0, cost: 18, kind: 'monster', place: 'floor', cat: 'monster', hp: 70, dmg: 10, rate: 0.9, speed: 2.1, leash: 3, undead: true,
      desc: 'Tireless. Guards 3 tiles around its post. Clerics shatter it.' },
    slime: { name: 'Bog Slime', tier: 1, cost: 26, kind: 'monster', place: 'floor', cat: 'monster', hp: 95, dmg: 5, rate: 0.8, speed: 1.3, leash: 2, slows: true,
      desc: 'Weak bite, but whatever it touches moves at half speed for 2s.' },
    mimic: { name: 'Mimic', tier: 2, cost: 42, kind: 'monster', place: 'floor', sense: 'illusion', cat: 'illusion', hp: 130, dmg: 18, rate: 1.2, speed: 1.4, leash: 1, lure: true, elite: true,
      desc: 'Looks like a treasure chest. Greedy heroes walk over to open it.' },
    spider: { name: 'Cave Spider', tier: 2, cost: 40, kind: 'monster', place: 'floor', cat: 'monster', hp: 85, dmg: 9, rate: 0.8, speed: 2.4, leash: 3, range: 2.2, slows: true,
      desc: 'Spits webbing from two tiles away. Anything it hits is slowed.' },
    brute: { name: 'Cave Brute', tier: 3, cost: 66, kind: 'monster', place: 'floor', cat: 'monster', hp: 300, dmg: 26, rate: 1.5, speed: 1.15, leash: 2, elite: true,
      desc: 'Slow, huge, and hits like a rockfall. A party of its own rank struggles to fell one.' },
    wraith: { name: 'Wraith', tier: 4, cost: 100, kind: 'monster', place: 'floor', cat: 'illusion', hp: 170, dmg: 20, rate: 1.0, speed: 2.4, leash: 4, undead: true, drain: 0.4, elite: true,
      desc: 'Drifts through walls of fear. Heals itself with 40% of the harm it deals.' },
    troll: { name: 'Troll', tier: 5, cost: 165, kind: 'monster', place: 'floor', cat: 'monster', hp: 380, dmg: 24, rate: 1.2, speed: 1.5, leash: 2, regen: 0.02, elite: true,
      desc: 'Regrows 2% of its health every second. Burn it down fast or not at all.' },
    wyvern: { name: 'Wyvern', tier: 6, cost: 260, kind: 'monster', place: 'floor', cat: 'monster', hp: 300, dmg: 28, rate: 1.3, speed: 2.6, leash: 4, range: 2.5, elite: true,
      desc: 'Strikes from the air two tiles away and runs down anyone who flees.' },
    golem: { name: 'Rune Golem', tier: 7, cost: 410, kind: 'monster', place: 'floor', cat: 'monster', hp: 720, dmg: 38, rate: 1.8, speed: 0.9, leash: 2, elite: true,
      desc: 'A walking wall. Takes a legendary party to crack.' },
    // bosses: one per floor
    goblinking: { name: 'Goblin King', tier: 3, cost: 150, kind: 'monster', boss: true, place: 'floor', cat: 'monster', hp: 420, dmg: 24, rate: 1.1, speed: 1.6, leash: 3, summon: 'goblin', every: 6, max: 3,
      desc: 'Boss. Calls a fresh goblin to its side every 6s, up to three at a time.' },
    lich: { name: 'Lich', tier: 5, cost: 400, kind: 'monster', boss: true, place: 'floor', cat: 'monster', hp: 380, dmg: 22, rate: 1.3, speed: 1.4, leash: 3, range: 3, undead: true, summon: 'skeleton', every: 5, max: 3,
      desc: 'Boss. Hurls bolts from three tiles away and raises skeletons every 5s.' },
    dragon: { name: 'Elder Dragon', tier: 6, cost: 760, kind: 'monster', boss: true, place: 'floor', cat: 'monster', hp: 760, dmg: 32, rate: 1.4, speed: 1.5, leash: 3, breath: 40, breathR: 1.8, every: 4,
      desc: 'Boss. Every 4s it breathes fire over everyone within two tiles.' },
    hydra: { name: 'Hydra', tier: 7, cost: 1250, kind: 'monster', boss: true, myth: true, place: 'floor', cat: 'monster', hp: 980, dmg: 26, rate: 0.9, speed: 1.3, leash: 3, heads: 3, regen: 0.025, elite: true,
      desc: 'Myth boss. Three heads bite three heroes at once, and it regrows 2.5% health a second.' },
    behemoth: { name: 'Behemoth', tier: 8, cost: 2000, kind: 'monster', boss: true, myth: true, place: 'floor', cat: 'monster', hp: 1400, dmg: 46, rate: 1.6, speed: 1.1, leash: 3, quake: 30, quakeR: 2.5, every: 6,
      desc: 'Myth boss. Every 6s the ground breaks around it, knocking down everyone within 2½ tiles.' },
    demonlord: { name: 'Demon Lord', tier: 9, cost: 3400, kind: 'monster', boss: true, myth: true, lord: true, place: 'floor', cat: 'monster', hp: 1800, dmg: 54, rate: 1.3, speed: 1.6, leash: 4,
      breath: 60, breathR: 2.2, every: 5, summon: 'imp', max: 4, regen: 0.01,
      desc: 'The end of all dungeons. Hellfire, a court of imps, and wounds that close on their own. The guild answers by sending its Chosen Hero.' },
    // ------------------------------------------------ more traps
    poison: { name: 'Poison Needle', tier: 1, cost: 30, kind: 'trap', place: 'floor', hidden: true, sense: 'mech', cat: 'trap', dmg: 6, dps: 4, dur: 6, rearm: 4,
      desc: 'A needle in the flagstones. Poisons the hero for 6s.' },
    alarm: { name: 'Alarm Bell', tier: 2, cost: 30, kind: 'trap', place: 'floor', hidden: true, sense: 'mech', cat: 'trap', dmg: 4, call: 7, rearm: 10,
      desc: 'Rings when stepped on. Every monster within 7 tiles drops its post and runs at the hero for 8s.' },
    cage: { name: 'Iron Cage', tier: 3, cost: 56, kind: 'trap', place: 'floor', hidden: true, sense: 'mech', cat: 'trap', dmg: 14, cage: 4, rearm: 9,
      desc: 'Bars drop around the hero for 4s. Caged heroes cannot move or fight back.' },
    teleport: { name: 'Teleport Circle', tier: 4, cost: 92, kind: 'trap', place: 'floor', hidden: true, sense: 'magic', cat: 'illusion', dmg: 10, rearm: 8,
      desc: 'Throws the hero to a far corner of this floor, away from the healer and the rest of the party.' },
    boulder: { name: 'Rolling Boulder', tier: 5, cost: 150, kind: 'trap', place: 'floor', hidden: true, sense: 'mech', cat: 'trap', dmg: 30, line: 5, rearm: 14,
      desc: 'A boulder thunders down the corridor, crushing every hero in a line up to 5 tiles.' },
    gravity: { name: 'Gravity Well', tier: 6, cost: 240, kind: 'trap', place: 'floor', hidden: true, sense: 'magic', cat: 'trap', dmg: 12, radius: 2.5, root: 2, slow: 5, rearm: 12,
      desc: 'Crushing weight pins every hero within 2½ tiles for 2s, then slows them for 5s.' },
    // ------------------------------------------------ more monsters
    kobold: { name: 'Kobold', tier: 0, cost: 8, kind: 'monster', place: 'floor', cat: 'monster', hp: 28, dmg: 6, rate: 0.7, speed: 2.5, leash: 3,
      desc: 'Small, sly and never alone for long. Cheap enough to field in numbers.' },
    orc: { name: 'Orc', tier: 1, cost: 24, kind: 'monster', place: 'floor', cat: 'monster', hp: 120, dmg: 12, rate: 1.0, speed: 1.9, leash: 3,
      desc: 'A thick-skinned brawler. Hits hard for its price.' },
    lizardman: { name: 'Lizardman', tier: 2, cost: 30, kind: 'monster', place: 'floor', cat: 'monster', hp: 110, dmg: 12, rate: 0.9, speed: 2.1, leash: 3, regen: 0.015,
      desc: 'Scaled spear-fighter that slowly closes its own wounds.' },
    harpy: { name: 'Harpy', tier: 2, cost: 28, kind: 'monster', place: 'floor', cat: 'monster', hp: 70, dmg: 9, rate: 0.8, speed: 2.9, leash: 5, range: 2.2,
      desc: 'Dives from two tiles away and hunts down runners across the floor.' },
    gargoyle: { name: 'Gargoyle', tier: 3, cost: 50, kind: 'monster', place: 'floor', sense: 'illusion', cat: 'illusion', hp: 220, dmg: 20, rate: 1.2, speed: 1.6, leash: 2, statue: true, armor: 0.5, elite: true,
      desc: 'Poses as a statue until a hero walks past. Stone skin halves damage from range.' },
    minotaur: { name: 'Minotaur', tier: 4, cost: 130, kind: 'monster', place: 'floor', cat: 'monster', hp: 280, dmg: 26, rate: 1.4, speed: 1.7, leash: 4, charge: 1.2, elite: true,
      desc: 'Charges heroes from up to 4 tiles away and knocks them down for 1.2s.' },
    basilisk: { name: 'Basilisk', tier: 5, cost: 215, kind: 'monster', place: 'floor', cat: 'monster', hp: 340, dmg: 22, rate: 1.2, speed: 1.3, leash: 3, petrify: 0.3, elite: true,
      desc: 'Every bite has a 30% chance to turn its target to stone for 2s.' },
    vampire: { name: 'Vampire', tier: 6, cost: 255, kind: 'monster', place: 'floor', cat: 'monster', hp: 280, dmg: 28, rate: 1.0, speed: 2.4, leash: 4, drain: 0.6, undead: true, elite: true,
      desc: 'Drinks back 60% of every wound it deals. Clerics and paladins burn it.' },
    dullahan: { name: 'Dullahan', tier: 7, cost: 400, kind: 'monster', place: 'floor', cat: 'monster', hp: 600, dmg: 40, rate: 1.4, speed: 1.8, leash: 3, fear: 5, undead: true, elite: true,
      desc: 'The headless rider. A hero it strikes loses their nerve for 5s and runs at the first wound.' },
    chimera: { name: 'Chimera', tier: 8, cost: 620, kind: 'monster', place: 'floor', cat: 'monster', hp: 820, dmg: 36, rate: 1.2, speed: 1.9, leash: 3, breath: 30, breathR: 1.6, every: 5, heads: 2, elite: true,
      desc: 'Lion, goat and serpent: bites two heroes at once and breathes fire every 5s.' },
    // ------------------------------------------------ hordes: one den, a whole pack
    warren: { name: 'Kobold Warren', tier: 0, cost: 40, kind: 'monster', den: true, pack: 'kobold', count: 4, place: 'floor', cat: 'monster', leash: 3,
      desc: 'Horde. Four kobolds pour out of this hole when the gate opens.' },
    warband: { name: 'Orc Warband', tier: 3, cost: 150, kind: 'monster', den: true, pack: 'orc', count: 4, place: 'floor', cat: 'monster', leash: 3,
      desc: 'Horde. A camp of four orcs, fighting at this rank.' },
    nest: { name: 'Harpy Nest', tier: 5, cost: 290, kind: 'monster', den: true, pack: 'harpy', count: 3, place: 'floor', cat: 'monster', leash: 5,
      desc: 'Horde. Three harpies, fighting at this rank, roost here.' },
    // ------------------------------------------------ rooms: what stands near these gets stronger
    banner: { name: 'War Banner', tier: 2, cost: 45, kind: 'totem', place: 'floor', aura: 'monster', auraR: 2.5,
      desc: 'Monster room. Monsters posted within 2½ tiles hit 25% harder and have 15% more health.' },
    sigil: { name: 'Trapmaster’s Sigil', tier: 3, cost: 60, kind: 'totem', place: 'floor', aura: 'trap', auraR: 2.5,
      desc: 'Trap room. Traps within 2½ tiles deal 20% more damage and rearm 40% faster.' },
    // ------------------------------------------------ the boss seal
    seal: { name: 'Boss Seal', tier: 5, cost: 520, kind: 'seal', place: 'floor',
      desc: 'Needs a boss on this floor. While that boss lives, no hero on the floor can take the stairs or the gate, so nobody escapes. Only the rare Phantom Thief slips through. One per floor.' },
    // ------------------------------------------------ more bosses
    orcwarlord: { name: 'Orc Warlord', tier: 4, cost: 260, kind: 'monster', boss: true, place: 'floor', cat: 'monster', hp: 520, dmg: 28, rate: 1.2, speed: 1.6, leash: 3, summon: 'orc', every: 6, max: 3,
      desc: 'Boss. Blows a war horn every 6s and another orc answers, up to three.' },
    minotaurking: { name: 'Minotaur King', tier: 5, cost: 420, kind: 'monster', boss: true, place: 'floor', cat: 'monster', hp: 640, dmg: 34, rate: 1.3, speed: 1.8, leash: 4, charge: 1.6, quake: 22, quakeR: 1.8, every: 5,
      desc: 'Boss. Charges the farthest hero it can reach and stamps the ground every 5s.' },
    vampirelord: { name: 'Vampire Lord', tier: 7, cost: 1150, kind: 'monster', boss: true, myth: true, place: 'floor', cat: 'monster', hp: 900, dmg: 34, rate: 1.0, speed: 2.2, leash: 4, drain: 0.7, regen: 0.01, undead: true, summon: 'vampire', every: 9, max: 2,
      desc: 'Myth boss. Heals on every bite and turns the fallen into vampires that serve it.' },
    // summoned only
    imp: { name: 'Imp', tier: 6, cost: 0, kind: 'monster', summonOnly: true, place: 'floor', cat: 'monster', hp: 60, dmg: 10, rate: 0.7, speed: 2.8, leash: 5,
      desc: 'A demon lord’s servant.' },
    // the vengeful ghost of a legend, risen each night in the room where they fell
    spectre: { name: 'Spectre', tier: 6, cost: 0, kind: 'monster', summonOnly: true, place: 'floor', cat: 'illusion', hp: 150, dmg: 18, rate: 1.0, speed: 2.4, leash: 3, undead: true, drain: 0.3,
      desc: 'The ghost of a legend who died in your dungeon, guarding the room where they fell. It fights at the rank they had in life.' },
    // bait: a chest of real coin where you want heroes to stop
    bait: { name: 'Bait Chest', tier: 1, cost: 15, kind: 'bait', place: 'floor', value: 20,
      desc: 'A chest of real coin, left where you want heroes to stop. Greedy heroes, and strike teams passing within 4 tiles, go out of their way for it and stand still for 2 seconds to open it. Kill them before they leave: whoever carries it out takes its gold from your hoard.' },
  };
  for (const k in RD.ITEMS) RD.ITEMS[k].id = k;

  // Tags tie pieces to floor themes and to the heroes who counter them.
  RD.TAGS = {
    undead: ['skeleton', 'wraith', 'lich', 'vampire', 'dullahan', 'vampirelord', 'spectre'],
    fire: ['rune', 'dragon', 'demonlord', 'chimera', 'imp'],
    frost: ['frost', 'gravity'],
    poison: ['vent', 'poison', 'slime', 'spider', 'basilisk'],
    beast: ['goblin', 'kobold', 'orc', 'spider', 'harpy', 'minotaur', 'wyvern', 'warren', 'warband', 'nest', 'minotaurking', 'orcwarlord', 'hydra', 'chimera', 'troll', 'lizardman', 'brute', 'goblinking'],
    arcane: ['maze', 'siphon', 'abyss', 'pylon', 'teleport', 'gravity', 'mimic', 'gargoyle', 'golem'],
    mech: ['spikes', 'snare', 'crusher', 'darts', 'door', 'vault', 'cage', 'boulder', 'alarm', 'poison'],
    goblinoid: ['goblin', 'kobold', 'orc', 'goblinking', 'orcwarlord', 'warren', 'warband', 'imp'],
  };
  for (const [tag, list] of Object.entries(RD.TAGS)) for (const k of list) if (RD.ITEMS[k]) (RD.ITEMS[k].tags = RD.ITEMS[k].tags || []).push(tag);
  RD.hasTag = (type, tag) => !!(RD.ITEMS[type] && RD.ITEMS[type].tags && RD.ITEMS[type].tags.includes(tag));

  // Floor themes: each floor dug gets one, picked from three. Matching pieces on that floor get stronger.
  RD.THEMES = {
    halls: { name: 'Stone Halls', desc: 'Plain cut stone. No bonus, no weakness.', tint: null },
    crypt: { name: 'Crypt', desc: 'Undead have 35% more health and hit 20% harder here. The guild sends more clerics.', tag: 'undead', hp: 1.35, dmg: 1.2, tint: 'rgba(120,140,110,0.10)' },
    forge: { name: 'Forge', desc: 'Fire traps and fire-breathers deal 35% more damage here.', tag: 'fire', dmg: 1.35, tint: 'rgba(255,110,40,0.10)' },
    frozen: { name: 'Frozen Hollow', desc: 'Slows, pins and stuns last 50% longer here, and heroes walk 10% slower.', tag: 'frost', hold: 1.5, heroSlow: 0.9, tint: 'rgba(150,200,255,0.12)' },
    fungal: { name: 'Fungal Warren', desc: 'Poison and creeping things deal 40% more damage; hordes bring one extra monster.', tag: 'poison', dmg: 1.4, hordeExtra: 1, tint: 'rgba(130,190,90,0.10)' },
    arcane: { name: 'Arcane Labyrinth', desc: 'Glyphs and magical traps rearm 35% faster and deal 20% more damage.', tag: 'arcane', dmg: 1.2, rearm: 0.65, tint: 'rgba(180,140,230,0.10)' },
    lair: { name: 'Beast Lair', desc: 'Beasts have 20% more health and move 20% faster here.', tag: 'beast', hp: 1.2, speed: 1.2, tint: 'rgba(170,110,70,0.10)' },
    vault: { name: 'Gilded Vault', desc: 'Heroes who die here drop twice the gold, but greedy heroes walk in faster.', gold: 2, tint: 'rgba(227,176,75,0.08)' },
  };

  RD.BASIC = ['spikes', 'darts', 'goblin', 'skeleton', 'door'];
  RD.SPECIAL = Object.keys(RD.ITEMS).filter((k) => !RD.BASIC.includes(k) && !RD.ITEMS[k].boss && !RD.ITEMS[k].summonOnly);
  RD.BOSSES = Object.keys(RD.ITEMS).filter((k) => RD.ITEMS[k].boss);
  // the catalogue, grouped the way the blueprint panel shows it
  RD.GROUPS = [
    { id: 'traps', name: 'Traps', kinds: ['trap'] },
    { id: 'walls', name: 'Walls & doors', kinds: ['turret', 'door'] },
    { id: 'monsters', name: 'Monsters', kinds: ['monster'], boss: false, den: false },
    { id: 'hordes', name: 'Hordes', kinds: ['monster'], boss: false, den: true },
    { id: 'rooms', name: 'Rooms, seals & bait', kinds: ['totem', 'seal', 'bait'] },
    { id: 'bosses', name: 'Bosses', kinds: ['monster'], boss: true },
  ];
  RD.inGroup = (g, k) => {
    const d = RD.ITEMS[k];
    return !d.summonOnly && g.kinds.includes(d.kind) && (g.boss == null || !!d.boss === g.boss) && (g.den == null || !!d.den === g.den);
  };

  // Balance dials, tuned with headless bot games. Monsters and traps scale with these on top of rank and level.
  RD.BAL = { monHp: 1.55, monDmg: 1.25, trapDmg: 1.3, theft: 1 };
  // Anti-stacking rules. None of them changes what a single piece does; they stop pieces chaining.
  // They are switches so tools/fortress.js can compare a build with and without them.
  // Combos: one thing catches a hero, the next hits harder. Checked in this order; the first that fits counts.
  RD.COMBOS = {
    skewer: { name: 'Skewered', mult: 1.5, desc: 'A trap or wall piece hits a hero who is pinned or caged: +50% damage.', hint: 'Pin a hero with a Bear Trap, Iron Cage or Gravity Well where a Dart Slit, Storm Pylon or a blast (Fire Rune, Frost Sigil) can reach them.' },
    shatter: { name: 'Shatter', mult: 2, types: ['crusher', 'boulder', 'chasm', 'spikes'], desc: 'A crushing trap (Crusher, Rolling Boulder, False Floor or Spike Pit) hits a slowed hero: double damage.', hint: 'Slow them first (Frost Sigil, Gravity Well, slimes, spiders), then crush.' },
    kindling: { name: 'Kindling', mult: 1.3, desc: 'Fire hits a hero who is poisoned or standing in gas: +30%, and the blast scorches everyone within 1.2 tiles for a third of it.', hint: 'Gas or poison first (Miasma Vent, Poison Needle), then fire: a Fire Rune, an imp, a dragon or a chimera.' },
    ambush: { name: 'Ambush', mult: 1.5, desc: 'A monster hits a dazed hero: +50% damage.', hint: 'A Wandering Rune makes heroes lose their way. Have something waiting.' },
    pileon: { name: 'Pile-on', mult: 1.4, desc: 'A monster hits a hero who is knocked down or stunned: +40% damage.', hint: 'Knock them down (False Floor, Crusher, Tremor, a minotaur charge, a basilisk’s gaze) where monsters can reach.' },
    panic: { name: 'Panic', mult: 1.25, desc: 'A monster hits a terrified hero: +25% damage.', hint: 'Terrify them (a dullahan, or the Dread Whisper power) and chase.' },
  };
  RD.SOUL_MEND = 0.8; // a hero healed back above this share of their health can be siphoned again
  RD.RULES = { dazeRecovery: true, soulOnce: true, pylonSight: true, pylonSpacing: true, pylonJam: true };
  RD.PYLON_GAP = 4; // storm pylons need this many tiles between them; measured with tools/fortress.js
  // wall pieces that stack along a corridor need room between copies of the same kind (tools/survey.js)
  RD.GAP = { pylon: RD.PYLON_GAP, darts: 2 };
  RD.balOf = (type, key) => {
    const d = RD.ITEMS[type];
    if (d.kind === 'monster') return key === 'hp' ? RD.BAL.monHp : key === 'dmg' || key === 'breath' || key === 'quake' ? RD.BAL.monDmg : 1;
    if (d.kind === 'trap' || d.kind === 'turret') return key === 'dmg' || key === 'dps' ? RD.BAL.trapDmg : 1;
    return 1;
  };

  // A piece's real numbers: rank × level × balance. `key` is a stat listed at rank F.
  RD.scaled = (type, key, lv, tier) => RD.ITEMS[type][key] * RD.TIER_MULT[tier == null ? RD.ITEMS[type].tier : tier] * RD.levelMult(lv) * RD.balOf(type, key);

  // What a boss calls or a den releases, and the rank it fights at: summons one rank below their boss
  // (never below their own blueprint), horde packs at the den's rank. Both fight at the parent's level.
  RD.minionOf = (type, tier) => {
    const d = RD.ITEMS[type];
    if (tier == null) tier = d.tier;
    if (d.summon) return { type: d.summon, kind: 'summon', tier: Math.max(RD.ITEMS[d.summon].tier, tier - 1), max: d.max, every: d.every || 5 };
    if (d.den) return { type: d.pack, kind: 'horde', tier: Math.max(tier, RD.ITEMS[d.pack].tier), count: d.count };
    return null;
  };

  RD.TOOLS = {
    inspect: { name: 'Info', cost: 0, desc: 'Click any placed piece for everything about it: its numbers at its level, what boosts it on its floor, what it summons and who counters it. During a raid, just click a hero, monster or trap.' },
    dig: { name: 'Dig', cost: 6, desc: 'Carve rock into corridor. The outer wall cannot be dug.' },
    fill: { name: 'Fill', cost: 3, desc: 'Collapse an empty corridor tile into rock. The hoard must stay reachable.' },
    move: { name: 'Move', cost: 0, desc: 'Pick up a trap, monster or door and set it down somewhere else, on any floor. Free.' },
    upgrade: { name: 'Level up', cost: 0, desc: 'Click a placed piece to raise its level within its rank (up to Lv5). Each level adds 15% to damage and health, 15% to how long it pins, dazes, slows or stuns, and makes traps rearm 6% faster. Hover a piece to see the before and after.' },
    hoard: { name: 'Move Hoard', cost: 25, desc: 'Haul your treasure to another tile. Heroes who knew the old spot will be wrong.' },
    sell: { name: 'Sell', cost: 0, desc: 'Remove a piece and get back 60% of everything spent on it.' },
  };

  // Raid powers. `night` is the campaign night a power opens (Quick runs reach it sooner);
  // `target` powers are aimed at a tile. Costs grow with the ranks you have unlocked.
  RD.POWERS = {
    tremor: { name: 'Tremor', cost: 12, cd: 8, night: 1, target: true, radius: 1.6, desc: 'Click a tile. Heroes within a tile of it are knocked down for 2s and lose 6% of their health.' },
    douse: { name: 'Douse', cost: 10, cd: 20, night: 1, desc: 'Snuff every torch for 8s. Heroes see one tile ahead, slow down and cannot spot traps.' },
    mire: { name: 'Grasping Mire', cost: 12, cd: 14, night: 2, target: true, radius: 1.5, desc: 'Click a tile. Hands of mud hold every hero within 1.5 tiles for 1.5s, then slow them by half for 6s.' },
    lure: { name: 'Phantom Gold', cost: 14, cd: 18, night: 3, target: true, radius: 0.6, desc: 'Click a corridor. A false hoard glitters there for 10s, and heroes still hunting for gold go to it instead.' },
    collapse: { name: 'Cave-in', cost: 16, cd: 16, night: 5, target: true, radius: 0.5, desc: 'Click an empty corridor tile. The ceiling drops and blocks it for 8s. Heroes look for another way, or wait for the dust to settle.' },
    rearm: { name: 'Overcharge', cost: 18, cd: 30, night: 6, desc: 'Every trap rearms at once, even ones a rogue disarmed, and jammed wall traps shake free.' },
    frenzy: { name: 'Bloodlust', cost: 22, cd: 25, night: 8, desc: 'For 7s every monster hits 50% harder, attacks faster and runs 35% faster.' },
    mend: { name: 'Dark Mending', cost: 22, cd: 30, night: 9, desc: 'Every monster in the dungeon heals half of its health.' },
    raise: { name: 'Raise the Dead', cost: 26, cd: 28, night: 11, target: true, radius: 1, desc: 'Click a corridor. Two skeletons claw out of the floor there and fight until dawn.' },
    dread: { name: 'Dread Whisper', cost: 24, cd: 26, night: 12, target: true, radius: 2, desc: 'Click a tile. Heroes within 2 tiles hear their own deaths: for 8s they run at the first scratch.' },
    seal: { name: 'Seal the Gate', cost: 30, cd: 40, night: 14, desc: 'The front gate slams shut for 6s. Nobody leaves, so nobody reports.' },
    smite: { name: 'Doom Bolt', cost: 34, cd: 32, night: 16, target: true, radius: 0.8, desc: 'Click a hero. A bolt from the dark takes a quarter of their health (a legend’s, a sixth). It cannot be dodged.' },
    banish: { name: 'Banish', cost: 40, cd: 45, night: 19, target: true, radius: 0.8, desc: 'Click a hero. They vanish and reappear far from where they were heading, dazed for 2s.' },
  };
  RD.powerOpen = (G, k) => RD.age(G) >= RD.POWERS[k].night;
  RD.powerCost = (G, k) => Math.round(RD.POWERS[k].cost * (1 + 0.3 * RD.unlocked(G)));

  // ---------------------------------------------------------------- the heroes
  // Stats are at rank F. Unique classes are rare and only appear at `minTier` or above.
  RD.CLASSES = {
    knight: { name: 'Knight', hp: 110, speed: 1.6, dmg: 13, rate: 1.0, range: 1.15, vision: 3, brave: 0.7, greed: 0.2, fleeAt: 0.22, bash: 45, w: 3,
      desc: 'Heavy armour. Walks through danger and batters doors down.' },
    rogue: { name: 'Rogue', hp: 60, speed: 2.3, dmg: 9, rate: 0.7, range: 1.15, vision: 3, brave: 0.3, greed: 0.8, fleeAt: 0.35, bash: 12, pick: 3,
      detect: { mech: 0.6, magic: 0.25 }, detectR: 1.5, disarm: 1.4, w: 2,
      desc: 'Spots and disarms mechanisms. Cannot resist a chest.' },
    mage: { name: 'Mage', hp: 48, speed: 1.75, dmg: 19, rate: 1.4, range: 2.6, vision: 3, brave: 0.3, greed: 0.3, fleeAt: 0.35, bash: 15,
      detect: { magic: 0.6, illusion: 1 }, detectR: 2.3, w: 1.4,
      desc: 'Burns monsters from range. Sees through illusions and glyphs.' },
    cleric: { name: 'Cleric', hp: 80, speed: 1.65, dmg: 8, rate: 1.0, range: 1.15, vision: 3, brave: 0.5, greed: 0.3, fleeAt: 0.25, bash: 15, heal: 6, healR: 2.2, holy: 3, w: 1.2,
      desc: 'Mends nearby allies. Shatters the undead.' },
    scout: { name: 'Scout', hp: 55, speed: 2.7, dmg: 10, rate: 0.9, range: 3.1, vision: 5, brave: 0.2, greed: 0.4, fleeAt: 0.45, bash: 10, w: 1.6,
      desc: 'Sees far and runs early. The likeliest to bring a map home.' },
    ranger: { name: 'Ranger', minTier: 1, hp: 70, speed: 2.2, dmg: 14, rate: 1.0, range: 3.4, vision: 4, brave: 0.4, greed: 0.3, fleeAt: 0.35, bash: 12,
      detect: { mech: 0.35 }, detectR: 1.5, w: 1.4,
      desc: 'Shoots from far back and has a nose for snares and pits.' },
    berserker: { name: 'Berserker', minTier: 2, hp: 135, speed: 1.9, dmg: 17, rate: 0.8, range: 1.15, vision: 3, brave: 0.95, greed: 0.4, fleeAt: 0.06, bash: 55, rage: 1, w: 1.2,
      desc: 'Hits harder the more it bleeds, up to double damage near death. Almost never runs.' },
    alchemist: { name: 'Alchemist', minTier: 3, hp: 65, speed: 1.8, dmg: 15, rate: 1.3, range: 2.4, splash: 1.2, vision: 3, brave: 0.4, greed: 0.5, fleeAt: 0.35, bash: 15,
      cure: 2.5, detect: { mech: 0.2, magic: 0.35 }, detectR: 1.5, w: 1,
      desc: 'Throws flasks that splash every monster nearby, and frees allies from pins, dazes and slows.' },
    bard: { name: 'Bard', minTier: 4, hp: 80, speed: 2.0, dmg: 9, rate: 1.0, range: 2.2, vision: 4, brave: 0.5, greed: 0.5, fleeAt: 0.3, bash: 12, inspire: 0.25, w: 0.9,
      desc: 'Allies within 2½ tiles deal 25% more damage, move 10% faster and hold their nerve longer.' },
    // unique classes
    paladin: { name: 'Paladin', unique: true, minTier: 3, hp: 170, speed: 1.6, dmg: 16, rate: 1.0, range: 1.15, vision: 3, brave: 0.95, greed: 0.1, fleeAt: 0.12, bash: 50,
      heal: 5, healR: 2.2, holy: 2.5, w: 1,
      desc: 'Unique. A knight with a cleric’s blessing: heals allies and smites the undead.' },
    swordsaint: { name: 'Sword Saint', unique: true, minTier: 4, hp: 130, speed: 2.1, dmg: 32, rate: 0.7, range: 1.25, vision: 3, brave: 0.9, greed: 0.2, fleeAt: 0.15, bash: 60, cleave: 1.4, w: 0.8,
      desc: 'Unique. Every swing cuts through all monsters around it.' },
    shadow: { name: 'Shadow', unique: true, minTier: 4, hp: 80, speed: 2.6, dmg: 16, rate: 0.6, range: 1.15, vision: 4, brave: 0.5, greed: 0.5, fleeAt: 0.3, bash: 20, pick: 0.8,
      detect: { mech: 1, magic: 0.85, illusion: 0.5 }, detectR: 2.3, disarm: 0.5, w: 0.8,
      desc: 'Unique. Finds nearly every trap and unpicks it in half a second.' },
    archmage: { name: 'Archmage', unique: true, minTier: 5, hp: 75, speed: 1.8, dmg: 30, rate: 1.6, range: 3.1, vision: 4, brave: 0.5, greed: 0.2, fleeAt: 0.3, bash: 20, splash: 1.3,
      detect: { magic: 1, illusion: 1, mech: 0.3 }, detectR: 3, w: 0.6,
      desc: 'Unique. Spells burst over every monster near the target. Sees every glyph and illusion.' },
    saint: { name: 'Saint', unique: true, minTier: 6, hp: 120, speed: 1.7, dmg: 12, rate: 1.0, range: 1.15, vision: 3, brave: 0.7, greed: 0.1, fleeAt: 0.2, bash: 20,
      heal: 16, healR: 3, holy: 4, revive: true, w: 0.5,
      desc: 'Unique. Heals the whole party and raises the first ally who falls.' },
    dragonslayer: { name: 'Dragonslayer', unique: true, minTier: 5, hp: 210, speed: 1.8, dmg: 34, rate: 1.0, range: 1.25, vision: 3, brave: 1, greed: 0.2, fleeAt: 0.1, bash: 60,
      slayer: 2, fireward: 0.5, w: 0.6,
      desc: 'Unique. Hunts bosses: double damage against them and half damage from breath and quakes.' },
    monk: { name: 'Monk', minTier: 1, hp: 90, speed: 2.2, dmg: 12, rate: 0.6, range: 1.15, vision: 3, brave: 0.6, greed: 0.2, fleeAt: 0.2, bash: 40, dodge: 0.25, w: 1.2,
      desc: 'Bare-handed and quick. Dodges a quarter of all trap and monster damage.' },
    tamer: { name: 'Beast Tamer', minTier: 2, hp: 85, speed: 2.0, dmg: 10, rate: 1.0, range: 1.15, vision: 3, brave: 0.5, greed: 0.3, fleeAt: 0.3, bash: 15, tame: 2.5, w: 1,
      desc: 'Calms beasts of its own rank or lower within 2½ tiles: they stop fighting for 6s, every 12s.' },
    ninja: { name: 'Ninja', minTier: 3, hp: 75, speed: 2.7, dmg: 15, rate: 0.7, range: 1.15, vision: 4, brave: 0.4, greed: 0.4, fleeAt: 0.35, bash: 15, pick: 1.5,
      detect: { mech: 0.5, illusion: 0.5 }, detectR: 1.8, unbound: true, w: 1,
      desc: 'Cannot be slowed, pinned or caged. Spots mechanisms and illusions alike.' },
    samurai: { name: 'Samurai', minTier: 4, hp: 120, speed: 1.9, dmg: 22, rate: 1.0, range: 1.2, vision: 3, brave: 0.85, greed: 0.2, fleeAt: 0.15, bash: 50, firstStrike: 2.5, w: 1,
      desc: 'The first blow against each monster lands at 2½ times strength.' },
    darkknight: { name: 'Dark Knight', minTier: 5, hp: 150, speed: 1.7, dmg: 20, rate: 1.0, range: 1.15, vision: 3, brave: 0.85, greed: 0.3, fleeAt: 0.15, bash: 55, lifesteal: 0.3, w: 0.9,
      desc: 'Heals for 30% of the damage it deals.' },
    shieldhero: { name: 'Shield Hero', unique: true, minTier: 3, hp: 260, speed: 1.6, dmg: 6, rate: 1.0, range: 1.15, vision: 3, brave: 1, greed: 0.1, fleeAt: 0.1, bash: 40, taunt: 3, guard: 0.5, w: 0.8,
      desc: 'Unique. Every monster within 3 tiles attacks it instead of the party, and it takes half damage. Barely hits back.' },
    goblinslayer: { name: 'Goblin Slayer', unique: true, minTier: 2, hp: 140, speed: 1.9, dmg: 18, rate: 0.9, range: 1.15, vision: 3, brave: 0.9, greed: 0, fleeAt: 0.2, bash: 45,
      detect: { mech: 0.8 }, detectR: 1.5, bane: 'goblinoid', w: 0.8,
      desc: 'Unique. Triple damage to goblins, kobolds, orcs and imps, and an eye for their snares.' },
    phantomthief: { name: 'Phantom Thief', unique: true, minTier: 5, hp: 110, speed: 2.8, dmg: 14, rate: 0.6, range: 1.15, vision: 4, brave: 0.5, greed: 1, fleeAt: 0.4, bash: 20, pick: 0.6,
      detect: { mech: 0.7, magic: 0.7 }, detectR: 2, disarm: 0.8, sealwalker: true, thief: 2, w: 0.5,
      desc: 'Unique. Walks through boss seals as if they were not there, and carries off twice the gold.' },
    sage: { name: 'Sage', unique: true, minTier: 6, hp: 100, speed: 1.8, dmg: 20, rate: 1.4, range: 2.8, vision: 5, brave: 0.6, greed: 0.2, fleeAt: 0.3, bash: 20, cure: 3,
      detect: { magic: 1, illusion: 1, mech: 0.6 }, detectR: 3.5, w: 0.5,
      desc: 'Unique. Sees almost every trap within 3½ tiles and lifts dazes, pins and slows from the party.' },
    chosen: { name: 'Chosen Hero', unique: true, minTier: 7, hp: 280, speed: 2.0, dmg: 42, rate: 0.9, range: 1.25, vision: 4, brave: 1, greed: 0, fleeAt: 0, bash: 80, slayer: 2.5, heal: 3, healR: 1.5, w: 0.15,
      desc: 'Unique. Born to end demon lords. Deals 2.5× damage to bosses and never runs.' },
  };
  RD.COMMON = ['knight', 'rogue', 'mage', 'cleric', 'scout', 'ranger', 'berserker', 'alchemist', 'bard', 'monk', 'tamer', 'ninja', 'samurai', 'darkknight'];
  RD.UNIQUE = Object.keys(RD.CLASSES).filter((k) => RD.CLASSES[k].unique);
  RD.TITLES = { paladin: 'the Radiant', swordsaint: 'of the Thousand Cuts', shadow: 'the Unseen', archmage: 'the Starborn', saint: 'the Merciful', dragonslayer: 'the Wyrmbane', shieldhero: 'of the Iron Shield', goblinslayer: 'who Hunts Goblins', phantomthief: 'the Uncatchable', sage: 'of the Thousand Tomes', chosen: 'the Chosen' };

  RD.TRAITS = {
    greedy: { icon: '💰', name: 'Greedy', w: 3, desc: 'Detours for any chest it sees.' },
    coward: { icon: '😨', name: 'Craven', w: 2, desc: 'Runs at half health.' },
    reckless: { icon: '💢', name: 'Reckless', w: 2, desc: 'Ignores warnings and rarely retreats.' },
    keen: { icon: '👁', name: 'Keen-eyed', w: 2, desc: 'Has a chance to spot any hidden trap next to it.' },
    stone: { icon: '🔮', name: 'Sending Stone', w: 1.2, desc: 'Reports to the guild even if it dies. The guild hands out more of them after a party vanishes.' },
    stout: { icon: '🛡', name: 'Stout', w: 2, desc: '+25% health.' },
    swift: { icon: '💨', name: 'Swift', w: 2, desc: '+20% speed.' },
  };

  RD.OMENS = [
    { id: 'calm', name: 'Quiet Night', text: 'No omen. The stones settle.' },
    { id: 'moon', name: 'Blood Moon', text: 'Your monsters strike 30% harder tonight.' },
    { id: 'bounty', name: 'Royal Bounty', text: 'A bounty is posted. One more hero comes, and all of them are greedier.' },
    { id: 'leak', name: 'Sold Survey', text: 'A surveyor sold part of your floor plan. The guild now knows 8 tiles as they stand right now.' },
    { id: 'dark', name: 'Wet Torches', text: 'The heroes see one tile less than usual.' },
    { id: 'ash', name: 'Rain of Ash', text: 'Your traps rearm twice as fast.' },
    { id: 'pilgrims', name: 'Pilgrimage', text: 'A cleric joins the party for free.' },
    { id: 'feud', name: 'Feuding Party', text: 'The heroes quarrel. Tonight they do not tell each other what they find.' },
    { id: 'tithe', name: 'Dark Tithe', text: '+30 malice, paid in advance.' },
  ];

  RD.NAMES = {
    first: ['Aldric', 'Brann', 'Mira', 'Sefa', 'Oren', 'Tamsin', 'Iolo', 'Wren', 'Kestrel', 'Dagny', 'Hollis', 'Ysolde',
      'Corin', 'Bex', 'Anselm', 'Rook', 'Petra', 'Ulf', 'Nim', 'Cass', 'Jory', 'Elowen', 'Garrick', 'Fen', 'Liesl',
      'Odo', 'Saoirse', 'Tobin', 'Vey', 'Maud', 'Ivo', 'Agnet', 'Hesk', 'Pell', 'Rowan', 'Talia'],
    last: ['Ashvale', 'Thornby', 'Coldwater', 'Merrow', 'Hale', 'Brightwell', 'Quill', 'Duskmantle', 'Vane', 'Fairweather',
      'Stonecroft', 'Pike', 'Lark', 'Underhill', 'Mossgrave', 'Tallow', 'Crane', 'Holloway', 'Fernsby', 'Grieve', 'Oakhart'],
  };

  // Tavern talk. {c} = grid coordinate, {w} = what was there, {n} = a count.
  RD.RUMOR = {
    hoard: ['The gold sits at {c}. Straight in, straight out.', 'Hoard\'s at {c}. I had my hands in it.', 'Follow the glitter to {c}.'],
    stairs: ['Stairs going down at {c}. It gets worse below.', 'There\'s another level. The way down is at {c}.'],
    trap: ['{W} at {c}. Step light or step around.', 'Mind {c}. There\'s a {w} under the dust.', 'Lost a good friend to the {w} at {c}.'],
    turret: ['Something in the wall at {c} shoots. Keep moving.', 'The rock at {c} spits death down the corridor.'],
    lair: ['A {w} guards {c}. Bring better steel.', '{W} at {c}. Don\'t go alone.', 'I saw a {w} near {c} and walked the other way.'],
    boss: ['There is a {w} at {c}. The guild should send its best.', 'I saw the {w} at {c}. I won\'t go back.'],
    lord: ['A demon lord sits at {c}. Ring every bell in the kingdom.'],
    mimic: ['The chest at {c} has teeth.', 'Leave the chest at {c} alone.'],
    door: ['Locked door at {c}. Bring a knight or a lockpick.', 'Iron door at {c}.'],
    gone: ['The {w} at {c} was gone. Someone moved it.', 'No {w} at {c} any more. The place changes.'],
    shift: ['The walls moved since the last map. Trust nothing old.', 'It\'s not the same dungeon twice. Watch your feet.'],
    map: ['I charted {n} more tiles of the place.', 'Added {n} tiles to the guild map.'],
    none: ['Nobody came back. The guild is guessing.', 'Not one of them returned. The tavern is quiet.'],
  };
  // The Dungeon Core: the voice of the dungeon itself. {n} hero, {t} title, {c} class, {g} gold, {m} monster, {k} count, {night}.
  RD.VOICE = {
    night: ['Night {night}. {k} heroes on their way. How generous of the guild.', 'Fresh adventurers. I can smell the optimism.', 'Build quickly, keeper. They are sharpening their swords.', 'Another party, all of them sure they are the main character.', '{k} heroes tonight. I hope they brought snacks. For me.'],
    legend: ['A legend comes tonight: {n} {t}. Make it a short legend.', '{n} {t}. The bards will need a sadder song.', 'They are sending {n} {t}. I am flattered.'],
    gate: ['Come in. Mind the floor.', 'The gate is open. Dinner is served.', 'Welcome, heroes. Please, touch everything.', 'Doors open. Let the screaming begin.', 'In you come. Nobody has ever regretted it. Out loud.'],
    first: ['First blood. Delicious.', '{n} will not be filing a report.', 'One down. The others did not even notice.'],
    kill: ['Another one for the bone pile.', '{n} the {c}. Forgotten already.', 'The guild will need a new {c}.', 'Mm. Crunchy.', 'Do not worry, {n}. I will look after your boots.', 'That {c} looked expensive. Looked.'],
    legendKill: ['{n} {t}! They will sing about this. Badly.', 'A legend, ended. I will keep the sword.', 'So much for destiny, {n}.'],
    nemesisKill: ['{n}. Finally. I saved a spot for you.', 'The nemesis falls. Collect the bounty, keeper.'],
    last: ['And that is the last of them.', 'Silence. My favourite sound.', 'All of them. Every last one.'],
    escape: ['{n} got out. Now the guild knows.', 'A witness. I hate witnesses.', 'Run, {n}. Tell them what you saw. Then come back.'],
    escapeGold: ['{n} is walking off with {g} of my gold!', 'Thief! {g} gold, gone.', 'That was MY treasure, {n}.'],
    loot: ['Hands OFF the hoard!', '{n} is in the vault. Stop them!', 'Someone is touching my gold. Do something.'],
    flee: ['Running already, {n}?', 'Look at {n} go.', 'Leaving so soon, {n}? You just got here.'],
    bossDown: ['They killed my {m}! Unforgivable.', 'The {m} has fallen. I am taking this personally.'],
    perfect: ['Not a single survivor. The guild learns nothing.', 'Flawless. They walked in as heroes and stayed as decor.'],
    robbed: ['They took {g} gold. I want it back with interest.', 'My hoard is lighter. My mood is darker.'],
    thin: ['The hoard is getting thin, keeper. Very thin.'],
    ghost: ['{n} {t} will not rest. Good.', 'Death was not the end for {n}. Not here.', 'Welcome back, {n}. You work for me now.'],
    combo: ['{c}! Beautiful.', 'Now THAT is craftsmanship.', '{c}. I felt that one.', 'Did you see that? {c}!'],
    power: {
      tremor: ['Feel that?'], douse: ['Lights out.'], mire: ['Stay a while.'], lure: ['Ooh, shiny.'], collapse: ['Mind your heads.'],
      rearm: ['Wake up, my lovelies.'], frenzy: ['Feed!'], mend: ['Up you get.'], raise: ['Rise. You have work to do.'],
      dread: ['Can you hear it? That is your future.'], seal: ['Nobody leaves.'], smite: ['Begone.'], banish: ['Not that way.'],
    },
  };

  // How a night went, from S (nobody got out, nothing taken) down to F.
  RD.nightGrade = function (d) {
    const n = d.killed.length + d.escaped.length;
    if (!n) return 'C';
    const kill = d.killed.length / n;
    if (kill === 1 && !d.goldLost && d.killed.length >= 2) return 'S';
    if (kill >= 0.75 && d.goldLost <= 10) return 'A';
    if (kill >= 0.5 && d.goldLost <= 40) return 'B';
    if (kill >= 0.25 || d.goldLost <= 20) return 'C';
    if (kill > 0) return 'D';
    return 'F';
  };

  RD.WHAT = { trap: 'trap', turret: 'dart slit', monster: 'monster', door: 'door', hoard: 'hoard', chest: 'chest', stairs: 'stairs' };
  for (const k in RD.ITEMS) RD.WHAT[k] = RD.ITEMS[k].name.toLowerCase();
  RD.WHAT.mimic = 'chest';
})();
