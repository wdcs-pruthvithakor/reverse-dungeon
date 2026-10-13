'use strict';
// The raid: heroes walk in with the guild's map, learn as they go, and carry what they learn home.
(function () {
  const RD = window.RD;
  const { N } = RD;
  const xy = RD.xy;

  // ---------------------------------------------------------------- visual effects (read by render.js)
  const FX = (RD.FX = { floaters: [], parts: [], shots: [], rings: [], shake: 0 });
  RD.floater = (x, y, text, color, big) => FX.floaters.push({ x, y, text, color, t: 0, life: big ? 1.6 : 1.1, big });
  RD.burst = (x, y, color, n, spd) => {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = (0.5 + Math.random()) * (spd || 2);
      FX.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.4 + Math.random() * 0.5, color });
    }
  };
  RD.ring = (x, y, r, color) => FX.rings.push({ x, y, r, color, t: 0, life: 0.5 });
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

  const center = (i) => { const [x, y] = xy(i); return [x + 0.5, y + 0.5]; };
  const udist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const omen = (G, id) => G.omen && G.omen.id === id;

  function log(R, text, tone) {
    R.log.unshift({ t: R.t, text, tone });
    if (R.log.length > 60) R.log.length = 60;
  }

  // ---------------------------------------------------------------- start
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
      if (d.kind !== 'monster') continue;
      const [x, y] = center(it.tile);
      R.monsters.push({
        type: it.type, d, home: it.tile, tile: it.tile, x, y, next: -1,
        hp: d.hp * RD.rankMult(it), maxHp: d.hp * RD.rankMult(it), mult: RD.rankMult(it), rank: it.rank || 1, cd: 0, dead: false, dormant: it.type === 'mimic', lunge: 0,
      });
    }
    log(R, `Raid ${G.raid} begins. ${G.party.length} heroes at the gate.`, 'info');
    return R;
  };

  function spawnHero(G, R, h) {
    const [x, y] = center(G.entrance);
    Object.assign(h, {
      tile: G.entrance, x, y, next: -1, goal: -1, state: 'seek',
      K: R.feud ? RD.cloneKnow(R.shared) : R.shared,
      checked: new Set(), visited: new Set(), seen: R.feud ? new Set() : R.seen,
      cd: 0, stun: 0, confuse: 0, slowT: 0, carry: 0, lootT: 0,
      doorAt: -1, disarmAt: -1, disarmT: 0, cat: 'trap', said: 0, bob: Math.random() * 6,
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
    for (let y = hy - vis; y <= hy + vis; y++) {
      for (let x = hx - vis; x <= hx + vis; x++) {
        if (x < 0 || y < 0 || x >= RD.COLS || y >= RD.ROWS) continue;
        if ((x - hx) ** 2 + (y - hy) ** 2 > vis * vis + 0.5) continue;
        const j = RD.idx(x, y);
        if (!RD.los(G.tiles, h.tile, j)) continue;
        h.seen.add(j);
        const truth = G.tiles[j];
        if (K.tiles[j] !== truth) {
          if (K.tiles[j] !== -1) { K.shifts++; if (truth === 0) K.removed.add('tile:' + j); }
          K.tiles[j] = truth;
          K.hz = null;
        }
        const it = G.items.get(j);
        const d = it && RD.ITEMS[it.type];
        // visible pieces
        if (d && d.kind === 'turret') { if (!K.turrets.has(j)) RD.learnItem(K, it); }
        else if (K.turrets.has(j)) { K.turrets.delete(j); shift(R, h, 'turret:' + j, 'dart slit', j); }
        if (d && d.kind === 'monster' && it.type !== 'mimic') { if (K.lairs.get(j) !== it.type) RD.learnItem(K, it); }
        else if (K.lairs.has(j) && !(it && it.type === 'mimic')) { const w = RD.WHAT[K.lairs.get(j)]; K.lairs.delete(j); shift(R, h, 'lair:' + j, w, j); }
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

  // Look for hidden things nearby. Each hero rolls once per tile.
  function detect(G, R, h) {
    const C = RD.CLASSES[h.cls];
    const keen = h.traits.includes('keen');
    const radius = Math.max(C.detectR || 0, keen ? 1.5 : 0);
    if (!radius) return;
    const war = G.guild.wariness * 0.2;
    for (let j = 0; j < N; j++) {
      if (RD.tdist(h.tile, j) > radius) continue;
      if (!RD.los(G.tiles, h.tile, j)) continue;
      const it = G.items.get(j);
      const d = it && RD.ITEMS[it.type];
      const kt = h.K.traps.get(j);
      const senses = (s) => (C.detect && C.detect[s]) || (keen ? 0.3 : 0);
      if (d && d.sense && !h.checked.has(j)) {
        h.checked.add(j);
        const p = senses(d.sense) + (senses(d.sense) > 0 ? war : 0);
        if (p > 0 && Math.random() < p) {
          const [x, y] = center(j);
          if (it.type === 'mimic') {
            if (!h.K.mimics.has(j)) { h.K.mimics.add(j); h.K.chests.delete(j); h.K.lairs.set(j, 'mimic'); h.K.hz = null; RD.floater(x, y, 'seen through', '#9cc0e6'); log(R, `${h.name} sees through the mimic at ${RD.coord(j)}.`, 'hero'); }
          } else if (d.kind === 'trap' && !kt) {
            h.K.traps.set(j, { type: it.type, off: false });
            h.K.removed.delete('trap:' + j);
            h.K.hz = null;
            RD.floater(x, y, 'spotted', '#9cc0e6');
            log(R, `${h.name} spots a ${RD.ITEMS[it.type].name.toLowerCase()} at ${RD.coord(j)}.`, 'hero');
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
  function heroCost(G, h, K, j) {
    const t = K.tiles[j];
    if (t === 0) return Infinity;
    let c = t === -1 ? 1.5 + G.guild.wariness * 0.6 : 1;
    const trap = K.traps.get(j);
    if (trap && !trap.off) {
      if (trap.type === 'chasm') c += 45;
      else if (h.cls === 'rogue') c += 2.5;
      else c += 26 * (1 - h.reck);
    }
    if (K.doors.has(j)) c += h.cls === 'knight' || h.cls === 'rogue' ? 2 : 5;
    if (K.mimics.has(j)) c += 12;
    c += K.hz[j] * 3.5 * (1 - h.brave);
    return c;
  }

  function chooseGoal(G, R, h, dist) {
    const K = h.K;
    if (h.state === 'escape' || h.state === 'flee') return G.entrance;
    if (h.greed >= 0.6) {
      let best = -1, bd = 6 + h.greed * 4;
      for (const c of K.chests) {
        if (K.mimics.has(c) || h.visited.has(c)) continue;
        if (dist[c] < bd) { bd = dist[c]; best = c; }
      }
      if (best >= 0) return best;
    }
    if (K.hoard >= 0 && dist[K.hoard] < Infinity) return K.hoard;
    // explore: unknown tiles next to known floor, pushing deeper than the entrance
    let best = -1, bs = Infinity;
    for (let j = 0; j < N; j++) {
      if (K.tiles[j] !== -1 || dist[j] === Infinity) continue;
      if (!RD.nb(j).some((k) => K.tiles[k] === 1)) continue;
      const s = dist[j] - 0.7 * RD.tdist(j, G.entrance) + RD.hash(h.seed, j) * 4;
      if (s < bs) { bs = s; best = j; }
    }
    if (best >= 0) return best;
    // the map is complete but the hoard moved: sweep known halls nobody has looked at tonight
    for (let j = 0; j < N; j++) {
      if (K.tiles[j] !== 1 || dist[j] === Infinity || h.seen.has(j)) continue;
      const s = dist[j] - 0.7 * RD.tdist(j, G.entrance) + RD.hash(h.seed, j) * 4;
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
    const { dist, prev } = RD.dijkstra(h.tile, (j) => heroCost(G, h, K, j));
    const goal = chooseGoal(G, R, h, dist);
    if (goal < 0 || dist[goal] === Infinity) {
      if (h.state === 'seek') { h.state = 'flee'; log(R, `${h.name} can find no way on and turns back.`, 'hero'); }
      return;
    }
    h.goal = goal;
    if (goal === h.tile) { arrive(G, R, h); return; }
    let step = goal;
    while (prev[step] !== h.tile) { step = prev[step]; if (step < 0) return; }
    if (G.tiles[step] === 0) { K.tiles[step] = 0; K.hz = null; return; }
    if (doorShut(G, step)) {
      if (!K.doors.has(step)) { K.doors.add(step); K.hz = null; }
      h.doorAt = step;
      return;
    }
    const kt = K.traps.get(step);
    if (h.cls === 'rogue' && kt && !kt.off && kt.type !== 'chasm') {
      h.disarmAt = step;
      h.disarmT = RD.CLASSES.rogue.disarm;
      return;
    }
    h.next = step;
  }

  function doorShut(G, j) {
    const it = G.items.get(j);
    return !!(it && it.type === 'door' && !it.broken);
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
    if (h.state !== 'dead') arrive(G, R, h);
  }

  // ---------------------------------------------------------------- traps
  function trigger(G, R, h, it) {
    const d = RD.ITEMS[it.type];
    const kt = h.K.traps.get(it.tile);
    const known = kt && kt.type === it.type;
    const [x, y] = center(it.tile);
    const ash = omen(G, 'ash') ? 0.5 : 1;
    const dmg = d.dmg * RD.rankMult(it);
    if (it.type === 'spikes') {
      hurt(G, R, h, dmg * (known ? 0.5 : 1), 'trap');
      it.cd = d.rearm * ash;
      RD.burst(x, y, '#e9e0d2', 8, 2);
      log(R, `${h.name} drops into the spike pit at ${RD.coord(it.tile)}.`, 'hit');
    } else if (it.type === 'rune') {
      it.spent = true;
      FX.shake = 0.6;
      RD.ring(x, y, d.radius, '#ff8a3d');
      RD.burst(x, y, '#ff8a3d', 26, 4);
      for (const o of R.heroes) if (alive(o) && Math.hypot(o.x - x, o.y - y) <= d.radius) hurt(G, R, o, dmg, 'trap');
      log(R, `The fire rune at ${RD.coord(it.tile)} erupts.`, 'hit');
    } else if (it.type === 'chasm') {
      hurt(G, R, h, dmg * (known ? 0.4 : 1), 'illusion');
      h.stun = known ? 0.8 : d.stun;
      RD.burst(x, y, '#5a4a66', 14, 1.5);
      log(R, `${h.name} falls through the false floor at ${RD.coord(it.tile)}.`, 'hit');
    } else if (it.type === 'vent') {
      R.clouds.push({ x, y, r: d.radius, t: d.dur, life: d.dur, dps: d.dps * RD.rankMult(it) });
      it.cd = d.rearm * ash;
      log(R, `Miasma pours from the grate at ${RD.coord(it.tile)}.`, 'hit');
    } else if (it.type === 'maze') {
      h.confuse = d.confuse;
      h.next = -1;
      it.cd = d.rearm * ash;
      RD.ring(x, y, 0.8, '#b38be0');
      log(R, `${h.name} steps on the wandering rune and loses the way.`, 'hit');
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
    if (dmg >= 1) RD.floater(h.x, h.y - 0.3, Math.round(dmg).toString(), '#e46a7c');
    if (h.hp <= 0) die(G, R, h);
  }

  function die(G, R, h) {
    h.state = 'dead';
    h.hp = 0;
    const bounty = 10 + Math.round(h.maxHp / 8) + (h.lvl - 1) * 5;
    G.malice += bounty;
    R.malice += bounty;
    if (h.carry) {
      G.gold += h.carry;
      R.goldBack += h.carry;
      const [hx, hy] = center(G.hoard);
      RD.floater(hx, hy - 0.4, '+' + h.carry + ' gold back', '#e3b04b');
      h.carry = 0;
    }
    G.guild.causes[h.cat] = (G.guild.causes[h.cat] || 0) + 1;
    G.stats.slain++;
    R.killed.push(h);
    R.bones.push({ x: h.x, y: h.y, r: Math.random() * 6 });
    RD.burst(h.x, h.y, '#c43c68', 18, 3);
    RD.floater(h.x, h.y - 0.6, '+' + bounty + ' malice', '#e05a86', true);
    if (h.traits.includes('stone')) {
      report(R, h);
      log(R, `${h.name} dies, but the sending stone flares. The guild hears everything.`, 'warn');
    } else log(R, `${h.name} the ${RD.CLASSES[h.cls].name.toLowerCase()} dies. What they saw dies too.`, 'kill');
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
  function tickHero(G, R, h, dt) {
    if (!alive(h)) return;
    h.cd -= dt;
    h.bob += dt * 8;
    if (h.slowT > 0) h.slowT -= dt;
    if (h.stun > 0) { h.stun -= dt; return; }
    if (h.confuse > 0) h.confuse -= dt;

    if (h.cls === 'cleric') {
      const C = RD.CLASSES.cleric;
      for (const o of R.heroes) if (alive(o) && o !== h && o.hp < o.maxHp && udist(o, h) <= C.healR) o.hp = Math.min(o.maxHp, o.hp + C.heal * dt);
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
        const want = Math.round(5 + h.greed * 6 + G.raid * 0.8);
        const take = Math.min(G.gold, want);
        G.gold -= take;
        h.carry += take;
        R.goldTaken += take;
        h.state = 'escape';
        RD.floater(h.x, h.y - 0.5, '−' + take + ' gold', '#e3b04b', true);
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
        const holy = h.cls === 'cleric' && foe.d.undead ? RD.CLASSES.cleric.holy : 1;
        const dmg = h.dmg * holy;
        foe.hp -= dmg;
        h.cd = h.rate;
        h.lunge = 0.15;
        if (h.range > 1.5) FX.shots.push({ x1: h.x, y1: h.y, x2: foe.x, y2: foe.y, t: 0, life: 0.18, color: h.cls === 'mage' ? '#a8b4ff' : '#cfe3f2' });
        RD.floater(foe.x, foe.y - 0.3, Math.round(dmg).toString(), '#cfe3f2');
        if (foe.hp <= 0) {
          foe.dead = true;
          RD.burst(foe.x, foe.y, '#9a8f9c', 14, 2.5);
          log(R, `${h.name} destroys the ${foe.d.name.toLowerCase()}.`, 'hero');
        }
      }
      if (h.state !== 'flee') return;
    }

    if (h.doorAt >= 0) {
      const it = G.items.get(h.doorAt);
      if (!it || it.type !== 'door' || it.broken) { h.doorAt = -1; return; }
      if (h.cls === 'rogue') it.pick += dt;
      else it.hp -= RD.CLASSES[h.cls].bash * dt;
      if (it.hp <= 0 || it.pick >= RD.CLASSES.rogue.pick) {
        it.broken = true;
        const [x, y] = center(it.tile);
        RD.burst(x, y, '#8a8090', 12, 2);
        log(R, `${h.name} ${h.cls === 'rogue' ? 'picks the lock on' : 'batters down'} the door at ${RD.coord(it.tile)}.`, 'hero');
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
          RD.floater(x, y, 'disarmed', '#9cc0e6');
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
    const [gx, gy] = center(h.next);
    const sp = h.speed * (h.slowT > 0 ? 0.5 : 1) * (R.douseT > 0 ? 0.75 : 1) * (1 - G.guild.wariness * 0.15) * (h.confuse > 0 ? 0.7 : 1);
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

  function tickMonster(G, R, m, dt) {
    if (m.dead) return;
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
      RD.floater(m.x, m.y - 0.5, 'MIMIC', '#e05a86', true);
      log(R, `The chest at ${RD.coord(m.home)} opens its mouth.`, 'hit');
    }
    const [hx, hy] = center(m.home);
    let target = null, best = Infinity;
    for (const h of R.heroes) {
      if (!alive(h)) continue;
      if (Math.hypot(h.x - hx, h.y - hy) > m.d.leash + 0.75) continue;
      const d = udist(h, m);
      if (d < best) { best = d; target = h; }
    }
    let goal = m.home;
    if (target) {
      if (best <= 1.15) {
        if (m.cd <= 0) {
          const dmg = m.d.dmg * m.mult * (omen(G, 'moon') ? 1.3 : 1);
          hurt(G, R, target, dmg, m.d.cat);
          if (m.d.slows && alive(target)) target.slowT = 2;
          m.cd = m.d.rate;
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
    const sp = m.d.speed;
    const dx = gx - m.x, dy = gy - m.y, d = Math.hypot(dx, dy);
    if (d <= sp * dt) { m.x = gx; m.y = gy; m.tile = m.next; m.next = -1; }
    else { m.x += (dx / d) * sp * dt; m.y += (dy / d) * sp * dt; if (dx) m.face = Math.sign(dx); }
  }

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function tickTurret(G, R, it, dt) {
    it.cd -= dt;
    if (it.cd > 0) return;
    const d = RD.ITEMS.darts;
    const [x0, y0] = xy(it.tile);
    let target = null, best = Infinity;
    for (const [dx, dy] of DIRS) {
      for (let s = 1; s <= d.range; s++) {
        const x = x0 + dx * s, y = y0 + dy * s;
        if (x < 0 || y < 0 || x >= RD.COLS || y >= RD.ROWS) break;
        const j = RD.idx(x, y);
        if (G.tiles[j] === 0 || doorShut(G, j)) break;
        for (const h of R.heroes) if (alive(h) && h.tile === j && s < best) { best = s; target = h; }
      }
    }
    if (!target) return;
    it.cd = d.rate;
    const [tx, ty] = center(it.tile);
    FX.shots.push({ x1: tx, y1: ty, x2: target.x, y2: target.y, t: 0, life: 0.14, color: '#e9e0d2' });
    if (!target.K.turrets.has(it.tile)) RD.learnItem(target.K, it);
    hurt(G, R, target, d.dmg * RD.rankMult(it), 'turret');
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
      if (it.cd > 0 && RD.ITEMS[it.type].kind === 'trap') it.cd -= dt;
      if (RD.ITEMS[it.type].kind === 'turret') tickTurret(G, R, it, dt);
    }
    for (const c of R.clouds) {
      c.t -= dt;
      for (const h of R.heroes) if (alive(h) && Math.hypot(h.x - c.x, h.y - c.y) <= c.r) {
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
      FX.shake = 1;
      RD.ring(x, y, 1.6, '#c43c68');
      RD.burst(x, y, '#6b5a70', 20, 3);
      let n = 0;
      for (const h of R.heroes) if (alive(h) && Math.hypot(h.x - x, h.y - y) <= 1.6) { h.stun = 2; hurt(G, R, h, 8, 'trap'); n++; }
      log(R, `The floor heaves at ${RD.coord(tile)}. ${n ? n + ' knocked down.' : 'Nobody was there.'}`, 'hit');
    } else {
      R.douseT = 8;
      log(R, 'Every torch gutters out at once.', 'hit');
    }
    return null;
  };

  // ---------------------------------------------------------------- after the raid
  function fill(tpl, vals) {
    return tpl.replace(/\{(\w)\}/g, (_, k) => vals[k]);
  }

  RD.diffIntel = function (before, after) {
    const out = [];
    if (after.hoard !== -1 && after.hoard !== before.hoard) out.push({ kind: 'hoard', tile: after.hoard });
    for (const [t, v] of after.traps) if (!before.traps.has(t) || before.traps.get(t).type !== v.type) out.push({ kind: 'trap_' + v.type, tile: t });
    for (const [t] of after.turrets) if (!before.turrets.has(t)) out.push({ kind: 'turret', tile: t });
    for (const [t, v] of after.lairs) if (before.lairs.get(t) !== v) out.push({ kind: 'lair_' + v, tile: t });
    for (const t of after.doors) if (!before.doors.has(t)) out.push({ kind: 'door', tile: t });
    for (const key of after.removed) {
      const [k, s] = key.split(':');
      if (k === 'tile' || k === 'chest') continue;
      const t = +s;
      const what = k === 'trap' ? RD.WHAT[(before.traps.get(t) || {}).type || 'trap'] : k === 'lair' ? RD.WHAT[before.lairs.get(t)] || 'monster' : RD.WHAT[k];
      out.push({ kind: 'gone', tile: t, what });
    }
    let n = 0;
    for (let i = 0; i < N; i++) if (before.tiles[i] === -1 && after.tiles[i] !== -1) n++;
    if (n) out.push({ kind: 'map', n });
    if (after.shifts > 0) out.push({ kind: 'shift' });
    return out;
  };

  function endRaid(G, R) {
    G.phase = 'debrief';
    const before = G.guild.K;
    let intel = [];
    if (R.report) {
      const nk = RD.cloneKnow(before);
      RD.mergeKnow(nk, R.report);
      intel = RD.diffIntel(before, nk);
      for (const v of nk.traps.values()) v.off = false;
      nk.removed = new Set();
      nk.shifts = 0;
      nk.hz = null;
      G.guild.K = nk;
      G.guild.wariness = Math.min(1, G.guild.wariness + 0.08 * Math.min(5, R.report.shifts));
    }
    // tavern talk
    const speakers = R.reporters || [];
    const rumors = [];
    if (!speakers.length) rumors.push({ who: 'The tavern', text: G.rng.pick(RD.RUMOR.none) });
    for (const it of intel) {
      const tpls = RD.RUMOR[it.kind];
      if (!tpls) continue;
      const s = G.rng.pick(speakers);
      rumors.push({ who: `${s.name}, ${RD.CLASSES[s.cls].name}`, text: fill(G.rng.pick(tpls), { c: it.tile != null ? RD.coord(it.tile) : '', w: it.what, n: it.n }) });
    }
    G.guild.rumors = rumors.concat(G.guild.rumors).slice(0, 14);
    for (const h of R.escaped) {
      G.guild.veterans.push({ name: h.name, cls: h.cls, lvl: h.lvl, traits: h.traits });
    }
    G.guild.veterans = G.guild.veterans.slice(-6);
    const income = 30 + 5 * G.raid;
    G.malice += income;
    const lost = R.goldTaken - R.goldBack;
    G.stats.goldLost += Math.max(0, lost);
    G.stats.held++;
    G.debrief = {
      raid: G.raid, killed: R.killed.slice(), escaped: R.escaped.slice(), intel, rumors,
      malice: R.malice, income, goldLost: Math.max(0, lost), gold: G.gold,
    };
    if (G.gold <= 0) { G.phase = 'over'; G.result = 'lost'; }
    else if (G.raid >= RD.RAIDS_TO_WIN && !G.endless) { G.phase = 'over'; G.result = 'won'; }
    if (RD.onRaidEnd) RD.onRaidEnd(G);
  }

  RD.nextNight = function (G) {
    G.raid++;
    RD.beginBuild(G, false);
  };
})();
