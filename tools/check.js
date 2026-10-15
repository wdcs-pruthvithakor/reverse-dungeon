// Regression checks: bosses, the Chosen Hero, a full raid, save round trips, old saves, modes and pacts.
//   node tools/check.js
const RD = require('./load')();
let fails = 0;
const ok = (name, cond) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) fails++; };

const G = RD.newGame(77, 'normal');
G.raid = 26; G.malice = 99999; RD.beginBuild(G, false);
while (!RD.canOpenFloor(G)) RD.openFloor(G);
for (const [f, b] of ['goblinking', 'lich', 'dragon', 'hydra', 'demonlord'].entries()) for (let i = f * RD.N; i < (f + 1) * RD.N; i++) if (!RD.check(G, b, i)) { RD.apply(G, b, i); break; }
const lord = [...G.items.values()].find((it) => it.type === 'demonlord');
G.guild.K.lairs.set(lord.tile, 'demonlord');
RD.beginBuild(G, false);
ok('a known Demon Lord brings the Chosen Hero', G.party.some((h) => h.cls === 'chosen'));
ok('a second boss on one floor is refused', !!RD.check(G, 'behemoth', [...G.items.values()].find((it) => it.type === 'hydra').tile + 1));
RD.startRaid(G);
for (let n = 0; G.phase === 'raid' && n < 30000; n++) RD.step(G, 1 / 30);
const L = G.R.log.map((l) => l.text), saw = (re) => L.some((t) => re.test(t));
ok('the raid ends', G.phase !== 'raid');
ok('bosses summon and breathe, heroes take stairs', saw(/calls a/) && saw(/breathes fire|hellfire/) && saw(/takes the stairs/));
if (G.phase !== 'build') RD.nextNight(G);
const s1 = JSON.stringify(RD.saveGame(G)), s2 = JSON.stringify(RD.saveGame(RD.loadGame(JSON.parse(s1))));
ok('save → load → save is identical', s1 === s2);
ok('a save stays under 1 MB', s1.length < 1e6);

const v1 = { v: 1, pending: false, seed: 5, rng: 12345, tiles: Array.from(RD.genMap(RD.makeRng(5), false).tiles), entrance: 0, hoard: 0, items: [{ type: 'spikes', tile: 20, rank: 3, paid: 10 }], malice: 200, gold: 90, raid: 6, endless: false,
  guild: { K: { tiles: new Array(RD.N).fill(-1), traps: [], turrets: [], lairs: [], doors: [], chests: [], mimics: [], hoard: -1, shifts: 0, removed: [] }, causes: { trap: 1, illusion: 0, monster: 0, turret: 0 }, wariness: 0.1, veterans: [{ name: 'Old Vet', cls: 'knight', lvl: 2, traits: [] }], rumors: [] },
  party: [{ name: 'x', cls: 'knight' }], omen: 'calm', offers: ['rune'], sale: 'rune', adapt: '', stats: { slain: 3, escaped: 1, goldLost: 10, held: 5 }, nextId: 9 };
const m = RD.loadGame(JSON.parse(JSON.stringify(v1)));
ok('a save from the first version loads, with ranked heroes', !!m && m.party.every((h) => Number.isInteger(h.tier)));

const Q = RD.newGame(9, 'normal', 'quick');
Q.raid = 12;
ok('quick mode reaches the top ranks by night 12', RD.unlocked(Q) >= 8 && RD.winAt(Q) === 12);
const D = RD.newGame(9, 'easy', 'daily');
ok('daily mode is always Keeper', D.diff === 'normal');
const T = RD.newGame(9, 'normal', 'campaign', 'tithe'), N0 = RD.newGame(9, 'normal');
ok('the Blood Tithe pact adds starting malice', T.malice === N0.malice + 60);
const B = RD.newGame(9, 'normal', 'campaign', 'bones');
ok('the Bone Pact discounts monsters', RD.costOf(B, 'brute') < RD.costOf(N0, 'brute') || N0.offers.includes('brute'));
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
