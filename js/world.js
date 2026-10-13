'use strict';
// The dungeon itself: grid helpers, map generation, building rules, guild knowledge, party generation.
(function () {
  const RD = window.RD;
  const { COLS, ROWS, N } = RD;

  // ---------------------------------------------------------------- grid helpers
  const idx = (x, y) => y * COLS + x;
  const xy = (i) => [i % COLS, (i / COLS) | 0];
  RD.idx = idx;
  RD.xy = xy;
  RD.coord = (i) => {
    const [x, y] = xy(i);
    return String.fromCharCode(65 + x) + (y + 1);
  };
  RD.isBorder = (i) => {
    const [x, y] = xy(i);
    return x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
  };
  const NB = new Array(N);
  for (let i = 0; i < N; i++) {
    const [x, y] = xy(i);
    const out = [];
    if (x > 0) out.push(i - 1);
    if (x < COLS - 1) out.push(i + 1);
    if (y > 0) out.push(i - COLS);
    if (y < ROWS - 1) out.push(i + COLS);
    NB[i] = out;
  }
  RD.nb = (i) => NB[i];
  RD.tdist = (a, b) => {
    const [ax, ay] = xy(a);
    const [bx, by] = xy(b);
    return Math.hypot(ax - bx, ay - by);
  };

  // Line of sight between tile centres; every tile strictly between must be floor.
  RD.los = function (tiles, a, b) {
    let [x0, y0] = xy(a);
    const [x1, y1] = xy(b);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (x0 === x1 && y0 === y1) return true;
      const i = idx(x0, y0);
      if (i !== a && tiles[i] === 0) return false;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };

  // Plain Dijkstra; the grid is 187 tiles so a linear scan is plenty.
  RD.dijkstra = function (start, cost) {
    const dist = new Float32Array(N).fill(Infinity);
    const prev = new Int16Array(N).fill(-1);
    const done = new Uint8Array(N);
    dist[start] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const v of NB[u]) {
        if (done[v]) continue;
        const c = cost(v);
        if (c === Infinity) continue;
        if (best + c < dist[v]) { dist[v] = best + c; prev[v] = u; }
      }
    }
    return { dist, prev };
  };

  // First step from `from` toward `to` over floor tiles (monsters ignore doors). -1 if none.
  RD.bfsStep = function (tiles, from, to) {
    if (from === to) return -1;
    const prev = new Int16Array(N).fill(-1);
    prev[from] = from;
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      if (u === to) break;
      for (const v of NB[u]) if (prev[v] < 0 && tiles[v] === 1) { prev[v] = u; q.push(v); }
    }
    if (prev[to] < 0) return -1;
    let s = to;
    while (prev[s] !== from) s = prev[s];
    return s;
  };

  RD.reachable = function (tiles, from, to) {
    const seen = new Uint8Array(N);
    seen[from] = 1;
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      if (u === to) return true;
      for (const v of NB[u]) if (!seen[v] && tiles[v] === 1) { seen[v] = 1; q.push(v); }
    }
    return false;
  };

  // ---------------------------------------------------------------- map generation
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  RD.genMap = function (rng) {
    const tiles = new Uint8Array(N);
    const side = rng.pick(['W', 'E', 'N', 'S']);
    let ex, ey, hx, hy;
    if (side === 'W') { ex = 0; ey = rng.int(2, ROWS - 3); hx = rng.int(COLS - 5, COLS - 2); hy = rng.int(1, ROWS - 2); }
    if (side === 'E') { ex = COLS - 1; ey = rng.int(2, ROWS - 3); hx = rng.int(1, 4); hy = rng.int(1, ROWS - 2); }
    if (side === 'N') { ey = 0; ex = rng.int(2, COLS - 3); hy = rng.int(ROWS - 4, ROWS - 2); hx = rng.int(1, COLS - 2); }
    if (side === 'S') { ey = ROWS - 1; ex = rng.int(2, COLS - 3); hy = rng.int(1, 3); hx = rng.int(1, COLS - 2); }
    const entrance = idx(ex, ey);
    const hoard = idx(hx, hy);
    const clampIn = (x, y) => [Math.max(1, Math.min(COLS - 2, x)), Math.max(1, Math.min(ROWS - 2, y))];
    const carve = (x, y) => { tiles[idx(x, y)] = 1; };
    tiles[entrance] = 1;
    let cx = ex + (side === 'W' ? 1 : side === 'E' ? -1 : 0);
    let cy = ey + (side === 'N' ? 1 : side === 'S' ? -1 : 0);
    carve(cx, cy);
    const spine = [idx(cx, cy)];
    let last = null, guard = 0;
    while ((cx !== hx || cy !== hy) && guard++ < 500) {
      let d;
      if (rng.chance(0.5)) {
        const sx = Math.sign(hx - cx), sy = Math.sign(hy - cy);
        d = sx && sy ? (rng.chance(0.5) ? [sx, 0] : [0, sy]) : [sx, sy];
      } else if (last && rng.chance(0.55)) d = last;
      else d = rng.pick(DIRS);
      [cx, cy] = clampIn(cx + d[0], cy + d[1]);
      last = d;
      carve(cx, cy);
      spine.push(idx(cx, cy));
    }
    while (cx !== hx) { cx += Math.sign(hx - cx); carve(cx, cy); }
    while (cy !== hy) { cy += Math.sign(hy - cy); carve(cx, cy); }

    // side passages, some of them dead ends worth baiting
    const branches = rng.int(3, 5);
    for (let b = 0; b < branches; b++) {
      let [bx, by] = xy(rng.pick(spine));
      let d = rng.pick(DIRS);
      const len = rng.int(3, 8);
      for (let s = 0; s < len; s++) {
        if (rng.chance(0.3)) d = rng.pick(DIRS);
        [bx, by] = clampIn(bx + d[0], by + d[1]);
        carve(bx, by);
      }
    }
    // a chamber or two
    const rooms = rng.int(1, 2);
    for (let r = 0; r < rooms; r++) {
      const [rx, ry] = xy(rng.pick(spine));
      const w = rng.int(2, 3), h = rng.int(2, 3);
      for (let y = ry; y < ry + h; y++) for (let x = rx; x < rx + w; x++) {
        const [px, py] = clampIn(x, y);
        carve(px, py);
      }
    }
    // never leave the entrance row open on the outer wall except the entrance itself
    for (let i = 0; i < N; i++) if (RD.isBorder(i) && i !== entrance) tiles[i] = 0;
    return { tiles, entrance, hoard };
  };

  // ---------------------------------------------------------------- guild knowledge
  RD.newKnow = () => ({
    tiles: new Int8Array(N).fill(-1),
    traps: new Map(), // tile -> { type, off }
    turrets: new Map(), // tile -> type
    lairs: new Map(), // tile -> monster type
    doors: new Set(),
    chests: new Set(),
    mimics: new Set(),
    hoard: -1,
    shifts: 0,
    removed: new Set(), // 'kind:tile' facts that turned out false this raid
    hz: null, // cached hazard map
  });

  RD.cloneKnow = (K) => ({
    tiles: K.tiles.slice(),
    traps: new Map([...K.traps].map(([k, v]) => [k, { ...v }])),
    turrets: new Map(K.turrets),
    lairs: new Map(K.lairs),
    doors: new Set(K.doors),
    chests: new Set(K.chests),
    mimics: new Set(K.mimics),
    hoard: K.hoard,
    shifts: K.shifts,
    removed: new Set(K.removed),
    hz: null,
  });

  RD.mergeKnow = function (into, from) {
    for (let i = 0; i < N; i++) if (from.tiles[i] !== -1) into.tiles[i] = from.tiles[i];
    for (const [k, v] of from.traps) into.traps.set(k, { ...v });
    for (const [k, v] of from.turrets) into.turrets.set(k, v);
    for (const [k, v] of from.lairs) into.lairs.set(k, v);
    for (const k of from.doors) into.doors.add(k);
    for (const k of from.chests) into.chests.add(k);
    for (const k of from.mimics) into.mimics.add(k);
    for (const key of from.removed) {
      const [kind, s] = key.split(':');
      const t = +s;
      if (kind === 'trap') into.traps.delete(t);
      if (kind === 'turret') into.turrets.delete(t);
      if (kind === 'lair') into.lairs.delete(t);
      if (kind === 'door') into.doors.delete(t);
      if (kind === 'chest') into.chests.delete(t);
      if (kind === 'hoard' && into.hoard === t) into.hoard = -1;
      into.removed.add(key);
    }
    if (from.hoard !== -1) into.hoard = from.hoard;
    into.shifts = Math.max(into.shifts, from.shifts);
    into.hz = null;
    return into;
  };

  // How dangerous each tile looks to the guild: turret lanes and monster posts.
  RD.hazard = function (K) {
    const hz = new Float32Array(N);
    for (const [t] of K.turrets) {
      const [x0, y0] = xy(t);
      for (const [dx, dy] of DIRS) {
        for (let s = 1; s <= RD.ITEMS.darts.range; s++) {
          const x = x0 + dx * s, y = y0 + dy * s;
          if (x < 0 || y < 0 || x >= COLS || y >= ROWS) break;
          const j = idx(x, y);
          if (K.tiles[j] === 0) break;
          hz[j] += 1;
        }
      }
    }
    for (const [t, type] of K.lairs) {
      if (type === 'mimic') continue;
      const w = type === 'brute' ? 2.2 : type === 'slime' ? 0.8 : 1;
      const r = RD.ITEMS[type].leash;
      for (let j = 0; j < N; j++) {
        const d = RD.tdist(t, j);
        if (d <= r) hz[j] += w * (1 - d / (r + 1));
      }
    }
    return hz;
  };

  RD.coverage = function (G, K) {
    let floor = 0, known = 0;
    for (let i = 0; i < N; i++) {
      if (RD.isBorder(i)) continue;
      floor++;
      if (K.tiles[i] !== -1) known++;
    }
    return known / floor;
  };

  // ---------------------------------------------------------------- game state
  RD.newGame = function (seed) {
    const rng = RD.makeRng(seed);
    const map = RD.genMap(rng);
    const G = {
      seed, rng,
      tiles: map.tiles, entrance: map.entrance, hoard: map.hoard,
      items: new Map(),
      malice: 120, gold: 100, raid: 1, phase: 'build', endless: false,
      guild: {
        K: RD.newKnow(),
        causes: { trap: 0, illusion: 0, monster: 0, turret: 0 },
        wariness: 0,
        veterans: [],
        rumors: [],
      },
      party: [], omen: null, offers: [], sale: null, adapt: '',
      stats: { slain: 0, escaped: 0, goldLost: 0, held: 0 },
      nextId: 1, debrief: null, R: null,
    };
    RD.G = G;
    RD.beginBuild(G, true);
    return G;
  };

  // ---------------------------------------------------------------- save / load
  // Only build-phase state is saved. `pending` marks a save taken at dawn, before the next night was rolled.
  const packKnow = (K) => ({
    tiles: Array.from(K.tiles), traps: [...K.traps], turrets: [...K.turrets], lairs: [...K.lairs],
    doors: [...K.doors], chests: [...K.chests], mimics: [...K.mimics],
    hoard: K.hoard, shifts: K.shifts, removed: [...K.removed],
  });
  const unpackKnow = (o) => ({
    tiles: Int8Array.from(o.tiles), traps: new Map(o.traps), turrets: new Map(o.turrets), lairs: new Map(o.lairs),
    doors: new Set(o.doors), chests: new Set(o.chests), mimics: new Set(o.mimics),
    hoard: o.hoard, shifts: o.shifts, removed: new Set(o.removed), hz: null,
  });

  RD.saveGame = function (G, pending) {
    const g = G.guild;
    return {
      v: 1, pending: !!pending,
      seed: G.seed, rng: G.rng.state(),
      tiles: Array.from(G.tiles), entrance: G.entrance, hoard: G.hoard,
      items: [...G.items.values()].map((it) => ({ type: it.type, tile: it.tile, rank: it.rank || 1, paid: it.paid || 0 })),
      malice: G.malice, gold: G.gold, raid: G.raid, endless: G.endless,
      guild: { K: packKnow(g.K), causes: g.causes, wariness: g.wariness, veterans: g.veterans, rumors: g.rumors },
      party: pending ? [] : G.party, omen: G.omen && G.omen.id, offers: G.offers, sale: G.sale, adapt: G.adapt,
      stats: G.stats, nextId: G.nextId,
    };
  };

  RD.loadGame = function (o) {
    if (!o || o.v !== 1) return null;
    const rng = RD.makeRng(o.seed);
    rng.setState(o.rng);
    const items = new Map();
    for (const s of o.items) { const it = { type: s.type, tile: s.tile, rank: s.rank || 1, paid: s.paid || 0 }; freshItem(it); items.set(it.tile, it); }
    const G = {
      seed: o.seed, rng,
      tiles: Uint8Array.from(o.tiles), entrance: o.entrance, hoard: o.hoard,
      items, malice: o.malice, gold: o.gold, raid: o.raid, phase: 'build', endless: o.endless,
      guild: { ...o.guild, K: unpackKnow(o.guild.K) },
      party: o.party, omen: RD.OMENS.find((m) => m.id === o.omen) || RD.OMENS[0],
      offers: o.offers, sale: o.sale, adapt: o.adapt,
      stats: o.stats, nextId: o.nextId, debrief: null, R: null,
    };
    RD.G = G;
    if (o.pending) RD.nextNight(G);
    return G;
  };

  function freshItem(it) {
    const d = RD.ITEMS[it.type];
    it.cd = 0;
    it.spent = false;
    it.off = false;
    if (d.kind === 'door') { it.hp = d.hp * RD.rankMult(it); it.pick = 0; it.broken = false; }
  }

  RD.beginBuild = function (G, first) {
    G.phase = 'build';
    G.R = null;
    for (const it of G.items.values()) freshItem(it);
    const rng = G.rng;
    G.omen = first ? RD.OMENS[0] : rng.pick(RD.OMENS.slice(G.raid < 3 ? 1 : 0));
    G.offers = rng.shuffle(RD.SPECIAL.slice()).slice(0, first ? 2 : 3);
    G.sale = rng.pick(G.offers);
    if (G.omen.id === 'tithe') G.malice += 30;
    if (G.omen.id === 'leak') RD.leakSurvey(G, 8);
    G.party = RD.genParty(G);
  };

  RD.costOf = function (G, type) {
    const base = RD.ITEMS[type] ? RD.ITEMS[type].cost : RD.TOOLS[type].cost;
    return G.sale === type ? Math.round(base * 0.7) : base;
  };

  RD.leakSurvey = function (G, n) {
    const K = G.guild.K;
    const pool = [];
    for (let i = 0; i < N; i++) if (!RD.isBorder(i) && K.tiles[i] === -1) pool.push(i);
    G.rng.shuffle(pool);
    for (const i of pool.slice(0, n)) {
      K.tiles[i] = G.tiles[i];
      const it = G.items.get(i);
      if (it) RD.learnItem(K, it);
      if (i === G.hoard) K.hoard = i;
    }
    K.hz = null;
  };

  // Record a real piece in a knowledge map.
  RD.learnItem = function (K, it) {
    const d = RD.ITEMS[it.type];
    const key = (k) => K.removed.delete(k + ':' + it.tile);
    if (d.kind === 'trap') { K.traps.set(it.tile, { type: it.type, off: false }); key('trap'); }
    else if (d.kind === 'turret') { K.turrets.set(it.tile, it.type); key('turret'); }
    else if (it.type === 'mimic') { K.chests.add(it.tile); }
    else if (d.kind === 'monster') { K.lairs.set(it.tile, it.type); key('lair'); }
    else if (d.kind === 'door') { K.doors.add(it.tile); key('door'); }
    K.hz = null;
  };

  // ---------------------------------------------------------------- building rules
  const nearEntrance = (G, i) => RD.tdist(i, G.entrance) < 1.5;

  RD.check = function (G, tool, i, from) {
    if (G.phase !== 'build') return 'Building is only possible between raids.';
    const it = G.items.get(i);
    const floor = G.tiles[i] === 1;
    if (tool === 'dig') {
      if (floor) return 'Already a corridor.';
      if (RD.isBorder(i)) return 'The outer wall holds the mountain up.';
      if (it) return 'Sell the dart slit first.';
      return afford(G, tool);
    }
    if (tool === 'fill') {
      if (!floor) return 'Already rock.';
      if (i === G.entrance) return 'The entrance stays open.';
      if (i === G.hoard) return 'Move the hoard first.';
      if (it) return 'Clear this tile first.';
      const t = G.tiles.slice();
      t[i] = 0;
      if (!RD.reachable(t, G.entrance, G.hoard)) return 'That would seal the hoard off.';
      return afford(G, tool);
    }
    if (tool === 'sell') return it ? null : 'Nothing here to sell.';
    if (tool === 'upgrade') {
      if (!it) return 'Pick a placed piece to upgrade.';
      const c = RD.upgradeCost(it);
      return G.malice >= c ? null : `Rank ${(it.rank || 1) + 1} needs ${c} malice. You have ${G.malice}.`;
    }
    if (tool === 'move' && from == null) return it ? null : 'Pick a piece to move.';
    if (tool === 'hoard') {
      if (!floor) return 'The hoard needs a floor.';
      if (i === G.hoard) return 'The hoard is already here.';
      if (it) return 'Clear this tile first.';
      if (nearEntrance(G, i)) return 'Too close to the entrance.';
      return afford(G, tool);
    }
    // placing a piece (tool is an item type, or 'move' with from set)
    const type = tool === 'move' ? G.items.get(from).type : tool;
    const d = RD.ITEMS[type];
    if (it && i !== from) return 'Something already stands here.';
    if (d.place === 'wall') {
      if (floor) return 'Dart slits go into rock beside a corridor.';
      if (!RD.nb(i).some((j) => G.tiles[j] === 1 && j !== G.entrance)) return 'There is no corridor beside this rock.';
    } else {
      if (!floor) return 'This needs a corridor tile.';
      if (i === G.hoard) return 'The hoard is here.';
      if (i === G.entrance || nearEntrance(G, i)) return 'Leave the threshold clear.';
    }
    return tool === 'move' ? null : afford(G, tool);
  };

  function afford(G, type) {
    const c = RD.costOf(G, type);
    return G.malice >= c ? null : `Needs ${c} malice. You have ${G.malice}.`;
  }

  RD.apply = function (G, tool, i, from) {
    const err = RD.check(G, tool, i, from);
    if (err) return { err };
    if (tool === 'dig') { G.tiles[i] = 1; G.malice -= RD.costOf(G, 'dig'); return { spent: RD.costOf(G, 'dig'), map: true }; }
    if (tool === 'fill') { G.tiles[i] = 0; G.malice -= RD.costOf(G, 'fill'); return { spent: RD.costOf(G, 'fill'), map: true }; }
    if (tool === 'sell') {
      const it = G.items.get(i);
      const back = Math.round((RD.ITEMS[it.type].cost + (it.paid || 0)) * 0.6);
      G.items.delete(i);
      G.malice += back;
      return { gained: back };
    }
    if (tool === 'upgrade') {
      const it = G.items.get(i);
      const c = RD.upgradeCost(it);
      it.rank = (it.rank || 1) + 1;
      it.paid = (it.paid || 0) + c;
      freshItem(it);
      G.malice -= c;
      return { spent: c, rank: it.rank };
    }
    if (tool === 'hoard') { G.hoard = i; G.malice -= RD.costOf(G, 'hoard'); return { spent: RD.costOf(G, 'hoard') }; }
    if (tool === 'move') {
      const it = G.items.get(from);
      G.items.delete(from);
      it.tile = i;
      G.items.set(i, it);
      return { moved: true };
    }
    const cost = RD.costOf(G, tool);
    const it = { type: tool, tile: i, rank: 1, paid: 0 };
    freshItem(it);
    G.items.set(i, it);
    G.malice -= cost;
    return { spent: cost };
  };

  // ---------------------------------------------------------------- parties
  function heroName(rng, used) {
    for (let k = 0; k < 20; k++) {
      const n = rng.pick(RD.NAMES.first) + ' ' + rng.pick(RD.NAMES.last);
      if (!used.has(n)) { used.add(n); return n; }
    }
    return rng.pick(RD.NAMES.first) + ' the Nameless';
  }

  function rollTraits(rng) {
    const count = +rng.weighted({ 0: 3, 1: 4, 2: 2 });
    const pool = {};
    for (const k in RD.TRAITS) pool[k] = RD.TRAITS[k].w;
    const out = [];
    for (let n = 0; n < count; n++) {
      const t = rng.weighted(pool);
      out.push(t);
      pool[t] = 0;
      if (t === 'coward') pool.reckless = 0;
      if (t === 'reckless') pool.coward = 0;
    }
    return out;
  }

  RD.makeHero = function (G, cls, vet, used) {
    const C = RD.CLASSES[cls];
    const rng = G.rng;
    const lvl = vet ? vet.lvl + 1 : 1;
    const traits = vet ? vet.traits.slice() : rollTraits(rng);
    const has = (t) => traits.includes(t);
    const scale = 1 + 0.11 * (G.raid - 1) + 0.15 * (lvl - 1);
    const h = {
      id: G.nextId++,
      name: vet ? vet.name : heroName(rng, used),
      cls, lvl, traits,
      maxHp: Math.round(C.hp * scale * (has('stout') ? 1.25 : 1)),
      speed: C.speed * (has('swift') ? 1.2 : 1),
      dmg: C.dmg * (1 + 0.06 * (G.raid - 1) + 0.1 * (lvl - 1)),
      rate: C.rate, range: C.range, vision: C.vision,
      brave: C.brave + (has('reckless') ? 0.3 : 0),
      greed: C.greed + (has('greedy') ? 0.5 : 0) + (G.omen && G.omen.id === 'bounty' ? 0.3 : 0),
      fleeAt: has('coward') ? 0.5 : has('reckless') ? 0.1 : C.fleeAt,
      reck: has('reckless') ? 0.6 : 0,
      seed: (rng.next() * 100000) | 0,
    };
    h.hp = h.maxHp;
    return h;
  };

  RD.genParty = function (G) {
    const rng = G.rng, gu = G.guild;
    let n = Math.min(9, 2 + Math.floor((G.raid - 1) * 0.75));
    if (G.omen.id === 'bounty') n++;
    const c = gu.causes;
    const w = { knight: 3, rogue: 2, mage: 1.4, cleric: 1.2, scout: 1.6 };
    w.rogue += c.trap * 0.7;
    w.mage += c.illusion * 0.9;
    w.knight += c.monster * 0.45 + c.turret * 0.6;
    w.cleric += c.monster * 0.5;
    w.scout += (1 - RD.coverage(G, gu.K)) * 2 + gu.wariness * 2;
    const used = new Set();
    const party = [];
    for (const v of rng.shuffle(gu.veterans.slice())) {
      if (party.length >= n - 1) break;
      if (rng.chance(0.6)) {
        party.push(RD.makeHero(G, v.cls, v, used));
        gu.veterans.splice(gu.veterans.indexOf(v), 1);
      }
    }
    if (G.omen.id === 'pilgrims') party.push(RD.makeHero(G, 'cleric', null, used));
    // the guild always hires at least one counter to whatever killed the most heroes
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    const counter = { trap: 'rogue', illusion: 'mage', monster: rng.pick(['knight', 'cleric']), turret: 'knight' }[top[0]];
    if (top[1] > 0 && party.length < n && !party.some((h) => h.cls === counter)) party.push(RD.makeHero(G, counter, null, used));
    while (party.length < n) party.push(RD.makeHero(G, rng.weighted(w), null, used));

    // explain the guild's thinking in one line
    const why = {
      trap: 'Traps killed the most heroes, so the guild hires rogues.',
      illusion: 'Illusions killed the most heroes, so the guild hires mages.',
      monster: 'Your monsters killed the most heroes, so the guild sends knights and clerics.',
      turret: 'Dart slits killed the most heroes, so the guild sends heavier armour.',
    };
    if (G.raid === 1) G.adapt = 'The guild knows nothing about you yet. They send a small party to look around.';
    else if (gu.wariness > 0.35 && rng.chance(0.5)) G.adapt = 'The guild has noticed your walls move. They send scouts to re-check the map.';
    else if (top[1] > 0) G.adapt = why[top[0]];
    else G.adapt = 'No one has died to you yet. The guild is getting bold.';
    return party;
  };
})();
