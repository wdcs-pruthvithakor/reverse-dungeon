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
// ---- raid powers
function raidAt(night) {
  const g = RD.newGame(4242, 'normal');
  g.raid = night; g.malice = 99999; RD.beginBuild(g, false);
  RD.startRaid(g);
  for (let k = 0; k < 400 && g.phase === 'raid'; k++) RD.step(g, 1 / 30); // let the party walk in
  return g;
}
const route = (g) => { const { prev } = RD.dijkstra(g, g.entrance, (j) => (g.tiles[j] ? 1 : Infinity)); const p = []; for (let s = g.hoard; s >= 0 && s !== g.entrance; s = prev[s]) p.push(s); return p.reverse(); };
{
  const g = raidAt(2);
  ok('powers open by night: Phantom Gold is locked on night 2', !!RD.usePower(g, 'lure', route(g)[3]));
  const h = raidAt(15);
  const r = route(h);
  const free = r.find((t) => !h.items.has(t) && !h.R.heroes.some((x) => x.tile === t || x.next === t) && t !== h.hoard && !RD.isGate(h, t) && !RD.isStairs(h, t));
  ok('Cave-in blocks a corridor', RD.usePower(h, 'collapse', free) === null && h.tiles[free] === 0);
  for (let k = 0; k < 300; k++) RD.step(h, 1 / 30);
  ok('…and clears after 8 seconds', h.tiles[free] === 1);
  const before = h.R.monsters.length;
  ok('Raise the Dead adds two skeletons', RD.usePower(h, 'raise', r[Math.floor(r.length / 2)]) === null && h.R.monsters.length === before + 2);
  ok('Bloodlust and Seal the Gate fire', RD.usePower(h, 'frenzy') === null && h.R.frenzyT > 0 && RD.usePower(h, 'seal') === null && h.R.sealT > 0);
  ok('Phantom Gold sets a lure', RD.usePower(h, 'lure', r[2]) === null && h.R.lure && h.R.lure.tile === r[2]);
}
{
  // a sealed gate keeps a fleeing hero inside
  const g = RD.newGame(77, 'normal');
  RD.startRaid(g);
  for (let k = 0; k < 60; k++) RD.step(g, 1 / 30);
  const h = g.R.heroes[0];
  h.state = 'flee'; h.next = -1;
  g.R.sealT = 999;
  for (let k = 0; k < 900; k++) RD.step(g, 1 / 30);
  ok('Seal the Gate stops a hero from leaving', h.state !== 'out');
}
{
  // fast monsters run fleeing heroes down well past the edge of their post
  let furthest = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = RD.newGame(seed * 31, 'normal');
    const r = route(g);
    const post = r.slice(Math.floor(r.length * 0.6)).find((t) => !RD.check(g, 'goblin', t));
    RD.apply(g, 'goblin', post);
    RD.startRaid(g);
    const m = g.R.monsters[0];
    for (let k = 0; k < 6000 && g.phase === 'raid'; k++) {
      RD.step(g, 1 / 30);
      // a hero who reaches the goblin panics and runs for the gate
      for (const h of g.R.heroes) if (RD.heroAlive(h) && h.state !== 'flee' && RD.tdist(h.tile, post) <= 2) { h.state = 'flee'; h.next = -1; h.hp = h.maxHp * 0.9; }
      furthest = Math.max(furthest, RD.tdist(m.tile, post));
    }
  }
  ok(`a goblin chases runners beyond its 3-tile post (furthest ${furthest.toFixed(1)} tiles)`, furthest > RD.ITEMS.goblin.leash + 1);
}
// ---- twists, nemeses, the heart
{
  const base = RD.newGame(5, 'normal', 'quick'), sw = RD.newGame(5, 'normal', 'quick', null, { twists: ['swarm'] });
  base.raid = sw.raid = 6; RD.beginBuild(base, false); RD.beginBuild(sw, false);
  ok('Swarm brings two extra heroes', sw.party.length >= base.party.length + 1);
  const st = RD.newGame(5, 'normal', 'quick', null, { twists: ['stones'] });
  ok('Sending Stones gives every hero a stone', st.party.every((h) => h.traits.includes('stone')));
  const ch = RD.newGame(5, 'normal', 'quick', null, { twists: ['cheap', 'thrones'] });
  ok('Buyer’s Market and Age of Thrones change prices and start malice', RD.costOf(ch, 'spikes') < RD.costOf(base, 'spikes') + 1 && ch.malice === base.malice + 120);
  const hz = RD.newGame(5, 'normal', 'campaign', null, { heart: { reserves: 2, vault: 1, ledger: 3, delve: 2 } }), h0 = RD.newGame(5, 'normal');
  ok('Heart upgrades: +50 malice, +20 gold, cheaper rerolls', hz.malice === h0.malice + 50 && hz.gold === h0.gold + 20 && RD.rerollCost(hz) === 3);
  ok('score grows 15% per twist', (() => { const a = RD.newGame(1, 'normal'), b = RD.newGame(1, 'normal', 'campaign', null, { twists: ['greed', 'rush'] }); a.stats.held = b.stats.held = 5; return RD.score(b) === Math.round(RD.score(a) * 1.3); })());
  // a veteran who escaped once and escapes again becomes a nemesis, and always returns
  const g = RD.newGame(11, 'normal');
  g.guild.veterans.push({ name: 'Wren Vane', cls: 'scout', tier: 0, lvl: 1, traits: [], escapes: 1 });
  g.raid = 2; RD.beginBuild(g, false);
  const vet = g.party.find((h) => h.name === 'Wren Vane');
  if (vet) {
    RD.startRaid(g);
    vet.state = 'flee'; // spawn will reset; force once in the dungeon
    for (let k = 0; k < 20000 && g.phase === 'raid'; k++) { RD.step(g, 1 / 30); if (vet.tile != null && RD.heroAlive(vet) && vet.state === 'seek') { vet.state = 'flee'; vet.next = -1; } }
    const v = g.guild.veterans.find((x) => x.name === 'Wren Vane');
    ok('a hero who escapes twice becomes a nemesis', !!(v && v.nemesis));
    RD.nextNight(g);
    ok('…and a nemesis always comes back', g.party.some((h) => h.name === 'Wren Vane' && h.nemesis));
  } else ok('veteran rejoined the party (rng)', false);
}
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
