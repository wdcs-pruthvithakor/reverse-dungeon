// Are some pieces too strong when stacked or combined? Same budget, same party, different builds.
//   node tools/stacks.js [night=18] [maps=4] [trials=6]
const RD = require('./load')();
const [nightArg = '18', mapsArg = '4', trialsArg = '6'] = process.argv.slice(2);
const I = RD.ITEMS;
const route = (G) => { const { prev } = RD.dijkstra(G, G.entrance, (j) => (G.tiles[j] ? 1 : Infinity)); const p = []; for (let s = G.hoard; s >= 0 && s !== G.entrance; s = prev[s]) p.push(s); return p.reverse(); };
const value = (t) => I[t].tier * 10 + (I[t].elite ? 5 : 0) + I[t].cost / 100;

// play the competent bot up to the target night to get a realistic dungeon and budget
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

// rebuild the non-boss part of the dungeon as `mix` (type -> share of budget), spending `budget`
function rebuild(G, mix, budget, maxCopies) {
  for (const it of [...G.items.values()]) if (!I[it.type].boss) G.items.delete(it.tile);
  G.offers = [];
  G.malice = budget;
  const p = route(G).filter((t) => !RD.isGate(G, t) && !RD.isStairs(G, t) && t !== G.hoard);
  const walls = [...new Set(p.flatMap((t) => RD.nb(t)))].filter((w) => G.tiles[w] === 0);
  const counts = {};
  const types = Object.keys(mix);
  // buy in round-robin by share until the budget or the room runs out
  let spent = 0, guard = 0;
  while (guard++ < 2000) {
    let bought = false;
    for (const t of types) {
      const want = budget * mix[t];
      const have = (counts[t] || 0) * RD.costOf(G, t);
      if (have + RD.costOf(G, t) > want + 1 || G.malice < RD.costOf(G, t) || (maxCopies && (counts[t] || 0) >= maxCopies)) continue;
      const pool = I[t].place === 'wall' ? walls : p;
      // spread copies along the route
      const start = Math.floor(Math.random() * pool.length);
      for (let k = 0; k < pool.length; k++) {
        const g = pool[(start + k * 7) % pool.length];
        if (!RD.check(G, t, g)) { RD.apply(G, t, g); counts[t] = (counts[t] || 0) + 1; spent += RD.costOf(G, t); bought = true; break; }
      }
    }
    if (!bought) break;
  }
  // leftover malice goes into levels, evenly
  for (let k = 0; k < 300; k++) { const l = [...G.items.values()].filter((it) => !I[it.type].boss && !RD.check(G, 'upgrade', it.tile)).sort((a, c) => (a.lv || 1) - (c.lv || 1)); if (!l.length) break; RD.apply(G, 'upgrade', l[0].tile); }
  return counts;
}

function trial(base, mix, budget, knows, maxCopies) {
  const G = RD.loadGame(JSON.parse(JSON.stringify(RD.saveGame(base))));
  const counts = rebuild(G, mix, budget, maxCopies);
  if (knows === 'all') { // the guild knows the dungeon exactly as built
    const K = G.guild.K;
    for (let i = 0; i < G.floors * RD.N; i++) K.tiles[i] = G.tiles[i];
    for (const it of G.items.values()) RD.learnItem(K, it);
    K.hoard = G.hoard;
    for (const [a, b] of G.links) if (RD.fl(b) > RD.fl(a)) K.stairs.add(a);
  } else G.guild.K = RD.newKnow();
  G.party = JSON.parse(JSON.stringify(base.party));
  RD.startRaid(G);
  for (let st = 0; G.phase === 'raid' && st < 60000; st++) RD.step(G, 1 / 30);
  const d = G.debrief, n = d.killed.length + d.escaped.length;
  return { kill: d.killed.length / n, n, gold: d.goldLost, t: G.R.t, timeout: G.R.log.some((l) => /gutter/.test(l.text)), counts };
}

