'use strict';
// Static tables: pieces you can build, hero classes, traits, omens, names and tavern talk.
(function () {
  const RD = (window.RD = window.RD || {});

  RD.COLS = 17;
  RD.ROWS = 11;
  RD.N = RD.COLS * RD.ROWS;
  RD.RAIDS_TO_WIN = 10;
  RD.RAID_TIME_LIMIT = 150;

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

  // ---------------------------------------------------------------- what the dungeon can build
  // kind: trap | turret | monster | door.  place: floor | wall.
  // sense: which hero senses can find it (mech = rogues, magic = mages/rogues, illusion = mages).
  // cat: what the guild blames when a hero dies to it.
  RD.ITEMS = {
    spikes: {
      name: 'Spike Pit', cost: 14, kind: 'trap', place: 'floor', hidden: true, sense: 'mech', cat: 'trap',
      dmg: 34, rearm: 3,
      desc: 'Hidden pit. 34 damage to whoever steps in, half if they knew it was there. Rearms in 3s.',
    },
    darts: {
      name: 'Dart Slit', cost: 24, kind: 'turret', place: 'wall', cat: 'turret',
      dmg: 9, rate: 1.1, range: 4,
      desc: 'Set into rock beside a corridor. Shoots down straight passages up to 4 tiles away.',
    },
    skeleton: {
      name: 'Skeleton', cost: 18, kind: 'monster', place: 'floor', cat: 'monster',
      hp: 48, dmg: 9, rate: 0.9, speed: 2.1, leash: 3, undead: true,
      desc: 'Cheap and tireless. Guards 3 tiles around its post. Clerics shatter it.',
    },
    door: {
      name: 'Iron Door', cost: 16, kind: 'door', place: 'floor', hp: 110,
      desc: 'Holds a corridor shut until broken. Knights batter it fast, rogues pick the lock.',
    },
    rune: {
      name: 'Fire Rune', cost: 28, kind: 'trap', place: 'floor', hidden: true, sense: 'magic', cat: 'trap',
      dmg: 34, radius: 1.5, oneShot: true,
      desc: 'Hidden glyph. Burns every hero within one tile for 34. Spent after one blast per raid.',
    },
    chasm: {
      name: 'False Floor', cost: 34, kind: 'trap', place: 'floor', hidden: true, sense: 'illusion', cat: 'illusion',
      dmg: 70, stun: 2.2,
      desc: 'An illusion laid over a drop. 70 damage and a long climb out. Mages see through it.',
    },
    mimic: {
      name: 'Mimic', cost: 30, kind: 'monster', place: 'floor', sense: 'illusion', cat: 'illusion',
      hp: 95, dmg: 17, rate: 1.2, speed: 1.4, leash: 1, lure: true,
      desc: 'Looks like a treasure chest. Greedy heroes walk over to open it.',
    },
    brute: {
      name: 'Cave Brute', cost: 44, kind: 'monster', place: 'floor', cat: 'monster',
      hp: 180, dmg: 21, rate: 1.5, speed: 1.15, leash: 2,
      desc: 'Slow, huge, and hits like a rockfall. Guards 2 tiles around its post.',
    },
    slime: {
      name: 'Bog Slime', cost: 20, kind: 'monster', place: 'floor', cat: 'monster',
      hp: 64, dmg: 4, rate: 0.8, speed: 1.3, leash: 2, slows: true,
      desc: 'Weak bite, but whatever it touches moves at half speed for 2s.',
    },
    vent: {
      name: 'Miasma Vent', cost: 26, kind: 'trap', place: 'floor', hidden: true, sense: 'mech', cat: 'trap',
      dps: 9, dur: 4, radius: 1.5, rearm: 8,
      desc: 'Hidden grate. Fills a 3×3 area with bad air: 9 damage per second for 4s.',
    },
    maze: {
      name: 'Wandering Rune', cost: 24, kind: 'trap', place: 'floor', hidden: true, sense: 'magic', cat: 'illusion',
      confuse: 5, rearm: 6,
      desc: 'Hidden glyph. The hero who steps on it wanders aimlessly for 5s.',
    },
  };
  RD.BASIC = ['spikes', 'darts', 'skeleton', 'door'];
  RD.SPECIAL = ['rune', 'chasm', 'mimic', 'brute', 'slime', 'vent', 'maze'];

  RD.TOOLS = {
    dig: { name: 'Dig', cost: 6, desc: 'Carve rock into corridor. The outer wall cannot be dug.' },
    fill: { name: 'Fill', cost: 3, desc: 'Collapse an empty corridor tile into rock. The hoard must stay reachable.' },
    move: { name: 'Move', cost: 0, desc: 'Pick up a trap, monster or door and set it down somewhere else. Free.' },
    hoard: { name: 'Move Hoard', cost: 25, desc: 'Haul your treasure to another tile. Heroes who knew the old spot will be wrong.' },
    upgrade: { name: 'Upgrade', cost: 0, desc: 'Click a placed piece to raise its rank. Each rank adds 40% to its damage, health or toughness. Every rank costs more than the last.' },
    sell: { name: 'Sell', cost: 0, desc: 'Remove a piece and get back 60% of everything spent on it.' },
  };

  // Ranked pieces keep up with heroes who grow stronger every raid.
  RD.rankMult = (it) => 1 + 0.4 * ((it.rank || 1) - 1);
  RD.upgradeCost = (it) => Math.round(RD.ITEMS[it.type].cost * 0.75 * (it.rank || 1));

  RD.POWERS = {
    tremor: { name: 'Tremor', cost: 12, cd: 8, desc: 'Click a tile. Heroes within a tile of it are knocked down for 2s and take 8 damage.' },
    douse: { name: 'Douse', cost: 10, cd: 20, desc: 'Snuff every torch for 8s. Heroes see one tile ahead, slow down and cannot spot traps.' },
  };

  // ---------------------------------------------------------------- the heroes
  RD.CLASSES = {
    knight: {
      name: 'Knight', hp: 110, speed: 1.6, dmg: 13, rate: 1.0, range: 1.15, vision: 3,
      brave: 0.7, greed: 0.2, fleeAt: 0.22, bash: 45,
      desc: 'Heavy armour. Walks through danger and batters doors down.',
    },
    rogue: {
      name: 'Rogue', hp: 60, speed: 2.3, dmg: 9, rate: 0.7, range: 1.15, vision: 3,
      brave: 0.3, greed: 0.8, fleeAt: 0.35, bash: 12, pick: 3,
      detect: { mech: 0.6, magic: 0.25 }, detectR: 1.5, disarm: 1.4,
      desc: 'Spots and disarms mechanisms it knows about. Cannot resist a chest.',
    },
    mage: {
      name: 'Mage', hp: 48, speed: 1.75, dmg: 19, rate: 1.4, range: 2.6, vision: 3,
      brave: 0.3, greed: 0.3, fleeAt: 0.35, bash: 15,
      detect: { magic: 0.6, illusion: 1 }, detectR: 2.3,
      desc: 'Burns monsters from range. Sees through illusions and glyphs.',
    },
    cleric: {
      name: 'Cleric', hp: 80, speed: 1.65, dmg: 8, rate: 1.0, range: 1.15, vision: 3,
      brave: 0.5, greed: 0.3, fleeAt: 0.25, bash: 15, heal: 6, healR: 2.2, holy: 3,
      desc: 'Mends nearby allies. Shatters the undead.',
    },
    scout: {
      name: 'Scout', hp: 55, speed: 2.7, dmg: 10, rate: 0.9, range: 3.1, vision: 5,
      brave: 0.2, greed: 0.4, fleeAt: 0.45, bash: 10,
      desc: 'Sees far and runs early. The likeliest to bring a map home.',
    },
  };

  RD.TRAITS = {
    greedy: { name: 'Greedy', w: 3, desc: 'Detours for any chest it sees.' },
    coward: { name: 'Craven', w: 2, desc: 'Runs at half health.' },
    reckless: { name: 'Reckless', w: 2, desc: 'Ignores warnings and rarely retreats.' },
    keen: { name: 'Keen-eyed', w: 2, desc: 'Has a chance to spot any hidden trap next to it.' },
    stone: { name: 'Sending Stone', w: 1.2, desc: 'Reports to the guild even if it dies.' },
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
    trap_spikes: ['Spike pit at {c}. Step light or step around.', 'Mind {c}. There are spikes under the dust.'],
    trap_rune: ['A fire glyph at {c}. Don\'t bunch up near it.', 'Something scorched the floor at {c}. Spread out there.'],
    trap_chasm: ['The floor at {c} is a lie. There\'s nothing under it.', 'Don\'t trust the stones at {c}.'],
    trap_vent: ['Bad air comes up at {c}. Hold your breath.', 'Grate at {c}. Green smoke.'],
    trap_maze: ['Something at {c} turns your feet around.', 'I lost myself at {c}. Walked in circles.'],
    turret: ['Dart slit in the wall at {c}. Keep moving past it.', 'Arrows come out of the rock at {c}.'],
    lair_skeleton: ['Bones walk near {c}. Bring a cleric.', 'Skeleton on watch at {c}.'],
    lair_brute: ['A brute the size of a cart guards {c}.', 'Don\'t go near {c} without a shield wall.'],
    lair_slime: ['Slime at {c}. It sticks to your boots.', 'Something wet lives at {c}.'],
    lair_mimic: ['The chest at {c} has teeth.', 'Leave the chest at {c} alone.'],
    door: ['Iron door at {c}. Bring a knight or a lockpick.', 'Locked door at {c}.'],
    gone: ['The {w} at {c} was gone. Someone moved it.', 'No {w} at {c} any more. The place changes.'],
    shift: ['The walls moved since the last map. Trust nothing old.', 'It\'s not the same dungeon twice. Watch your feet.'],
    map: ['I charted {n} more tiles of the place.', 'Added {n} tiles to the guild map.'],
    none: ['Nobody came back. The guild is guessing.', 'Not one of them returned. The tavern is quiet.'],
  };
  RD.WHAT = {
    trap: 'trap', spikes: 'spike pit', rune: 'fire glyph', chasm: 'false floor', vent: 'vent', maze: 'glyph',
    turret: 'dart slit', darts: 'dart slit', skeleton: 'skeleton', brute: 'brute', slime: 'slime', mimic: 'chest',
    door: 'door', hoard: 'hoard',
  };
})();
