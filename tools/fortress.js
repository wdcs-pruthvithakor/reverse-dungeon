// The deep fortress: the lower floors are long stretches of alternating Wandering Runes and Soul Siphons
// inside a field of Storm Pylons. Every build gets the same lower-floor budget and nothing else, so the
// result is only what that budget buys. The party is an SSS strike force with two Chosen Heroes, a Paladin, a Saint
// and a Sword Saint.  node tools/fortress.js [maps=4] [trials=5]
const RD = require('./load')();
const [mapsArg = '4', trialsArg = '5'] = process.argv.slice(2);
const I = RD.ITEMS;
const route = (G) => { const { prev } = RD.dijkstra(G, G.entrance, (j) => (G.tiles[j] ? 1 : Infinity)); const p = []; for (let s = G.hoard; s >= 0 && s !== G.entrance; s = prev[s]) p.push(s); return p.reverse(); };
const maxLv = (G, t) => { while (!RD.check(G, 'upgrade', t)) RD.apply(G, 'upgrade', t); };

// Upper floors and bosses are identical in every build; the lower floors get `budget` malice spent as `mix`.
function fortress(seed, mix, budget) {
  const G = RD.newGame(seed, 'normal');
  G.raid = 27; G.malice = 1e6; RD.beginBuild(G, false);
  while (!RD.canOpenFloor(G)) RD.openFloor(G);
  const r = route(G).filter((t) => !RD.isGate(G, t) && !RD.isStairs(G, t) && t !== G.hoard);
  // nothing else in the dungeon: the lower-floor budget is the only thing that can kill
  G.malice = budget;
  const low = r.filter((x) => RD.fl(x) >= 2);
  const walls = [];
  for (let g = 2 * RD.N; g < G.floors * RD.N; g++) if (G.tiles[g] === 0 && low.some((t) => RD.tdist(t, g) <= 2.3)) walls.push(g);
  // buy one of each piece in the mix in turn, spread over the route, then spend what is left on levels
  const types = Object.keys(mix);
  let i = 0, wi = 0, guard = 0;
  while (guard++ < 5000) {
    let bought = false;
    for (const ty of types) {
      if (G.malice < RD.costOf(G, ty)) continue;
      if (I[ty].place === 'wall') { while (wi < walls.length && RD.check(G, ty, walls[wi])) wi++; if (wi < walls.length) { RD.apply(G, ty, walls[wi++]); bought = true; } }
      else { for (let k = 0; k < low.length; k++) { const t = low[(i + k) % low.length]; if (!RD.check(G, ty, t)) { RD.apply(G, ty, t); i += k + 1; bought = true; break; } } }
    }
    if (!bought) break;
  }
  for (let n = 0; n < 2000; n++) { const l = [...G.items.values()].filter((it) => RD.fl(it.tile) >= 2 && !I[it.type].boss && !RD.check(G, 'upgrade', it.tile)).sort((a, b) => a.lv - b.lv); if (!l.length) break; RD.apply(G, 'upgrade', l[0].tile); }
  return G;
}

function strikeForce(G) {
  const used = new Set();
  const p = ['chosen', 'chosen', 'paladin', 'saint', 'swordsaint', 'archmage', 'knight', 'cleric', 'rogue', 'scout', 'berserker', 'alchemist']
    .map((c) => RD.makeHero(G, c, 8, null, used));
  return p;
}

const BUDGET = 12000;
const BUILDS = {
  'runes + siphons + pylons (your build)': { maze: 1, siphon: 1, pylon: 1 },
  'pylons only': { pylon: 1 },
  'runes + siphons, no pylons': { maze: 1, siphon: 1 },
  'golems + wyverns': { golem: 1, wyvern: 1 },
  'runes only': { maze: 1 },
  'siphons only': { siphon: 1 },
  'nothing at all (control)': {},
};
// node tools/fortress.js maps trials old  → run with the anti-stacking rules switched off
if (process.argv[4] === 'old') for (const k in RD.RULES) RD.RULES[k] = false;
if (process.env.NO_RULES) for (const k of process.env.NO_RULES.split(',')) RD.RULES[k] = false;
console.log(`anti-stacking rules: ${process.argv[4] === 'old' ? 'OFF (the old game)' : 'ON'}`);
const out = {};
let hp = 0;
for (const [name, mix] of Object.entries(BUILDS)) {
  let killed = 0, total = 0, legends = 0, t = 0, runs = 0, cnt = {};
  for (let m = 0; m < +mapsArg; m++) for (let r = 0; r < +trialsArg; r++) {
    const G = fortress(7000 + m * 97, mix, BUDGET);
    G.guild.K = RD.newKnow();
    G.party = strikeForce(G);
    hp = G.party.reduce((a, h) => a + h.maxHp, 0);
    for (const it of G.items.values()) if (RD.fl(it.tile) >= 2 && !I[it.type].boss) cnt[it.type] = (cnt[it.type] || 0) + 1 / (+mapsArg * +trialsArg);
    RD.startRaid(G);
    for (let st = 0; G.phase === 'raid' && st < 90000; st++) RD.step(G, 1 / 30);
    const d = G.debrief;
    killed += d.killed.length; total += d.killed.length + d.escaped.length; t += G.R.t; runs++;
    legends += d.killed.filter((h) => h.title).length;
  }
  out[name] = `killed ${(100 * killed / total).toFixed(0)}% · legends ${(legends / runs).toFixed(1)} of 6 · raid ${(t / runs).toFixed(0)}s · lower floors: ${Object.entries(cnt).map(([k, v]) => `${k}×${Math.round(v)}`).join(' ')}`;
  console.log(name.padEnd(40), out[name]);
}
console.log(`party health ${hp}, lower-floor budget ${BUDGET} malice each`);
