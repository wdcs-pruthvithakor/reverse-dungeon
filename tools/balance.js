// A competent bot plays many dungeons to measure difficulty.
// It builds kill zones near the hoard, keeps traps on the route, moves traps the guild knows,
// sells outdated pieces, levels everything, and puts a boss on every floor.
//   node tools/balance.js [difficulty=normal] [games=8] [nights=30] [mode=campaign] [verbose=0]
const RD = require('./load')();
if (process.env.OLD_RULES) for (const k in RD.RULES) RD.RULES[k] = false;
if (process.env.NO_RULES) for (const k of process.env.NO_RULES.split(',')) RD.RULES[k] = false;
const [diff = 'normal', games = '8', nightsArg = '30', mode = 'campaign', verbose = '0'] = process.argv.slice(2);
const I = RD.ITEMS;
function route(G) {
  const { prev } = RD.dijkstra(G, G.entrance, (j) => (G.tiles[j] ? 1 : Infinity));
  const p = [];
  for (let s = G.hoard; s >= 0 && s !== G.entrance; s = prev[s]) p.push(s);
  return p.reverse();
}
const value = (t) => I[t].tier * 10 + (I[t].elite ? 5 : 0) + I[t].cost / 100;
const out = [], kill = {}, t0 = Date.now();
for (let g = 0; g < +games; g++) {
  const G = RD.newGame(500 + g * 7919, diff, mode);
  G.endless = true;
  let died = null;
  for (let night = 0; night < +nightsArg; night++) {
    if (!RD.canOpenFloor(G)) RD.openFloor(G);
    const top = RD.unlocked(G);
    for (const it of [...G.items.values()]) if (I[it.type].tier < top - 2 && !I[it.type].boss) RD.apply(G, 'sell', it.tile);
    const p = route(G), L = p.length;
    for (const [t] of G.guild.K.traps) {
      if (!G.items.get(t)) continue;
      for (let k = 0; k < 6; k++) { const to = p[Math.floor(Math.random() * L * 0.8)]; if (!RD.check(G, 'move', to, t)) { RD.apply(G, 'move', to, t); break; } }
    }
    const avail = Object.keys(I).filter((k) => !I[k].summonOnly && I[k].tier <= top);
    const best = (kind) => avail.filter((k) => I[k].kind === kind && !I[k].boss).sort((a, b) => value(b) - value(a));
    for (let f = 0; f < G.floors; f++) {
      const cur = [...G.items.values()].find((it) => I[it.type].boss && RD.fl(it.tile) === f);
      const bs = avail.filter((k) => I[k].boss).sort((a, b) => I[b].tier - I[a].tier);
      if (cur) { if (bs.length && I[bs[0]].tier > I[cur.type].tier + 1 && G.malice > RD.costOf(G, bs[0]) * 1.2) RD.apply(G, 'sell', cur.tile); else continue; }
      const tiles = p.filter((t) => RD.fl(t) === f).reverse();
      for (const b of bs) { let ok = false; for (const t of tiles.slice(1, 8)) if (!RD.check(G, b, t)) { RD.apply(G, b, t); ok = true; break; } if (ok) break; }
    }
    const mons = best('monster'), traps = best('trap'), turs = best('turret');
    for (let k = 0; k < 400 && G.malice > 20; k++) {
      const r = Math.random();
      if (r < 0.45 && mons.length) { const t = mons[Math.floor(Math.random() * Math.min(2, mons.length))]; const i = p[Math.floor(L * 0.55 + Math.random() * L * 0.45)]; if (!RD.check(G, t, i)) RD.apply(G, t, i); }
      else if (r < 0.8 && traps.length) { const t = traps[Math.floor(Math.random() * Math.min(3, traps.length))]; const i = p[Math.floor(Math.random() * L * 0.7)]; if (!RD.check(G, t, i)) RD.apply(G, t, i); }
      else if (turs.length) { const w = RD.nb(p[Math.floor(Math.random() * L)])[Math.floor(Math.random() * 4)]; if (w != null && !RD.check(G, turs[0], w)) RD.apply(G, turs[0], w); }
    }
    for (let k = 0; k < 80; k++) {
      const list = [...G.items.values()].filter((it) => !RD.check(G, 'upgrade', it.tile)).sort((a, b) => I[b.type].tier - I[a.type].tier || RD.levelCost(a) - RD.levelCost(b));
      if (!list.length) break;
      RD.apply(G, 'upgrade', list[0].tile);
    }
    const party = G.party.map((h) => RD.TIERS[h.tier] + (h.title ? '*' : '') + h.cls.slice(0, 2) + (h.hunt != null ? '!' : '')).join(' ');
    RD.startRaid(G);
    for (let st = 0; G.phase === 'raid' && st < 60000; st++) RD.step(G, 1 / 30);
    const d = G.debrief, band = Math.floor((d.raid - 1) / 10) * 10 + 1;
    kill[band] = kill[band] || [0, 0];
    kill[band][0] += d.killed.length;
    kill[band][1] += d.killed.length + d.escaped.length;
    if (+verbose) console.log(`g${g} n${d.raid} fl${G.floors} top ${RD.TIERS[top]} rate ${RD.rating(G.guild.threat)} [${party}] kill ${d.killed.length}/${d.killed.length + d.escaped.length} gold ${G.gold} mal ${G.malice} items ${G.items.size}`);
    if (G.phase === 'over') { died = d.raid; break; }
    RD.nextNight(G);
  }
  out.push(died ? `died@${died}` : `alive@${nightsArg}`);
}
const win = RD.MODES[mode].win || RD.DIFF[diff].win;
const wins = out.filter((o) => o.startsWith('alive') || +o.split('@')[1] > win).length;
console.log(`${mode}/${diff}: reached night ${win} in ${wins}/${games} | ${out.join(' ')} | kill% ${Object.entries(kill).map(([b, [k, n]]) => b + ':' + Math.round((100 * k) / n)).join(' ')} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
