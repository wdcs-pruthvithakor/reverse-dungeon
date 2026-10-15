'use strict';
// Static tables: ranks, pieces you can build, hero classes, traits, omens, difficulty, names and tavern talk.
(function () {
  const RD = (window.RD = window.RD || {});

  RD.COLS = 17;
  RD.ROWS = 11;
  RD.N = RD.COLS * RD.ROWS;
  RD.raidTime = (G) => 140 + 60 * G.floors; // deeper dungeons get longer nights

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
  RD.MAX_FLOORS = 5;
  RD.FLOOR_UNLOCK = [1, 4, 9, 14, 19];
  RD.FLOOR_COST = [0, 40, 110, 240, 420];
  RD.ROMAN = ['I', 'II', 'III', 'IV', 'V'];

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
  // a run's score: nights held, heroes slain, legends, and a bonus for winning
  RD.score = (G) => 20 * G.stats.held + 10 * G.stats.slain + 40 * G.stats.legends + (G.result === 'won' ? 250 + G.gold : 0);

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
      desc: 'Hidden glyph. The hero who steps on it wanders aimlessly for 5s. Levels make the daze last longer.' },
    vent: { name: 'Miasma Vent', tier: 2, cost: 36, kind: 'trap', place: 'floor', hidden: true, sense: 'mech', cat: 'trap', dps: 6, dur: 4, radius: 1.5, rearm: 8,
      desc: 'Hidden grate. Fills a 3×3 area with bad air for 4s.' },
    rune: { name: 'Fire Rune', tier: 2, cost: 40, kind: 'trap', place: 'floor', hidden: true, sense: 'magic', cat: 'trap', dmg: 22, radius: 1.5, oneShot: true,
      desc: 'Hidden glyph. Burns every hero within one tile. Spent after one blast per raid.' },
    chasm: { name: 'False Floor', tier: 3, cost: 58, kind: 'trap', place: 'floor', hidden: true, sense: 'illusion', cat: 'illusion', dmg: 30, stun: 2.2, rearm: 4,
      desc: 'An illusion laid over a drop. Heavy damage and a long climb out. Mages see through it.' },
    crusher: { name: 'Crusher', tier: 3, cost: 62, kind: 'trap', place: 'floor', hidden: true, sense: 'mech', cat: 'trap', dmg: 46, rearm: 10,
      desc: 'A ceiling block on a hair trigger. Enormous damage, slow to winch back up.' },
    frost: { name: 'Frost Sigil', tier: 4, cost: 96, kind: 'trap', place: 'floor', hidden: true, sense: 'magic', cat: 'trap', dmg: 12, radius: 1.5, slow: 5, rearm: 7,
      desc: 'Hidden glyph. Freezes every hero within one tile to half speed for 5s.' },
    siphon: { name: 'Soul Siphon', tier: 6, cost: 250, kind: 'trap', place: 'floor', hidden: true, sense: 'magic', cat: 'trap', dmg: 8, pct: 0.3, rearm: 9,
      desc: 'Tears away 30% of the victim’s health, however strong they are.' },
    abyss: { name: 'Abyss Gate', tier: 7, cost: 400, kind: 'trap', place: 'floor', hidden: true, sense: 'illusion', cat: 'illusion', dmg: 14, rearm: 12,
      desc: 'An illusion of open floor. Whoever steps through is thrown back out of the front gate.' },
    // wall pieces
    darts: { name: 'Dart Slit', tier: 0, cost: 24, kind: 'turret', place: 'wall', cat: 'turret', dmg: 9, rate: 1.1, range: 4,
      desc: 'Set into rock beside a corridor. Shoots down straight passages up to 4 tiles away.' },
    pylon: { name: 'Storm Pylon', tier: 5, cost: 160, kind: 'turret', place: 'wall', cat: 'turret', dmg: 12, rate: 1.6, range: 3, chain: 3,
      desc: 'Set into rock. Lightning leaps between up to 3 heroes within 3 tiles.' },
    // obstacles
    door: { name: 'Iron Door', tier: 0, cost: 16, kind: 'door', place: 'floor', hp: 110,
      desc: 'Holds a corridor shut until broken. Knights batter it fast, rogues pick the lock.' },
    vault: { name: 'Runed Vault Door', tier: 4, cost: 90, kind: 'door', place: 'floor', hp: 160, nopick: true,
      desc: 'No lock to pick. It has to be broken, and it takes a beating.' },
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
    // summoned only
    imp: { name: 'Imp', tier: 6, cost: 0, kind: 'monster', summonOnly: true, place: 'floor', cat: 'monster', hp: 60, dmg: 10, rate: 0.7, speed: 2.8, leash: 5,
      desc: 'A demon lord’s servant.' },
  };
  for (const k in RD.ITEMS) RD.ITEMS[k].id = k;

  RD.BASIC = ['spikes', 'darts', 'goblin', 'skeleton', 'door'];
  RD.SPECIAL = Object.keys(RD.ITEMS).filter((k) => !RD.BASIC.includes(k) && !RD.ITEMS[k].boss && !RD.ITEMS[k].summonOnly);
  RD.BOSSES = Object.keys(RD.ITEMS).filter((k) => RD.ITEMS[k].boss);
  // the catalogue, grouped the way the blueprint panel shows it
  RD.GROUPS = [
    { id: 'traps', name: 'Traps', kinds: ['trap'] },
    { id: 'walls', name: 'Walls & doors', kinds: ['turret', 'door'] },
    { id: 'monsters', name: 'Monsters', kinds: ['monster'], boss: false },
    { id: 'bosses', name: 'Bosses', kinds: ['monster'], boss: true },
  ];
  RD.inGroup = (g, k) => {
    const d = RD.ITEMS[k];
    return !d.summonOnly && g.kinds.includes(d.kind) && (g.boss == null || !!d.boss === g.boss);
  };

  // Balance dials, tuned with headless bot games. Monsters and traps scale with these on top of rank and level.
  RD.BAL = { monHp: 1.5, monDmg: 1.2, trapDmg: 1.3, theft: 1 };
  RD.balOf = (type, key) => {
    const d = RD.ITEMS[type];
    if (d.kind === 'monster') return key === 'hp' ? RD.BAL.monHp : key === 'dmg' || key === 'breath' || key === 'quake' ? RD.BAL.monDmg : 1;
    if (d.kind === 'trap' || d.kind === 'turret') return key === 'dmg' || key === 'dps' ? RD.BAL.trapDmg : 1;
    return 1;
  };

  // A piece's real numbers: rank × level × balance. `key` is a stat listed at rank F.
  RD.scaled = (type, key, lv, tier) => RD.ITEMS[type][key] * RD.TIER_MULT[tier == null ? RD.ITEMS[type].tier : tier] * RD.levelMult(lv) * RD.balOf(type, key);

  RD.TOOLS = {
    dig: { name: 'Dig', cost: 6, desc: 'Carve rock into corridor. The outer wall cannot be dug.' },
    fill: { name: 'Fill', cost: 3, desc: 'Collapse an empty corridor tile into rock. The hoard must stay reachable.' },
    move: { name: 'Move', cost: 0, desc: 'Pick up a trap, monster or door and set it down somewhere else, on any floor. Free.' },
    upgrade: { name: 'Level up', cost: 0, desc: 'Click a placed piece to raise its level within its rank (up to Lv5). Each level adds 15% to damage and health, 15% to how long it pins, dazes, slows or stuns, and makes traps rearm 6% faster. Hover a piece to see the before and after.' },
    hoard: { name: 'Move Hoard', cost: 25, desc: 'Haul your treasure to another tile. Heroes who knew the old spot will be wrong.' },
    sell: { name: 'Sell', cost: 0, desc: 'Remove a piece and get back 60% of everything spent on it.' },
  };

  RD.POWERS = {
    tremor: { name: 'Tremor', cost: 12, cd: 8, desc: 'Click a tile. Heroes within a tile of it are knocked down for 2s and lose 6% of their health.' },
    douse: { name: 'Douse', cost: 10, cd: 20, desc: 'Snuff every torch for 8s. Heroes see one tile ahead, slow down and cannot spot traps.' },
  };

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
    chosen: { name: 'Chosen Hero', unique: true, minTier: 7, hp: 280, speed: 2.0, dmg: 42, rate: 0.9, range: 1.25, vision: 4, brave: 1, greed: 0, fleeAt: 0, bash: 80, slayer: 2.5, heal: 3, healR: 1.5, w: 0.15,
      desc: 'Unique. Born to end demon lords. Deals 2.5× damage to bosses and never runs.' },
  };
  RD.COMMON = ['knight', 'rogue', 'mage', 'cleric', 'scout', 'ranger', 'berserker', 'alchemist', 'bard'];
  RD.UNIQUE = Object.keys(RD.CLASSES).filter((k) => RD.CLASSES[k].unique);
  RD.TITLES = { paladin: 'the Radiant', swordsaint: 'of the Thousand Cuts', shadow: 'the Unseen', archmage: 'the Starborn', saint: 'the Merciful', dragonslayer: 'the Wyrmbane', chosen: 'the Chosen' };

  RD.TRAITS = {
    greedy: { name: 'Greedy', w: 3, desc: 'Detours for any chest it sees.' },
    coward: { name: 'Craven', w: 2, desc: 'Runs at half health.' },
    reckless: { name: 'Reckless', w: 2, desc: 'Ignores warnings and rarely retreats.' },
    keen: { name: 'Keen-eyed', w: 2, desc: 'Has a chance to spot any hidden trap next to it.' },
    stone: { name: 'Sending Stone', w: 1.2, desc: 'Reports to the guild even if it dies. The guild hands out more of them after a party vanishes.' },
    stout: { name: 'Stout', w: 2, desc: '+25% health.' },
    swift: { name: 'Swift', w: 2, desc: '+20% speed.' },
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
  RD.WHAT = { trap: 'trap', turret: 'dart slit', monster: 'monster', door: 'door', hoard: 'hoard', chest: 'chest', stairs: 'stairs' };
  for (const k in RD.ITEMS) RD.WHAT[k] = RD.ITEMS[k].name.toLowerCase();
  RD.WHAT.mimic = 'chest';
})();
