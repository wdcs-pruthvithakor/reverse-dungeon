// The "kill box": on the one corridor heroes must use, a max-level Wandering Rune next to a Soul Siphon,
// every rock tile around them filled with Storm Pylons, and the same set-up in the boss room.
// Compared with the bot's normal build on the same budget, and with each ingredient taken out.
//   node tools/killbox.js [night=18] [maps=4] [trials=6]
const RD = require('./load')();
const [nightArg = '18', mapsArg = '4', trialsArg = '6'] = process.argv.slice(2);
const I = RD.ITEMS;
const route = (G) => { const { prev } = RD.dijkstra(G, G.entrance, (j) => (G.tiles[j] ? 1 : Infinity)); const p = []; for (let s = G.hoard; s >= 0 && s !== G.entrance; s = prev[s]) p.push(s); return p.reverse(); };
const value = (t) => I[t].tier * 10 + (I[t].elite ? 5 : 0) + I[t].cost / 100;

function grow(seed, night) {
  const G = RD.newGame(seed, 'normal');
  G.endless = true;
  for (let n = 1; n < night && G.phase !== 'over'; n++) {
    if (!RD.canOpenFloor(G)) RD.openFloor(G);
    const top = RD.unlocked(G), p = route(G), L = p.length;
    for (const it of [...G.items.values()]) if (I[it.type].tier < top - 2 && !I[it.type].boss) RD.apply(G, 'sell', it.tile);
    const avail = Object.keys(I).filter((k) => !I[k].summonOnly && I[k].tier <= top);
    for (let f = 0; f < G.floors; f++) {
      if ([...G.items.values()].some((it) => I[it.type].boss && RD.fl(it.tile) === f)) continue;
      const b = avail.filter((k) => I[k].boss).sort((a, c) => I[c].tier - I[a].tier)[0];
      if (b) for (const t of p.filter((t) => RD.fl(t) === f).reverse().slice(1, 8)) if (!RD.check(G, b, t)) { RD.apply(G, b, t); break; }
    }
    const best = (kind) => avail.filter((k) => I[k].kind === kind && !I[k].boss).sort((a, c) => value(c) - value(a));
    const mons = best('monster'), traps = best('trap'), turs = best('turret');
    for (let k = 0; k < 400 && G.malice > 20; k++) {
      const r = Math.random();
      if (r < 0.45 && mons.length) { const t = mons[Math.floor(Math.random() * Math.min(2, mons.length))]; const i = p[Math.floor(L * 0.55 + Math.random() * L * 0.45)]; if (!RD.check(G, t, i)) RD.apply(G, t, i); }
      else if (r < 0.8 && traps.length) { const t = traps[Math.floor(Math.random() * Math.min(3, traps.length))]; const i = p[Math.floor(Math.random() * L * 0.7)]; if (!RD.check(G, t, i)) RD.apply(G, t, i); }
      else if (turs.length) { const w = RD.nb(p[Math.floor(Math.random() * L)])[Math.floor(Math.random() * 4)]; if (w != null && !RD.check(G, turs[0], w)) RD.apply(G, turs[0], w); }
    }
    for (let k = 0; k < 80; k++) { const l = [...G.items.values()].filter((it) => !RD.check(G, 'upgrade', it.tile)).sort((a, c) => I[c.type].tier - I[a.type].tier); if (!l.length) break; RD.apply(G, 'upgrade', l[0].tile); }
    RD.startRaid(G);
    for (let st = 0; G.phase === 'raid' && st < 60000; st++) RD.step(G, 1 / 30);
    if (G.phase === 'over') G.phase = 'debrief';
    RD.nextNight(G);
  }
  return G;
}

const maxLevel = (G, tile) => { while (!RD.check(G, 'upgrade', tile)) RD.apply(G, 'upgrade', tile); };
// one kill box around `spot`: rune and siphon on the corridor, pylons in every rock tile within 2 tiles
function box(G, spots, use) {
  const placed = [];
  if (use.maze && !RD.check(G, 'maze', spots[0])) { RD.apply(G, 'maze', spots[0]); placed.push(spots[0]); }
  if (use.siphon && spots[1] != null && !RD.check(G, 'siphon', spots[1])) { RD.apply(G, 'siphon', spots[1]); placed.push(spots[1]); }
  for (const t of placed) maxLevel(G, t);
  if (use.pylon) {
    const near = [];
    for (let g = RD.fl(spots[0]) * RD.N; g < (RD.fl(spots[0]) + 1) * RD.N; g++) if (G.tiles[g] === 0 && spots.some((s) => RD.tdist(s, g) <= 2.3)) near.push(g);
    near.sort((a, b) => Math.min(...spots.map((s) => RD.tdist(s, a))) - Math.min(...spots.map((s) => RD.tdist(s, b))));
    for (const w of near) if (!RD.check(G, 'pylon', w)) RD.apply(G, 'pylon', w);
  }
}

