// Cost-effectiveness of every piece: the same budget spent on one piece type only, against the same parties.
// Outliers at the top are candidates for a price rise; at the bottom, for a buff.
//   node tools/survey.js [night=18] [maps=3] [trials=3]
const { RD, grow, trial } = require('./stacks.js');
const [nightArg = '18', mapsArg = '3', trialsArg = '3'] = process.argv.slice(2);
const I = RD.ITEMS;
const bases = [];
for (let m = 0; m < +mapsArg; m++) bases.push(grow(9000 + m * 131, +nightArg));
const invested = (G) => [...G.items.values()].filter((it) => !I[it.type].boss).reduce((a, it) => a + I[it.type].cost + (it.paid || 0), 0) + G.malice;
const top = RD.unlocked(bases[0]);
const rows = [];
for (const k of Object.keys(I)) {
  const d = I[k];
  if (d.summonOnly || d.boss || d.kind === 'door' || d.kind === 'totem' || d.kind === 'seal' || d.tier > top) continue;
  let kill = 0, n = 0;
  for (const b of bases) for (let r = 0; r < +trialsArg; r++) { kill += trial(b, { [k]: 1 }, invested(b), 'none').kill; n++; }
  rows.push([k, RD.TIERS[d.tier], d.kind, d.cost, Math.round((100 * kill) / n)]);
}
rows.sort((a, b) => b[4] - a[4]);
console.log(`night ${nightArg}: same budget (~${Math.round(bases.reduce((a, b) => a + invested(b), 0) / bases.length)}) on one piece type`);
for (const r of rows) console.log(`${r[0].padEnd(11)} ${r[1].padEnd(3)} ${r[2].padEnd(7)} cost ${String(r[3]).padStart(4)}  killed ${String(r[4]).padStart(3)}%  ${'█'.repeat(Math.round(r[4] / 4))}`);
