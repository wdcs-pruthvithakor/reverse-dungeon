'use strict';
// The raid: heroes walk in with the guild's map, learn as they go, and carry what they learn home.
(function () {
  const RD = window.RD;
  const { N } = RD;
  const xy = RD.xy, fl = RD.fl;

  // ---------------------------------------------------------------- visual effects (read by render.js)
  // Every effect remembers its floor so the map only draws what happens on the floor you are looking at.
  const FX = (RD.FX = { floaters: [], parts: [], shots: [], rings: [], bubbles: [], shake: 0 });
  let fxFloor = 0;
  RD.floater = (x, y, text, color, big, f) => {
    f = f == null ? fxFloor : f;
    // a quick run of hits on one spot adds up into one number instead of a pile of them
    if (!big && /^\d+$/.test(text)) {
      const same = FX.floaters.find((o) => !o.big && o.f === f && o.color === color && o.t < 0.35 && /^\d+$/.test(o.text) && Math.abs(o.x - x) < 0.5 && Math.abs(o.y - y) < 0.6);
      if (same) { same.text = String(+same.text + +text); same.t = Math.min(same.t, 0.1); return; }
    }
    FX.floaters.push({ x, y, text, color, t: 0, life: big ? 1.6 : 1.1, big, f });
  };
  RD.burst = (x, y, color, n, spd, f) => {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = (0.5 + Math.random()) * (spd || 2);
      FX.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.4 + Math.random() * 0.5, color, f: f == null ? fxFloor : f });
    }
  };
  RD.ring = (x, y, r, color, f) => FX.rings.push({ x, y, r, color, t: 0, life: 0.5, f: f == null ? fxFloor : f });
  // a few words over a hero's head, so the story of a raid is on the map and not only in the log
  RD.say = (h, text) => {
    FX.bubbles = FX.bubbles.filter((b) => b.h !== h);
    FX.bubbles.push({ h, text, t: 0, life: 2.4 });
  };
  const shot = (a, b, color, life) => FX.shots.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, t: 0, life: life || 0.16, color, f: fl(a.tile) });
  RD.fxUpdate = function (dt) {
    for (const f of FX.floaters) { f.t += dt; f.y -= dt * 0.7; }
    for (const p of FX.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    for (const s of FX.shots) s.t += dt;
    for (const r of FX.rings) r.t += dt;
    for (const b of FX.bubbles) b.t += dt;
    FX.bubbles = FX.bubbles.filter((b) => b.t < b.life);
    FX.floaters = FX.floaters.filter((f) => f.t < f.life);
    FX.parts = FX.parts.filter((p) => p.t < p.life);
    FX.shots = FX.shots.filter((s) => s.t < s.life);
    FX.rings = FX.rings.filter((r) => r.t < r.life);
    FX.shake = Math.max(0, FX.shake - dt * 3);
  };
  RD.fxFloor = (f) => { fxFloor = f; };

  const center = (i) => { const [x, y] = xy(i); return [x + 0.5, y + 0.5]; };
  const udist = (a, b) => (fl(a.tile) !== fl(b.tile) ? Infinity : Math.hypot(a.x - b.x, a.y - b.y));
  const omen = (G, id) => (G.omen && G.omen.id === id) || (id === 'dark' && RD.twisted(G, 'dark'));
  const scaleOf = (h) => h.dmg / RD.CLASSES[h.cls].dmg; // rank × difficulty × veteran bonus
  const label = (h) => `${h.name}${h.title ? ' ' + h.title : ''}`;
  const sfx = (name) => { if (RD.sfx) RD.sfx(name); }; // audio.js may not be loaded (headless runs)

  function log(R, text, tone) {
    R.log.unshift({ t: R.t, text, tone });
    if (R.log.length > 250) R.log.length = 250;
  }

  // ---------------------------------------------------------------- start
  function mkMonster(type, home, lv, tier, item) {
    const d = RD.ITEMS[type];
    const G = RD.G;
    const glass = G && RD.twisted(G, 'glass');
    const room = G && RD.inAura(G, home, 'monster');
    const hp = RD.scaled(type, 'hp', lv, tier) * (glass ? 0.7 : 1) * (G ? RD.themeMult(G, type, home, 'hp') : 1) * (room ? 1.15 : 1);
    const dmg = RD.scaled(type, 'dmg', lv, tier) * (glass ? 1.5 : 1) * (G ? RD.themeMult(G, type, home, 'dmg') : 1) * (room ? 1.25 : 1);
    const [x, y] = center(home);
    return {
      type, d, item, home, tile: home, x, y, next: -1, tier, lv, spd: G ? RD.themeMult(G, type, home, 'speed') : 1,
      hp, maxHp: hp, dmg, struck: new Set(), chargeCd: 0, calmT: 0, alarmT: 0, alarmTo: null,
      cd: 0, abT: d.every ? d.every * 0.5 : 0, sumT: d.every || 5, minions: 0,
      dead: false, dormant: type === 'mimic' || !!d.statue, lunge: 0, face: 1,
    };
  }

  RD.startRaid = function (G) {
    G.phase = 'raid';
    const shared = RD.cloneKnow(G.guild.K);
    shared.removed = new Set();
    shared.shifts = 0;
    const R = (G.R = {
      t: 0, heroes: [], monsters: [], clouds: [], log: [],
      queue: G.party.slice(), spawnT: 0.4, shared, feud: omen(G, 'feud'),
      report: null, killed: [], escaped: [], goldTaken: 0, goldBack: 0, malice: 0,
      powers: Object.fromEntries(Object.keys(RD.POWERS).map((k) => [k, 0])), seals: {}, douseT: 0, frenzyT: 0, sealT: 0, lure: null, rubble: [],
      dropped: [], newGhosts: [], src: null, dealt: {}, fired: new Set(), combos: {}, healed: 0, disarmed: 0, jammed: 0, comboLock: false,
      startGold: G.gold, bones: [], seen: new Set(),
    });
    for (const it of G.items.values()) {
      const d = RD.ITEMS[it.type];
      if (d.kind !== 'monster') continue;
      if (!d.den) { R.monsters.push(mkMonster(it.type, it.tile, it.lv, d.tier, it)); continue; }
      // a den releases its horde around itself, fighting at the den's rank
      const n = d.count + (RD.themeOf(G, it.tile).hordeExtra || 0);
      const spots = [it.tile].concat(RD.nb(it.tile).filter((j) => G.tiles[j] === 1));
      for (let k = 0; k < n; k++) {
        const m = mkMonster(d.pack, spots[k % spots.length], it.lv, RD.minionOf(it.type).tier, it);
        m.home = it.tile;
        R.monsters.push(m);
      }
    }
    for (const it of G.items.values()) if (it.type === 'seal') R.seals[fl(it.tile)] = true;
    for (const it of G.items.values()) if (RD.ITEMS[it.type].oneway) { it.dropped = it.armed = false; it.by = null; it.passed = new Set(); }
    for (const it of G.items.values()) { it.taken = false; it.lost = false; }
    // vengeful ghosts rise where they fell, at the rank they had in life
    for (const gh of G.ghosts || []) {
      gh.ex = 0;
      if (gh.kind !== 'vengeful' || gh.gone || G.tiles[gh.tile] !== 1 || fl(gh.tile) >= G.floors) continue;
      const m = mkMonster('spectre', gh.tile, 3, Math.min(RD.MAX_TIER - 1, Math.max(RD.ITEMS.spectre.tier, gh.tier)), null);
      m.ghost = gh;
      R.monsters.push(m);
    }
    // exit gates start shut: solid until a drop gate on their floor falls
    for (const it of G.items.values()) if (RD.ITEMS[it.type].exit) { it.opened = false; G.tiles[it.tile] = 0; }
    if (RD.view) RD.view.dirty = true;
    const legends = G.party.filter((h) => h.title);
    log(R, `Raid ${G.raid} begins. ${G.party.length} heroes at the gate, rated up to ${RD.TIERS[Math.max(...G.party.map((h) => h.tier))]}.`, 'info');
    for (const h of legends) log(R, `A legend walks with them: ${label(h)}, ${RD.TIERS[h.tier]}-rank ${RD.CLASSES[h.cls].name}.`, 'warn');
    return R;
  };

  function spawnHero(G, R, h) {
    const [x, y] = center(G.entrance);
    Object.assign(h, {
      tile: G.entrance, x, y, next: -1, goal: -1, state: 'seek',
      K: R.feud ? RD.cloneKnow(R.shared) : R.shared,
      checked: new Set(), visited: new Set(), seen: R.feud ? new Set() : R.seen,
      cd: 0, stun: 0, rootT: 0, confuse: 0, slowT: 0, carry: 0, lootT: 0,
      doorAt: -1, disarmAt: -1, disarmT: 0, jamAt: -1, jamT: 0, steadyT: 0, soulTorn: false, cat: 'trap', said: 0, bob: Math.random() * 6, revived: false,
      xp: 0, charted: 0, hurtTaken: 0, cureT: 0,
    });
    R.heroes.push(h);
    reveal(G, R, h);
  }

  // ---------------------------------------------------------------- knowledge updates
  function shift(R, h, key, what, tile) {
    h.K.removed.add(key);
    h.K.shifts++;
    h.K.hz = null;
    if (R.t - (h.said || 0) > 2) {
      h.said = R.t;
      RD.say(h, `The ${what} is gone!`);
      log(R, `${h.name}: “The ${what} at ${RD.coord(tile)} is gone.”`, 'hero');
    }
  }

  function reveal(G, R, h) {
    const K = h.K;
    const dark = R.douseT > 0;
    const vis = dark ? 1 : Math.max(1, h.vision - (omen(G, 'dark') ? 1 : 0));
    const [hx, hy] = xy(h.tile);
    const f = fl(h.tile);
    for (let y = hy - vis; y <= hy + vis; y++) {
      for (let x = hx - vis; x <= hx + vis; x++) {
        if (x < 0 || y < 0 || x >= RD.COLS || y >= RD.ROWS) continue;
        if ((x - hx) ** 2 + (y - hy) ** 2 > vis * vis + 0.5) continue;
        const j = RD.idx(x, y, f);
        if (!RD.los(G.tiles, h.tile, j)) continue;
        h.seen.add(j);
        const truth = rubbleAt(R, j) ? 1 : G.tiles[j];
        if (K.tiles[j] !== truth) {
          if (K.tiles[j] === -1) h.charted++;
          if (K.tiles[j] !== -1) { K.shifts++; if (truth === 0) K.removed.add('tile:' + j); }
          K.tiles[j] = truth;
          K.hz = null;
        }
        const down = G.links.get(j);
        if (down != null && fl(down) > f && !K.stairs.has(j)) {
          K.stairs.add(j);
          K.hz = null;
          RD.say(h, 'Stairs down!');
          log(R, `${h.name} finds stairs leading down at ${RD.coord(j)}.`, 'warn');
        }
        const it = G.items.get(j);
        const d = it && RD.ITEMS[it.type];
        // visible pieces
        if (d && d.kind === 'turret') { if (K.turrets.get(j) !== it.type) RD.learnItem(K, it); }
        else if (K.turrets.has(j)) { const w = RD.WHAT[K.turrets.get(j)]; K.turrets.delete(j); shift(R, h, 'turret:' + j, w, j); }
        if (d && d.kind === 'monster' && it.type !== 'mimic') {
          if (K.lairs.get(j) !== it.type) {
            RD.learnItem(K, it);
            if (d.boss) RD.say(h, d.lord ? 'The Demon Lord!' : `A ${d.name.toLowerCase()}!`);
            if (d.boss) log(R, `${h.name} sees the ${d.name} at ${RD.coord(j)}${d.myth ? '. A myth made flesh.' : '.'}`, 'warn');
          }
        } else if (K.lairs.has(j) && !(it && it.type === 'mimic')) { const w = RD.WHAT[K.lairs.get(j)]; K.lairs.delete(j); shift(R, h, 'lair:' + j, w, j); }
        if (it && (it.type === 'mimic' || (d.kind === 'bait' && !it.taken))) { if (!K.mimics.has(j)) K.chests.add(j); }
        else if (K.chests.has(j)) { K.chests.delete(j); K.mimics.delete(j); h.K.removed.add('chest:' + j); }
        if (d && d.kind === 'door' && !it.broken) { if (!K.doors.has(j)) RD.learnItem(K, it); }
        else if (K.doors.has(j) && !(d && d.kind === 'door')) { K.doors.delete(j); shift(R, h, 'door:' + j, 'door', j); }
        if (j === G.hoard) { if (K.hoard !== j) { K.hoard = j; K.removed.delete('hoard:' + j); log(R, `${h.name} spots the hoard at ${RD.coord(j)}.`, 'warn'); } }
        else if (K.hoard === j) { K.hoard = -1; shift(R, h, 'hoard:' + j, 'hoard', j); }
      }
    }
    if (!dark) detect(G, R, h);
  }

  // Look for hidden things nearby. Each hero rolls once per tile. Strong heroes spot weak traps more easily.
  function detect(G, R, h) {
    const C = RD.CLASSES[h.cls];
    const keen = h.traits.includes('keen');
    const radius = Math.max(C.detectR || 0, keen ? 1.5 : 0);
    if (!radius) return;
    const war = (G.guild.wariness || 0) * 0.2;
    const [hx, hy] = xy(h.tile);
    const f = fl(h.tile);
    const r = Math.ceil(radius);
    for (let y = hy - r; y <= hy + r; y++) for (let x = hx - r; x <= hx + r; x++) {
      if (x < 0 || y < 0 || x >= RD.COLS || y >= RD.ROWS) continue;
      const j = RD.idx(x, y, f);
      if (RD.tdist(h.tile, j) > radius) continue;
      if (!RD.los(G.tiles, h.tile, j)) continue;
      const it = G.items.get(j);
      const d = it && RD.ITEMS[it.type];
      const kt = h.K.traps.get(j);
      const senses = (s) => (C.detect && C.detect[s]) || (keen ? 0.3 : 0);
      if (d && d.sense && !h.checked.has(j)) {
        h.checked.add(j);
        const base = senses(d.sense);
        const p = base > 0 ? Math.min(1, base + war + 0.08 * (h.tier - d.tier)) : 0;
        if (p > 0 && Math.random() < p) {
          const [cx, cy] = center(j);
          if (it.type === 'mimic') {
            if (!h.K.mimics.has(j)) { h.K.mimics.add(j); h.K.chests.delete(j); h.K.lairs.set(j, 'mimic'); h.K.hz = null; RD.floater(cx, cy, 'seen through', '#9cc0e6', false, f); log(R, `${h.name} sees through the mimic at ${RD.coord(j)}.`, 'hero'); }
          } else if (d.kind === 'trap' && !kt) {
            h.K.traps.set(j, { type: it.type, off: false });
            h.K.removed.delete('trap:' + j);
            h.K.hz = null;
            RD.floater(cx, cy, 'spotted', '#9cc0e6', false, f);
            RD.say(h, 'A trap!');
            sfx('spot');
            log(R, `${h.name} spots a ${d.name.toLowerCase()} at ${RD.coord(j)}.`, 'hero');
          }
        }
      }
      // A known trap where a detector now finds nothing: the dungeon moved it.
      if (kt && !(d && d.kind === 'trap') && !h.checked.has('x' + j)) {
        const kd = RD.ITEMS[kt.type];
        h.checked.add('x' + j);
        if (senses(kd.sense) >= 0.5) { h.K.traps.delete(j); shift(R, h, 'trap:' + j, RD.WHAT[kt.type], j); }
      }
    }
  }

  function learnTrap(R, h, tile, type) {
    const K = h.K;
    K.traps.set(tile, { type, off: false });
    K.removed.delete('trap:' + tile);
    K.hz = null;
  }

  // ---------------------------------------------------------------- hero planning
  const UNDISARMABLE = new Set(['chasm', 'abyss']);

  const rubbleAt = (R, j) => R.rubble.some((r) => r.tile === j);

  // `probe`: the hero is stuck, so rock the guild remembers but nobody has looked at tonight might be a new corridor.
  function heroCost(G, h, K, j, probe) {
    const t = K.tiles[j];
    if (t === 0) return probe && !h.seen.has(j) && !RD.isBorder(j) ? 6 : Infinity;
    let c = t === -1 ? 1.5 + (G.guild.wariness || 0) * 0.6 : 1;
    if (G.R && rubbleAt(G.R, j)) c += 14; // a cave-in: worth a detour, otherwise wait for the dust to settle
    const trap = K.traps.get(j);
    if (trap && !trap.off) {
      const td = RD.ITEMS[trap.type];
      if (UNDISARMABLE.has(trap.type)) c += 45;
      else if (RD.CLASSES[h.cls].disarm) c += 2.5;
      else c += 26 * (1 - h.reck) * Math.max(0.15, Math.min(2, 1 + 0.5 * (td.tier - h.tier)));
    }
    if (K.doors.has(j)) c += h.cls === 'knight' || RD.CLASSES[h.cls].pick ? 2 : 5;
    if (K.mimics.has(j)) c += 12;
    c += (K.hz[j] * 3.5 * (1 - Math.min(0.95, h.brave))) / (1 + 0.5 * h.tier);
    return c;
  }

  function gateOf(G, f) { return f * N + G.gates[f]; }

  // A sealed floor: a Boss Seal stands on it and that floor's boss still lives.
  function sealed(G, R, f) {
    if (!R.seals || !R.seals[f]) return false;
    return R.monsters.some((m) => !m.dead && m.d.boss && m.item && fl(m.home) === f);
  }
  const canPassSeal = (h) => !!RD.CLASSES[h.cls].sealwalker;

  function chooseGoal(G, R, h, dist, probe) {
    const K = h.K;
    // trapped behind a boss seal: the only way out is through the boss
    if ((h.state === 'escape' || h.state === 'flee') && sealed(G, R, fl(h.tile)) && !canPassSeal(h)) {
      const boss = R.monsters.find((m) => !m.dead && m.d.boss && m.item && fl(m.home) === fl(h.tile));
      if (boss && boss.tile < dist.length && dist[boss.tile] < Infinity && boss.tile !== h.tile) return boss.tile;
    }
    if (h.state === 'escape' || h.state === 'flee') return G.entrance;
    if (h.hunt != null) {
      const prey = R.monsters.find((m) => m.home === h.hunt && m.d.boss && !m.dead);
      if (!prey) h.hunt = null;
      else if (prey.tile < dist.length && dist[prey.tile] < Infinity && prey.tile !== h.tile) return prey.tile;
      else if (h.hunt < dist.length && dist[h.hunt] < Infinity && h.hunt !== h.tile) return h.hunt;
    }
    if (R.lure && h.state === 'seek' && h.fooled !== R.lure.id && R.lure.tile < dist.length && dist[R.lure.tile] < Infinity) return R.lure.tile;
    // treasure pulls the greedy a long way, and a strike team a few steps off its hunt
    const pull = h.greed >= 0.6 ? 6 + h.greed * 4 : h.hunt != null ? 4 : 0;
    if (pull > 0) {
      let best = -1, bd = pull;
      for (const c of K.chests) {
        if (K.mimics.has(c) || h.visited.has(c) || c >= dist.length) continue;
        if (dist[c] < bd) { bd = dist[c]; best = c; }
      }
      if (best >= 0) return best;
    }
    if (K.hoard >= 0 && K.hoard < dist.length && dist[K.hoard] < Infinity) return K.hoard;
    // explore: unknown tiles next to known floor, pushing deeper into the dungeon
    const score = (j) => dist[j] - 0.7 * RD.tdist(j, gateOf(G, fl(j))) - 6 * fl(j) + RD.hash(h.seed, j) * 4;
    let best = -1, bs = Infinity;
    for (let j = 0; j < dist.length; j++) {
      if (K.tiles[j] !== -1 || dist[j] === Infinity) continue;
      const l = G.links.get(j);
      if (!RD.nb(j).some((k) => K.tiles[k] === 1) && !(l != null && K.tiles[l] === 1)) continue;
      const s = score(j);
      if (s < bs) { bs = s; best = j; }
    }
    if (best >= 0) return best;
    // the map is complete but the hoard moved: sweep known halls nobody has looked at tonight
    for (let j = 0; j < dist.length; j++) {
      if (K.tiles[j] !== 1 || dist[j] === Infinity || h.seen.has(j)) continue;
      const s = score(j);
      if (s < bs) { bs = s; best = j; }
    }
    if (best >= 0 || !probe) return best;
    // still nothing: go and look at remembered rock beside known halls in case it was dug out
    for (let j = 0; j < dist.length; j++) {
      if (K.tiles[j] !== 0 || dist[j] === Infinity || h.seen.has(j) || RD.isBorder(j)) continue;
      if (!RD.nb(j).some((k) => K.tiles[k] === 1)) continue;
      const s = score(j);
      if (s < bs) { bs = s; best = j; }
    }
    return best;
  }

  function plan(G, R, h) {
    const K = h.K;
    if (h.confuse > 0) {
      const opts = RD.nb(h.tile).filter((j) => G.tiles[j] === 1 && !doorShut(G, j));
      if (opts.length) h.next = opts[Math.floor(Math.random() * opts.length)];
      return;
    }
    if (!K.hz) K.hz = RD.hazard(K);
    const linkOk = (u) => (K.stairs.has(u) || K.stairs.has(G.links.get(u))) && (canPassSeal(h) || !sealed(G, R, fl(u)));
    let { dist, prev } = RD.dijkstra(G, h.tile, (j) => heroCost(G, h, K, j, false), linkOk);
    let goal = chooseGoal(G, R, h, dist, false);
    if (goal < 0 || dist[goal] === Infinity) {
      // stuck on the map they carry: the walls may have moved, so search rock nobody has checked tonight
      ({ dist, prev } = RD.dijkstra(G, h.tile, (j) => heroCost(G, h, K, j, true), linkOk));
      goal = chooseGoal(G, R, h, dist, true);
      if (goal >= 0 && dist[goal] < Infinity && !h.probing) {
        h.probing = true;
        RD.say(h, 'The walls moved!');
        log(R, `${h.name}: “The walls have moved. There must be another way.”`, 'hero');
      }
    }
    if (goal < 0 || dist[goal] === Infinity) {
      if (h.state === 'seek') { h.state = 'flee'; log(R, `${h.name} can find no way on and turns back.`, 'hero'); }
      else if (R.dropped.length && (h.noWay = (h.noWay || 0) + 1) > 90) { h.noWay = 0; reopenFor(G, R, h); }
      return;
    }
    h.noWay = 0;
    h.goal = goal;
    if (goal === h.tile) { arrive(G, R, h); return; }
    let step = goal;
    while (prev[step] !== h.tile) { step = prev[step]; if (step < 0) return; }
    if (rubbleAt(R, step)) {
      if (!h.dustSaid) { h.dustSaid = true; RD.say(h, 'Rubble! Wait…'); }
      return;
    }
    if (G.tiles[step] === 0) { K.tiles[step] = 0; K.hz = null; h.seen.add(step); return; }
    if (doorShut(G, step)) {
      if (!K.doors.has(step)) { K.doors.add(step); K.hz = null; }
      h.doorAt = step;
      return;
    }
    const kt = K.traps.get(step);
    const C = RD.CLASSES[h.cls];
    if (C.disarm && kt && !kt.off && !UNDISARMABLE.has(kt.type)) {
      h.disarmAt = step;
      h.disarmT = C.disarm;
      return;
    }
    h.next = step;
  }

  // a Drop Gate is no door while it stands open; once down, its tile is solid rock until dawn
  function doorShut(G, j) {
    const it = G.items.get(j);
    const d = it && RD.ITEMS[it.type];
    return !!(d && d.kind === 'door' && !d.oneway && !d.exit && !it.broken);
  }
  function dropGates(G, R) {
    for (const it of G.items.values()) {
      if (!it.armed || it.dropped) continue;
      const t = it.tile;
      // it waits for the whole party: everyone still coming has to be through (the dead and the runaways don't count)
      if (R.queue.length) continue;
      if (R.heroes.some((h) => alive(h) && !(it.passed && it.passed.has(h.id)) && h.state !== 'flee' && h.state !== 'escape')) continue;
      if (R.heroes.some((h) => alive(h) && h.tile === t) || R.monsters.some((m) => !m.dead && m.tile === t)) continue;
      it.dropped = true;
      it.armed = false;
      G.tiles[t] = 0;
      R.dropped.push(t);
      for (const o of R.heroes) if (o.next === t) o.next = -1;
      for (const m of R.monsters) if (m.next === t) m.next = -1;
      const [x, y] = center(t);
      FX.shake = Math.max(FX.shake, 0.5);
      RD.burst(x, y, '#8a8090', 14, 2, fl(t));
      sfx('door');
      if (RD.view) RD.view.dirty = true;
      if (it.by && alive(it.by)) RD.say(it.by, 'The gate! It’s shut behind us!');
      log(R, `The drop gate at ${RD.coord(t)} crashes down behind the last of them, ${it.by ? it.by.name : 'the heroes'}. They need another way out.`, 'hit');
      // the floor hears it: everyone there knows the way back is shut, and the Exit Gates grind open
      const f = fl(t);
      for (const o of R.heroes) if (alive(o) && o.K && fl(o.tile) === f) { o.K.tiles[t] = 0; o.K.hz = null; o.next = o.next === t ? -1 : o.next; }
      for (const e of G.items.values()) {
        if (!RD.ITEMS[e.type].exit || e.opened || fl(e.tile) !== f) continue;
        e.opened = true;
        G.tiles[e.tile] = 1;
        for (const o of R.heroes) if (o.K) { o.K.tiles[e.tile] = 1; o.K.hz = null; }
        const [ex, ey] = center(e.tile);
        RD.ring(ex, ey, 0.8, '#86c06a', f);
        log(R, `The exit gate at ${RD.coord(e.tile)} grinds open.`, 'warn');
      }
      emit('dropgate', it);
    }
  }
  // the safety net: a hero with no road left at all gets the nearest fallen gate back
  function reopenFor(G, R, h) {
    const f = fl(h.tile);
    const t = R.dropped.filter((j) => fl(j) === f).sort((a, b) => RD.tdist(a, h.tile) - RD.tdist(b, h.tile))[0];
    if (t == null) return;
    G.tiles[t] = 1;
    R.dropped.splice(R.dropped.indexOf(t), 1);
    for (const o of R.heroes) if (o.K && o.K.tiles[t] === 0) { o.K.tiles[t] = 1; o.K.hz = null; }
    if (RD.view) RD.view.dirty = true;
    log(R, `The drop gate at ${RD.coord(t)} creaks back up.`, 'hero');
  }

  function arrive(G, R, h) {
    if (R.lure && h.tile === R.lure.tile && h.state === 'seek' && h.fooled !== R.lure.id) {
      h.fooled = R.lure.id;
      h.confuse = 1.5;
      RD.say(h, 'Fake gold!');
      return;
    }
    if ((h.state === 'escape' || h.state === 'flee') && h.tile === G.entrance && (R.sealT > 0 || (sealed(G, R, 0) && !canPassSeal(h)))) {
      if (!h.sealed) { h.sealed = true; RD.say(h, 'The gate is shut!'); }
      return;
    }
    if (h.state === 'seek' && h.tile === G.hoard) {
      h.state = 'loot';
      h.lootT = 1.2;
      return;
    }
    if ((h.state === 'escape' || h.state === 'flee') && h.tile === G.entrance) {
      leave(G, R, h);
      return;
    }
    const bait = G.items.get(h.tile);
    if (bait && RD.ITEMS[bait.type].kind === 'bait' && !bait.taken && h.state === 'seek' && !h.baitT) {
      h.baitT = 2;
      h.baitAt = h.tile;
      RD.say(h, 'Treasure!');
    }
    if (h.K.chests.has(h.tile)) h.visited.add(h.tile);
  }

  function enterTile(G, R, h) {
    h.visited.add(h.tile);
    reveal(G, R, h);
    const it = G.items.get(h.tile);
    if (it && RD.ITEMS[it.type].kind === 'trap' && !it.off && !it.spent && it.cd <= 0) trigger(G, R, h, it);
    if (alive(h)) arrive(G, R, h);
  }

  // ---------------------------------------------------------------- traps
  const heroesNear = (R, f, x, y, r) => R.heroes.filter((o) => alive(o) && fl(o.tile) === f && Math.hypot(o.x - x, o.y - y) <= r);

  // A hero far above a trap's rank shakes off part of its pin, daze, slow or stun.
  const resist = (h, d) => Math.max(0.35, Math.min(1, 1 - 0.2 * (h.tier - d.tier - 1)));
  const hold = (h, d, key, lv) => RD.lvDur(d, key, lv) * resist(h, d) * (RD.G ? RD.themeMult(RD.G, d.id, h.tile, 'hold') : 1);
  const unbound = (h) => !!RD.CLASSES[h.cls].unbound; // ninjas shrug off pins, slows and cages

  // R.src names whoever is dealing damage right now (a placed piece, a monster, or a power), so hurt()
  // can credit the right piece in the night's report and check for combos
  function trigger(G, R, h, it) {
    const was = R.src;
    R.src = it;
    R.fired.add('it:' + it.tile);
    try { triggerOnce(G, R, h, it); } finally { R.src = was; }
  }
  function triggerOnce(G, R, h, it) {
    const d = RD.ITEMS[it.type];
    const kt = h.K.traps.get(it.tile);
    const known = kt && kt.type === it.type;
    const [x, y] = center(it.tile);
    const f = fl(it.tile);
    const workshop = RD.inAura(G, it.tile, 'trap');
    const ash = (omen(G, 'ash') ? 0.5 : 1) * RD.themeMult(G, it.type, it.tile, 'rearm') * (workshop ? 0.6 : 1);
    const dmg = d.dmg != null ? RD.scaled(it.type, 'dmg', it.lv) * RD.themeMult(G, it.type, it.tile, 'dmg') * (workshop ? 1.2 : 1) : 0;
    const where = RD.coord(it.tile);
    if (d.rearm) it.cd = RD.lvRearm(d, it.lv) * ash * (G.pact === 'iron' ? 0.85 : 1);
    sfx({ spikes: 'trap', snare: 'trap', rune: 'fire', chasm: 'crush', crusher: 'crush', vent: 'hiss', maze: 'daze', frost: 'frost', siphon: 'daze', abyss: 'summon', poison: 'hiss', alarm: 'gold', cage: 'door', teleport: 'summon', boulder: 'boom', gravity: 'crush' }[it.type]);
    switch (it.type) {
      case 'spikes':
        hurt(G, R, h, dmg * (known ? 0.5 : 1), 'trap');
        RD.burst(x, y, '#e9e0d2', 8, 2, f);
        log(R, `${h.name} drops into the spike pit at ${where}.`, 'hit');
        break;
      case 'snare':
        hurt(G, R, h, dmg, 'trap');
        if (!unbound(h)) h.rootT = hold(h, d, 'root', it.lv);
        RD.burst(x, y, '#8a8090', 8, 1.5, f);
        log(R, `Iron jaws close on ${h.name} at ${where}.`, 'hit');
        break;
      case 'rune':
        it.spent = true;
        FX.shake = 0.6;
        RD.ring(x, y, d.radius, '#ff8a3d', f);
        RD.burst(x, y, '#ff8a3d', 26, 4, f);
        for (const o of heroesNear(R, f, x, y, d.radius)) hurt(G, R, o, dmg, 'trap');
        log(R, `The fire rune at ${where} erupts.`, 'hit');
        break;
      case 'chasm':
        hurt(G, R, h, dmg * (known ? 0.4 : 1), 'illusion');
        h.stun = known ? 0.8 : hold(h, d, 'stun', it.lv);
        RD.burst(x, y, '#5a4a66', 14, 1.5, f);
        log(R, `${h.name} falls through the false floor at ${where}.`, 'hit');
        break;
      case 'crusher':
        hurt(G, R, h, dmg * (known ? 0.6 : 1), 'trap');
        h.stun = 1;
        FX.shake = 0.5;
        RD.burst(x, y, '#8a8090', 16, 2.5, f);
        log(R, `The ceiling comes down on ${h.name} at ${where}.`, 'hit');
        break;
      case 'vent':
        R.clouds.push({ x, y, f, r: d.radius, t: d.dur, life: d.dur, dps: RD.scaled(it.type, 'dps', it.lv), src: it });
        log(R, `Miasma pours from the grate at ${where}.`, 'hit');
        break;
      case 'maze':
        hurt(G, R, h, dmg, 'illusion');
        // a hero who just shook off a daze keeps their head for a few seconds
        if (RD.RULES.dazeRecovery && h.steadyT > 0) { RD.say(h, 'Not again!'); break; }
        h.confuse = hold(h, d, 'confuse', it.lv);
        h.next = -1;
        RD.ring(x, y, 0.8, '#b38be0', f);
        log(R, `${h.name} steps on the wandering rune and loses the way.`, 'hit');
        break;
      case 'frost':
        RD.ring(x, y, d.radius, '#9cc0e6', f);
        RD.burst(x, y, '#cfe3f2', 18, 2.5, f);
        for (const o of heroesNear(R, f, x, y, d.radius)) { hurt(G, R, o, dmg, 'trap'); if (!unbound(o)) o.slowT = hold(o, d, 'slow', it.lv); }
        log(R, `Frost blooms from the sigil at ${where}.`, 'hit');
        break;
      case 'siphon': {
        // a siphon tears away part of the soul; a torn soul has nothing more to give until it mends
        const take = (RD.RULES.soulOnce && h.soulTorn ? 0 : Math.max(0, h.hp) * d.pct) + dmg;
        if (!h.soulTorn) { RD.say(h, 'My soul!'); h.tornAt = R.t; }
        h.soulTorn = true;
        hurt(G, R, h, take, 'trap');
        RD.ring(x, y, 0.9, '#e05a86', f);
        log(R, `The soul siphon at ${where} tears into ${h.name}.`, 'hit');
        break;
      }
      case 'poison':
        hurt(G, R, h, dmg, 'trap');
        h.poison = { dps: RD.scaled(it.type, 'dps', it.lv) * RD.themeMult(G, it.type, it.tile, 'dmg'), t: d.dur, src: it };
        RD.burst(x, y, '#86c06a', 8, 1.2, f);
        log(R, `A needle pricks ${h.name} at ${where}. Poison.`, 'hit');
        break;
      case 'alarm': {
        hurt(G, R, h, dmg, 'trap');
        RD.ring(x, y, d.call, '#e3b04b', f);
        let n = 0;
        for (const m of R.monsters) if (!m.dead && !m.d.boss && fl(m.tile) === f && RD.tdist(m.tile, it.tile) <= d.call) { m.alarmT = 8; m.alarmTo = h; m.dormant = false; n++; }
        log(R, `The alarm bell at ${where} rings. ${n} monster${n === 1 ? '' : 's'} come running.`, 'hit');
        break;
      }
      case 'cage':
        hurt(G, R, h, dmg, 'trap');
        if (!unbound(h)) { h.cageT = hold(h, d, 'cage', it.lv); RD.say(h, 'Caged!'); }
        log(R, `Bars slam down around ${h.name} at ${where}.`, 'hit');
        break;
      case 'teleport': {
        hurt(G, R, h, dmg, 'illusion');
        const far = [];
        for (let j = f * N; j < (f + 1) * N; j++) if (G.tiles[j] === 1 && !G.items.has(j) && RD.tdist(j, h.tile) >= 5 && j !== G.hoard) far.push(j);
        if (alive(h) && far.length) {
          const to = far[Math.floor(Math.random() * far.length)];
          const [tx, ty] = center(to);
          RD.ring(x, y, 0.8, '#b38be0', f);
          h.tile = to; h.x = tx; h.y = ty; h.next = -1; h.confuse = Math.max(h.confuse, 1);
          RD.ring(tx, ty, 0.8, '#b38be0', f);
          RD.say(h, 'Where am I?');
          log(R, `${h.name} vanishes from ${where} and reappears at ${RD.coord(to)}.`, 'hit');
        }
        break;
      }
      case 'boulder': {
        // it rolls the way the hero was walking
        const from = h.prevTile != null ? h.prevTile : h.tile;
        const [ax, ay] = xy(from), [bx, by] = xy(it.tile);
        const dx = Math.sign(bx - ax) || 1, dy = Math.sign(by - ay);
        const lane = [it.tile];
        for (let k = 1; k <= d.line; k++) {
          const nx = bx + dx * k, ny = by + (dx ? 0 : dy) * k;
          if (nx < 0 || ny < 0 || nx >= RD.COLS || ny >= RD.ROWS) break;
          const j = RD.idx(nx, ny, f);
          if (G.tiles[j] === 0) break;
          lane.push(j);
        }
        FX.shake = 0.7;
        for (const j of lane) { const [lx, ly] = center(j); RD.burst(lx, ly, '#8a8090', 5, 1.5, f); }
        for (const o of R.heroes) if (alive(o) && lane.includes(o.tile)) { hurt(G, R, o, dmg, 'trap'); o.stun = Math.max(o.stun, 0.6); }
        log(R, `A boulder thunders down the corridor from ${where}.`, 'hit');
        break;
      }
      case 'gravity':
        RD.ring(x, y, d.radius, '#7a5ab8', f);
        for (const o of heroesNear(R, f, x, y, d.radius)) {
          hurt(G, R, o, dmg, 'trap');
          if (!unbound(o)) { o.rootT = Math.max(o.rootT, hold(o, d, 'root', it.lv)); o.slowT = hold(o, d, 'slow', it.lv); }
        }
        log(R, `The gravity well at ${where} drags everyone down.`, 'hit');
        break;
      case 'abyss': {
        hurt(G, R, h, dmg, 'illusion');
        RD.ring(x, y, 1, '#b38be0', f);
        if (!alive(h)) break;
        if (h.state === 'escape' || h.state === 'flee') {
          // never a shortcut home: anyone trying to leave is thrown back into the deep instead
          const gate = gateOf(G, f);
          const { dist } = RD.dijkstra(G, h.tile, (j) => (G.tiles[j] === 1 ? 1 : Infinity));
          let to = -1, best = -1;
          for (let j = f * N; j < (f + 1) * N; j++) {
            if (G.tiles[j] !== 1 || dist[j] === Infinity || G.items.has(j) || RD.isStairs(G, j) || RD.isGate(G, j)) continue;
            const sc = RD.tdist(j, gate) + Math.random() * 0.5;
            if (sc > best) { best = sc; to = j; }
          }
          if (to >= 0 && RD.tdist(to, gate) > RD.tdist(h.tile, gate)) {
            const [tx, ty] = center(to);
            h.tile = to; h.x = tx; h.y = ty; h.next = -1; h.confuse = 2;
            RD.ring(tx, ty, 1, '#b38be0', f);
            RD.burst(tx, ty, '#b38be0', 16, 2.5, f);
            RD.say(h, 'No! Not back down!');
            log(R, `${h.name} tries to run across the abyss at ${where} and is thrown back into the deep, to ${RD.coord(to)}.`, 'hit');
          } else { h.confuse = 3; log(R, `The abyss at ${where} spits ${h.name} back out, reeling.`, 'hit'); }
          break;
        }
        const [ex, ey] = center(G.entrance);
        h.tile = G.entrance; h.x = ex; h.y = ey; h.next = -1; h.confuse = 2;
        // a hero who has been through a drop gate still counts as through, even thrown back out: the gate falls once
        // everyone has walked through it once, and anyone outside by then comes back in by the exit road
        RD.ring(ex, ey, 1.2, '#b38be0', 0);
        RD.burst(ex, ey, '#b38be0', 18, 2.5, 0);
        RD.say(h, 'Thrown out!');
        log(R, `${h.name} steps into the abyss at ${where} and is thrown back out of the front gate.`, 'hit');
        break;
      }
    }
    // the victim shouts; the party hears unless they are feuding
    learnTrap(R, h, it.tile, it.type);
  }

  // ---------------------------------------------------------------- damage, death, escape
  const alive = (h) => h.state !== 'dead' && h.state !== 'out';
  RD.heroAlive = alive;
  // moments the page reacts to (the dungeon's voice, hit-stop, slow motion); headless runs ignore them
  const emit = (type, data) => { if (RD.onEvent) RD.onEvent(type, data); };

  // the piece a source belongs to, as a key that survives a save: summons count for their boss, packs for their den
  const srcKey = (src) => {
    if (!src) return null;
    if (src.power) return 'power:' + src.power;
    if (src.ghost) return 'ghost:' + src.ghost.name;
    if (src.d) { const it = src.item || (src.summoner && src.summoner.item); return it ? 'it:' + it.tile : 'power:raise'; }
    return 'it:' + src.tile;
  };
  RD.srcKey = srcKey;
  // Combos: a hero already caught by one thing takes more from the next. First match wins.
  function comboOf(h, src) {
    const t = src && src.type;
    const d = t && RD.ITEMS[t];
    if (!d) return null;
    const trap = d.kind === 'trap' || d.kind === 'turret';
    if (trap && (h.rootT > 0 || h.cageT > 0)) return 'skewer';
    if (trap && RD.COMBOS.shatter.types.includes(t) && h.slowT > 0) return 'shatter';
    if (RD.hasTag(t, 'fire') && (h.poison || h.gasT > 0)) return 'kindling';
    if (d.kind === 'monster' && h.confuse > 0) return 'ambush';
    if (d.kind === 'monster' && h.stun > 0) return 'pileon';
    if (d.kind === 'monster' && h.fearT > 0) return 'panic';
    return null;
  }
  function hurt(G, R, h, dmg, cat, aoe) {
    if (!alive(h)) return;
    const C = RD.CLASSES[h.cls];
    if (aoe && C.fireward) dmg *= C.fireward;
    if (C.guard) dmg *= C.guard;
    if (C.dodge && cat !== 'power' && Math.random() < C.dodge) { RD.floater(h.x, h.y - 0.3, 'dodged', '#9cc0e6', false, fl(h.tile)); return; }
    const combo = R.comboLock ? null : comboOf(h, R.src);
    if (combo) {
      dmg *= RD.COMBOS[combo].mult;
      R.combos[combo] = (R.combos[combo] || 0) + 1;
      RD.floater(h.x, h.y - 0.9, RD.COMBOS[combo].name + '!', '#ffd34d', true, fl(h.tile));
      emit('combo', { id: combo, h });
      if (combo === 'kindling') {
        // the gas goes up: a third of the blow scorches everyone close by
        R.comboLock = true;
        RD.ring(h.x, h.y, 1.2, '#ff8a3d', fl(h.tile));
        for (const o of heroesNear(R, fl(h.tile), h.x, h.y, 1.2)) if (o !== h) hurt(G, R, o, dmg * 0.3, cat, true);
        R.comboLock = false;
      }
    }
    // the night's tally: how much each piece actually took off the heroes
    const key = srcKey(R.src);
    if (key) {
      const e = R.dealt[key] || (R.dealt[key] = { dmg: 0, kills: 0, hits: 0 });
      e.dmg += Math.min(Math.max(0, h.hp), dmg);
      e.hits++;
      h.lastSrc = key;
    }
    h.hp -= dmg;
    h.hurtTaken += dmg / h.maxHp;
    h.cat = cat;
    if (dmg >= 1) { RD.floater(h.x, h.y - 0.3, Math.round(dmg).toString(), '#e46a7c', false, fl(h.tile)); sfx('hit'); }
    if (dmg >= h.maxHp * 0.2) emit('bigHit', h);
    if (h.hp <= 0) die(G, R, h);
  }

  function die(G, R, h) {
    // a saint on the same floor raises the first ally who falls
    const saint = R.heroes.find((o) => o !== h && alive(o) && o.cls === 'saint' && !o.revived && fl(o.tile) === fl(h.tile));
    if (saint) {
      saint.revived = true;
      h.hp = h.maxHp * 0.5;
      RD.ring(h.x, h.y, 1, '#f0d9a0', fl(h.tile));
      log(R, `${label(saint)} raises ${h.name} from the floor.`, 'hero');
      RD.say(saint, 'Rise!');
      return;
    }
    h.state = 'dead';
    h.hp = 0;
    sfx('death');
    const grudge = h.nemesis ? 3 * (1 + 0.5 * ((G.heart && G.heart.grudge) || 0)) : 1;
    const bounty = Math.round((10 + 12 * h.tier) * (1 + 0.1 * (h.lvl - 1)) * (h.title ? 2 : 1) * (RD.twisted(G, 'greed') ? 2 : 1) * grudge * (RD.modeOf(G).bounty || 1));
    if (h.nemesis) {
      G.stats.nemeses = (G.stats.nemeses || 0) + 1;
      RD.ring(h.x, h.y, 1.4, '#e3b04b', fl(h.tile));
      log(R, `The nemesis ${h.name} finally falls. The bounty is yours.`, 'warn');
    }
    G.malice += bounty;
    R.malice += bounty;
    const purse = Math.round((2 + 3 * h.tier) * RD.themeMult(G, null, h.tile, 'gold') * (RD.modeOf(G).purse || 1)); // long runs drop less per kill
    G.gold += purse;
    R.goldBack += purse;
    if (h.carry) {
      G.gold += h.carry;
      R.goldBack += h.carry;
      const [hx, hy] = center(G.hoard);
      RD.floater(hx, hy - 0.4, '+' + h.carry + ' gold back', '#e3b04b', false, fl(G.hoard));
      h.carry = 0;
    }
    G.guild.causes[h.cat] = (G.guild.causes[h.cat] || 0) + 1;
    G.stats.slain++;
    if (h.title) G.stats.legends++;
    R.killed.push(h);
    if (h.lastSrc && R.dealt[h.lastSrc]) R.dealt[h.lastSrc].kills++;
    if (h.bait) { log(R, `The bait chest’s ${h.bait} gold stays in the dungeon with ${h.name}.`, 'kill'); h.bait = 0; }
    // a legend may not rest: the Chosen Hero always returns, other legends often
    if (h.title && Math.random() < (h.cls === 'chosen' ? 1 : 0.45)) {
      const kinds = Object.keys(RD.GHOSTS);
      R.newGhosts.push({ tile: h.tile, name: h.name, title: h.title, cls: h.cls, tier: h.tier, kind: kinds[Math.floor(Math.random() * kinds.length)], night: G.raid });
    }
    emit('kill', h);
    R.bones.push({ x: h.x, y: h.y, f: fl(h.tile), r: Math.random() * 6 });
    RD.burst(h.x, h.y, '#c43c68', 18, 3, fl(h.tile));
    RD.floater(h.x, h.y - 0.6, '+' + bounty + ' malice', '#e05a86', true, fl(h.tile));
    if (h.traits.includes('stone')) {
      report(R, h);
      log(R, `${h.name} dies, but the sending stone flares. The guild hears everything.`, 'warn');
    } else log(R, `${label(h)} the ${RD.TIERS[h.tier]}-rank ${RD.CLASSES[h.cls].name.toLowerCase()} dies. What they saw dies too.`, 'kill');
  }

  function leave(G, R, h) {
    h.state = 'out';
    if (h.bait) {
      const lost = Math.min(G.gold, h.bait);
      G.gold -= lost;
      R.goldTaken += lost;
      log(R, `${h.name} walks out with the bait chest: ${lost} gold gone from your hoard.`, 'warn');
    }
    sfx('escape');
    R.escaped.push(h);
    G.stats.escaped++;
    emit('escape', h);
    report(R, h);
    log(R, h.carry ? `${h.name} escapes with ${h.carry} gold and a full report.` : `${h.name} escapes with a report for the guild.`, 'warn');
  }

  function report(R, h) {
    const snap = RD.cloneKnow(h.K);
    R.report = R.report ? RD.mergeKnow(R.report, snap) : snap;
    R.reporters = R.reporters || [];
    R.reporters.push(h);
  }

  // ---------------------------------------------------------------- per-frame updates
  function strike(G, R, h, foe) {
    const C = RD.CLASSES[h.cls];
    let mult = C.holy && foe.d.undead ? C.holy : 1;
    if (C.slayer && foe.d.boss) mult *= C.slayer;
    if (C.bane && RD.hasTag(foe.type, C.bane)) mult *= 3;
    if (C.firstStrike && !foe.struck.has(h.id)) { mult *= C.firstStrike; foe.struck.add(h.id); }
    if (C.rage) mult *= 1 + C.rage * (1 - h.hp / h.maxHp);
    if (R.heroes.some((o) => o !== h && alive(o) && RD.CLASSES[o.cls].inspire && udist(o, h) <= 2.5)) mult *= 1.25;
    const targets = [foe];
    const around = C.cleave ? [h, C.cleave] : C.splash ? [foe, C.splash] : null;
    if (around) for (const m of R.monsters) if (m !== foe && !m.dead && !m.dormant && udist(m, around[0]) <= around[1]) targets.push(m);
    if (h.range > 1.5) shot(h, foe, h.cls === 'mage' || h.cls === 'archmage' ? '#a8b4ff' : '#cfe3f2', 0.18);
    if (C.splash) RD.ring(foe.x, foe.y, C.splash, '#a8b4ff', fl(foe.tile));
    for (const m of targets) {
      const dmg = h.dmg * mult * (m === foe ? 1 : 0.6) * (m.d.armor && h.range > 1.5 ? 1 - m.d.armor : 1);
      m.hp -= dmg;
      if (C.lifesteal) h.hp = Math.min(h.maxHp, h.hp + dmg * C.lifesteal);
      RD.floater(m.x, m.y - 0.3, Math.round(dmg).toString(), '#cfe3f2', false, fl(m.tile));
      if (m.hp <= 0 && !m.dead) {
        m.dead = true;
        if (m.ghost) { m.ghost.gone = true; log(R, `The ghost of ${m.ghost.name} is laid to rest.`, 'hero'); }
        // Mortal Monsters: the piece is lost once every monster it fielded has fallen
        if (m.item && RD.twisted(G, 'mortal') && !R.monsters.some((o) => o !== m && !o.dead && o.item === m.item)) m.item.lost = true;
        if (m.summoner) m.summoner.minions--;
        sfx(m.d.boss ? 'boom' : 'hit');
        h.xp += (m.d.boss ? 6 : 1) * (1 + Math.max(0, m.tier - h.tier + 1));
        RD.burst(m.x, m.y, '#9a8f9c', m.d.boss ? 40 : 14, m.d.boss ? 4 : 2.5, fl(m.tile));
        if (m.d.boss && R.seals[fl(m.home)] && !sealed(G, R, fl(m.home))) { log(R, `The ${m.d.name.toLowerCase()} falls and the seal on floor ${RD.ROMAN[fl(m.home)]} breaks.`, 'warn'); RD.ring(m.x, m.y, 3, '#e3b04b', fl(m.tile)); }
        log(R, m.d.boss ? `${label(h)} slays the ${m.d.name}!` : `${h.name} destroys the ${m.d.name.toLowerCase()}.`, m.d.boss ? 'warn' : 'hero');
        if (m.d.boss) emit('bossDown', m);
      }
    }
  }

  function tickHero(G, R, h, dt) {
    if (!alive(h)) return;
    const C = RD.CLASSES[h.cls];
    h.cd -= dt;
    h.bob += dt * 8;
    if (h.slowT > 0) h.slowT -= dt;
    if (h.rootT > 0) h.rootT -= dt;
    if (h.stun > 0) { h.stun -= dt; return; }
    if (h.confuse > 0) { h.confuse -= dt; if (h.confuse <= 0) h.steadyT = 8; }
    else if (h.steadyT > 0) h.steadyT -= dt;
    if (h.poison) {
      h.poisonAcc = (h.poisonAcc || 0) + h.poison.dps * dt;
      if (h.poisonAcc >= 3) { R.src = h.poison.src; hurt(G, R, h, h.poisonAcc, 'trap'); R.src = null; h.poisonAcc = 0; }
      if ((h.poison.t -= dt) <= 0) h.poison = null;
      if (!alive(h)) return;
    }
    if (h.fearT > 0) h.fearT -= dt;
    if (h.gasT > 0) h.gasT -= dt;
    // a torn soul mends once the hero is healed back above SOUL_MEND of their health (and not straight away)
    if (h.soulTorn && h.hp >= h.maxHp * RD.SOUL_MEND && R.t - (h.tornAt || 0) >= 5) { h.soulTorn = false; RD.floater(h.x, h.y - 0.4, 'soul mended', '#e05a86', false, fl(h.tile)); }
    if (h.cageT > 0) { h.cageT -= dt; return; } // caged: no moving, no fighting
    if (h.hauntCd > 0) h.hauntCd -= dt;
    // ghosts: a haunting one frightens whoever comes near; a cleric, paladin, saint or sage who stands by one lays it to rest
    for (const gh of G.ghosts) {
      if (gh.gone || gh.kind === 'vengeful' || fl(gh.tile) !== fl(h.tile)) continue;
      const dd = RD.tdist(gh.tile, h.tile);
      if (gh.kind === 'haunt' && dd <= 2 && !(h.hauntCd > 0)) { h.fearT = Math.max(h.fearT || 0, 5); h.hauntCd = 8; RD.say(h, 'A ghost!'); }
      if ((C.holy || C.cure) && dd <= 1.5) {
        gh.ex = (gh.ex || 0) + dt;
        if (gh.ex >= 3) { gh.gone = true; RD.ring(...center(gh.tile), 1, '#f0d9a0', fl(gh.tile)); RD.say(h, 'Be at peace.'); log(R, `${h.name} lays the ghost of ${gh.name} to rest.`, 'hero'); h.xp += 2; }
      }
    }
    // opening a bait chest: two seconds standing still where you wanted them
    if (h.baitT > 0) {
      if (h.state !== 'seek') h.baitT = 0;
      else if ((h.baitT -= dt) <= 0) {
        h.baitT = 0;
        const it = G.items.get(h.baitAt);
        if (it && !it.taken) {
          it.taken = true;
          h.bait = RD.baitValue(it);
          h.K.chests.delete(it.tile);
          RD.floater(h.x, h.y - 0.5, `bait: ${h.bait} gold`, '#e3b04b', false, fl(h.tile));
          log(R, `${h.name} opens the bait chest at ${RD.coord(it.tile)}. If they get out, so does its ${h.bait} gold.`, 'warn');
        }
      }
      if (h.baitT > 0) return;
    }
    // beast tamers calm monsters of their own rank or lower
    if (C.tame && (h.tameCd = (h.tameCd || 0) - dt) <= 0) {
      for (const m of R.monsters) if (!m.dead && !m.d.boss && m.tier <= h.tier && RD.hasTag(m.type, 'beast') && udist(m, h) <= C.tame && !(m.calmT > 0)) {
        m.calmT = 6; h.tameCd = 12;
        RD.floater(m.x, m.y - 0.4, 'calmed', '#86c06a', false, fl(m.tile));
        RD.say(h, 'Easy there…');
        break;
      }
    }

    if (C.heal) {
      const amt = C.heal * scaleOf(h) * dt;
      for (const o of R.heroes) if (alive(o) && o !== h && o.hp < o.maxHp && udist(o, h) <= C.healR) { R.healed += Math.min(amt, o.maxHp - o.hp); o.hp = Math.min(o.maxHp, o.hp + amt); }
    }
    if (C.cure && (h.cureT -= dt) <= 0) {
      for (const o of R.heroes) if (alive(o) && o !== h && udist(o, h) <= C.cure && (o.rootT > 0 || o.confuse > 0 || o.slowT > 0)) {
        o.rootT = o.confuse = o.slowT = 0;
        h.cureT = 3;
        RD.floater(o.x, o.y - 0.4, 'cured', '#86c06a', false, fl(o.tile));
        break;
      }
    }

    const steady = R.heroes.some((o) => o !== h && alive(o) && RD.CLASSES[o.cls].inspire && udist(o, h) <= 2.5) ? 0.6 : 1;
    if ((h.state === 'seek' || h.state === 'loot') && h.hp < (h.fearT > 0 ? 0.95 : h.fleeAt * steady) * h.maxHp) {
      h.state = 'flee';
      h.next = -1;
      h.doorAt = h.disarmAt = -1;
      RD.say(h, h.carry ? 'Run, with the gold!' : 'Run!');
      emit('flee', h);
      log(R, `${h.name} turns and runs for the gate.`, 'hero');
    }

    if (h.state === 'loot') {
      h.lootT -= dt;
      if (h.lootT <= 0) {
        const want = Math.round((5 + h.greed * 6 + 0.4 * Math.min(RD.age(G), 40)) * (1 + 0.15 * h.tier) * RD.BAL.theft * (RD.twisted(G, 'greed') ? 2 : 1) * (C.thief || 1));
        const take = Math.min(G.gold, want);
        G.gold -= take;
        h.carry += take;
        R.goldTaken += take;
        h.state = 'escape';
        h.xp += 4;
        RD.say(h, 'Gold!');
        sfx('loot');
        RD.floater(h.x, h.y - 0.5, '−' + take + ' gold', '#e3b04b', true, fl(h.tile));
        log(R, `${h.name} fills a sack with ${take} gold.`, 'warn');
        emit('loot', h);
      }
      return;
    }

    // fight whatever is in reach
    let foe = null, fd = Infinity;
    for (const m of R.monsters) {
      if (m.dead || m.dormant) continue;
      const d = udist(m, h);
      if (d <= h.range && d < fd && (d < 1.5 || RD.los(G.tiles, h.tile, m.tile))) { fd = d; foe = m; }
    }
    if (foe) {
      if (h.cd <= 0) {
        strike(G, R, h, foe);
        h.cd = h.rate;
        h.lunge = 0.15;
      }
      if (h.state !== 'flee') return;
    }
    if (h.rootT > 0) return;

    if (h.doorAt >= 0) {
      const it = G.items.get(h.doorAt);
      if (!it || RD.ITEMS[it.type].kind !== 'door' || it.broken) { h.doorAt = -1; return; }
      const picks = C.pick && !RD.ITEMS[it.type].nopick;
      if (picks) it.pick += dt;
      else it.hp -= C.bash * scaleOf(h) * dt;
      if (it.hp <= 0 || (picks && it.pick >= C.pick)) {
        it.broken = true;
        const [x, y] = center(it.tile);
        RD.burst(x, y, '#8a8090', 12, 2, fl(it.tile));
        h.xp += 1;
        sfx('door');
        log(R, `${h.name} ${picks ? 'picks the lock on' : 'batters down'} the ${RD.ITEMS[it.type].name.toLowerCase()} at ${RD.coord(it.tile)}.`, 'hero');
        h.doorAt = -1;
      }
      return;
    }

    // Rogues and shadows can jam a wall piece (dart slit or storm pylon) they have been hit by, from the corridor beside it.
    // It takes three times as long as disarming a trap, they are under fire the whole time, and the
    // pylon comes back after 12 seconds.
    if (RD.RULES.pylonJam && C.disarm && h.jamAt < 0 && h.state !== 'flee') {
      for (const j of RD.nb(h.tile)) {
        const it = G.items.get(j);
        if (it && RD.ITEMS[it.type].kind === 'turret' && !(it.jamT > 0) && h.K.turrets.get(j) === it.type) { h.jamAt = j; h.jamT = C.disarm * 3; RD.say(h, 'Jamming it!'); break; }
      }
    }
    if (h.jamAt >= 0) {
      const it = G.items.get(h.jamAt);
      if (!it || it.jamT > 0) { h.jamAt = -1; return; }
      h.jamT -= dt;
      if (h.jamT <= 0) {
        it.jamT = 12;
        R.jammed++;
        const [x, y] = center(h.jamAt);
        RD.floater(x, y, 'jammed 12s', '#9cc0e6', false, fl(h.jamAt));
        h.xp += 2;
        log(R, `${h.name} jams the ${RD.ITEMS[it.type].name.toLowerCase()} at ${RD.coord(h.jamAt)} for a few seconds.`, 'hero');
        h.jamAt = -1;
      }
      return;
    }

    if (h.disarmAt >= 0) {
      h.disarmT -= dt;
      if (h.disarmT <= 0) {
        const j = h.disarmAt;
        h.disarmAt = -1;
        const it = G.items.get(j);
        const [x, y] = center(j);
        if (it && RD.ITEMS[it.type].kind === 'trap') {
          it.off = true;
          R.disarmed++;
          const kt = h.K.traps.get(j);
          if (kt) kt.off = true;
          RD.floater(x, y, 'disarmed', '#9cc0e6', false, fl(j));
          h.xp += 1;
          log(R, `${h.name} disarms the ${RD.ITEMS[it.type].name.toLowerCase()} at ${RD.coord(j)}.`, 'hero');
        } else {
          const kt = h.K.traps.get(j);
          h.K.traps.delete(j);
          shift(R, h, 'trap:' + j, RD.WHAT[kt ? kt.type : 'trap'], j);
        }
      }
      return;
    }

    if (h.next < 0) plan(G, R, h);
    if (h.next < 0) return;
    // stairs: step straight onto the floor below (or above)
    if (fl(h.next) !== fl(h.tile)) {
      const [nx, ny] = center(h.next);
      h.x = nx; h.y = ny;
      h.tile = h.next;
      h.next = -1;
      log(R, `${h.name} takes the stairs to floor ${RD.ROMAN[fl(h.tile)]}.`, 'hero');
      enterTile(G, R, h);
      return;
    }
    const [gx, gy] = center(h.next);
    const th = RD.themeOf(G, h.tile);
    const sp = h.speed * (steady < 1 ? 1.1 : 1) * (th.heroSlow || 1) * (th.gold && h.greed >= 0.6 ? 1.15 : 1) * (h.slowT > 0 && !unbound(h) ? 0.5 : 1) * (R.douseT > 0 ? 0.75 : 1) * (1 - (G.guild.wariness || 0) * 0.15) * (h.confuse > 0 ? 0.7 : 1);
    const dx = gx - h.x, dy = gy - h.y, d = Math.hypot(dx, dy);
    if (d <= sp * dt) {
      h.x = gx; h.y = gy;
      h.prevTile = h.tile;
      h.tile = h.next;
      h.next = -1;
      // walked through a Drop Gate: it falls as soon as the doorway is clear
      const left = G.items.get(h.prevTile);
      if (left && RD.ITEMS[left.type].oneway && !left.dropped) { left.armed = true; left.by = h; (left.passed || (left.passed = new Set())).add(h.id); }
      enterTile(G, R, h);
    } else {
      h.x += (dx / d) * sp * dt;
      h.y += (dy / d) * sp * dt;
    }
  }

  function summon(G, R, m) {
    const type = m.d.summon;
    const spots = RD.nb(m.tile).filter((j) => G.tiles[j] === 1);
    const at = spots.length ? spots[Math.floor(Math.random() * spots.length)] : m.tile;
    const s = mkMonster(type, at, m.lv, RD.minionOf(m.type, m.tier).tier, null);
    s.summoner = m;
    s.home = m.home;
    m.minions++;
    R.monsters.push(s);
    sfx('summon');
    RD.burst(s.x, s.y, '#b38be0', 12, 2, fl(at));
    log(R, `The ${m.d.name.toLowerCase()} calls a ${RD.ITEMS[type].name.toLowerCase()}.`, 'hit');
  }

  function tickMonster(G, R, m, dt) {
    R.src = m;
    tickMonsterOnce(G, R, m, dt);
    R.src = null;
  }
  function tickMonsterOnce(G, R, m, dt) {
    if (m.dead) return;
    const d = m.d;
    m.cd -= dt;
    if (m.lunge > 0) m.lunge -= dt;
    if (m.calmT > 0) { m.calmT -= dt; return; }
    if (m.chargeCd > 0) m.chargeCd -= dt;
    if (m.dormant && d.statue) {
      const near = R.heroes.find((h) => alive(h) && udist(h, m) <= 1.05);
      if (!near) return;
      m.dormant = false;
      RD.floater(m.x, m.y - 0.5, 'IT MOVES', '#e05a86', true, fl(m.tile));
      RD.say(near, 'The statue!');
      log(R, `The statue at ${RD.coord(m.home)} was a gargoyle.`, 'hit');
    }
    if (m.dormant) {
      const near = R.heroes.find((h) => alive(h) && udist(h, m) <= 1.05);
      if (!near) return;
      m.dormant = false;
      near.K.mimics.add(m.home);
      near.K.chests.delete(m.home);
      near.K.lairs.set(m.home, 'mimic');
      near.K.hz = null;
      RD.floater(m.x, m.y - 0.5, 'MIMIC', '#e05a86', true, fl(m.tile));
      RD.say(near, 'It bites!');
      log(R, `The chest at ${RD.coord(m.home)} opens its mouth.`, 'hit');
    }
    if (d.regen && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * d.regen * dt);
    const [hx, hy] = center(m.home);
    const f = fl(m.home);
    let target = null, best = Infinity;
    // Monsters guard their post, but they run down anyone fleeing or carrying gold.
    // Fast monsters chase furthest; bosses never leave their lair.
    for (const h of R.heroes) {
      if (!alive(h) || fl(h.tile) !== f) continue;
      const runner = !d.boss && (h.state === 'escape' || h.state === 'flee');
      const reach = m.alarmT > 0 ? 99 : d.leash + 0.75 + (runner ? (d.speed >= 2.2 ? 6 : 3.5) : 0) + (m.chase === h ? 2 : 0);
      if (Math.hypot(h.x - hx, h.y - hy) > reach) continue;
      const dd = udist(h, m) - (h.carry ? 1.5 : 0);
      if (dd < best) { best = dd; target = h; }
    }
    // an alarm bell overrides the post; a shield hero draws every monster near it
    if (m.alarmT > 0) { m.alarmT -= dt; if (m.alarmTo && alive(m.alarmTo) && fl(m.alarmTo.tile) === f) target = m.alarmTo; }
    const shield = R.heroes.find((h) => alive(h) && RD.CLASSES[h.cls].taunt && udist(h, m) <= RD.CLASSES[h.cls].taunt);
    if (shield && !d.boss) target = shield;
    if (target) best = udist(target, m);
    m.chase = target && (target.state === 'escape' || target.state === 'flee') ? target : null;
    // a charge: close the gap in one bound and knock the hero down
    if (target && d.charge && m.chargeCd <= 0 && best > 1.6 && best <= d.leash + 1 && RD.los(G.tiles, m.tile, target.tile)) {
      const spot = RD.nb(target.tile).filter((j) => G.tiles[j] === 1).sort((a, b) => RD.tdist(a, m.tile) - RD.tdist(b, m.tile))[0];
      if (spot != null) {
        const [cx, cy] = center(spot);
        m.x = cx; m.y = cy; m.tile = spot; m.next = -1; m.chargeCd = 6;
        hurt(G, R, target, m.dmg * 0.8, 'monster');
        if (!unbound(target)) target.stun = Math.max(target.stun, d.charge);
        RD.burst(cx, cy, '#c9a36a', 14, 2.5, f);
        log(R, `The ${d.name.toLowerCase()} charges ${target.name}.`, 'hit');
        best = udist(target, m);
      }
    }
    // boss abilities fire while heroes are close
    if (target) {
      if (d.summon && m.minions < d.max) {
        m.sumT -= dt;
        if (m.sumT <= 0) { summon(G, R, m); m.sumT = d.every || 5; }
      }
      if (d.breath || d.quake) {
        m.abT -= dt;
        const r = d.breath ? d.breathR : d.quakeR;
        if (m.abT <= 0 && best <= r) {
          m.abT = d.every;
          const dmg = RD.scaled(m.type, d.breath ? 'breath' : 'quake', m.lv, m.tier) * (omen(G, 'moon') ? 1.3 : 1);
          RD.ring(m.x, m.y, r, d.breath ? '#ff8a3d' : '#c9a36a', f);
          RD.burst(m.x, m.y, d.breath ? '#ff8a3d' : '#8a8090', 30, 4, f);
          FX.shake = Math.max(FX.shake, 0.7);
          sfx(d.breath ? 'fire' : 'boom');
          for (const h of heroesNear(R, f, m.x, m.y, r)) { hurt(G, R, h, dmg, 'monster', true); if (d.quake && alive(h)) h.stun = 1.5 * resist(h, d); }
          log(R, `The ${d.name.toLowerCase()} ${d.lord ? 'calls down hellfire' : d.breath ? 'breathes fire' : 'shatters the floor'}.`, 'hit');
        }
      }
    }
    let goal = m.home;
    if (target) {
      const reach = d.range || 1.15;
      if (best <= reach && (best < 1.5 || RD.los(G.tiles, m.tile, target.tile))) {
        if (m.cd <= 0) {
          const dmg = m.dmg * (omen(G, 'moon') ? 1.3 : 1) * (R.frenzyT > 0 ? 1.5 : 1);
          const victims = [target];
          if (d.heads) for (const h of R.heroes) if (victims.length < d.heads && h !== target && alive(h) && udist(h, m) <= reach) victims.push(h);
          if (reach > 1.5) shot(m, target, d.slows ? '#e9e0d2' : '#e05a86', 0.18);
          for (const v of victims) {
            hurt(G, R, v, dmg, d.cat);
            if (d.slows && alive(v) && !unbound(v)) v.slowT = 2;
            if (d.petrify && alive(v) && Math.random() < d.petrify) { v.stun = Math.max(v.stun, 2 * resist(v, d)); RD.floater(v.x, v.y - 0.5, 'stone', '#9a8f9c', false, fl(v.tile)); }
            if (d.fear && alive(v)) v.fearT = d.fear;
          }
          if (d.drain) m.hp = Math.min(m.maxHp, m.hp + dmg * d.drain);
          m.cd = d.rate * (R.frenzyT > 0 ? 0.75 : 1);
          m.lunge = 0.15;
          m.face = Math.sign(target.x - m.x) || m.face;
        }
        return;
      }
      goal = target.tile;
    }
    if (m.next < 0) {
      if (m.tile === goal) return;
      m.next = RD.bfsStep(G.tiles, m.tile, goal);
      if (m.next < 0) return;
    }
    const [gx, gy] = center(m.next);
    const sp = d.speed * (m.spd || 1) * (R.frenzyT > 0 ? 1.35 : 1);
    const dx = gx - m.x, dy = gy - m.y, dd = Math.hypot(dx, dy);
    if (dd <= sp * dt) { m.x = gx; m.y = gy; m.tile = m.next; m.next = -1; }
    else { m.x += (dx / dd) * sp * dt; m.y += (dy / dd) * sp * dt; if (dx) m.face = Math.sign(dx); }
  }

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function tickTurret(G, R, it, dt) {
    R.src = it;
    tickTurretOnce(G, R, it, dt);
    R.src = null;
  }
  function tickTurretOnce(G, R, it, dt) {
    if (it.jamT > 0) return; // jammed for a while
    it.cd -= dt;
    if (it.cd > 0) return;
    const d = RD.ITEMS[it.type];
    const f = fl(it.tile);
    const dmg = RD.scaled(it.type, 'dmg', it.lv);
    const [tx, ty] = center(it.tile);
    const src = { x: tx, y: ty, tile: it.tile };
    if (d.chain) {
      // lightning: the nearest hero in range, then the next nearest to that one, and so on
      const pool = R.heroes.filter((h) => alive(h) && fl(h.tile) === f && RD.tdist(h.tile, it.tile) <= d.range + 0.5);
      const sees = (a, h) => !RD.RULES.pylonSight || RD.los(G.tiles, a.tile, h.tile);
      if (!pool.some((h) => sees(it, h))) return;
      it.cd = d.rate;
      let from = src;
      const hit = [];
      for (let k = 0; k < d.chain && pool.length; k++) {
        // lightning needs a clear path, from the pylon and between heroes
        const reach = pool.filter((h) => sees(from, h));
        if (!reach.length) break;
        reach.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
        const h = reach[0];
        pool.splice(pool.indexOf(h), 1);
        shot(from, h, '#bfe0ff', 0.2);
        hit.push(h);
        from = h;
      }
      for (const h of hit) { if (!h.K.turrets.has(it.tile)) RD.learnItem(h.K, it); hurt(G, R, h, dmg, 'turret'); }
      return;
    }
    const [x0, y0] = xy(it.tile);
    let target = null, best = Infinity;
    for (const [dx, dy] of DIRS) {
      for (let s = 1; s <= d.range; s++) {
        const x = x0 + dx * s, y = y0 + dy * s;
        if (x < 0 || y < 0 || x >= RD.COLS || y >= RD.ROWS) break;
        const j = RD.idx(x, y, f);
        if (G.tiles[j] === 0 || doorShut(G, j)) break;
        for (const h of R.heroes) if (alive(h) && h.tile === j && s < best) { best = s; target = h; }
      }
    }
    if (!target) return;
    it.cd = d.rate;
    shot(src, target, '#e9e0d2', 0.14);
    if (!target.K.turrets.has(it.tile)) RD.learnItem(target.K, it);
    hurt(G, R, target, dmg, 'turret');
  }

  RD.step = function (G, dt) {
    const R = G.R;
    if (!R || G.phase !== 'raid') return;
    R.t += dt;
    R.spawnT -= dt;
    if (R.queue.length && R.spawnT <= 0) {
      const h = R.queue.shift();
      spawnHero(G, R, h);
      R.spawnT = 0.9;
    }
    R.douseT = Math.max(0, R.douseT - dt);
    R.frenzyT = Math.max(0, R.frenzyT - dt);
    R.sealT = Math.max(0, R.sealT - dt);
    for (const k in R.powers) R.powers[k] = Math.max(0, R.powers[k] - dt);
    if (R.lure && (R.lure.t -= dt) <= 0) R.lure = null;
    for (const r of R.rubble) if ((r.t -= dt) <= 0) { G.tiles[r.tile] = 1; for (const h of R.heroes) h.dustSaid = false; if (RD.view) RD.view.dirty = true; }
    R.rubble = R.rubble.filter((r) => r.t > 0);
    for (const it of G.items.values()) {
      const kind = RD.ITEMS[it.type].kind;
      if (it.cd > 0 && kind === 'trap') it.cd -= dt;
      if (kind === 'turret') { if (it.jamT > 0) it.jamT -= dt; tickTurret(G, R, it, dt); }
    }
    for (const c of R.clouds) {
      c.t -= dt;
      for (const h of R.heroes) if (alive(h) && fl(h.tile) === c.f && Math.hypot(h.x - c.x, h.y - c.y) <= c.r) {
        h.cloudAcc = (h.cloudAcc || 0) + c.dps * dt;
        h.gasT = 0.5; // standing in poison gas, for the Kindling combo
        if (h.cloudAcc >= 4) { R.src = c.src; hurt(G, R, h, h.cloudAcc, 'trap'); R.src = null; h.cloudAcc = 0; }
      }
    }
    R.clouds = R.clouds.filter((c) => c.t > 0);
    for (const h of R.heroes) tickHero(G, R, h, dt);
    for (const m of R.monsters) tickMonster(G, R, m, dt);
    if (R.dropped.length || G.items.size) dropGates(G, R);
    for (const h of R.heroes) if (h.lunge > 0) h.lunge -= dt;

    const active = R.heroes.filter(alive);
    if (!R.queue.length && !active.length) return endRaid(G, R);
    if (R.t > RD.raidTime(G)) {
      for (const h of active) {
        if (sealed(G, R, fl(h.tile)) && !canPassSeal(h)) { h.cat = 'monster'; log(R, `${h.name} never finds a way past the seal.`, 'kill'); die(G, R, h); }
        else leave(G, R, h);
      }
      log(R, 'The torches gutter out. The last heroes feel their way back to the gate.', 'info');
      return endRaid(G, R);
    }
  };

  // ---------------------------------------------------------------- dungeon powers
  RD.usePower = function (G, power, tile) {
    const R = G.R;
    const p = RD.POWERS[power];
    if (!R || G.phase !== 'raid') return 'Powers only work during a raid.';
    if (!RD.powerOpen(G, power)) return `${p.name} opens on night ${RD.realNight(G, p.night)}.`;
    if (R.powers[power] > 0) return `${p.name} is still recovering.`;
    const cost = RD.powerCost(G, power);
    if (G.malice < cost) return `${p.name} needs ${cost} malice.`;
    const f = tile != null ? fl(tile) : 0;
    const [x, y] = tile != null ? center(tile) : [0, 0];
    const busy = (g) => R.heroes.some((h) => alive(h) && (h.tile === g || h.next === g)) || R.monsters.some((m) => !m.dead && (m.tile === g || m.next === g));
    // aimed powers check their tile before anything is spent
    if (p.target && tile == null) return 'Pick a tile.';
    if (power === 'lure' || power === 'raise') {
      if (G.tiles[tile] !== 1) return 'That needs a corridor.';
    }
    if (power === 'collapse') {
      if (G.tiles[tile] !== 1) return 'That is already rock.';
      if (tile === G.hoard || RD.isGate(G, tile) || RD.isStairs(G, tile)) return 'Not the gate, stairs or hoard.';
      if (G.items.has(tile)) return 'Something stands there.';
      if (busy(tile)) return 'Someone is standing there.';
    }
    // the hero nearest the click, for powers aimed at one hero
    let victim = null;
    if (power === 'smite' || power === 'banish') {
      victim = heroesNear(R, f, x, y, p.radius).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      if (!victim) return 'Click on a hero.';
    }
    let dest = -1;
    if (power === 'banish') {
      // somewhere on the same floor, reachable, as far as possible from where they were going
      const goal = victim.state === 'escape' || victim.state === 'flee' ? gateOf(G, f) : victim.goal != null && victim.goal >= 0 && fl(victim.goal) === f ? victim.goal : gateOf(G, f);
      const { dist } = RD.dijkstra(G, victim.tile, (j) => (G.tiles[j] === 1 ? 1 : Infinity));
      let best = -1;
      for (let j = f * N; j < (f + 1) * N; j++) {
        if (G.tiles[j] !== 1 || dist[j] === Infinity || G.items.has(j) || j === G.hoard || RD.isStairs(G, j) || RD.isGate(G, j) || RD.tdist(j, victim.tile) < 3) continue;
        const sc = RD.tdist(j, goal) + Math.random();
        if (sc > best) { best = sc; dest = j; }
      }
      if (dest < 0 || RD.tdist(dest, victim.tile) < 3) return 'There is nowhere far enough to send them.';
    }
    G.malice -= cost;
    emit('power', power);
    R.src = { power };
    R.powers[power] = p.cd * (G.heart && G.heart.haste ? 1 - 0.1 * G.heart.haste : 1);
    sfx('power');
    switch (power) {
      case 'tremor': {
        FX.shake = 1;
        RD.ring(x, y, 1.6, '#c43c68', f);
        RD.burst(x, y, '#6b5a70', 20, 3, f);
        const hit = heroesNear(R, f, x, y, 1.6);
        for (const h of hit) { h.stun = 2; hurt(G, R, h, h.maxHp * 0.06, 'trap'); }
        log(R, `The floor heaves at ${RD.coord(tile)}. ${hit.length ? hit.length + ' knocked down.' : 'Nobody was there.'}`, 'hit');
        break;
      }
      case 'douse':
        R.douseT = 8;
        log(R, 'Every torch gutters out at once.', 'hit');
        break;
      case 'lure':
        R.lure = { tile, t: 10, id: R.t };
        RD.ring(x, y, 1, '#e3b04b', f);
        log(R, `Gold glitters at ${RD.coord(tile)}. It is not real.`, 'hit');
        break;
      case 'collapse':
        G.tiles[tile] = 0;
        R.rubble.push({ tile, t: 8 });
        if (RD.view) RD.view.dirty = true;
        FX.shake = 0.8;
        RD.burst(x, y, '#8a8090', 26, 3, f);
        sfx('crush');
        log(R, `The ceiling comes down at ${RD.coord(tile)}.`, 'hit');
        break;
      case 'frenzy':
        R.frenzyT = 7;
        for (const m of R.monsters) if (!m.dead) RD.ring(m.x, m.y, 0.8, '#e05a86', fl(m.tile));
        log(R, 'Bloodlust runs through every monster in the dungeon.', 'hit');
        break;
      case 'raise': {
        const spots = [tile].concat(RD.nb(tile).filter((j) => G.tiles[j] === 1)).slice(0, 2);
        const tier = Math.max(0, RD.unlocked(G) - 1);
        for (const at of spots) {
          const m = mkMonster('skeleton', at, 1, tier, null);
          R.monsters.push(m);
          RD.burst(m.x, m.y, '#e9e0d2', 14, 2, f);
        }
        sfx('summon');
        log(R, `${spots.length} skeletons claw out of the floor at ${RD.coord(tile)}.`, 'hit');
        break;
      }
      case 'mire': {
        const hit = heroesNear(R, f, x, y, p.radius);
        for (const h of hit) if (!unbound(h)) { h.rootT = Math.max(h.rootT, 1.5); h.slowT = Math.max(h.slowT, 7.5); RD.floater(h.x, h.y - 0.4, 'mired', '#8a7a4a', false, f); }
        RD.ring(x, y, p.radius, '#8a7a4a', f);
        RD.burst(x, y, '#5a4a2a', 22, 2, f);
        log(R, `The floor turns to grasping mud at ${RD.coord(tile)}. ${hit.length ? hit.length + ' stuck fast.' : 'Nobody was there.'}`, 'hit');
        break;
      }
      case 'rearm': {
        let n = 0;
        for (const it of G.items.values()) {
          const kind = RD.ITEMS[it.type].kind;
          const woke = (kind === 'trap' && (it.cd > 0 || it.off)) || (kind === 'turret' && it.jamT > 0);
          if (!woke) continue;
          it.cd = kind === 'trap' ? 0 : it.cd; it.off = false; it.jamT = 0; n++;
          const [ix, iy] = center(it.tile);
          RD.ring(ix, iy, 0.5, '#e05a86', fl(it.tile));
        }
        log(R, n ? `Power surges through the walls. ${n} trap${n === 1 ? '' : 's'} snap back to life.` : 'Power surges through the walls, but every trap was already armed.', 'hit');
        break;
      }
      case 'mend': {
        let n = 0;
        for (const m of R.monsters) if (!m.dead && m.hp < m.maxHp) { m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.5); n++; RD.floater(m.x, m.y - 0.4, 'mended', '#86c06a', false, fl(m.tile)); }
        log(R, `Dark threads knit your monsters back together. ${n} healed.`, 'hit');
        break;
      }
      case 'dread': {
        const hit = heroesNear(R, f, x, y, p.radius);
        for (const h of hit) { h.fearT = Math.max(h.fearT || 0, 8); RD.say(h, 'I… hear it.'); }
        RD.ring(x, y, p.radius, '#6a4a8a', f);
        log(R, `Whispers fill the halls at ${RD.coord(tile)}. ${hit.length ? hit.length + ' hero' + (hit.length === 1 ? '' : 'es') + ' lose their nerve.' : 'Nobody was there to hear.'}`, 'hit');
        break;
      }
      case 'smite': {
        const dmg = victim.maxHp * (victim.title ? 1 / 6 : 0.25);
        FX.shake = 0.6;
        RD.ring(victim.x, victim.y, 0.9, '#b38be0', f);
        RD.burst(victim.x, victim.y, '#b38be0', 24, 3, f);
        sfx('boom');
        log(R, `A bolt from the dark strikes ${victim.name}.`, 'hit');
        hurt(G, R, victim, dmg, 'power');
        break;
      }
      case 'banish': {
        const [tx, ty] = center(dest);
        RD.ring(victim.x, victim.y, 0.9, '#b38be0', f);
        if (victim.state === 'loot') victim.state = victim.carry ? 'escape' : 'seek';
        victim.tile = dest; victim.x = tx; victim.y = ty; victim.next = -1;
        victim.doorAt = victim.disarmAt = victim.jamAt = -1;
        victim.confuse = Math.max(victim.confuse, 2);
        RD.ring(tx, ty, 0.9, '#b38be0', f);
        RD.say(victim, 'Where am I?');
        log(R, `${victim.name} vanishes and stumbles out at ${RD.coord(dest)}.`, 'hit');
        break;
      }
      case 'seal':
        R.sealT = 6;
        for (const h of R.heroes) h.sealed = false;
        sfx('door');
        log(R, 'The front gate slams shut.', 'hit');
        break;
    }
    R.src = null;
    return null;
  };

  // ---------------------------------------------------------------- after the raid
  function fill(tpl, vals) {
    return tpl.replace(/\{(\w)\}/g, (_, k) => (k === 'W' ? vals.w.charAt(0).toUpperCase() + vals.w.slice(1) : vals[k]));
  }

  RD.diffIntel = function (before, after) {
    const out = [];
    if (after.hoard !== -1 && after.hoard !== before.hoard) out.push({ kind: 'hoard', tile: after.hoard });
    for (const t of after.stairs) if (!before.stairs.has(t)) out.push({ kind: 'stairs', tile: t });
    for (const [t, v] of after.traps) if (!before.traps.has(t) || before.traps.get(t).type !== v.type) out.push({ kind: 'trap', tile: t, what: RD.WHAT[v.type] });
    for (const [t, v] of after.turrets) if (before.turrets.get(t) !== v) out.push({ kind: 'turret', tile: t, what: RD.WHAT[v] });
    for (const [t, v] of after.lairs) {
      if (before.lairs.get(t) === v) continue;
      const d = RD.ITEMS[v];
      out.push({ kind: v === 'mimic' ? 'mimic' : d.lord ? 'lord' : d.boss ? 'boss' : 'lair', tile: t, what: RD.WHAT[v], type: v });
    }
    for (const t of after.doors) if (!before.doors.has(t)) out.push({ kind: 'door', tile: t });
    for (const key of after.removed) {
      const [k, s] = key.split(':');
      if (k === 'tile' || k === 'chest') continue;
      const t = +s;
      const what = k === 'trap' ? RD.WHAT[(before.traps.get(t) || {}).type || 'trap'] : k === 'lair' ? RD.WHAT[before.lairs.get(t)] || 'monster' : k === 'turret' ? RD.WHAT[before.turrets.get(t)] || 'wall trap' : RD.WHAT[k];
      out.push({ kind: 'gone', tile: t, what });
    }
    let n = 0;
    for (let i = 0; i < before.tiles.length; i++) if (before.tiles[i] === -1 && after.tiles[i] !== -1) n++;
    if (n) out.push({ kind: 'map', n });
    if (after.shifts > 0) out.push({ kind: 'shift' });
    return out;
  };

  const brief = (h) => ({ name: h.name, title: h.title, cls: h.cls, tier: h.tier, carry: h.carry || 0, growth: h.growth || '', team: !!h.team, nemesis: !!h.nemesis });

  function endRaid(G, R) {
    G.phase = 'debrief';
    for (const r of R.rubble) G.tiles[r.tile] = 1;
    R.rubble = [];
    // dawn lifts every fallen gate; the guild remembers a gate there, not a wall
    for (const t of R.dropped) {
      G.tiles[t] = 1;
      const it = G.items.get(t);
      if (it) { it.dropped = false; it.by = null; }
      if (R.report) { R.report.tiles[t] = 1; R.report.removed.delete('tile:' + t); }
    }
    R.dropped = [];
    for (const it of G.items.values()) {
      if (!RD.ITEMS[it.type].exit) continue;
      G.tiles[it.tile] = 1;
      it.opened = false;
      if (R.report) { R.report.tiles[it.tile] = 1; R.report.removed.delete('tile:' + it.tile); }
    }
    if (RD.view) RD.view.dirty = true;
    const gu = G.guild, D = RD.DIFF[G.diff];
    const before = gu.K;
    let intel = [];
    if (R.report) {
      const nk = RD.cloneKnow(before);
      RD.mergeKnow(nk, R.report);
      intel = RD.diffIntel(before, nk);
      for (const v of nk.traps.values()) v.off = false;
      nk.removed = new Set();
      nk.shifts = 0;
      nk.hz = null;
      gu.K = nk;
      gu.wariness = Math.min(1, (gu.wariness || 0) + 0.08 * Math.min(5, R.report.shifts));
    }
    // heavy losses make the guild send stronger parties; easy nights make it complacent
    const n = R.killed.length + R.escaped.length;
    if (n && R.killed.length >= Math.ceil(n / 2)) gu.pressure = Math.min(1, gu.pressure + 0.25);
    else if (!R.killed.length) gu.pressure = Math.max(0, gu.pressure - 0.25);
    else gu.pressure = Math.max(0, gu.pressure - 0.05);
    // tavern talk
    const speakers = R.reporters || [];
    const rumors = [];
    if (!speakers.length) rumors.push({ who: 'The tavern', text: G.rng.pick(RD.RUMOR.none) });
    for (const it of intel) {
      const tpls = RD.RUMOR[it.kind];
      if (!tpls) continue;
      const s = G.rng.pick(speakers);
      rumors.push({ who: `${s.name}, ${RD.TIERS[s.tier]}-rank ${RD.CLASSES[s.cls].name}`, text: fill(G.rng.pick(tpls), { c: it.tile != null ? RD.coord(it.tile) : '', w: it.what || '', n: it.n }) });
    }
    const report = RD.nightReport(G, R); // before the fallen leave the board, so the report can name them
    // ghosts: whisperers lie to the guild, the laid-to-rest leave, and tonight's fallen legends may rise
    G.ghosts = (G.ghosts || []).filter((gh) => !gh.gone);
    for (const gh of G.ghosts) {
      if (gh.kind !== 'whisper') continue;
      const K = gu.K, f = fl(gh.tile);
      const known = [...K.traps.keys()].filter((t) => fl(t) === f);
      if (known.length && G.rng.chance(0.5)) {
        const t = G.rng.pick(known);
        K.traps.delete(t);
        rumors.push({ who: `The ghost of ${gh.name}`, text: `There is nothing at ${RD.coord(t)}. Nothing at all. Walk on.` });
      } else {
        const open = [];
        for (let j = f * N; j < (f + 1) * N; j++) if (G.tiles[j] === 1 && !G.items.has(j) && j !== G.hoard && !RD.isGate(G, j) && !RD.isStairs(G, j)) open.push(j);
        if (open.length) {
          const t = G.rng.pick(open);
          K.traps.set(t, { type: 'spikes', off: false });
          rumors.push({ who: `The ghost of ${gh.name}`, text: `Beware ${RD.coord(t)}. Spikes. I felt them.` });
        }
      }
      K.hz = null;
    }
    const risen = [];
    for (const gh of R.newGhosts) {
      gh.fade = G.raid + RD.GHOST_NIGHTS;
      G.ghosts.push(gh);
      risen.push(gh);
      log(R, `Something of ${gh.name} ${gh.title} stays behind at ${RD.coord(gh.tile)}: a ${RD.GHOSTS[gh.kind].name.toLowerCase()} ghost.`, 'warn');
    }
    G.ghosts = G.ghosts.slice(-RD.GHOST_MAX);
    // Mortal Monsters: the fallen are gone for good, and a boss seal goes with the last boss of its floor
    const fallen = [];
    for (const it of [...G.items.values()]) {
      if (!it.lost) continue;
      fallen.push({ type: it.type, lv: it.lv || 1, tile: it.tile });
      G.items.delete(it.tile);
      if (RD.ITEMS[it.type].boss && ![...G.items.values()].some((o) => RD.ITEMS[o.type].boss && fl(o.tile) === fl(it.tile))) for (const o of [...G.items.values()]) if (o.type === 'seal' && fl(o.tile) === fl(it.tile)) G.items.delete(o.tile);
    }
    gu.rumors = rumors.concat(gu.rumors).slice(0, 14);
    // Escaping is not enough. Heroes who fought, looted, mapped or bled come back stronger;
    // ones who ran with nothing to show for it come back the same, or quit.
    const cap = Math.min(8, RD.unlocked(G));
    for (const h of R.escaped) {
      const xp = h.xp + Math.min(2, h.charted * 0.04) + Math.min(2, h.hurtTaken * 1.5);
      let lvl = h.lvl, tier = h.tier;
      if (xp >= 14 && tier < cap) { tier++; h.growth = `ranked up to ${RD.TIERS[tier]}`; }
      else if (xp >= 6) { lvl++; h.growth = 'returns stronger'; }
      else if (xp < 1.5 && !h.escapes && G.rng.chance(0.5)) { h.growth = 'quit the guild'; continue; } // anyone who got away once comes back for more
      else h.growth = 'learned little';
      const escapes = (h.escapes || 0) + 1;
      if (escapes >= 2 && !h.nemesis) { h.growth += ' · now a nemesis'; log(R, `${h.name} has escaped you twice. The guild calls them a hero; you call them a nemesis.`, 'warn'); }
      gu.veterans.push({ name: h.name, cls: h.cls, tier, lvl, traits: h.traits, escapes, nemesis: escapes >= 2 });
    }
    // nemeses are never forgotten
    gu.veterans = gu.veterans.filter((v) => v.nemesis).concat(gu.veterans.filter((v) => !v.nemesis).slice(-6)).slice(-8);
    gu.blackout = (R.reporters || []).length ? 0 : gu.blackout + 1;
    // Renown: once the ranks run out, every night the guild fails to take gold it trains and equips harder.
    // A dungeon that holds easily keeps facing stronger heroes until something gives.
    if (RD.age(G) >= 15) {
      if (R.goldTaken - R.goldBack <= 0) gu.renown = (gu.renown || 0) + 0.05 * D.drift * Math.min(1, RD.modeOf(G).pace); // slow runs train slowly too
      else gu.renown = Math.max(0, (gu.renown || 0) - 0.02);
    }
    const income = Math.round((26 + 4 * Math.min(RD.age(G), 40)) * D.income * RD.modeOf(G).income * (1 + 0.25 * RD.unlocked(G)) * (RD.twisted(G, 'cheap') ? 0.75 : 1));
    G.malice += income;
    const lost = R.goldTaken - R.goldBack;
    G.stats.goldLost += Math.max(0, lost);
    G.stats.held++;
    G.debrief = {
      raid: G.raid, killed: R.killed.slice(), escaped: R.escaped.slice(), intel, rumors,
      malice: R.malice, income, goldLost: Math.max(0, lost), gold: G.gold,
      report, risen, fallen,
    };
    G.history.unshift({
      raid: G.raid, omen: G.omen.name, rating: RD.rating(gu.threat), floors: G.floors,
      killed: R.killed.map(brief), escaped: R.escaped.map(brief), rumors,
      goldLost: Math.max(0, lost), malice: R.malice + income, log: R.log.slice(),
    });
    G.history = G.history.slice(0, 5);
    if (G.gold <= 0) { G.phase = 'over'; G.result = 'lost'; }
    else if (G.raid >= RD.winAt(G) && !G.endless) { G.phase = 'over'; G.result = 'won'; }
    if (RD.onRaidEnd) RD.onRaidEnd(G);
  }

  // ---------------------------------------------------------------- why it went the way it did
  // Each piece's share of the damage and kills, the pieces that never touched a hero, and up to three fixes.
  const FIGHTERS = new Set(['trap', 'turret', 'monster']);
  RD.nightReport = function (G, R) {
    const pieces = Object.entries(R.dealt).map(([key, e]) => {
      let name = 'Something', type = null, tile = null;
      if (key.startsWith('it:')) { tile = +key.slice(3); const it = G.items.get(tile); if (it) { type = it.type; name = RD.ITEMS[type].name; } }
      else if (key.startsWith('ghost:')) { type = 'spectre'; name = 'Ghost of ' + key.slice(6); }
      else { const k = key.slice(6); type = 'power:' + k; name = k === 'raise' ? 'Raised skeletons' : RD.POWERS[k].name; }
      return { key, type, tile, name, dmg: Math.round(e.dmg), kills: e.kills };
    }).sort((a, b) => b.dmg - a.dmg);
    const total = pieces.reduce((a, p) => a + p.dmg, 0);
    const busy = new Set([...Object.keys(R.dealt), ...R.fired]);
    const idle = [...G.items.values()].filter((it) => FIGHTERS.has(RD.ITEMS[it.type].kind) && !busy.has('it:' + it.tile)).map((it) => it.tile);
    const gold = Math.max(0, R.goldTaken - R.goldBack);
    const tips = [];
    const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    if (R.healed > Math.max(150, total * 0.2)) tips.push({ id: 'heal', text: `Healers mended ${Math.round(R.healed)} health, ${Math.round((100 * R.healed) / Math.max(1, total))}% of all the damage you dealt. Kill them first: they hang back, so a dart slit or a second monster further along catches them, and Doom Bolt can pick one off.` });
    if (gold > 0 && ![...G.items.values()].some((it) => RD.ITEMS[it.type].kind === 'monster' && fl(it.tile) === fl(G.hoard) && RD.tdist(it.tile, G.hoard) <= 2)) tips.push({ id: 'hoard', text: `Heroes reached the hoard and took ${gold} gold with nothing guarding it. Put a monster within 2 tiles of the gold so they have to fight for it.` });
    if (R.disarmed + R.jammed > 0) tips.push({ id: 'rogue', text: `Rogues switched off ${n(R.disarmed, 'trap', 'traps')}${R.jammed ? ` and jammed ${n(R.jammed, 'wall piece', 'wall pieces')}` : ''}. They only disarm what the guild knows about: move known traps (they have an eye on the Guild’s map), or use a False Floor, which can’t be disarmed.` });
    if (idle.length) tips.push({ id: 'idle', text: `${n(idle.length, 'piece', 'pieces')} never touched a hero. They are ringed on the map: move them onto the path heroes take (Move is free).` });
    if (pieces.length > 1 && total > 0 && pieces[0].dmg > total * 0.6) tips.push({ id: 'carry', text: `${pieces[0].name} did ${Math.round((100 * pieces[0].dmg) / total)}% of all the damage. Level it up, or build a second one further along the route.` });
    if (R.escaped.length && !Object.keys(R.combos).length) tips.push({ id: 'combo', text: 'No combos landed. Pin a hero with a Bear Trap in the line of a Dart Slit for +50%: the Guide’s Combos tab lists them all.' });
    return { pieces: pieces.slice(0, 8), total, idle, healed: Math.round(R.healed), disarmed: R.disarmed, jammed: R.jammed, combos: { ...R.combos }, tips: tips.slice(0, 3) };
  };

  // ---------------------------------------------------------------- scrying: tonight's raid, rehearsed
  RD.scryCost = (G) => Math.round(10 + 6 * RD.unlocked(G));
  // the shape of the dungeon a forecast was made for; any change makes the forecast stale
  RD.buildSig = (G) => {
    let h = 0;
    for (let i = 0; i < G.floors * N; i++) h = (h * 31 + G.tiles[i] + 2) | 0;
    return `${h}|${G.hoard}|${G.floors}|${[...G.items.values()].map((it) => it.type + it.tile + '.' + it.lv).sort().join()}`;
  };
  // Run tonight's raid `runs` times on copies of the dungeon, out of sight, and average what happened.
  RD.forecast = function (G, runs) {
    const save = JSON.stringify(RD.saveGame(G));
    const keep = { G: RD.G, sfx: RD.sfx, ev: RD.onEvent, end: RD.onRaidEnd, shake: FX.shake, n: Object.fromEntries(Object.keys(FX).filter((k) => Array.isArray(FX[k])).map((k) => [k, FX[k].length])) };
    RD.sfx = null; RD.onEvent = null; RD.onRaidEnd = null;
    const heat = new Float32Array(G.floors * N);
    const sum = { killed: 0, escaped: 0, gold: 0, dealt: {}, combos: {}, healed: 0, fired: new Set() };
    try {
      for (let r = 0; r < runs; r++) {
        const g = RD.loadGame(JSON.parse(save));
        // scouting is never exact: every hero is up to 10% stronger or weaker than the scry assumes
        for (const h of g.party) { const k = 0.9 + 0.2 * Math.random(); h.maxHp = Math.round(h.maxHp * k); h.hp = h.maxHp; h.dmg *= 0.9 + 0.2 * Math.random(); }
        RD.startRaid(g);
        for (let k = 0; k < 30 * 400 && g.phase === 'raid'; k++) {
          RD.step(g, 1 / 30);
          if (k % 6 === 0) for (const h of g.R.heroes) if (alive(h) && h.tile != null) heat[h.tile]++;
        }
        const R = g.R;
        sum.killed += R.killed.length;
        sum.escaped += R.escaped.length;
        sum.gold += Math.max(0, R.goldTaken - R.goldBack);
        sum.range = sum.range || { killed: [99, 0], gold: [1e9, 0] };
        sum.range.killed = [Math.min(sum.range.killed[0], R.killed.length), Math.max(sum.range.killed[1], R.killed.length)];
        sum.range.gold = [Math.min(sum.range.gold[0], Math.max(0, R.goldTaken - R.goldBack)), Math.max(sum.range.gold[1], Math.max(0, R.goldTaken - R.goldBack))];
        sum.healed += R.healed;
        for (const [k, e] of Object.entries(R.dealt)) { const a = sum.dealt[k] || (sum.dealt[k] = { dmg: 0, kills: 0 }); a.dmg += e.dmg; a.kills += e.kills; }
        for (const [k, v] of Object.entries(R.combos)) sum.combos[k] = (sum.combos[k] || 0) + v;
        for (const k of R.fired) sum.fired.add(k);
      }
    } finally {
      RD.G = keep.G; RD.sfx = keep.sfx; RD.onEvent = keep.ev; RD.onRaidEnd = keep.end;
      for (const k in keep.n) FX[k].length = keep.n[k];
      FX.shake = keep.shake;
    }
    let top = 0;
    for (const v of heat) top = Math.max(top, v);
    if (top) for (let i = 0; i < heat.length; i++) heat[i] /= top;
    const pieces = Object.entries(sum.dealt).map(([key, e]) => {
      const tile = key.startsWith('it:') ? +key.slice(3) : null, it = tile != null ? G.items.get(tile) : null;
      const ghost = key.startsWith('ghost:');
      return { key, tile, type: it ? it.type : ghost ? 'spectre' : 'power:' + key.slice(6), name: it ? RD.ITEMS[it.type].name : ghost ? 'Ghost of ' + key.slice(6) : 'Raised skeletons', dmg: Math.round(e.dmg / runs), kills: e.kills / runs };
    }).sort((a, b) => b.dmg - a.dmg);
    const busy = new Set([...Object.keys(sum.dealt), ...sum.fired]);
    const idle = [...G.items.values()].filter((it) => FIGHTERS.has(RD.ITEMS[it.type].kind) && !busy.has('it:' + it.tile)).map((it) => it.tile);
    return { runs, night: G.raid, sig: RD.buildSig(G), party: G.party.length, killed: sum.killed / runs, escaped: sum.escaped / runs, gold: sum.gold / runs, range: sum.range, healed: sum.healed / runs, heat, pieces, idle, combos: sum.combos };
  };

  RD.nextNight = function (G) {
    G.raid++;
    RD.beginBuild(G, false);
  };
})();