if (require.main !== module) { module.exports = { RD, grow, rebuild, trial }; return; }
const night = +nightArg;
const BUILDS = {
  'bot mix (baseline)': null,
  'all Soul Siphon': { siphon: 1 },
  'all Storm Pylon': { pylon: 1 },
  'all Dart Slit': { darts: 1 },
  'all Wandering Rune': { maze: 1 },
  'Rune + Pylon': { maze: 0.5, pylon: 0.5 },
  'Rune + Siphon': { maze: 0.5, siphon: 0.5 },
  'Siphon + Pylon': { siphon: 0.5, pylon: 0.5 },
  'elite monsters only': null,
};
const bases = [];
for (let m = 0; m < +mapsArg; m++) bases.push(grow(9000 + m * 131, night));
const invested = (G) => [...G.items.values()].filter((it) => !I[it.type].boss).reduce((a, it) => a + I[it.type].cost + (it.paid || 0), 0) + G.malice;
console.log(`night ${night} · ${bases.length} maps · party ranks ${bases.map((b) => b.party.map((h) => RD.TIERS[h.tier]).join('')).join(' / ')} · budget ~${Math.round(bases.reduce((a, b) => a + invested(b), 0) / bases.length)} malice\n`);
const rows = [];
for (const knows of ['none', 'all']) {
  for (const [name, mix0] of Object.entries(BUILDS)) {
    let k = 0, gold = 0, t = 0, to = 0, runs = 0, copies = {};
    for (const b of bases) {
      const top = RD.unlocked(b);
      let mix = mix0;
      if (name.startsWith('bot')) mix = (() => { const c = {}; for (const it of b.items.values()) if (!I[it.type].boss) c[it.type] = (c[it.type] || 0) + I[it.type].cost; const tot = Object.values(c).reduce((a, x) => a + x, 0) || 1; for (const k2 in c) c[k2] /= tot; return c; })();
      if (name.startsWith('elite')) { const e = Object.keys(I).filter((x) => I[x].elite && !I[x].boss && I[x].tier <= top).sort((a, c) => I[c].tier - I[a].tier).slice(0, 2); mix = Object.fromEntries(e.map((x) => [x, 1 / e.length])); }
      if (Object.keys(mix).some((x) => I[x].tier > top)) continue;
      for (let r = 0; r < +trialsArg; r++) {
        const res = trial(b, mix, invested(b), knows);
        k += res.kill; gold += res.gold; t += res.t; to += res.timeout ? 1 : 0; runs++;
        for (const c in res.counts) copies[c] = (copies[c] || 0) + res.counts[c];
      }
    }
    if (!runs) continue;
    rows.push([knows, name, (100 * k / runs).toFixed(0) + '%', (gold / runs).toFixed(0), (t / runs).toFixed(0) + 's', to, Object.entries(copies).map(([c, v]) => `${c}×${(v / runs).toFixed(0)}`).join(' ')]);
  }
}
console.log('guild knows | build | heroes killed | gold lost | raid length | time-outs | pieces bought');
for (const r of rows) console.log(r.join(' | '));

// how kill rate grows with the number of copies (diminishing returns or a cliff?)
console.log('\ncopies → heroes killed (guild knows nothing, same budget cap, rest unspent)');
for (const t of ['siphon', 'pylon', 'maze']) {
  const line = [];
  for (const n of [1, 2, 4, 8, 16]) {
    let k = 0, runs = 0;
    for (const b of bases) {
      if (I[t].tier > RD.unlocked(b)) continue;
      for (let r = 0; r < Math.max(2, +trialsArg / 2); r++) { const res = trial(b, { [t]: 1 }, invested(b), 'none', n); k += res.kill; runs++; }
    }
    if (runs) line.push(`${n}: ${(100 * k / runs).toFixed(0)}%`);
  }
  console.log(`  ${t.padEnd(7)} ${line.join('  ')}`);
}
