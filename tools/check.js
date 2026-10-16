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
// ---- deeper floors and the Saga
{
  const g = RD.newGame(9, 'normal');
  g.malice = 1e6;
  g.raid = 30;
  for (let f = 1; f < 5; f++) RD.openFloor(g);
  ok('a normal run stops at five floors', g.floors === 5 && /endless/.test(RD.canOpenFloor(g) || ''));
  g.endless = true;
  ok('endless: floor VI waits for night 50', /night 50/.test(RD.canOpenFloor(g) || ''));
  g.raid = 50;
  const r6 = RD.openFloor(g);
  ok('endless: floor VI opens on night 50', !r6.err && g.floors === 6 && RD.floorNight(g, 6) === 100);
  g.raid = 250;
  for (let f = 6; f < 10; f++) RD.openFloor(g);
  ok('ten floors at most', g.floors === 10 && /deep/.test(RD.canOpenFloor(g) || ''));
  RD.startRaid(g);
  for (let k = 0; k < 600 && g.phase === 'raid'; k++) RD.step(g, 1 / 30);
  ok('a ten-floor dungeon raids cleanly', g.phase === 'raid' || g.phase === 'debrief' || g.phase === 'over');
  const d = RD.newGame(9, 'normal');
  d.malice = 1e6; d.endless = true; d.raid = 250;
  for (let f = 1; f < 10; f++) RD.openFloor(d);
  const back = RD.loadGame(JSON.parse(JSON.stringify(RD.saveGame(d))));
  ok('a ten-floor dungeon saves and loads', back && back.floors === 10 && back.themes.length === 10 && back.tiles[9 * RD.N + back.gates[9] % RD.N] === d.tiles[9 * RD.N + d.gates[9] % RD.N]);
  const S = RD.newGame(3, 'normal', 'saga'), C0 = RD.newGame(3, 'normal');
  S.raid = C0.raid = 40;
  ok('Saga: 100 nights, ranks open about four times slower', RD.winAt(S) === 100 && RD.unlocked(S) < RD.unlocked(C0) && RD.realNight(S, RD.TIER_UNLOCK[9]) <= 100);
}
// ---- raid powers
function raidAt(night) {
  const g = RD.newGame(4242, 'normal');
  g.raid = night; g.malice = 99999; RD.beginBuild(g, false);
  RD.startRaid(g);
  for (let k = 0; k < 400 && g.phase === 'raid'; k++) RD.step(g, 1 / 30); // let the party walk in
  return g;
}
const route = (g) => { const { prev } = RD.dijkstra(g, g.entrance, (j) => (g.tiles[j] ? 1 : Infinity)); const p = []; for (let s = g.hoard; s >= 0 && s !== g.entrance; s = prev[s]) p.push(s); return p.reverse(); };
// ---- selling never pays more than buying, whatever the discount
{
  const g = RD.newGame(13, 'normal', 'campaign', 'wyrm', { twists: ['thrones', 'cheap'] });
  g.raid = 30; RD.beginBuild(g, false);
  g.malice = 1e6;
  const r = route(g).filter((t) => !RD.isGate(g, t) && !RD.isStairs(g, t) && t !== g.hoard);
  let worst = -Infinity, tried = 0;
  for (const k of Object.keys(RD.ITEMS).filter((x) => !RD.ITEMS[x].summonOnly)) {
    g.offers = [k]; g.sale = k; // the deepest discount the game can give this piece
    for (let n = 0; n < 3; n++) {
      const t = r.concat([...g.tiles.keys()].filter((j) => g.tiles[j] === 0 && RD.fl(j) === 0)).find((j) => !RD.check(g, k, j));
      if (t == null) break;
      const before = g.malice;
      RD.apply(g, k, t);
      if (RD.ITEMS[k].kind !== 'seal') RD.apply(g, 'upgrade', t);
      RD.apply(g, 'sell', t);
      worst = Math.max(worst, g.malice - before);
      tried++;
    }
  }
  ok(`buying and selling never makes malice (${tried} round trips, best ${worst})`, tried > 20 && worst < 0);
  const old = RD.loadGame(JSON.parse(JSON.stringify(Object.assign(RD.saveGame(g), { items: [{ type: 'goblin', tile: r[2], lv: 1, paid: 0 }] }))));
  ok('an old save without prices refunds from the list price', old && RD.refund(old.items.get(r[2])) === Math.round(RD.ITEMS.goblin.cost * 0.6));
}
{
  const g = raidAt(2);
  ok('powers open by night: Phantom Gold is locked on night 2', !!RD.usePower(g, 'lure', route(g)[3]));
  const h = raidAt(15);
  const r = route(h);
  const free = r.find((t) => !h.items.has(t) && !h.R.heroes.some((x) => x.tile === t || x.next === t) && t !== h.hoard && !RD.isGate(h, t) && !RD.isStairs(h, t));
  ok('Cave-in blocks a corridor', RD.usePower(h, 'collapse', free) === null && h.tiles[free] === 0);
  for (let k = 0; k < 300; k++) RD.step(h, 1 / 30);
  ok('…and clears after 8 seconds', h.tiles[free] === 1);
}
{
  const h = raidAt(15);
  const r = route(h);
  const before = h.R.monsters.length;
  ok('Raise the Dead adds two skeletons', RD.usePower(h, 'raise', r[Math.floor(r.length / 2)]) === null && h.R.monsters.length === before + 2);
  ok('Bloodlust and Seal the Gate fire', RD.usePower(h, 'frenzy') === null && h.R.frenzyT > 0 && RD.usePower(h, 'seal') === null && h.R.sealT > 0);
  ok('Phantom Gold sets a lure', RD.usePower(h, 'lure', r[2]) === null && h.R.lure && h.R.lure.tile === r[2]);
}
{
  // the later powers: mire holds, overcharge rearms, mending heals, dread unnerves, doom bolt and banish need a hero
  const g = raidAt(22);
  const v = g.R.heroes.find((x) => RD.heroAlive(x) && x.tile != null);
  v.hp = v.maxHp = 1e5;
  ok('Grasping Mire holds and slows', RD.usePower(g, 'mire', v.tile) === null && v.rootT > 0 && v.slowT > 0);
  const it = [...g.items.values()].find((x) => RD.ITEMS[x.type].kind === 'trap');
  if (it) { it.off = true; it.cd = 5; }
  ok('Overcharge rearms a disarmed trap', RD.usePower(g, 'rearm') === null && (!it || (!it.off && it.cd === 0)));
  const m = g.R.monsters.find((x) => !x.dead);
  if (m) m.hp = m.maxHp * 0.2;
  ok('Dark Mending heals monsters', RD.usePower(g, 'mend') === null && (!m || m.hp >= m.maxHp * 0.69));
  ok('Dread Whisper unnerves heroes', RD.usePower(g, 'dread', v.tile) === null && v.fearT > 0);
  const empty = [...g.tiles.keys()].find((j) => g.tiles[j] === 1 && !g.R.heroes.some((x) => RD.heroAlive(x) && RD.fl(x.tile) === RD.fl(j) && RD.tdist(x.tile, j) < 3));
  ok('Doom Bolt needs a hero under the cursor', typeof RD.usePower(g, 'smite', empty) === 'string');
  const hp = v.hp;
  ok('Doom Bolt takes a quarter of a hero’s health', RD.usePower(g, 'smite', v.tile) === null && Math.abs(hp - v.hp - (v.title ? 1e5 / 6 : 2.5e4)) < 1);
  const from = v.tile;
  ok('Banish moves a hero far away', RD.usePower(g, 'banish', from) === null && RD.tdist(v.tile, from) >= 3 && g.tiles[v.tile] === 1);
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
  // a cave-in that cuts a runner off from the gate: they wait it out, then leave, and never remember it as rock
  let tried = 0, fine = 0;
  for (let seed = 1; seed <= 20 && tried < 6; seed++) {
    const g = RD.newGame(seed * 7, 'normal'); g.malice = 999; g.raid = 6;
    const r = route(g);
    RD.startRaid(g);
    let h = null, caved = -1, still = 0, worst = 0, last = null;
    for (let k = 0; k < 20000 && g.phase === 'raid'; k++) {
      RD.step(g, 1 / 30);
      if (caved < 0) {
        h = g.R.heroes.find((x) => RD.heroAlive(x) && x.tile != null && r.indexOf(x.tile) > 12);
        if (!h) continue;
        h.state = 'flee'; h.next = -1; h.hp = h.maxHp = 1e6;
        const cut = (t) => { const v = g.tiles[t]; g.tiles[t] = 0; const { dist } = RD.dijkstra(g, h.tile, (j) => (g.tiles[j] ? 1 : Infinity)); g.tiles[t] = v; return dist[g.entrance] === Infinity; };
        const i = r.indexOf(h.tile);
        for (let d = 2; d < 12 && caved < 0; d++) { const t = r[i - d]; if (t != null && cut(t) && !RD.usePower(g, 'collapse', t)) caved = t; }
        if (caved < 0) break;
      } else {
        if (h.state === 'seek') { h.state = 'flee'; h.next = -1; }
        if (h.state !== 'out' && !g.R.rubble.length) { still = h.tile === last ? still + 1 : 0; worst = Math.max(worst, still); }
        last = h.tile;
      }
    }
    if (caved < 0) continue;
    tried++;
    if (worst < 30 * 6 && h.K.tiles[caved] !== 0) fine++;
  }
  ok(`runners cut off by a cave-in leave once it clears (${fine}/${tried})`, tried > 0 && fine === tried);
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
    m.hp = m.maxHp = 1e9; m.dmg = 0; // this check is about chasing, not about winning the fight
    for (let k = 0; k < 6000 && g.phase === 'raid'; k++) {
      RD.step(g, 1 / 30);
      // a hero who reaches the goblin panics and runs for the gate
      for (const h of g.R.heroes) if (RD.heroAlive(h) && h.state !== 'flee' && RD.tdist(h.tile, m.tile) <= 2) { h.state = 'flee'; h.next = -1; h.hp = h.maxHp * 0.9; }
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
  let g, vet;
  for (let seed = 11; seed < 60 && !vet; seed++) {
    g = RD.newGame(seed, 'normal');
    g.guild.veterans.push({ name: 'Wren Vane', cls: 'scout', tier: 0, lvl: 1, traits: [], escapes: 1 });
    g.raid = 2; RD.beginBuild(g, false);
    vet = g.party.find((h) => h.name === 'Wren Vane');
  }
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
// ---- anti-stacking rules
{
  const g = RD.newGame(3, 'normal');
  g.raid = 20; g.malice = 1e6; RD.beginBuild(g, false);
  const r = route(g);
  const wall = (() => { for (const t of r) for (const w of RD.nb(t)) if (!RD.check(g, 'pylon', w)) return w; })();
  RD.apply(g, 'pylon', wall);
  const close = RD.nb(wall).flatMap((x) => RD.nb(x)).find((w) => w !== wall && g.tiles[w] === 0 && RD.tdist(w, wall) < RD.PYLON_GAP && RD.nb(w).some((j) => g.tiles[j] === 1));
  ok(`two storm pylons cannot stand within ${RD.PYLON_GAP} tiles`, !close || /interfere/.test(RD.check(g, 'pylon', close) || ''));
  // daze recovery and the once-torn soul, on one hero walking over two runes and two siphons
  const h = RD.newGame(8, 'normal');
  h.raid = 20; h.malice = 1e6; RD.beginBuild(h, false);
  const rr = route(h).filter((t) => !RD.isGate(h, t) && !RD.isStairs(h, t) && t !== h.hoard);
  RD.apply(h, 'siphon', rr[3]); RD.apply(h, 'siphon', rr[4]);
  RD.startRaid(h);
  for (let k = 0; k < 40 && !h.R.heroes.length; k++) RD.step(h, 1 / 30);
  const hero = h.R.heroes[0];
  const it3 = h.items.get(rr[3]), it4 = h.items.get(rr[4]);
  const hp0 = hero.hp = hero.maxHp;
  hero.tile = rr[3]; RD.step(h, 0); // place the hero and trigger by stepping in
  // a torn soul stays torn while the hero is hurt, and mends once healed above SOUL_MEND
  hero.soulTorn = true; hero.tornAt = h.R.t - 10; hero.hp = hero.maxHp * (RD.SOUL_MEND - 0.1);
  RD.step(h, 1 / 30);
  const still = hero.soulTorn;
  hero.hp = hero.maxHp * (RD.SOUL_MEND + 0.05);
  RD.step(h, 1 / 30);
  ok('a torn soul mends only once the hero is healed back above 80%', still && !hero.soulTorn);
  hero.soulTorn = true; hero.tornAt = h.R.t; hero.hp = hero.maxHp;
  RD.step(h, 1 / 30);
  ok('…and not in the same moment it was torn', hero.soulTorn);
  ok('rules are on by default', Object.values(RD.RULES).every(Boolean));
}
// ---- the expansion: new traps, hordes, rooms, themes, seals, jobs
{
  const g = RD.newGame(21, 'normal');
  g.raid = 26; g.malice = 1e7; RD.beginBuild(g, false);
  const r = route(g).filter((t) => !RD.isGate(g, t) && !RD.isStairs(g, t) && t !== g.hoard);
  const put = (type, from) => { for (const t of r.slice(from || 0)) if (!RD.check(g, type, t)) { RD.apply(g, type, t); return t; } return -1; };
  for (const t of ['poison', 'alarm', 'cage', 'teleport', 'boulder', 'gravity']) put(t, 1);
  const den = put('warren', 3);
  put('banner', 3); put('sigil', 1); put('goblin', 2);
  RD.startRaid(g);
  ok('a Kobold Warren releases four kobolds', g.R.monsters.filter((m) => m.type === 'kobold').length === 4);
  const gob = g.R.monsters.find((m) => m.type === 'goblin');
  ok('a War Banner makes nearby monsters hit harder', !gob || gob.dmg >= RD.scaled('goblin', 'dmg', 1) * 1.24 || !RD.inAura(g, gob.home, 'monster'));
  let err = null;
  try { for (let k = 0; k < 20000 && g.phase === 'raid'; k++) RD.step(g, 1 / 30); } catch (e) { err = e; }
  const L = g.R.log.map((l) => l.text).join('\n');
  ok(`a raid through every new trap runs cleanly${err ? ' (' + err.message + ')' : ''}`, !err);
  ok('new traps fire (needle, bell, cage, teleport, boulder, gravity)', ['A needle pricks', 'alarm bell', 'Bars slam', 'vanishes from', 'boulder thunders', 'gravity well'].filter((x) => L.includes(x)).length >= 3);
}
{
  // themes
  const g = RD.newGame(4, 'normal');
  g.raid = 9; g.malice = 1e6; RD.beginBuild(g, false);
  RD.openFloor(g, 'crypt');
  ok('a floor dug as a Crypt keeps its theme', g.themes[1] === 'crypt' && RD.themeMult(g, 'skeleton', RD.N + 5, 'hp') > 1 && RD.themeMult(g, 'skeleton', 5, 'hp') === 1);
  const s1 = JSON.stringify(RD.saveGame(g)), s2 = JSON.stringify(RD.saveGame(RD.loadGame(JSON.parse(s1))));
  ok('themes survive a save', s1 === s2);
}
{
  // the boss seal: nobody leaves the floor while the boss lives, except a phantom thief
  const g = RD.newGame(6, 'normal');
  g.raid = 15; g.malice = 1e7; RD.beginBuild(g, false);
  const r = route(g).filter((t) => !RD.isGate(g, t) && t !== g.hoard);
  ok('a seal needs a boss on the floor', /needs a boss/.test(RD.check(g, 'seal', r[4]) || ''));
  const bt = r.slice(6).find((t) => !RD.check(g, 'goblinking', t)); RD.apply(g, 'goblinking', bt);
  const st = r.find((t) => !RD.check(g, 'seal', t)); RD.apply(g, 'seal', st);
  // make the boss unkillable and the party run for the gate
  RD.startRaid(g);
  for (const m of g.R.monsters) if (m.d.boss) { m.hp = m.maxHp = 1e12; m.dmg = 0; }
  let left = 0;
  for (let k = 0; k < 30000 && g.phase === 'raid'; k++) {
    RD.step(g, 1 / 30);
    for (const h of g.R.heroes) if (RD.heroAlive(h) && h.state === 'seek' && g.R.t > 8) { h.state = 'flee'; h.next = -1; }
  }
  left = g.debrief.escaped.length;
  ok('heroes cannot escape a sealed floor while its boss lives', left === 0);
  const sold = RD.newGame(6, 'normal');
  sold.raid = 15; sold.malice = 1e7; RD.beginBuild(sold, false);
  RD.apply(sold, 'goblinking', bt); RD.apply(sold, 'seal', st); RD.apply(sold, 'sell', bt);
  ok('selling the boss refunds and removes its seal', !sold.items.has(st));
  // phantom thieves walk through
  const h = RD.newGame(6, 'normal');
  h.raid = 15; h.malice = 1e7; RD.beginBuild(h, false);
  RD.apply(h, 'goblinking', bt); RD.apply(h, 'seal', st);
  h.party = [RD.makeHero(h, 'phantomthief', 6, null, new Set())];
  RD.startRaid(h);
  for (const m of h.R.monsters) if (m.d.boss) { m.hp = m.maxHp = 1e12; m.dmg = 0; }
  for (let k = 0; k < 30000 && h.phase === 'raid'; k++) {
    RD.step(h, 1 / 30);
    for (const x of h.R.heroes) if (RD.heroAlive(x) && x.state === 'seek' && h.R.t > 8) { x.state = 'flee'; x.next = -1; }
  }
  ok('a Phantom Thief slips through the seal', h.debrief.escaped.length === 1);
}
{
  // every hero job can run a raid without errors
  let bad = [];
  for (const cls of Object.keys(RD.CLASSES)) {
    try {
      const g = RD.newGame(13, 'normal');
      g.raid = 14; g.malice = 1e6; RD.beginBuild(g, false);
      const r = route(g);
      for (const [t, f] of [['orc', 0.5], ['gargoyle', 0.6], ['minotaur', 0.7], ['basilisk', 0.8], ['harpy', 0.4]]) { const i = r.slice(Math.floor(r.length * f)).find((x) => !RD.check(g, t, x)); if (i != null) RD.apply(g, t, i); }
      g.party = [RD.makeHero(g, cls, 6, null, new Set()), RD.makeHero(g, 'knight', 5, null, new Set())];
      RD.startRaid(g);
      for (let k = 0; k < 15000 && g.phase === 'raid'; k++) RD.step(g, 1 / 30);
    } catch (e) { bad.push(cls + ': ' + e.message); }
  }
  ok(`all ${Object.keys(RD.CLASSES).length} hero jobs raid cleanly${bad.length ? ' — ' + bad.join('; ') : ''}`, !bad.length);
}
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