function build(G, budget, use) {
  for (const it of [...G.items.values()]) if (!I[it.type].boss) G.items.delete(it.tile);
  G.offers = [];
  G.malice = budget;
  const r = route(G).filter((t) => !RD.isGate(G, t) && !RD.isStairs(G, t) && t !== G.hoard);
  // the corridor box, a third of the way along the route, then the boss room box
  const k = Math.floor(r.length * 0.35);
  box(G, [r[k], r[k + 1]], use);
  const boss = [...G.items.values()].find((it) => I[it.type].boss && RD.fl(it.tile) === RD.fl(G.hoard));
  if (boss) {
    const room = r.filter((t) => RD.fl(t) === RD.fl(boss.tile)).sort((a, b) => RD.tdist(a, boss.tile) - RD.tdist(b, boss.tile));
    box(G, room.slice(0, 2), use);
  }
  // whatever is left: level the pylons evenly
  for (let n = 0; n < 400; n++) { const l = [...G.items.values()].filter((it) => it.type === 'pylon' && !RD.check(G, 'upgrade', it.tile)).sort((a, b) => a.lv - b.lv); if (!l.length) break; RD.apply(G, 'upgrade', l[0].tile); }
  const c = {};
  for (const it of G.items.values()) if (!I[it.type].boss) c[it.type] = (c[it.type] || 0) + 1;
  return c;
}

function run(base, budget, use, knows) {
  const G = RD.loadGame(JSON.parse(JSON.stringify(RD.saveGame(base))));
  const counts = use === 'bot' ? null : build(G, budget, use);
  if (use === 'bot') for (const it of G.items.values()) it.cd = 0;
  if (knows) {
    const K = G.guild.K;
    for (let i = 0; i < G.floors * RD.N; i++) K.tiles[i] = G.tiles[i];
    for (const it of G.items.values()) RD.learnItem(K, it);
    K.hoard = G.hoard;
    for (const [a, b] of G.links) if (RD.fl(b) > RD.fl(a)) K.stairs.add(a);
  } else G.guild.K = RD.newKnow();
  G.party = JSON.parse(JSON.stringify(base.party));
  RD.startRaid(G);
  let dazedNearPylon = 0;
  const pylons = [...G.items.values()].filter((it) => it.type === 'pylon').map((it) => it.tile);
  for (let st = 0; G.phase === 'raid' && st < 60000; st++) {
    RD.step(G, 1 / 30);
    if (st % 30 === 0) for (const h of G.R.heroes) if (RD.heroAlive(h) && h.confuse > 0 && pylons.some((p) => RD.tdist(p, h.tile) <= 3.5)) dazedNearPylon++;
  }
  const d = G.debrief, n = d.killed.length + d.escaped.length;
  const triggers = (type) => G.R.log.filter((l) => (type === 'maze' ? /wandering rune/ : /soul siphon/).test(l.text)).length;
  return { kill: d.killed.length / n, gold: d.goldLost, t: G.R.t, counts, dazed: dazedNearPylon, maze: triggers('maze'), siphon: triggers('siphon') };
}

const night = +nightArg;
const bases = [];
for (let m = 0; m < +mapsArg; m++) bases.push(grow(9000 + m * 131, night));
const invested = (G) => [...G.items.values()].filter((it) => !I[it.type].boss).reduce((a, it) => a + I[it.type].cost + (it.paid || 0), 0) + G.malice;
console.log(`night ${night} · ${bases.length} maps · ~${Math.round(bases.reduce((a, b) => a + invested(b), 0) / bases.length)} malice · parties ${bases.map((b) => b.party.map((h) => RD.TIERS[h.tier]).join('')).join(' / ')}\n`);
const VARIANTS = {
  'bot’s normal build': 'bot',
  'KILL BOX: Lv5 rune + Lv5 siphon + pylons': { maze: 1, siphon: 1, pylon: 1 },
  'same box without the rune': { siphon: 1, pylon: 1 },
  'same box without the siphon': { maze: 1, pylon: 1 },
  'same box without the pylons': { maze: 1, siphon: 1 },
};
console.log('guild knows | build | heroes killed | gold lost | raid length | rune / siphon triggers | dazed hero-seconds near pylons | pieces');
for (const knows of [false, true]) {
  for (const [name, use] of Object.entries(VARIANTS)) {
    let k = 0, gold = 0, t = 0, runs = 0, dz = 0, mz = 0, sp = 0, cnt = {};
    for (const b of bases) for (let r = 0; r < +trialsArg; r++) {
      const res = run(b, invested(b), use, knows);
      k += res.kill; gold += res.gold; t += res.t; dz += res.dazed; mz += res.maze; sp += res.siphon; runs++;
      if (res.counts) for (const c in res.counts) cnt[c] = (cnt[c] || 0) + res.counts[c];
    }
    console.log([knows ? 'all' : 'none', name, (100 * k / runs).toFixed(0) + '%', (gold / runs).toFixed(0), (t / runs).toFixed(0) + 's', `${(mz / runs).toFixed(1)} / ${(sp / runs).toFixed(1)}`, (dz / runs).toFixed(0), Object.entries(cnt).map(([c, v]) => `${c}×${(v / runs).toFixed(0)}`).join(' ')].join(' | '));
  }
}
