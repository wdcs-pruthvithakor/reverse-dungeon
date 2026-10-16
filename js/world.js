'use strict';
// The dungeon itself: grid helpers, floors and stairs, map generation, building rules,
// guild knowledge, the guild's rating of your dungeon, and party generation.
(function () {
  const RD = window.RD;
  const { COLS, ROWS, N, MAX_FLOORS } = RD;
  const NN = N * MAX_FLOORS;

  // ---------------------------------------------------------------- grid helpers
  // A tile id is global: floor * N + local index. Floors share one coordinate grid.
  const idx = (x, y, f) => (f || 0) * N + y * COLS + x;
  const xy = (g) => { const i = g % N; return [i % COLS, (i / COLS) | 0]; };
  const fl = (g) => (g / N) | 0;
  RD.idx = idx;
  RD.xy = xy;
  RD.fl = fl;
  RD.cell = (g) => { const [x, y] = xy(g); return String.fromCharCode(65 + x) + (y + 1); };
  RD.coord = (g) => (RD.G && RD.G.floors > 1 ? RD.ROMAN[fl(g)] + '·' : '') + RD.cell(g);
  RD.isBorder = (g) => {
    const [x, y] = xy(g);
    return x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
  };
  const NB = new Array(NN);
  for (let g = 0; g < NN; g++) {
    const [x, y] = xy(g);
    const out = [];
    if (x > 0) out.push(g - 1);
    if (x < COLS - 1) out.push(g + 1);
    if (y > 0) out.push(g - COLS);
    if (y < ROWS - 1) out.push(g + COLS);
    NB[g] = out;
  }
  RD.nb = (g) => NB[g];
  // neighbours including a staircase link
  RD.adj = (G, g) => { const l = G.links.get(g); return l == null ? NB[g] : NB[g].concat(l); };
  RD.tdist = (a, b) => {
    if (fl(a) !== fl(b)) return Infinity;
    const [ax, ay] = xy(a);
    const [bx, by] = xy(b);
    return Math.hypot(ax - bx, ay - by);
  };

  // Line of sight between tile centres on one floor; every tile strictly between must be floor.
  RD.los = function (tiles, a, b) {
    const f = fl(a);
    if (f !== fl(b)) return false;
    let [x0, y0] = xy(a);
    const [x1, y1] = xy(b);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (x0 === x1 && y0 === y1) return true;
      const i = idx(x0, y0, f);
      if (i !== a && tiles[i] === 0) return false;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };

  // Dijkstra over every open floor with a small binary heap. `linkOk(g)` gates staircases.
  RD.dijkstra = function (G, start, cost, linkOk) {
    const M = G.floors * N;
    const dist = new Float32Array(M).fill(Infinity);
    const prev = new Int16Array(M).fill(-1);
    const hk = [], hv = [];
    const push = (k, v) => {
      let i = hk.length;
      hk.push(k); hv.push(v);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hk[p] <= k) break;
        hk[i] = hk[p]; hv[i] = hv[p]; i = p;
      }
      hk[i] = k; hv[i] = v;
    };
    const pop = () => {
      const top = hv[0];
      const k = hk.pop(), v = hv.pop();
      if (hk.length) {
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i, mk = k;
          if (l < hk.length && hk[l] < mk) { m = l; mk = hk[l]; }
          if (r < hk.length && hk[r] < mk) { m = r; mk = hk[r]; }
          if (m === i) break;
          hk[i] = hk[m]; hv[i] = hv[m]; i = m;
        }
        hk[i] = k; hv[i] = v;
      }
      return top;
    };
    dist[start] = 0;
    push(0, start);
    const relax = (u, v) => {
      const c = cost(v);
      if (c === Infinity) return;
      const d = dist[u] + c;
      if (d < dist[v]) { dist[v] = d; prev[v] = u; push(d, v); }
    };
    const seen = new Uint8Array(M);
    while (hk.length) {
      const u = pop();
      if (seen[u]) continue;
      seen[u] = 1;
      for (const v of NB[u]) if (v < M) relax(u, v);
      const l = G.links.get(u);
      if (l != null && (!linkOk || linkOk(u))) relax(u, l);
    }
    return { dist, prev };
  };

  // First step from `from` toward `to` over floor tiles on one floor (monsters ignore doors). -1 if none.
  RD.bfsStep = function (tiles, from, to) {
    if (from === to || fl(from) !== fl(to)) return -1;
    const base = fl(from) * N;
    const prev = new Int16Array(N).fill(-1);
    prev[from - base] = from - base;
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      if (u === to) break;
      for (const v of NB[u]) if (prev[v - base] < 0 && tiles[v] === 1) { prev[v - base] = u - base; q.push(v); }
    }
    if (prev[to - base] < 0) return -1;
    let s = to - base;
    while (prev[s] !== from - base) s = prev[s];
    return s + base;
  };

  RD.reachable = function (G, tiles, from, to) {
    const seen = new Uint8Array(G.floors * N);
    seen[from] = 1;
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      if (u === to) return true;
      for (const v of RD.adj(G, u)) if (v < seen.length && !seen[v] && tiles[v] === 1) { seen[v] = 1; q.push(v); }
    }
    return false;
  };

  // ---------------------------------------------------------------- map generation
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // One floor, as local tiles. The top floor starts at the outer wall; deeper floors start at the foot of the stairs.
  RD.genMap = function (rng, deep) {
    const tiles = new Uint8Array(N);
    const li = (x, y) => y * COLS + x;
    let ex, ey, hx, hy, side = null;
    if (!deep) {
      side = rng.pick(['W', 'E', 'N', 'S']);
      if (side === 'W') { ex = 0; ey = rng.int(2, ROWS - 3); hx = rng.int(COLS - 5, COLS - 2); hy = rng.int(1, ROWS - 2); }
      if (side === 'E') { ex = COLS - 1; ey = rng.int(2, ROWS - 3); hx = rng.int(1, 4); hy = rng.int(1, ROWS - 2); }
      if (side === 'N') { ey = 0; ex = rng.int(2, COLS - 3); hy = rng.int(ROWS - 4, ROWS - 2); hx = rng.int(1, COLS - 2); }
      if (side === 'S') { ey = ROWS - 1; ex = rng.int(2, COLS - 3); hy = rng.int(1, 3); hx = rng.int(1, COLS - 2); }
    } else {
      ex = rng.int(2, COLS - 3); ey = rng.int(2, ROWS - 3);
      hx = ex < COLS / 2 ? rng.int(COLS - 5, COLS - 2) : rng.int(1, 4);
      hy = ey < ROWS / 2 ? rng.int(ROWS - 4, ROWS - 2) : rng.int(1, 3);
    }
    const entrance = li(ex, ey);
    const hoard = li(hx, hy);
    const clampIn = (x, y) => [Math.max(1, Math.min(COLS - 2, x)), Math.max(1, Math.min(ROWS - 2, y))];
    const carve = (x, y) => { tiles[li(x, y)] = 1; };
    tiles[entrance] = 1;
    let cx = ex + (side === 'W' ? 1 : side === 'E' ? -1 : 0);
    let cy = ey + (side === 'N' ? 1 : side === 'S' ? -1 : 0);
    carve(cx, cy);
    const spine = [li(cx, cy)];
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
      spine.push(li(cx, cy));
    }
    while (cx !== hx) { cx += Math.sign(hx - cx); carve(cx, cy); }
    while (cy !== hy) { cy += Math.sign(hy - cy); carve(cx, cy); }

    // side passages, some of them dead ends worth baiting
    const branches = rng.int(3, 5);
    for (let b = 0; b < branches; b++) {
      const s = rng.pick(spine);
      let bx = s % COLS, by = (s / COLS) | 0;
      let d = rng.pick(DIRS);
      const len = rng.int(3, 8);
      for (let k = 0; k < len; k++) {
        if (rng.chance(0.3)) d = rng.pick(DIRS);
        [bx, by] = clampIn(bx + d[0], by + d[1]);
        carve(bx, by);
      }
    }
    // a chamber or two
    const rooms = rng.int(1, 2);
    for (let r = 0; r < rooms; r++) {
      const s = rng.pick(spine);
      const rx = s % COLS, ry = (s / COLS) | 0;
      const w = rng.int(2, 3), h = rng.int(2, 3);
      for (let y = ry; y < ry + h; y++) for (let x = rx; x < rx + w; x++) {
        const [px, py] = clampIn(x, y);
        carve(px, py);
      }
    }
    // the outer wall stays solid except the front gate
    for (let i = 0; i < N; i++) if (RD.isBorder(i) && i !== entrance) tiles[i] = 0;
    return { tiles, entrance, hoard };
  };

  // ---------------------------------------------------------------- guild knowledge
  RD.newKnow = () => ({
    tiles: new Int8Array(NN).fill(-1),
    traps: new Map(), // tile -> { type, off }
    turrets: new Map(), // tile -> type
    lairs: new Map(), // tile -> monster type
    doors: new Set(),
    chests: new Set(),
    mimics: new Set(),
    stairs: new Set(), // staircases down that someone has seen
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
    stairs: new Set(K.stairs),
    hoard: K.hoard,
    shifts: K.shifts,
    removed: new Set(K.removed),
    hz: null,
  });

  RD.mergeKnow = function (into, from) {
    for (let i = 0; i < NN; i++) if (from.tiles[i] !== -1) into.tiles[i] = from.tiles[i];
    for (const [k, v] of from.traps) into.traps.set(k, { ...v });
    for (const [k, v] of from.turrets) into.turrets.set(k, v);
    for (const [k, v] of from.lairs) into.lairs.set(k, v);
    for (const k of from.doors) into.doors.add(k);
    for (const k of from.chests) into.chests.add(k);
    for (const k of from.mimics) into.mimics.add(k);
    for (const k of from.stairs) into.stairs.add(k);
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

  // How dangerous each tile looks to the guild: turret lanes and monster posts, weighted by rank.
  RD.hazard = function (K) {
    const hz = new Float32Array(NN);
    let open = null; // what the guild believes is passable, built once for line-of-sight checks
    for (const [t, type] of K.turrets) {
      const [x0, y0] = xy(t), f = fl(t);
      const d = RD.ITEMS[type];
      if (d.chain) {
        // chain lightning reaches every open tile it can see within range
        if (!open) open = K.tiles.map((v) => (v === 0 ? 0 : 1));
        for (let j = f * N; j < (f + 1) * N; j++) if (K.tiles[j] !== 0 && RD.tdist(t, j) <= d.range + 0.5 && RD.los(open, t, j)) hz[j] += 1.5 + 0.6 * d.tier;
        continue;
      }
      for (const [dx, dy] of DIRS) {
        for (let s = 1; s <= d.range; s++) {
          const x = x0 + dx * s, y = y0 + dy * s;
          if (x < 0 || y < 0 || x >= COLS || y >= ROWS) break;
          const j = idx(x, y, f);
          if (K.tiles[j] === 0) break;
          hz[j] += 1 + 0.5 * d.tier;
        }
      }
    }
    for (const [t, type] of K.lairs) {
      if (type === 'mimic') continue;
      const d = RD.ITEMS[type];
      const w = (d.boss ? 2.5 : d.elite ? 1.8 : 1) * (1 + 0.5 * d.tier);
      const r = d.leash, base = fl(t) * N;
      for (let j = base; j < base + N; j++) {
        const dd = RD.tdist(t, j);
        if (dd <= r) hz[j] += w * (1 - dd / (r + 1));
      }
    }
    return hz;
  };

  RD.coverage = function (G, K) {
    let floor = 0, known = 0;
    for (let i = 0; i < G.floors * N; i++) {
      if (RD.isBorder(i)) continue;
      floor++;
      if (K.tiles[i] !== -1) known++;
    }
    return known / floor;
  };

  // ---------------------------------------------------------------- unlocks
  // How far along the dungeon is, in campaign nights. Quick and daily runs age faster.
  RD.modeOf = (G) => RD.MODES[G.mode] || RD.MODES.campaign;
  RD.age = (G) => 1 + (G.raid - 1) * RD.modeOf(G).pace;
  // the real night on which a campaign-night milestone arrives in this run
  RD.realNight = (G, campaignNight) => Math.ceil(1 + (campaignNight - 1) / RD.modeOf(G).pace - 1e-9);
  RD.unlocked = (G) => {
    let t = 0;
    while (t < RD.MAX_TIER && RD.age(G) >= RD.TIER_UNLOCK[t + 1]) t++;
    return t;
  };
  RD.nextUnlock = (G) => {
    const t = RD.unlocked(G) + 1;
    if (t > RD.MAX_TIER) return null;
    return { tier: t, night: RD.realNight(G, RD.TIER_UNLOCK[t]), items: Object.keys(RD.ITEMS).filter((k) => RD.ITEMS[k].tier === t && !RD.ITEMS[k].summonOnly) };
  };
  // the real night floor f can be dug; floors past the fifth come every DEEP_EVERY nights, at least 20 nights apart
  RD.floorNight = (G, f) => f < RD.BASE_FLOORS ? RD.realNight(G, RD.FLOOR_UNLOCK[f]) : Math.max(RD.DEEP_EVERY * (f - RD.BASE_FLOORS + 1), RD.floorNight(G, f - 1) + 20);
  RD.deepAllowed = (G) => !!(G.endless || RD.modeOf(G).deep);
  RD.maxFloors = (G) => (RD.deepAllowed(G) ? RD.MAX_FLOORS : RD.BASE_FLOORS);
  RD.winAt = (G) => RD.modeOf(G).win || RD.DIFF[G.diff].win;

  // ---------------------------------------------------------------- the guild's rating of your dungeon
  // The guild only rates what it has seen. A strong piece nobody escaped from is a secret.
  // Three things push the rating: the strongest thing they have seen (plus a little for every other
  // piece close to it in rank), how strong adventurers are in general by now, and how many of their own died here.
  RD.assess = function (G) {
    const gu = G.guild, K = gu.K, D = RD.DIFF[G.diff];
    const vals = [];
    for (const [t, type] of K.lairs) { const d = RD.ITEMS[type]; vals.push({ v: d.tier + (d.boss ? 1 : d.elite ? 0.6 : 0.2), type, tile: t }); }
    for (const t of K.mimics) vals.push({ v: RD.ITEMS.mimic.tier + 0.6, type: 'mimic', tile: t });
    for (const [t, v] of K.traps) vals.push({ v: RD.ITEMS[v.type].tier - 0.3, type: v.type, tile: t });
    for (const [t, type] of K.turrets) vals.push({ v: RD.ITEMS[type].tier, type, tile: t });
    vals.sort((x, y) => y.v - x.v);
    let seen = 0, why = null;
    if (vals.length) {
      const close = vals.filter((x) => x.v >= vals[0].v - 1).length - 1;
      seen = vals[0].v + 0.15 * Math.min(3, close);
      why = vals[0];
    }
    const top = RD.unlocked(G);
    // adventurers in general keep pace with what dungeons can build, whether or not anyone came back
    const base = Math.max(0.27 * (RD.age(G) - 1) * D.drift, top - 0.6 + (D.drift - 1) * 0.5);
    // at most one rank above what you could have built, and only when the guild is angry or has seen it
    const cap = top + 0.3 + (RD.age(G) > 6 ? 0.6 * Math.min(1, 0.8 * gu.pressure + 0.4 * Math.max(0, seen - top)) : 0);
    const threat = Math.max(0, Math.min(cap, Math.max(base, seen) + gu.pressure));
    return { threat, seen, base, why, cap };
  };
  RD.rating = (threat) => RD.TIERS[Math.max(0, Math.min(RD.MAX_TIER, Math.round(threat)))];

  // ---------------------------------------------------------------- game state
  RD.newGame = function (seed, diff, mode, pact, opts) {
    opts = opts || {};
    mode = RD.MODES[mode] ? mode : 'campaign';
    if (RD.MODES[mode].diff) diff = RD.MODES[mode].diff;
    diff = RD.DIFF[diff] ? diff : 'normal';
    const D = RD.DIFF[diff];
    const rng = RD.makeRng(seed);
    const map = RD.genMap(rng, false);
    const tiles = new Uint8Array(NN);
    tiles.set(map.tiles, 0);
    const G = {
      seed, rng, diff, mode, pact: pact || null, twists: (opts.twists || []).filter((k) => RD.TWISTS[k]), heart: opts.heart || {},
      floors: 1, tiles, gates: [map.entrance], stairs: [], links: new Map(), themes: ['halls'],
      entrance: map.entrance, hoard: map.hoard,
      items: new Map(),
      malice: D.malice, gold: D.gold, raid: 1, phase: 'build', endless: false,
      guild: {
        K: RD.newKnow(),
        causes: { trap: 0, illusion: 0, monster: 0, turret: 0 },
        pressure: 0, threat: 0, wariness: 0, blackout: 0, renown: 0,
        veterans: [],
        rumors: [],
      },
      party: [], omen: null, offers: [], sale: null, adapt: '',
      stats: { slain: 0, escaped: 0, goldLost: 0, held: 0, legends: 0, nemeses: 0 },
      nextId: 1, history: [], debrief: null, R: null,
    };
    G.malice += 25 * (G.heart.reserves || 0) + (RD.twisted(G, 'thrones') ? 120 : 0);
    G.gold += 20 * (G.heart.vault || 0);
    if (G.pact === 'tithe') G.malice += 60;
    if (G.pact === 'purse') G.gold += 50;
    RD.G = G;
    RD.beginBuild(G, true);
    return G;
  };

  function linkFloors(G) {
    G.links = new Map();
    for (let f = 0; f < G.floors - 1; f++) {
      const a = f * N + G.stairs[f], b = (f + 1) * N + G.gates[f + 1];
      G.links.set(a, b);
      G.links.set(b, a);
    }
  }
  RD.isStairs = (G, g) => G.links.has(g);
  RD.isGate = (G, g) => g === G.entrance || (fl(g) > 0 && G.gates[fl(g)] === g % N);

  // ---------------------------------------------------------------- floor themes and room auras
  RD.themeOf = (G, g) => RD.THEMES[(G.themes && G.themes[fl(g)]) || 'halls'];
  // the bonus a floor's theme gives a piece standing on it, for one stat
  RD.themeMult = (G, type, g, stat) => {
    const th = RD.themeOf(G, g);
    if (!th || th[stat] == null) return 1;
    if (stat === 'hold' || stat === 'heroSlow' || stat === 'gold') return th[stat];
    return th.tag && RD.hasTag(type, th.tag) ? th[stat] : 1;
  };
  // is a piece inside the reach of a War Banner or Trapmaster's Sigil?
  RD.inAura = (G, g, aura) => {
    for (const it of G.items.values()) { const d = RD.ITEMS[it.type]; if (d.aura === aura && RD.tdist(it.tile, g) <= d.auraR) return true; }
    return false;
  };
  // three themes to choose from for the next floor, seeded by the run
  RD.themeChoices = (G) => {
    const rng = RD.makeRng(G.seed * 31 + G.floors * 7 + G.raid);
    return rng.shuffle(Object.keys(RD.THEMES).filter((k) => k !== 'halls')).slice(0, 3);
  };

  // ---------------------------------------------------------------- save / load
  // Only build-phase state is saved. `pending` marks a save taken at dawn, before the next night was rolled.
  const packKnow = (K, M) => ({
    tiles: Array.from(K.tiles.subarray(0, M)), traps: [...K.traps], turrets: [...K.turrets], lairs: [...K.lairs],
    doors: [...K.doors], chests: [...K.chests], mimics: [...K.mimics], stairs: [...(K.stairs || [])],
    hoard: K.hoard, shifts: K.shifts, removed: [...K.removed],
  });
  const unpackKnow = (o) => {
    const K = RD.newKnow();
    K.tiles.set(Int8Array.from(o.tiles), 0);
    K.traps = new Map(o.traps); K.turrets = new Map(o.turrets); K.lairs = new Map(o.lairs);
    K.doors = new Set(o.doors); K.chests = new Set(o.chests); K.mimics = new Set(o.mimics); K.stairs = new Set(o.stairs || []);
    K.hoard = o.hoard; K.shifts = o.shifts; K.removed = new Set(o.removed);
    return K;
  };

  RD.saveGame = function (G, pending) {
    const g = G.guild, M = G.floors * N;
    return {
      v: 2, pending: !!pending, diff: G.diff, mode: G.mode, pact: G.pact, adReroll: G.adReroll, twists: G.twists, heart: G.heart, daily: G.daily,
      seed: G.seed, rng: G.rng.state(),
      floors: G.floors, tiles: Array.from(G.tiles.subarray(0, M)), gates: G.gates, stairs: G.stairs, themes: G.themes,
      entrance: G.entrance, hoard: G.hoard,
      items: [...G.items.values()].map((it) => ({ type: it.type, tile: it.tile, lv: it.lv || 1, paid: it.paid || 0, price: it.price })),
      malice: G.malice, gold: G.gold, raid: G.raid, endless: G.endless,
      guild: { K: packKnow(g.K, M), causes: g.causes, pressure: g.pressure, threat: g.threat, wariness: g.wariness, blackout: g.blackout || 0, renown: g.renown || 0, veterans: g.veterans, rumors: g.rumors },
      party: pending ? [] : G.party, omen: G.omen && G.omen.id, offers: G.offers, sale: G.sale, adapt: G.adapt,
      stats: G.stats, nextId: G.nextId, history: G.history.map((h) => ({ ...h, log: h.log.slice(0, 120) })),
    };
  };

  RD.loadGame = function (o) {
    if (!o || (o.v !== 1 && o.v !== 2)) return null;
    const v1 = o.v === 1;
    const rng = RD.makeRng(o.seed);
    rng.setState(o.rng);
    const items = new Map();
    for (const s of o.items) {
      if (!RD.ITEMS[s.type]) continue;
      // saves from before prices were recorded fall back to the list price
      const it = { type: s.type, tile: s.tile, lv: Math.min(RD.MAX_LEVEL, s.lv || s.rank || 1), paid: s.paid || 0, price: s.price != null ? s.price : RD.ITEMS[s.type].cost };
      freshItem(it);
      items.set(it.tile, it);
    }
    const tiles = new Uint8Array(NN);
    tiles.set(Uint8Array.from(o.tiles), 0);
    const G = {
      seed: o.seed, rng, diff: RD.DIFF[o.diff] ? o.diff : 'normal', mode: RD.MODES[o.mode] ? o.mode : 'campaign', pact: o.pact || null, adReroll: o.adReroll, twists: o.twists || [], heart: o.heart || {}, daily: o.daily,
      floors: o.floors || 1, tiles, gates: o.gates || [o.entrance], stairs: o.stairs || [], links: new Map(),
      themes: (o.themes || []).concat(new Array(o.floors || 1).fill('halls')).slice(0, o.floors || 1),
      entrance: o.entrance, hoard: o.hoard,
      items, malice: o.malice, gold: o.gold, raid: o.raid, phase: 'build', endless: o.endless,
      guild: { pressure: 0, threat: 0, wariness: 0, blackout: 0, renown: 0, ...o.guild, K: unpackKnow(o.guild.K) },
      party: o.party, omen: RD.OMENS.find((m) => m.id === o.omen) || RD.OMENS[0],
      offers: (o.offers || []).filter((t) => RD.ITEMS[t]), sale: o.sale, adapt: o.adapt,
      stats: { ...o.stats, legends: o.stats.legends || 0, nemeses: o.stats.nemeses || 0 }, nextId: o.nextId, history: o.history || [], debrief: null, R: null,
    };
    linkFloors(G);
    RD.G = G;
    if (o.pending) RD.nextNight(G);
    else if (v1) RD.beginBuild(G, false, true); // old heroes had no rank: hire tonight's party again
    return G;
  };

  function freshItem(it) {
    const d = RD.ITEMS[it.type];
    it.cd = 0;
    it.spent = false;
    it.off = false;
    it.jamT = 0;
    if (d.kind === 'door') { it.hp = RD.scaled(it.type, 'hp', it.lv) * (RD.G && RD.G.pact === 'iron' ? 1.5 : 1); it.pick = 0; it.broken = false; }
  }

  RD.beginBuild = function (G, first, keepOmen) {
    G.phase = 'build';
    G.R = null;
    for (const it of G.items.values()) freshItem(it);
    const rng = G.rng;
    if (!keepOmen) {
      G.omen = first ? RD.OMENS[0] : rng.pick(RD.OMENS.slice(G.raid < 3 ? 1 : 0));
      // everything unlocked is always for sale; three random pieces are 30% off tonight
      const top = RD.unlocked(G);
      const pool = Object.keys(RD.ITEMS).filter((k) => !RD.ITEMS[k].summonOnly && RD.ITEMS[k].tier <= top);
      G.offers = rng.shuffle(pool).slice(0, RD.dealCount(G));
      G.sale = null;
      if (G.omen.id === 'tithe') G.malice += 30;
      if (G.omen.id === 'leak') RD.leakSurvey(G, 8);
    }
    if (!first && !keepOmen && RD.twisted(G, 'blind')) G.guild.K = RD.newKnow();
    const a = RD.assess(G);
    G.guild.threat = a.threat;
    G.party = RD.genParty(G, a);
  };

  // New deals for tonight. The UI charges malice for it, or offers it after an optional ad.
  RD.dealCount = (G) => (G.pact === 'market' ? 4 : 3);
  RD.rerollCost = (G) => Math.max(1, (G.pact === 'market' ? 5 : 15) - 4 * (G.heart.ledger || 0));
  RD.floorCost = (G) => Math.round(RD.FLOOR_COST[G.floors] * (1 - 0.15 * (G.heart.delve || 0)));
  RD.rerollDeals = function (G) {
    const top = RD.unlocked(G);
    const pool = Object.keys(RD.ITEMS).filter((k) => !RD.ITEMS[k].summonOnly && RD.ITEMS[k].tier <= top);
    const fresh = G.rng.shuffle(pool.filter((k) => !G.offers.includes(k)));
    G.offers = fresh.concat(G.rng.shuffle(pool.filter((k) => G.offers.includes(k)))).slice(0, RD.dealCount(G));
  };

  RD.costOf = function (G, type) {
    const d = RD.ITEMS[type];
    if (!d) return RD.TOOLS[type].cost;
    let c = d.cost;
    if (G.pact === 'bones' && d.kind === 'monster' && !d.boss) c *= 0.85;
    if (G.pact === 'wyrm' && d.boss) c *= 0.8;
    if (G.offers.includes(type) || G.sale === type) c *= 0.7;
    if (RD.twisted(G, 'cheap')) c *= 0.75;
    if (RD.twisted(G, 'thrones') && d.boss) c *= 0.6;
    return Math.round(c);
  };

  RD.leakSurvey = function (G, n) {
    const K = G.guild.K;
    const pool = [];
    for (let i = 0; i < G.floors * N; i++) if (!RD.isBorder(i) && K.tiles[i] === -1) pool.push(i);
    G.rng.shuffle(pool);
    for (const i of pool.slice(0, n)) {
      K.tiles[i] = G.tiles[i];
      const it = G.items.get(i);
      if (it) RD.learnItem(K, it);
      if (i === G.hoard) K.hoard = i;
      if (G.links.has(i) && fl(G.links.get(i)) > fl(i)) K.stairs.add(i);
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

  // ---------------------------------------------------------------- floors
  RD.canOpenFloor = function (G) {
    if (G.phase !== 'build') return 'Only between raids.';
    if (G.floors >= MAX_FLOORS) return 'The dungeon is as deep as it goes.';
    if (G.floors >= RD.maxFloors(G)) return `Floors below ${RD.ROMAN[G.floors - 1]} open in endless mode, from night ${RD.floorNight(G, G.floors)}.`;
    if (G.raid < RD.floorNight(G, G.floors)) return `Floor ${RD.ROMAN[G.floors]} can be dug from night ${RD.floorNight(G, G.floors)}.`;
    const c = RD.floorCost(G);
    if (G.malice < c) return `Needs ${c} malice. You have ${G.malice}.`;
    return null;
  };

  // Dig a new floor below the deepest one. The stairs go at the far end of the floor above,
  // and the hoard is carried down to the new floor for free.
  RD.openFloor = function (G, theme) {
    const err = RD.canOpenFloor(G);
    if (err) return { err };
    const f = G.floors;
    const map = RD.genMap(G.rng, true);
    G.tiles.set(map.tiles, f * N);
    // stairs: the reachable empty tile on the floor above that is farthest from its own gate
    const above = f - 1, from = above * N + G.gates[above];
    const dist = new Int16Array(N).fill(-1);
    dist[from - above * N] = 0;
    const q = [from];
    let best = -1, bd = -1;
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      const d = dist[u - above * N];
      if (u !== from && !G.items.has(u) && !G.links.has(u) && d > bd) { bd = d; best = u; }
      for (const v of NB[u]) if (dist[v - above * N] < 0 && G.tiles[v] === 1) { dist[v - above * N] = d + 1; q.push(v); }
    }
    G.malice -= RD.floorCost(G);
    G.stairs[above] = best % N;
    G.gates[f] = map.entrance;
    G.themes = G.themes || ['halls'];
    G.themes[f] = RD.THEMES[theme] ? theme : 'halls';
    G.floors++;
    linkFloors(G);
    G.hoard = f * N + map.hoard;
    return { floor: f, stairs: best };
  };

  // ---------------------------------------------------------------- building rules
  const nearEntrance = (G, g) => RD.tdist(g, G.entrance) < 1.5;
  const special = (G, g) => RD.isStairs(G, g) || RD.isGate(G, g);

  RD.check = function (G, tool, i, from) {
    if (G.phase !== 'build') return 'Building is only possible between raids.';
    if (fl(i) >= G.floors) return 'That floor has not been dug yet.';
    const it = G.items.get(i);
    const floor = G.tiles[i] === 1;
    if (tool === 'dig') {
      if (floor) return 'Already a corridor.';
      if (RD.isBorder(i)) return 'The outer wall holds the mountain up.';
      if (it) return 'Sell the piece in this rock first.';
      return afford(G, tool);
    }
    if (tool === 'fill') {
      if (!floor) return 'Already rock.';
      if (special(G, i)) return 'The gate and the stairs stay open.';
      if (i === G.hoard) return 'Move the hoard first.';
      if (it) return 'Clear this tile first.';
      const t = G.tiles.slice();
      t[i] = 0;
      if (!RD.reachable(G, t, G.entrance, G.hoard)) return 'That would seal the hoard off.';
      return afford(G, tool);
    }
    if (tool === 'sell') return it ? null : 'Nothing here to sell.';
    if (tool === 'upgrade') {
      if (!it) return 'Pick a placed piece to level up.';
      if ((it.lv || 1) >= RD.MAX_LEVEL) return `Already Lv${RD.MAX_LEVEL}, the most a ${RD.TIERS[RD.ITEMS[it.type].tier]}-rank piece can reach.`;
      const c = RD.levelCost(it);
      return G.malice >= c ? null : `Lv${(it.lv || 1) + 1} needs ${c} malice. You have ${G.malice}.`;
    }
    if (tool === 'move' && from == null) return it ? null : 'Pick a piece to move.';
    if (tool === 'hoard') {
      if (!floor) return 'The hoard needs a floor.';
      if (i === G.hoard) return 'The hoard is already here.';
      if (it) return 'Clear this tile first.';
      if (special(G, i)) return 'Keep the hoard off the stairs.';
      if (nearEntrance(G, i)) return 'Too close to the entrance.';
      return afford(G, tool);
    }
    // placing a piece (tool is an item type, or 'move' with from set)
    const type = tool === 'move' ? G.items.get(from).type : tool;
    const d = RD.ITEMS[type];
    if (tool !== 'move' && d.tier > RD.unlocked(G)) return `${RD.TIERS[d.tier]}-rank pieces unlock on night ${RD.TIER_UNLOCK[d.tier]}.`;
    if (it && i !== from) return 'Something already stands here.';
    if (d.kind === 'seal') {
      const boss = [...G.items.values()].some((o) => RD.ITEMS[o.type].boss && fl(o.tile) === fl(i));
      if (!boss) return 'A boss seal needs a boss on the same floor.';
      for (const o of G.items.values()) if (o.tile !== from && o.type === 'seal' && fl(o.tile) === fl(i)) return `Floor ${RD.ROMAN[fl(i)]} already has a boss seal.`;
    }
    if (d.boss) {
      for (const o of G.items.values()) {
        if (o.tile === from || !RD.ITEMS[o.type].boss) continue;
        if (d.lord && RD.ITEMS[o.type].lord) return 'There can only be one Demon Lord.';
        if (fl(o.tile) === fl(i)) return `Floor ${RD.ROMAN[fl(i)]} already has a boss (${RD.ITEMS[o.type].name}).`;
      }
    }
    // storm fields interfere: pylons need room between them
    const gap = RD.RULES.pylonSpacing && RD.GAP[type];
    if (gap) for (const o of G.items.values()) if (o.tile !== from && o.type === type && RD.tdist(o.tile, i) < gap) return type === 'pylon' ? `Storm pylons interfere within ${gap} tiles of each other (one stands at ${RD.coord(o.tile)}).` : `${d.name}s need ${gap} tiles between them (one is at ${RD.coord(o.tile)}).`;
    if (d.place === 'wall') {
      if (floor) return `${d.name}s go into rock beside a corridor.`;
      if (!RD.nb(i).some((j) => G.tiles[j] === 1 && !RD.isGate(G, j))) return 'There is no corridor beside this rock.';
    } else {
      if (!floor) return 'This needs a corridor tile.';
      if (i === G.hoard) return 'The hoard is here.';
      if (special(G, i)) return 'Keep the stairs clear.';
      if (nearEntrance(G, i)) return 'Leave the threshold clear.';
    }
    return tool === 'move' ? null : afford(G, tool);
  };

  function afford(G, type) {
    const c = RD.costOf(G, type);
    return G.malice >= c ? null : `Needs ${c} malice. You have ${G.malice}.`;
  }

  // Selling returns 60% of what was actually spent: the price paid at placement (after any deal,
  // pact or twist discount) plus every level-up. Never the full list price, or discounts would mint malice.
  RD.refund = (it) => Math.round(((it.price != null ? it.price : RD.ITEMS[it.type].cost) + (it.paid || 0)) * 0.6);

  RD.apply = function (G, tool, i, from) {
    const err = RD.check(G, tool, i, from);
    if (err) return { err };
    if (tool === 'dig') { G.tiles[i] = 1; G.malice -= RD.costOf(G, 'dig'); return { spent: RD.costOf(G, 'dig'), map: true }; }
    if (tool === 'fill') { G.tiles[i] = 0; G.malice -= RD.costOf(G, 'fill'); return { spent: RD.costOf(G, 'fill'), map: true }; }
    if (tool === 'sell') {
      const it = G.items.get(i);
      let back = RD.refund(it);
      G.items.delete(i);
      // a seal cannot outlive the last boss on its floor
      if (RD.ITEMS[it.type].boss && ![...G.items.values()].some((o) => RD.ITEMS[o.type].boss && fl(o.tile) === fl(i))) {
        for (const o of [...G.items.values()]) if (o.type === 'seal' && fl(o.tile) === fl(i)) { back += RD.refund(o); G.items.delete(o.tile); }
      }
      G.malice += back;
      return { gained: back };
    }
    if (tool === 'upgrade') {
      const it = G.items.get(i);
      const c = RD.levelCost(it);
      it.lv = (it.lv || 1) + 1;
      it.paid = (it.paid || 0) + c;
      freshItem(it);
      G.malice -= c;
      return { spent: c, lv: it.lv };
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
    const it = { type: tool, tile: i, lv: 1, paid: 0, price: cost };
    freshItem(it);
    G.items.set(i, it);
    G.malice -= cost;
    return { spent: cost };
  };

  // Every number a piece will fight with, for the detail panel.
  // `tier` overrides the blueprint's rank: summons and horde packs fight above their own
  RD.pieceStats = function (type, lv, tier) {
    const d = RD.ITEMS[type];
    const s = (k) => Math.round(RD.scaled(type, k, lv, tier));
    const rows = [];
    if (d.hp != null) rows.push(['Health', s('hp')]);
    if (d.dmg != null) rows.push([d.kind === 'monster' ? 'Hit' : 'Damage', s('dmg')]);
    if (d.rate) rows.push(['Attacks', 'every ' + d.rate + 's']);
    if (d.dmg != null && d.rate) rows.push(['Damage / s', Math.round(RD.scaled(type, 'dmg', lv, tier) / d.rate)]);
    if (d.dps) rows.push(['Poison / s', s('dps')]);
    if (d.breath) rows.push([d.lord ? 'Hellfire' : 'Breath', `${s('breath')} every ${d.every}s`]);
    if (d.quake) rows.push(['Quake', `${s('quake')} + knockdown every ${d.every}s`]);
    if (d.pct) rows.push(['Drains', Math.round(d.pct * 100) + '% of current health; again once healed above ' + Math.round(RD.SOUL_MEND * 100) + '%']);
    if (d.regen) rows.push(['Regrows', (d.regen * 100).toFixed(1) + '% / s']);
    if (d.summon) rows.push(['Summons', `${RD.ITEMS[d.summon].name} every ${d.every || 5}s (max ${d.max})`]);
    if (d.heads) rows.push(['Bites', `${d.heads} heroes at once`]);
    if (d.range && d.kind === 'monster') rows.push(['Reach', d.range + ' tiles']);
    if (d.range && d.kind === 'turret') rows.push(['Range', d.range + ' tiles']);
    if (d.leash) rows.push(['Guards', d.leash + ' tiles']);
    const sec = (v) => v.toFixed(1) + 's';
    if (d.root) rows.push(['Pins', sec(RD.lvDur(d, 'root', lv))]);
    if (d.slow) rows.push(['Slows', sec(RD.lvDur(d, 'slow', lv))]);
    if (d.stun) rows.push(['Stuns', sec(RD.lvDur(d, 'stun', lv))]);
    if (d.confuse) rows.push(['Dazes', sec(RD.lvDur(d, 'confuse', lv))]);
    if (d.rearm) rows.push(['Rearms', sec(RD.lvRearm(d, lv))]);
    if (d.dur && d.dps && d.kind === 'trap' && d.radius == null) rows.push(['Poison for', d.dur + 's']);
    if (d.call) rows.push(['Calls monsters', `within ${d.call} tiles`]);
    if (d.cage) rows.push(['Cages', sec(RD.lvDur(d, 'cage', lv))]);
    if (d.line) rows.push(['Rolls', d.line + ' tiles']);
    if (d.den) rows.push(['Horde', `${d.count} × ${RD.ITEMS[d.pack].name}, fighting at ${RD.TIERS[Math.max(d.tier, RD.ITEMS[d.pack].tier)]}`]);
    if (d.statue) rows.push(['Disguise', 'a statue until a hero is adjacent']);
    if (d.armor) rows.push(['Stone skin', `${Math.round(d.armor * 100)}% less from range`]);
    if (d.charge) rows.push(['Charge', `knocks down for ${d.charge}s`]);
    if (d.petrify) rows.push(['Petrify', `${Math.round(d.petrify * 100)}% a bite`]);
    if (d.fear) rows.push(['Terror', `${d.fear}s of panic`]);
    if (d.aura) rows.push(['Room', `${d.aura === 'monster' ? 'monsters' : 'traps'} within ${d.auraR} tiles`]);
    return rows;
  };

  // ---------------------------------------------------------------- parties
  function heroName(rng, used) {
    for (let k = 0; k < 20; k++) {
      const n = rng.pick(RD.NAMES.first) + ' ' + rng.pick(RD.NAMES.last);
      if (!used.has(n)) { used.add(n); return n; }
    }
    return rng.pick(RD.NAMES.first) + ' the Nameless';
  }

  function rollTraits(rng, blackout) {
    const count = +rng.weighted({ 0: 3, 1: 4, 2: 2 });
    const pool = {};
    for (const k in RD.TRAITS) pool[k] = RD.TRAITS[k].w;
    pool.stone *= (1 + 1.5 * Math.min(3, blackout || 0)) * (RD.G && RD.G.pact === 'silence' ? 0.5 : 1);
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

  RD.makeHero = function (G, cls, tier, vet, used) {
    const C = RD.CLASSES[cls];
    const D = RD.DIFF[G.diff];
    const rng = G.rng;
    const lvl = vet ? vet.lvl : 1;
    const traits = vet ? vet.traits.slice() : rollTraits(rng, G.guild.blackout);
    if (RD.twisted(G, 'stones') && !traits.includes('stone')) traits.push('stone');
    const has = (t) => traits.includes(t);
    // ranks run out at SSS; after night 15 adventurers keep getting better gear and training
    const era = 1 + D.growth * Math.max(0, RD.age(G) - 15);
    const grace = G.raid === 1 ? 0.65 : Math.min(1, 0.8 + 0.05 * G.raid); // the first few parties are green
    const nemesis = !!(vet && vet.nemesis);
    const scale = RD.TIER_MULT[tier] * D.hero * (1 + 0.1 * (lvl - 1)) * era * grace * (1 + (G.guild.renown || 0)) * (nemesis ? 1.15 : 1);
    const h = {
      id: G.nextId++,
      name: vet ? vet.name : heroName(rng, used),
      title: C.unique ? RD.TITLES[cls] : '',
      cls, tier, lvl, traits,
      maxHp: Math.round(C.hp * scale * (has('stout') ? 1.25 : 1)),
      speed: C.speed * (has('swift') ? 1.2 : 1) * (RD.twisted(G, 'rush') ? 1.2 : 1),
      nemesis, escapes: vet ? vet.escapes || 0 : 0,
      dmg: C.dmg * scale,
      rate: C.rate, range: C.range, vision: C.vision,
      brave: C.brave + (has('reckless') ? 0.3 : 0),
      greed: C.greed + (has('greedy') ? 0.5 : 0) + (G.omen && G.omen.id === 'bounty' ? 0.3 : 0),
      // first-night rookies are too proud to run
      fleeAt: cls === 'chosen' ? 0 : G.raid === 1 ? 0.05 : has('coward') ? 0.5 : has('reckless') ? 0.1 : C.fleeAt,
      reck: has('reckless') ? 0.6 : 0,
      seed: (rng.next() * 100000) | 0,
    };
    h.hp = h.maxHp;
    return h;
  };

  // Which classes can fill a role at a given rank.
  const ROLES = {
    tank: [['knight', 3], ['berserker', 2], ['paladin', 0.25]],
    healer: [['cleric', 3], ['bard', 1], ['saint', 0.15]],
    trapper: [['rogue', 3], ['ranger', 2], ['shadow', 0.3]],
    seer: [['mage', 3], ['alchemist', 1], ['archmage', 0.25]],
  };
  const canBe = (cls, t) => (RD.CLASSES[cls].minTier || 0) <= t;

  // The boss hunters the guild sends for each kind of boss.
  const HUNTERS = {
    goblinking: ['knight', 'berserker'], lich: ['paladin', 'cleric', 'saint'], dragon: ['dragonslayer', 'knight', 'alchemist'],
    hydra: ['dragonslayer', 'swordsaint', 'archmage'], behemoth: ['dragonslayer', 'paladin', 'berserker'], demonlord: ['chosen', 'saint', 'swordsaint'],
  };

  RD.genParty = function (G, a) {
    const rng = G.rng, gu = G.guild, D = RD.DIFF[G.diff], K = gu.K;
    a = a || RD.assess(G);
    const top = RD.unlocked(G);
    const cap = Math.min(8, top + 1);
    const T = Math.max(0, Math.min(cap + (RD.twisted(G, 'blind') ? 0.6 : 0), a.threat + (RD.twisted(G, 'blind') ? 0.6 : 0)) - (RD.twisted(G, 'swarm') ? 1 : 0));
    const age = RD.age(G);
    let n = 3 + Math.floor((age - 1) / 5) + (age > 5 ? D.party : 0) + (gu.blackout >= 2 ? 1 : 0);
    n = Math.max(2, Math.min(10, n));
    if (G.raid === 1) n = Math.max(2, n - 1);
    if (G.omen.id === 'bounty') n++;
    if (RD.twisted(G, 'swarm')) n += 2;
    const roll = () => Math.max(0, Math.min(cap, Math.round(T) + +rng.weighted({ '-1': 0.3, 0: 0.58, 1: 0.12 })));
    const c = gu.causes;
    const used = new Set();
    const party = [];
    let legend = false;
    // one legend per party, except strike teams, which are made of them
    const hire = (cls, tier, vet, team) => {
      if (RD.CLASSES[cls].unique && legend && !team && cls !== 'chosen') cls = rng.pick(['knight', 'mage', 'cleric']);
      if (!canBe(cls, tier) && cls !== 'chosen') cls = 'knight';
      const h = RD.makeHero(G, cls, tier, vet, used);
      if (RD.CLASSES[cls].unique) legend = true;
      party.push(h);
      return h;
    };
    const pickRole = (role, t) => {
      const pool = {};
      for (const [cls, w] of ROLES[role]) if (canBe(cls, t) && !(RD.CLASSES[cls].unique && legend)) pool[cls] = w;
      return rng.weighted(pool);
    };
    const notes = [];

    // a strike team for the most dangerous boss the guild knows about
    let boss = null;
    for (const [t, type] of K.lairs) { const d = RD.ITEMS[type]; if (d.boss && (!boss || d.tier > RD.ITEMS[boss.type].tier)) boss = { type, tile: t }; }
    if (boss) {
      const bd = RD.ITEMS[boss.type];
      if (bd.lord || rng.chance(bd.myth ? 0.85 : 0.55)) {
        const tier = Math.max(0, Math.min(8, Math.max(Math.round(T), bd.tier + (bd.myth ? 1 : 0))));
        const team = HUNTERS[boss.type] || ['knight', 'mage'];
        const size = bd.lord || bd.myth ? 3 : 2;
        for (let k = 0; k < size; k++) {
          let cls = team[k % team.length];
          if (!canBe(cls, tier)) cls = cls === 'chosen' ? 'chosen' : 'knight';
          const h = hire(cls, cls === 'chosen' ? Math.max(tier, 7) : tier, null, true);
          h.hunt = boss.tile;
          h.team = true;
        }
        n += 1;
        notes.push(bd.lord ? 'The Chosen Hero leads a strike team against your Demon Lord.' : `A strike team is hunting your ${bd.name} at ${RD.coord(boss.tile)}.`);
      }
    }

    // veterans who earned their return
    for (const v of rng.shuffle(gu.veterans.slice())) {
      if (party.length >= n - 1) break;
      if (v.nemesis || rng.chance(0.65)) {
        hire(v.cls, Math.min(cap, v.tier || 0), v);
        gu.veterans.splice(gu.veterans.indexOf(v), 1);
      }
    }
    if (G.omen.id === 'pilgrims') hire('cleric', roll());

    // roles the guild insists on, from what it knows and what has been killing its people
    const illusions = [...K.traps.values()].filter((v) => RD.ITEMS[v.type].sense === 'illusion').length + K.mimics.size
      + [...K.lairs.values()].filter((t) => RD.ITEMS[t].cat === 'illusion').length;
    const has = (role) => party.some((h) => ROLES[role].some(([cls]) => cls === h.cls));
    const need = [];
    if (K.traps.size >= 2 || c.trap >= 2) need.push('trapper');
    if (illusions >= 1 || c.illusion >= 2) need.push('seer');
    if (n >= 4 || T >= 2) need.push('tank');
    if (n >= 4) need.push('healer');
    for (const role of need) if (party.length < n && !has(role)) { const t = roll(); hire(pickRole(role, t), t); }

    // the first night is a lesson: two green F-rank adventurers, no healers
    if (G.raid === 1) {
      while (party.length < n) hire(rng.pick(['knight', 'rogue', 'scout']), 0);
    }
    while (party.length < n) {
      const t = roll();
      const w = {};
      for (const k of RD.COMMON) if (canBe(k, t)) w[k] = RD.CLASSES[k].w;
      w.rogue += c.trap * 0.4;
      w.mage += c.illusion * 0.5;
      w.knight += c.monster * 0.3 + c.turret * 0.4;
      if (w.berserker) w.berserker += c.monster * 0.2;
      w.cleric += c.monster * 0.3;
      w.scout += (1 - RD.coverage(G, K)) * 2 + (gu.wariness || 0) * 2;
      if (w.tamer) w.tamer += c.monster * 0.2;
      if (w.ninja) w.ninja += c.trap * 0.2;
      if (G.themes && G.themes.includes('crypt')) w.cleric += 1;
      let cls = rng.weighted(w);
      if (!legend && (RD.twisted(G, 'legends') || rng.chance(0.045 * D.rare * (1 + 0.2 * t)))) {
        const pool = {};
        for (const u of RD.UNIQUE) if (u !== 'chosen' && canBe(u, t)) pool[u] = RD.CLASSES[u].w;
        // the guild sends the right specialist when it knows what it is facing
        const known = [...K.lairs.values()];
        if (pool.goblinslayer && known.filter((ty) => RD.hasTag(ty, 'goblinoid')).length >= 3) pool.goblinslayer *= 4;
        if (pool.phantomthief && [...G.items.values()].some((it) => it.type === 'seal') && K.lairs.size) pool.phantomthief *= 3;
        if (pool.shieldhero && known.filter((ty) => RD.ITEMS[ty].elite).length >= 2) pool.shieldhero *= 3;
        if (Object.keys(pool).length) cls = rng.weighted(pool);
      }
      hire(cls, t);
    }

    // explain the guild's thinking
    const L = RD.rating(T);
    let line;
    if (G.raid === 1) line = 'The guild knows nothing about you yet. They send a small party to look around.';
    else if (a.why && a.seen >= a.base && a.seen > 0.5) line = `They saw the ${RD.ITEMS[a.why.type].name.toLowerCase()} at ${RD.coord(a.why.tile)} and rated the dungeon to match.`;
    else if (gu.blackout >= 2) line = 'Their last parties never came back. This one is bigger and carries sending stones.';
    else if (gu.pressure > 0.3) line = 'Too many of their own have died here. They are sending stronger blades.';
    else if (a.base >= a.seen) line = 'Adventurers everywhere are getting stronger, and the guild sends its usual best.';
    else line = 'No one has died to you yet. The guild is getting bold.';
    if (gu.renown > 0.005) notes.push(`Renown +${Math.round(gu.renown * 100)}%: every night they fail to take gold, they train harder.`);
    G.adapt = `Guild rating: ${L}-rank. ${line}${notes.length ? ' ' + notes.join(' ') : ''}`;
    return party;
  };
})();
