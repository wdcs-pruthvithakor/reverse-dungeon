'use strict';
// The raid: heroes walk in with the guild's map, learn as they go, and carry what they learn home.
(function () {
  const RD = window.RD;
  const { N } = RD;
  const xy = RD.xy, fl = RD.fl;

  // ---------------------------------------------------------------- visual effects (read by render.js)
  // Every effect remembers its floor so the map only draws what happens on the floor you are looking at.
  const FX = (RD.FX = { floaters: [], parts: [], shots: [], rings: [], shake: 0 });
  let fxFloor = 0;
  RD.floater = (x, y, text, color, big, f) => FX.floaters.push({ x, y, text, color, t: 0, life: big ? 1.6 : 1.1, big, f: f == null ? fxFloor : f });
  RD.burst = (x, y, color, n, spd, f) => {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = (0.5 + Math.random()) * (spd || 2);
      FX.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.4 + Math.random() * 0.5, color, f: f == null ? fxFloor : f });
    }
  };
  RD.ring = (x, y, r, color, f) => FX.rings.push({ x, y, r, color, t: 0, life: 0.5, f: f == null ? fxFloor : f });
  const shot = (a, b, color, life) => FX.shots.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, t: 0, life: life || 0.16, color, f: fl(a.tile) });
  RD.fxUpdate = function (dt) {
    for (const f of FX.floaters) { f.t += dt; f.y -= dt * 0.7; }
    for (const p of FX.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    for (const s of FX.shots) s.t += dt;
    for (const r of FX.rings) r.t += dt;
    FX.floaters = FX.floaters.filter((f) => f.t < f.life);
    FX.parts = FX.parts.filter((p) => p.t < p.life);
    FX.shots = FX.shots.filter((s) => s.t < s.life);
    FX.rings = FX.rings.filter((r) => r.t < r.life);
    FX.shake = Math.max(0, FX.shake - dt * 3);
  };
  RD.fxFloor = (f) => { fxFloor = f; };

  const center = (i) => { const [x, y] = xy(i); return [x + 0.5, y + 0.5]; };
  const udist = (a, b) => (fl(a.tile) !== fl(b.tile) ? Infinity : Math.hypot(a.x - b.x, a.y - b.y));
  const omen = (G, id) => G.omen && G.omen.id === id;
  const scaleOf = (h) => h.dmg / RD.CLASSES[h.cls].dmg; // rank × difficulty × veteran bonus
  const label = (h) => `${h.name}${h.title ? ' ' + h.title : ''}`;

  function log(R, text, tone) {
    R.log.unshift({ t: R.t, text, tone });
    if (R.log.length > 250) R.log.length = 250;
  }

  // ---------------------------------------------------------------- start
  function mkMonster(type, home, lv, tier, item) {
    const d = RD.ITEMS[type];
    const m = RD.TIER_MULT[tier] * RD.levelMult(lv);
    const [x, y] = center(home);
    return {
      type, d, item, home, tile: home, x, y, next: -1, tier, lv,
      hp: d.hp * m, maxHp: d.hp * m, dmg: d.dmg * m, mult: m,
      cd: 0, abT: d.every ? d.every * 0.5 : 0, sumT: d.every || 5, minions: 0,
      dead: false, dormant: type === 'mimic', lunge: 0, face: 1,
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
      powers: { tremor: 0, douse: 0 }, douseT: 0, startGold: G.gold, bones: [], seen: new Set(),
    });
    for (const it of G.items.values()) {
      const d = RD.ITEMS[it.type];
      if (d.kind === 'monster') R.monsters.push(mkMonster(it.type, it.tile, it.lv, d.tier, it));
    }
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
      doorAt: -1, disarmAt: -1, disarmT: 0, cat: 'trap', said: 0, bob: Math.random() * 6, revived: false,
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
        const truth = G.tiles[j];
        if (K.tiles[j] !== truth) {
          if (K.tiles[j] !== -1) { K.shifts++; if (truth === 0) K.removed.add('tile:' + j); }
          K.tiles[j] = truth;
          K.hz = null;
        }
        const down = G.links.get(j);
        if (down != null && fl(down) > f && !K.stairs.has(j)) {
          K.stairs.add(j);
          K.hz = null;
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
            if (d.boss) log(R, `${h.name} sees the ${d.name} at ${RD.coord(j)}${d.myth ? '. A myth made flesh.' : '.'}`, 'warn');
          }
        } else if (K.lairs.has(j) && !(it && it.type === 'mimic')) { const w = RD.WHAT[K.lairs.get(j)]; K.lairs.delete(j); shift(R, h, 'lair:' + j, w, j); }
        if (it && it.type === 'mimic') { if (!K.mimics.has(j)) K.chests.add(j); }
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

  // `probe`: the hero is stuck, so rock the guild remembers but nobody has looked at tonight might be a new corridor.
  function heroCost(G, h, K, j, probe) {
    const t = K.tiles[j];
    if (t === 0) return probe && !h.seen.has(j) && !RD.isBorder(j) ? 6 : Infinity;
    let c = t === -1 ? 1.5 + (G.guild.wariness || 0) * 0.6 : 1;
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

  function chooseGoal(G, R, h, dist, probe) {
    const K = h.K;
    if (h.state === 'escape' || h.state === 'flee') return G.entrance;
    if (h.greed >= 0.6) {
      let best = -1, bd = 6 + h.greed * 4;
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
    const linkOk = (u) => K.stairs.has(u) || K.stairs.has(G.links.get(u));
    let { dist, prev } = RD.dijkstra(G, h.tile, (j) => heroCost(G, h, K, j, false), linkOk);
    let goal = chooseGoal(G, R, h, dist, false);
    if (goal < 0 || dist[goal] === Infinity) {
      // stuck on the map they carry: the walls may have moved, so search rock nobody has checked tonight
      ({ dist, prev } = RD.dijkstra(G, h.tile, (j) => heroCost(G, h, K, j, true), linkOk));
      goal = chooseGoal(G, R, h, dist, true);
      if (goal >= 0 && dist[goal] < Infinity && !h.probing) {
        h.probing = true;
        log(R, `${h.name}: “The walls have moved. There must be another way.”`, 'hero');
      }
    }
    if (goal < 0 || dist[goal] === Infinity) {
      if (h.state === 'seek') { h.state = 'flee'; log(R, `${h.name} can find no way on and turns back.`, 'hero'); }
      return;
    }
    h.goal = goal;
    if (goal === h.tile) { arrive(G, R, h); return; }
    let step = goal;
    while (prev[step] !== h.tile) { step = prev[step]; if (step < 0) return; }
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

  function doorShut(G, j) {
    const it = G.items.get(j);
    return !!(it && RD.ITEMS[it.type].kind === 'door' && !it.broken);
  }

  function arrive(G, R, h) {
    if (h.state === 'seek' && h.tile === G.hoard) {
      h.state = 'loot';
      h.lootT = 1.2;
      return;
    }
    if ((h.state === 'escape' || h.state === 'flee') && h.tile === G.entrance) {
      leave(G, R, h);
      return;
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

  function trigger(G, R, h, it) {
    const d = RD.ITEMS[it.type];
    const kt = h.K.traps.get(it.tile);
    const known = kt && kt.type === it.type;
    const [x, y] = center(it.tile);
    const f = fl(it.tile);
    const ash = omen(G, 'ash') ? 0.5 : 1;
    const dmg = d.dmg != null ? RD.scaled(it.type, 'dmg', it.lv) : 0;
    const where = RD.coord(it.tile);
    if (d.rearm) it.cd = d.rearm * ash;
    switch (it.type) {
      case 'spikes':
        hurt(G, R, h, dmg * (known ? 0.5 : 1), 'trap');
        RD.burst(x, y, '#e9e0d2', 8, 2, f);
        log(R, `${h.name} drops into the spike pit at ${where}.`, 'hit');
        break;
      case 'snare':
        hurt(G, R, h, dmg, 'trap');
        h.rootT = d.root;
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
        h.stun = known ? 0.8 : d.stun;
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
        R.clouds.push({ x, y, f, r: d.radius, t: d.dur, life: d.dur, dps: RD.scaled(it.type, 'dps', it.lv) });
        log(R, `Miasma pours from the grate at ${where}.`, 'hit');
        break;
      case 'maze':
        h.confuse = d.confuse;
        h.next = -1;
        RD.ring(x, y, 0.8, '#b38be0', f);
        log(R, `${h.name} steps on the wandering rune and loses the way.`, 'hit');
        break;
      case 'frost':
        RD.ring(x, y, d.radius, '#9cc0e6', f);
        RD.burst(x, y, '#cfe3f2', 18, 2.5, f);
        for (const o of heroesNear(R, f, x, y, d.radius)) { hurt(G, R, o, dmg, 'trap'); o.slowT = d.slow; }
        log(R, `Frost blooms from the sigil at ${where}.`, 'hit');
        break;
      case 'siphon': {
        const take = h.maxHp * d.pct + dmg;
        hurt(G, R, h, take, 'trap');
        RD.ring(x, y, 0.9, '#e05a86', f);
        log(R, `The soul siphon at ${where} tears into ${h.name}.`, 'hit');
        break;
      }
      case 'abyss': {
        hurt(G, R, h, dmg, 'illusion');
        RD.ring(x, y, 1, '#b38be0', f);
        if (alive(h)) {
          const [ex, ey] = center(G.entrance);
          h.tile = G.entrance; h.x = ex; h.y = ey; h.next = -1; h.confuse = 2;
          log(R, `${h.name} steps into the abyss at ${where} and stumbles out of the front gate.`, 'hit');
        }
        break;
      }
    }
    // the victim shouts; the party hears unless they are feuding
    learnTrap(R, h, it.tile, it.type);
  }

  // ---------------------------------------------------------------- damage, death, escape
  const alive = (h) => h.state !== 'dead' && h.state !== 'out';
  RD.heroAlive = alive;

  function hurt(G, R, h, dmg, cat) {
    if (!alive(h)) return;
    h.hp -= dmg;
    h.cat = cat;
    if (dmg >= 1) RD.floater(h.x, h.y - 0.3, Math.round(dmg).toString(), '#e46a7c', false, fl(h.tile));
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
      return;
    }
    h.state = 'dead';
    h.hp = 0;
    const bounty = Math.round((8 + h.maxHp / 9 + (h.lvl - 1) * 4) * (h.title ? 2 : 1));
    G.malice += bounty;
    R.malice += bounty;
    const purse = 1 + 2 * h.tier;
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
    R.escaped.push(h);
    G.stats.escaped++;
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
    const targets = [foe];
    const around = C.cleave ? [h, C.cleave] : C.splash ? [foe, C.splash] : null;
    if (around) for (const m of R.monsters) if (m !== foe && !m.dead && !m.dormant && udist(m, around[0]) <= around[1]) targets.push(m);
    if (h.range > 1.5) shot(h, foe, h.cls === 'mage' || h.cls === 'archmage' ? '#a8b4ff' : '#cfe3f2', 0.18);
    if (C.splash) RD.ring(foe.x, foe.y, C.splash, '#a8b4ff', fl(foe.tile));
    for (const m of targets) {
      const dmg = h.dmg * mult * (m === foe ? 1 : 0.6);
      m.hp -= dmg;
      RD.floater(m.x, m.y - 0.3, Math.round(dmg).toString(), '#cfe3f2', false, fl(m.tile));
      if (m.hp <= 0 && !m.dead) {
        m.dead = true;
        if (m.summoner) m.summoner.minions--;
        RD.burst(m.x, m.y, '#9a8f9c', m.d.boss ? 40 : 14, m.d.boss ? 4 : 2.5, fl(m.tile));
        log(R, m.d.boss ? `${label(h)} slays the ${m.d.name}!` : `${h.name} destroys the ${m.d.name.toLowerCase()}.`, m.d.boss ? 'warn' : 'hero');
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
    if (h.confuse > 0) h.confuse -= dt;

    if (C.heal) {
      const amt = C.heal * scaleOf(h) * dt;
      for (const o of R.heroes) if (alive(o) && o !== h && o.hp < o.maxHp && udist(o, h) <= C.healR) o.hp = Math.min(o.maxHp, o.hp + amt);
    }

    if ((h.state === 'seek' || h.state === 'loot') && h.hp < h.fleeAt * h.maxHp) {
      h.state = 'flee';
      h.next = -1;
      h.doorAt = h.disarmAt = -1;
      log(R, `${h.name} turns and runs for the gate.`, 'hero');
    }

    if (h.state === 'loot') {
      h.lootT -= dt;
      if (h.lootT <= 0) {
        const want = Math.round((5 + h.greed * 6 + G.raid * 0.6) * (1 + 0.25 * h.tier));
        const take = Math.min(G.gold, want);
        G.gold -= take;
        h.carry += take;
        R.goldTaken += take;
        h.state = 'escape';
        RD.floater(h.x, h.y - 0.5, '−' + take + ' gold', '#e3b04b', true, fl(h.tile));
        log(R, `${h.name} fills a sack with ${take} gold.`, 'warn');
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
        log(R, `${h.name} ${picks ? 'picks the lock on' : 'batters down'} the ${RD.ITEMS[it.type].name.toLowerCase()} at ${RD.coord(it.tile)}.`, 'hero');
        h.doorAt = -1;
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
          const kt = h.K.traps.get(j);
          if (kt) kt.off = true;
          RD.floater(x, y, 'disarmed', '#9cc0e6', false, fl(j));
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
    const sp = h.speed * (h.slowT > 0 ? 0.5 : 1) * (R.douseT > 0 ? 0.75 : 1) * (1 - (G.guild.wariness || 0) * 0.15) * (h.confuse > 0 ? 0.7 : 1);
    const dx = gx - h.x, dy = gy - h.y, d = Math.hypot(dx, dy);
    if (d <= sp * dt) {
      h.x = gx; h.y = gy;
      h.tile = h.next;
      h.next = -1;
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
    const tier = Math.max(RD.ITEMS[type].tier, m.tier - 1);
    const s = mkMonster(type, at, m.lv, tier, null);
    s.summoner = m;
    s.home = m.home;
    m.minions++;
    R.monsters.push(s);
    RD.burst(s.x, s.y, '#b38be0', 12, 2, fl(at));
    log(R, `The ${m.d.name.toLowerCase()} calls a ${RD.ITEMS[type].name.toLowerCase()}.`, 'hit');
  }

  function tickMonster(G, R, m, dt) {
    if (m.dead) return;
    const d = m.d;
    m.cd -= dt;
    if (m.lunge > 0) m.lunge -= dt;
    if (m.dormant) {
      const near = R.heroes.find((h) => alive(h) && udist(h, m) <= 1.05);
      if (!near) return;
      m.dormant = false;
      near.K.mimics.add(m.home);
      near.K.chests.delete(m.home);
      near.K.lairs.set(m.home, 'mimic');
      near.K.hz = null;
      RD.floater(m.x, m.y - 0.5, 'MIMIC', '#e05a86', true, fl(m.tile));
      log(R, `The chest at ${RD.coord(m.home)} opens its mouth.`, 'hit');
    }
    if (d.regen && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * d.regen * dt);
    const [hx, hy] = center(m.home);
    const f = fl(m.home);
    let target = null, best = Infinity;
    for (const h of R.heroes) {
      if (!alive(h) || fl(h.tile) !== f) continue;
      if (Math.hypot(h.x - hx, h.y - hy) > d.leash + 0.75) continue;
      const dd = udist(h, m);
      if (dd < best) { best = dd; target = h; }
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
          const dmg = RD.TIER_MULT[m.tier] * RD.levelMult(m.lv) * (d.breath || d.quake) * (omen(G, 'moon') ? 1.3 : 1);
          RD.ring(m.x, m.y, r, d.breath ? '#ff8a3d' : '#c9a36a', f);
          RD.burst(m.x, m.y, d.breath ? '#ff8a3d' : '#8a8090', 30, 4, f);
          FX.shake = Math.max(FX.shake, 0.7);
          for (const h of heroesNear(R, f, m.x, m.y, r)) { hurt(G, R, h, dmg, 'monster'); if (d.quake && alive(h)) h.stun = 1.5; }
          log(R, `The ${d.name.toLowerCase()} ${d.lord ? 'calls down hellfire' : d.breath ? 'breathes fire' : 'shatters the floor'}.`, 'hit');
        }
      }
    }
    let goal = m.home;
    if (target) {
      const reach = d.range || 1.15;
      if (best <= reach && (best < 1.5 || RD.los(G.tiles, m.tile, target.tile))) {
        if (m.cd <= 0) {
          const dmg = m.dmg * (omen(G, 'moon') ? 1.3 : 1);
          const victims = [target];
          if (d.heads) for (const h of R.heroes) if (victims.length < d.heads && h !== target && alive(h) && udist(h, m) <= reach) victims.push(h);
          if (reach > 1.5) shot(m, target, d.slows ? '#e9e0d2' : '#e05a86', 0.18);
          for (const v of victims) {
            hurt(G, R, v, dmg, d.cat);
            if (d.slows && alive(v)) v.slowT = 2;
          }
          if (d.drain) m.hp = Math.min(m.maxHp, m.hp + dmg * d.drain);
          m.cd = d.rate;
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
    const sp = d.speed;
    const dx = gx - m.x, dy = gy - m.y, dd = Math.hypot(dx, dy);
    if (dd <= sp * dt) { m.x = gx; m.y = gy; m.tile = m.next; m.next = -1; }
    else { m.x += (dx / dd) * sp * dt; m.y += (dy / dd) * sp * dt; if (dx) m.face = Math.sign(dx); }
  }

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function tickTurret(G, R, it, dt) {
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
      if (!pool.length) return;
      it.cd = d.rate;
      let from = src;
      const hit = [];
      for (let k = 0; k < d.chain && pool.length; k++) {
        pool.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
        const h = pool.shift();
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
    R.powers.tremor = Math.max(0, R.powers.tremor - dt);
    R.powers.douse = Math.max(0, R.powers.douse - dt);
    for (const it of G.items.values()) {
      const kind = RD.ITEMS[it.type].kind;
      if (it.cd > 0 && kind === 'trap') it.cd -= dt;
      if (kind === 'turret') tickTurret(G, R, it, dt);
    }
    for (const c of R.clouds) {
      c.t -= dt;
      for (const h of R.heroes) if (alive(h) && fl(h.tile) === c.f && Math.hypot(h.x - c.x, h.y - c.y) <= c.r) {
        h.cloudAcc = (h.cloudAcc || 0) + c.dps * dt;
        if (h.cloudAcc >= 4) { hurt(G, R, h, h.cloudAcc, 'trap'); h.cloudAcc = 0; }
      }
    }
    R.clouds = R.clouds.filter((c) => c.t > 0);
    for (const h of R.heroes) tickHero(G, R, h, dt);
    for (const m of R.monsters) tickMonster(G, R, m, dt);
    for (const h of R.heroes) if (h.lunge > 0) h.lunge -= dt;

    const active = R.heroes.filter(alive);
    if (!R.queue.length && !active.length) return endRaid(G, R);
    if (R.t > RD.RAID_TIME_LIMIT) {
      for (const h of active) leave(G, R, h);
      log(R, 'The torches gutter out. The last heroes feel their way back to the gate.', 'info');
      return endRaid(G, R);
    }
  };

  // ---------------------------------------------------------------- dungeon powers
  RD.usePower = function (G, power, tile) {
    const R = G.R;
    const p = RD.POWERS[power];
    if (!R || G.phase !== 'raid') return 'Powers only work during a raid.';
    if (R.powers[power] > 0) return `${p.name} is still recovering.`;
    if (G.malice < p.cost) return `${p.name} needs ${p.cost} malice.`;
    G.malice -= p.cost;
    R.powers[power] = p.cd;
    if (power === 'tremor') {
      const [x, y] = center(tile);
      const f = fl(tile);
      FX.shake = 1;
      RD.ring(x, y, 1.6, '#c43c68', f);
      RD.burst(x, y, '#6b5a70', 20, 3, f);
      const hit = heroesNear(R, f, x, y, 1.6);
      for (const h of hit) { h.stun = 2; hurt(G, R, h, h.maxHp * 0.06, 'trap'); }
      log(R, `The floor heaves at ${RD.coord(tile)}. ${hit.length ? hit.length + ' knocked down.' : 'Nobody was there.'}`, 'hit');
    } else {
      R.douseT = 8;
      log(R, 'Every torch gutters out at once.', 'hit');
    }
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

  const brief = (h) => ({ name: h.name, title: h.title, cls: h.cls, tier: h.tier, carry: h.carry || 0 });

  function endRaid(G, R) {
    G.phase = 'debrief';
    const gu = G.guild;
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
    gu.rumors = rumors.concat(gu.rumors).slice(0, 14);
    for (const h of R.escaped) gu.veterans.push({ name: h.name, cls: h.cls, tier: h.tier, lvl: h.lvl, traits: h.traits });
    gu.veterans = gu.veterans.slice(-6);
    const D = RD.DIFF[G.diff];
    const income = Math.round((26 + 4 * G.raid) * D.income * (1 + 0.3 * RD.unlocked(G)));
    G.malice += income;
    const lost = R.goldTaken - R.goldBack;
    G.stats.goldLost += Math.max(0, lost);
    G.stats.held++;
    G.debrief = {
      raid: G.raid, killed: R.killed.slice(), escaped: R.escaped.slice(), intel, rumors,
      malice: R.malice, income, goldLost: Math.max(0, lost), gold: G.gold,
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

  RD.nextNight = function (G) {
    G.raid++;
    RD.beginBuild(G, false);
  };
})();
