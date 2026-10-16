'use strict';
// Canvas drawing: stone, pieces, heroes, torchlight, and the guild's map overlay. One floor at a time.
(function () {
  const RD = window.RD;
  const { COLS, ROWS, N } = RD;
  const xy = RD.xy, fl = RD.fl;

  const P = (RD.PAL = {
    void: '#0d0b10', rockA: '#1f1a24', rockB: '#272030', rockFace: '#3a3142', rockRim: '#57495f',
    floorA: '#4b3f3b', floorB: '#574942', seam: '#2d2526', moss: '#4f5a3b',
    malice: '#c43c68', maliceHi: '#e05a86', gold: '#e3b04b', goldDk: '#9c6f1f',
    bone: '#e9e0d2', ash: '#9a8f9c', steel: '#9cc0e6', ink: '#6f93bd',
    venom: '#86c06a', fire: '#ff8a3d', violet: '#b38be0', iron: '#5b5562', frost: '#cfe9ff',
    hero: {
      knight: '#d6dde8', rogue: '#7fbca6', mage: '#98a4f4', cleric: '#f0d9a0', scout: '#9fd2e9',
      ranger: '#9bc47a', berserker: '#e08a6a', alchemist: '#7fd6c2', bard: '#e7a8d8',
      monk: '#e8b070', tamer: '#a8d48a', ninja: '#5a5f78', samurai: '#d86a5a', darkknight: '#6a4a8a',
      shieldhero: '#c8d8e8', goblinslayer: '#9a9080', phantomthief: '#2a2a3a', sage: '#b8e0f0',
      paladin: '#ffe6a3', swordsaint: '#f4f4f4', shadow: '#6a6f8a', archmage: '#c9a8ff', saint: '#fff3cf', dragonslayer: '#ff9a5c', chosen: '#ffd34d',
    },
  });

  const V = (RD.view = { canvas: null, ctx: null, T: 32, M: 18, dpr: 1, hover: -1, guildMap: false, staticC: null, dirty: true, time: 0, floor: 0, drawn: -1, marks: [] });

  RD.initRender = function (canvas) {
    V.canvas = canvas;
    V.ctx = canvas.getContext('2d');
    V.staticC = document.createElement('canvas');
    V.lightC = document.createElement('canvas');
  };

  RD.resize = function (maxW, maxH) {
    const M = maxW < 520 ? 14 : 18;
    const T = Math.max(16, Math.floor(Math.min((maxW - M) / COLS, (maxH - M) / ROWS)));
    V.T = T;
    V.M = M;
    V.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = M + COLS * T, h = M + ROWS * T;
    for (const c of [V.canvas, V.staticC, V.lightC]) {
      c.width = Math.round(w * V.dpr);
      c.height = Math.round(h * V.dpr);
    }
    V.canvas.style.width = w + 'px';
    V.canvas.style.height = h + 'px';
    V.w = w;
    V.h = h;
    V.dirty = true;
  };

  // global tile under a canvas point, on the floor being viewed
  RD.tileAt = function (px, py) {
    const x = Math.floor((px - V.M) / V.T), y = Math.floor((py - V.M) / V.T);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return -1;
    return RD.idx(x, y, V.floor);
  };

  // ---------------------------------------------------------------- static stone layer
  function drawStatic(G) {
    const c = V.staticC.getContext('2d');
    const { T, M } = V;
    const f = V.floor, base = f * N;
    c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    c.fillStyle = P.void;
    c.fillRect(0, 0, V.w, V.h);
    c.translate(M, M);
    // deeper floors are colder and darker
    const deep = Math.min(f, 6) * 0.06;
    for (let i = 0; i < N; i++) {
      const g = base + i;
      const [x, y] = xy(g);
      const px = x * T, py = y * T;
      const r = RD.hash(g, G.seed);
      if (G.tiles[g] === 0) {
        c.fillStyle = r < 0.5 ? P.rockA : P.rockB;
        c.fillRect(px, py, T, T);
        c.fillStyle = 'rgba(87,73,95,0.35)';
        for (let k = 0; k < 4; k++) {
          const a = RD.hash(g * 7 + k, G.seed + 3), b = RD.hash(g * 13 + k, G.seed + 5);
          c.fillRect(px + a * (T - 3), py + b * (T * 0.6), Math.max(1, T / 14), Math.max(1, T / 14));
        }
        const below = y < ROWS - 1 ? G.tiles[g + COLS] : 0;
        if (below === 1) {
          const fh = T * 0.36;
          c.fillStyle = P.rockFace;
          c.fillRect(px, py + T - fh, T, fh);
          c.fillStyle = P.rockRim;
          c.fillRect(px, py + T - fh, T, Math.max(1, T / 20));
          c.fillStyle = 'rgba(0,0,0,0.25)';
          for (let k = 1; k < 3; k++) c.fillRect(px + (k * T) / 3 + (r - 0.5) * 4, py + T - fh, 1, fh);
        }
      } else {
        c.fillStyle = r < 0.5 ? P.floorA : P.floorB;
        c.fillRect(px, py, T, T);
        c.strokeStyle = P.seam;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(px, py + T / 2 + 0.5);
        c.lineTo(px + T, py + T / 2 + 0.5);
        const off = (y % 2) * (T / 2);
        const v1 = px + ((T * 0.33 + off) % T), v2 = px + ((T * 0.8 + off) % T);
        c.moveTo(Math.round(v1) + 0.5, py);
        c.lineTo(Math.round(v1) + 0.5, py + T / 2);
        c.moveTo(Math.round(v2) + 0.5, py + T / 2);
        c.lineTo(Math.round(v2) + 0.5, py + T);
        c.stroke();
        if (r > 0.82) {
          c.fillStyle = 'rgba(79,90,59,0.45)';
          c.beginPath();
          c.ellipse(px + T * RD.hash(g, 9), py + T * 0.85, T * 0.18, T * 0.08, 0, 0, Math.PI * 2);
          c.fill();
        }
        if (r < 0.12) {
          c.strokeStyle = 'rgba(20,15,18,0.6)';
          c.beginPath();
          c.moveTo(px + T * 0.2, py + T * 0.3);
          c.lineTo(px + T * 0.45, py + T * 0.42);
          c.lineTo(px + T * 0.52, py + T * 0.7);
          c.stroke();
        }
        if (y > 0 && G.tiles[g - COLS] === 0) {
          const gr = c.createLinearGradient(0, py, 0, py + T * 0.4);
          gr.addColorStop(0, 'rgba(10,8,12,0.55)');
          gr.addColorStop(1, 'rgba(10,8,12,0)');
          c.fillStyle = gr;
          c.fillRect(px, py, T, T * 0.4);
        }
        if (x > 0 && G.tiles[g - 1] === 0) { c.fillStyle = 'rgba(10,8,12,0.3)'; c.fillRect(px, py, T * 0.12, T); }
        if (deep) { c.fillStyle = `rgba(20,24,46,${deep})`; c.fillRect(px, py, T, T); }
        const tint = RD.themeOf(G, g).tint;
        if (tint) { c.fillStyle = tint; c.fillRect(px, py, T, T); }
      }
    }
    if (f === 0) {
      // entrance: daylight spilling in
      const [ex, ey] = xy(G.entrance);
      const cx = ex * T + T / 2, cy = ey * T + T / 2;
      const gr = c.createRadialGradient(cx, cy, 0, cx, cy, T * 1.6);
      gr.addColorStop(0, 'rgba(214,226,240,0.55)');
      gr.addColorStop(1, 'rgba(214,226,240,0)');
      c.fillStyle = gr;
      c.fillRect(cx - T * 2, cy - T * 2, T * 4, T * 4);
      c.strokeStyle = 'rgba(233,224,210,0.55)';
      c.lineWidth = Math.max(1, T / 16);
      for (let k = 1; k <= 3; k++) {
        c.beginPath();
        if (ex === 0 || ex === COLS - 1) { c.moveTo(ex * T + (k * T) / 4, ey * T + T * 0.15); c.lineTo(ex * T + (k * T) / 4, ey * T + T * 0.85); }
        else { c.moveTo(ex * T + T * 0.15, ey * T + (k * T) / 4); c.lineTo(ex * T + T * 0.85, ey * T + (k * T) / 4); }
        c.stroke();
      }
    } else {
      const [ux, uy] = xy(G.gates[f]);
      stairs(c, ux * T + T / 2, uy * T + T / 2, T, true);
    }
    if (f < G.floors - 1) {
      const [dx, dy] = xy(G.stairs[f]);
      stairs(c, dx * T + T / 2, dy * T + T / 2, T, false);
    }
    // grid coordinates, like a surveyor's plan
    c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    c.fillStyle = P.ash;
    c.font = `${Math.max(9, Math.min(11, T / 3))}px "DM Mono", ui-monospace, monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let x = 0; x < COLS; x++) c.fillText(String.fromCharCode(65 + x), M + x * T + T / 2, M / 2);
    for (let y = 0; y < ROWS; y++) c.fillText(String(y + 1), M / 2, M + y * T + T / 2);
  }

  function stairs(c, cx, cy, s, up) {
    c.save();
    c.translate(cx, cy);
    c.fillStyle = up ? 'rgba(214,226,240,0.16)' : 'rgba(0,0,0,0.55)';
    c.fillRect(-s * 0.44, -s * 0.44, s * 0.88, s * 0.88);
    for (let k = 0; k < 4; k++) {
      const w = s * (0.8 - k * 0.14);
      c.fillStyle = up ? `rgba(233,224,210,${0.55 - k * 0.1})` : `rgba(87,73,95,${0.9 - k * 0.18})`;
      c.fillRect(-w / 2, -s * 0.36 + k * s * 0.18, w, s * 0.12);
    }
    c.strokeStyle = up ? P.bone : P.gold;
    c.lineWidth = Math.max(1, s / 14);
    c.beginPath();
    if (up) { c.moveTo(-s * 0.12, -s * 0.18); c.lineTo(0, -s * 0.32); c.lineTo(s * 0.12, -s * 0.18); }
    else { c.moveTo(-s * 0.12, s * 0.18); c.lineTo(0, s * 0.32); c.lineTo(s * 0.12, s * 0.18); }
    c.stroke();
    c.restore();
  }

  // ---------------------------------------------------------------- glyphs (also used for palette icons)
  RD.glyph = function (c, type, cx, cy, s, o) {
    o = o || {};
    const t = V.time;
    c.save();
    c.translate(cx, cy);
    const lw = Math.max(1, s / 18);
    c.lineWidth = lw;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (o.alpha != null) c.globalAlpha = o.alpha;
    const d = RD.ITEMS[type];
    if (d && d.boss) aura(c, s, RD.TIER_COLOR[d.tier], t);
    const eyes = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(-x, y, r, 0, Math.PI * 2); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
    switch (type) {
      // ------------------------------------------------ traps
      case 'spikes': {
        c.fillStyle = '#17121a';
        rr(c, -s * 0.36, -s * 0.36, s * 0.72, s * 0.72, s * 0.08);
        c.fill();
        c.fillStyle = o.off ? P.iron : P.bone;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const x = -s * 0.22 + i * s * 0.22, y = -s * 0.16 + j * s * 0.2;
          c.beginPath(); c.moveTo(x - s * 0.06, y + s * 0.07); c.lineTo(x, y - s * 0.09); c.lineTo(x + s * 0.06, y + s * 0.07); c.fill();
        }
        break;
      }
      case 'snare': {
        c.strokeStyle = o.off ? P.iron : '#a59cad';
        c.lineWidth = lw * 1.6;
        c.beginPath(); c.arc(0, s * 0.02, s * 0.28, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
        c.beginPath(); c.arc(0, -s * 0.02, s * 0.28, Math.PI * 0.05, Math.PI * 0.95); c.stroke();
        c.fillStyle = o.off ? P.iron : P.bone;
        for (let k = -2; k <= 2; k++) {
          const x = k * s * 0.1;
          c.beginPath(); c.moveTo(x - s * 0.04, -s * 0.2); c.lineTo(x, -s * 0.08); c.lineTo(x + s * 0.04, -s * 0.2); c.fill();
          c.beginPath(); c.moveTo(x - s * 0.04, s * 0.2); c.lineTo(x, s * 0.08); c.lineTo(x + s * 0.04, s * 0.2); c.fill();
        }
        c.fillStyle = '#5b5562'; c.beginPath(); c.arc(0, 0, s * 0.05, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'rune': {
        c.strokeStyle = o.off ? P.iron : P.fire;
        c.shadowColor = P.fire;
        c.shadowBlur = o.off ? 0 : s * 0.25 * (0.6 + 0.4 * Math.sin(t * 3));
        c.beginPath(); c.arc(0, 0, s * 0.3, 0, Math.PI * 2); c.stroke();
        c.beginPath();
        for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k * Math.PI * 2) / 3; c[k ? 'lineTo' : 'moveTo'](Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3); }
        c.closePath(); c.stroke();
        c.beginPath(); c.moveTo(0, -s * 0.12); c.lineTo(0, s * 0.1); c.stroke();
        break;
      }
      case 'chasm': case 'abyss': {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, s * 0.42);
        g.addColorStop(0, '#000');
        g.addColorStop(0.7, type === 'abyss' ? 'rgba(40,10,50,0.92)' : 'rgba(15,10,20,0.9)');
        g.addColorStop(1, 'rgba(15,10,20,0)');
        c.fillStyle = g;
        c.fillRect(-s / 2, -s / 2, s, s);
        c.strokeStyle = P.violet;
        if (type === 'abyss') {
          c.globalAlpha *= 0.85;
          c.beginPath();
          for (let a = 0; a < Math.PI * 4; a += 0.25) { const r = (a / (Math.PI * 4)) * s * 0.36; c.lineTo(Math.cos(a - t * 2) * r, Math.sin(a - t * 2) * r); }
          c.stroke();
        } else {
          c.setLineDash([s * 0.08, s * 0.08]);
          c.globalAlpha *= 0.7;
          rr(c, -s * 0.38, -s * 0.38, s * 0.76, s * 0.76, s * 0.1);
          c.stroke();
        }
        break;
      }
      case 'crusher': {
        c.fillStyle = '#17121a';
        c.fillRect(-s * 0.36, -s * 0.36, s * 0.72, s * 0.72);
        c.fillStyle = o.off ? P.iron : '#6d6474';
        rr(c, -s * 0.3, -s * 0.3, s * 0.6, s * 0.6, s * 0.04);
        c.fill();
        c.strokeStyle = '#2a2430';
        c.beginPath(); c.moveTo(-s * 0.3, -s * 0.1); c.lineTo(s * 0.3, -s * 0.1); c.moveTo(-s * 0.3, s * 0.1); c.lineTo(s * 0.3, s * 0.1); c.stroke();
        c.strokeStyle = o.off ? P.iron : P.maliceHi;
        c.lineWidth = lw * 1.4;
        c.beginPath(); c.moveTo(-s * 0.1, -s * 0.2); c.lineTo(0, -s * 0.06); c.lineTo(s * 0.1, -s * 0.2); c.stroke();
        break;
      }
      case 'vent': {
        c.fillStyle = '#1b1a17';
        rr(c, -s * 0.32, -s * 0.26, s * 0.64, s * 0.52, s * 0.06);
        c.fill();
        c.strokeStyle = o.off ? P.iron : P.venom;
        for (let k = 0; k < 4; k++) { const y = -s * 0.17 + k * s * 0.115; c.beginPath(); c.moveTo(-s * 0.24, y); c.lineTo(s * 0.24, y); c.stroke(); }
        break;
      }
      case 'maze': {
        c.strokeStyle = o.off ? P.iron : P.violet;
        c.beginPath();
        for (let a = 0; a < Math.PI * 5; a += 0.2) { const r = (a / (Math.PI * 5)) * s * 0.32; c.lineTo(Math.cos(a + t) * r, Math.sin(a + t) * r); }
        c.stroke();
        break;
      }
      case 'frost': {
        c.strokeStyle = o.off ? P.iron : P.frost;
        c.shadowColor = P.steel;
        c.shadowBlur = o.off ? 0 : s * 0.2;
        c.lineWidth = lw * 1.3;
        for (let k = 0; k < 3; k++) {
          c.save(); c.rotate((k * Math.PI) / 3);
          c.beginPath(); c.moveTo(0, -s * 0.32); c.lineTo(0, s * 0.32);
          c.moveTo(-s * 0.08, -s * 0.24); c.lineTo(0, -s * 0.16); c.lineTo(s * 0.08, -s * 0.24);
          c.moveTo(-s * 0.08, s * 0.24); c.lineTo(0, s * 0.16); c.lineTo(s * 0.08, s * 0.24);
          c.stroke(); c.restore();
        }
        break;
      }
      case 'siphon': {
        c.strokeStyle = o.off ? P.iron : P.maliceHi;
        c.shadowColor = P.malice;
        c.shadowBlur = o.off ? 0 : s * 0.3 * (0.6 + 0.4 * Math.sin(t * 4));
        c.beginPath(); c.ellipse(0, 0, s * 0.32, s * 0.18, 0, 0, Math.PI * 2); c.stroke();
        c.fillStyle = o.off ? P.iron : P.malice;
        c.beginPath(); c.arc(0, 0, s * 0.1, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#120a10';
        c.fillRect(-s * 0.015, -s * 0.08, s * 0.03, s * 0.16);
        break;
      }
      // ------------------------------------------------ obstacles and wall pieces
      case 'door': case 'vault': {
        if (o.broken) {
          c.strokeStyle = P.iron;
          c.lineWidth = lw * 2;
          c.beginPath(); c.moveTo(-s * 0.35, s * 0.2); c.lineTo(-s * 0.05, -s * 0.05); c.moveTo(s * 0.35, -s * 0.2); c.lineTo(s * 0.08, s * 0.12); c.stroke();
          break;
        }
        const vault = type === 'vault';
        c.fillStyle = vault ? '#2b2440' : '#3c3742';
        rr(c, -s * 0.4, -s * 0.42, s * 0.8, s * 0.84, s * 0.06);
        c.fill();
        c.strokeStyle = vault ? P.violet : '#7a7383';
        c.lineWidth = lw * 1.5;
        if (vault) {
          c.shadowColor = P.violet;
          c.shadowBlur = s * 0.2;
          c.beginPath(); c.arc(0, 0, s * 0.2, 0, Math.PI * 2); c.stroke();
          c.beginPath(); c.moveTo(0, -s * 0.2); c.lineTo(0, s * 0.2); c.moveTo(-s * 0.2, 0); c.lineTo(s * 0.2, 0); c.stroke();
          c.shadowBlur = 0;
        } else {
          for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(k * s * 0.22, -s * 0.38); c.lineTo(k * s * 0.22, s * 0.38); c.stroke(); }
          c.beginPath(); c.moveTo(-s * 0.38, 0); c.lineTo(s * 0.38, 0); c.stroke();
          c.fillStyle = P.gold;
          c.beginPath(); c.arc(s * 0.3, s * 0.12, s * 0.05, 0, Math.PI * 2); c.fill();
        }
        if (o.hp != null && o.hp < 1) bar(c, -s * 0.4, -s * 0.5, s * 0.8, o.hp, P.ash);
        break;
      }
      case 'darts': {
        const a = o.dir != null ? o.dir : 0;
        c.rotate(a);
        c.fillStyle = '#0e0b10';
        rr(c, s * 0.12, -s * 0.2, s * 0.26, s * 0.4, s * 0.05);
        c.fill();
        c.strokeStyle = P.bone;
        c.beginPath(); c.moveTo(s * 0.18, 0); c.lineTo(s * 0.46, 0); c.stroke();
        c.fillStyle = P.bone;
        c.beginPath(); c.moveTo(s * 0.5, 0); c.lineTo(s * 0.4, -s * 0.07); c.lineTo(s * 0.4, s * 0.07); c.fill();
        break;
      }
      case 'pylon': {
        if (o.off) c.globalAlpha *= 0.4; // jammed
        c.fillStyle = '#20283a';
        c.beginPath(); c.moveTo(0, -s * 0.38); c.lineTo(s * 0.2, 0); c.lineTo(0, s * 0.38); c.lineTo(-s * 0.2, 0); c.closePath(); c.fill();
        c.strokeStyle = '#bfe0ff';
        c.shadowColor = '#bfe0ff';
        c.shadowBlur = s * 0.25 * (0.5 + 0.5 * Math.sin(t * 6));
        c.stroke();
        c.beginPath(); c.moveTo(-s * 0.04, -s * 0.18); c.lineTo(s * 0.06, -s * 0.02); c.lineTo(-s * 0.06, s * 0.02); c.lineTo(s * 0.04, s * 0.18); c.stroke();
        break;
      }
      // ------------------------------------------------ monsters
      case 'goblin': case 'imp': case 'goblinking': {
        const imp = type === 'imp';
        const k = s * (type === 'goblinking' ? 1.05 : 0.85);
        const skin = imp ? '#b8402f' : '#6f9a4a';
        c.fillStyle = skin;
        c.beginPath(); c.moveTo(-k * 0.42, -k * 0.12); c.lineTo(-k * 0.18, -k * 0.02); c.lineTo(-k * 0.2, -k * 0.16); c.fill();
        c.beginPath(); c.moveTo(k * 0.42, -k * 0.12); c.lineTo(k * 0.18, -k * 0.02); c.lineTo(k * 0.2, -k * 0.16); c.fill();
        c.beginPath(); c.arc(0, 0, k * 0.22, 0, Math.PI * 2); c.fill();
        if (imp) { c.fillStyle = '#2a0f0c'; c.beginPath(); c.moveTo(-k * 0.14, -k * 0.16); c.lineTo(-k * 0.2, -k * 0.36); c.lineTo(-k * 0.05, -k * 0.2); c.moveTo(k * 0.14, -k * 0.16); c.lineTo(k * 0.2, -k * 0.36); c.lineTo(k * 0.05, -k * 0.2); c.fill(); }
        eyes(k * 0.08, -k * 0.03, k * 0.04, imp ? P.gold : '#ff4d3d');
        c.fillStyle = '#1d1414'; c.fillRect(-k * 0.08, k * 0.09, k * 0.16, k * 0.03);
        if (type === 'goblinking') {
          c.fillStyle = P.gold;
          c.beginPath(); c.moveTo(-k * 0.2, -k * 0.2); c.lineTo(-k * 0.2, -k * 0.38); c.lineTo(-k * 0.1, -k * 0.28); c.lineTo(0, -k * 0.42); c.lineTo(k * 0.1, -k * 0.28); c.lineTo(k * 0.2, -k * 0.38); c.lineTo(k * 0.2, -k * 0.2); c.closePath(); c.fill();
        }
        break;
      }
      case 'skeleton': case 'lich': {
        const lich = type === 'lich';
        const k = s * (lich ? 1.05 : 0.9);
        if (lich) {
          c.fillStyle = '#2a1d3a';
          c.beginPath(); c.moveTo(-k * 0.36, k * 0.36); c.quadraticCurveTo(-k * 0.34, -k * 0.42, 0, -k * 0.42); c.quadraticCurveTo(k * 0.34, -k * 0.42, k * 0.36, k * 0.36); c.closePath(); c.fill();
        }
        c.fillStyle = P.bone;
        c.beginPath(); c.arc(0, -k * 0.06, k * 0.22, 0, Math.PI * 2); c.fill();
        rr(c, -k * 0.13, k * 0.08, k * 0.26, k * 0.17, k * 0.04); c.fill();
        eyes(k * 0.09, -k * 0.07, k * 0.065, lich ? P.violet : '#1a141d');
        c.fillStyle = '#1a141d';
        c.fillRect(-k * 0.01, k * 0.02, k * 0.02, k * 0.05);
        for (let i = -1; i <= 1; i++) c.fillRect(i * k * 0.06 - k * 0.008, k * 0.13, k * 0.016, k * 0.1);
        if (lich) { c.fillStyle = P.gold; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * k * 0.1 - k * 0.04, -k * 0.24); c.lineTo(i * k * 0.1, -k * 0.36); c.lineTo(i * k * 0.1 + k * 0.04, -k * 0.24); c.fill(); } }
        break;
      }
      case 'brute': case 'troll': case 'behemoth': {
        const k = s * (type === 'behemoth' ? 1.25 : 1.05);
        c.fillStyle = type === 'troll' ? '#5f7360' : type === 'behemoth' ? '#4a3a33' : '#7a3a35';
        c.beginPath(); c.ellipse(0, k * 0.04, k * 0.36, k * 0.3, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#d8cbb3';
        if (type === 'troll') {
          c.beginPath(); c.moveTo(-k * 0.1, k * 0.12); c.lineTo(-k * 0.06, -k * 0.02); c.lineTo(-k * 0.02, k * 0.12); c.fill();
          c.beginPath(); c.moveTo(k * 0.1, k * 0.12); c.lineTo(k * 0.06, -k * 0.02); c.lineTo(k * 0.02, k * 0.12); c.fill();
        } else {
          c.beginPath(); c.moveTo(-k * 0.26, -k * 0.14); c.quadraticCurveTo(-k * 0.42, -k * 0.38, -k * 0.2, -k * 0.36); c.lineTo(-k * 0.16, -k * 0.2); c.fill();
          c.beginPath(); c.moveTo(k * 0.26, -k * 0.14); c.quadraticCurveTo(k * 0.42, -k * 0.38, k * 0.2, -k * 0.36); c.lineTo(k * 0.16, -k * 0.2); c.fill();
        }
        eyes(k * 0.1, -k * 0.02, k * 0.04, type === 'troll' ? '#e3e36a' : P.fire);
        c.strokeStyle = '#2a1816';
        c.beginPath(); c.moveTo(-k * 0.12, k * 0.16); c.lineTo(k * 0.12, k * 0.16); c.stroke();
        break;
      }
      case 'slime': {
        const w = 1 + Math.sin(t * 4 + cx) * 0.06;
        c.fillStyle = 'rgba(134,192,106,0.82)';
        c.beginPath();
        c.moveTo(-s * 0.32 * w, s * 0.22);
        c.quadraticCurveTo(-s * 0.36 * w, -s * 0.28 / w, 0, -s * 0.28 / w);
        c.quadraticCurveTo(s * 0.36 * w, -s * 0.28 / w, s * 0.32 * w, s * 0.22);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(233,240,220,0.7)';
        c.beginPath(); c.ellipse(-s * 0.1, -s * 0.1, s * 0.06, s * 0.04, -0.5, 0, Math.PI * 2); c.fill();
        eyes(s * 0.07, s * 0.02, s * 0.03, '#1d2a18');
        break;
      }
      case 'spider': {
        c.strokeStyle = '#2b2230';
        c.lineWidth = lw * 1.6;
        for (let k = 0; k < 4; k++) {
          const a = -0.9 + k * 0.6 + Math.sin(t * 8 + k) * 0.05;
          c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.3); c.stroke();
          c.beginPath(); c.moveTo(0, 0); c.lineTo(-Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.3); c.stroke();
        }
        c.fillStyle = '#3d2f45';
        c.beginPath(); c.ellipse(0, s * 0.06, s * 0.16, s * 0.18, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(0, -s * 0.12, s * 0.1, 0, Math.PI * 2); c.fill();
        eyes(s * 0.04, -s * 0.13, s * 0.025, '#ff4d3d');
        break;
      }
      case 'wraith': {
        const b = Math.sin(t * 3) * s * 0.03;
        c.fillStyle = 'rgba(179,139,224,0.55)';
        c.beginPath();
        c.moveTo(-s * 0.26, s * 0.3 + b);
        c.quadraticCurveTo(-s * 0.3, -s * 0.36, 0, -s * 0.36);
        c.quadraticCurveTo(s * 0.3, -s * 0.36, s * 0.26, s * 0.3 + b);
        for (let k = 0; k < 4; k++) c.lineTo(s * 0.26 - (k + 0.5) * s * 0.13, s * (k % 2 ? 0.3 : 0.18) + b);
        c.closePath(); c.fill();
        c.fillStyle = '#120a1a';
        c.beginPath(); c.ellipse(0, -s * 0.1, s * 0.14, s * 0.12, 0, 0, Math.PI * 2); c.fill();
        eyes(s * 0.06, -s * 0.1, s * 0.03, P.frost);
        break;
      }
      case 'wyvern': case 'dragon': {
        const k = s * (type === 'dragon' ? 1.15 : 0.95);
        const col = type === 'dragon' ? '#a8322a' : '#b8742c';
        const flap = Math.sin(t * (type === 'dragon' ? 3 : 6)) * 0.15;
        c.fillStyle = col;
        c.globalAlpha *= 0.9;
        c.beginPath(); c.moveTo(-k * 0.06, 0); c.lineTo(-k * 0.46, -k * (0.28 + flap)); c.lineTo(-k * 0.36, k * 0.06); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(k * 0.06, 0); c.lineTo(k * 0.46, -k * (0.28 + flap)); c.lineTo(k * 0.36, k * 0.06); c.closePath(); c.fill();
        c.globalAlpha = o.alpha != null ? o.alpha : 1;
        c.beginPath(); c.ellipse(0, k * 0.06, k * 0.14, k * 0.24, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(0, -k * 0.2, k * 0.12, 0, Math.PI * 2); c.fill();
        eyes(k * 0.05, -k * 0.22, k * 0.025, P.gold);
        if (type === 'dragon') { c.fillStyle = '#e9e0d2'; c.beginPath(); c.moveTo(-k * 0.08, -k * 0.28); c.lineTo(-k * 0.14, -k * 0.42); c.lineTo(-k * 0.02, -k * 0.3); c.moveTo(k * 0.08, -k * 0.28); c.lineTo(k * 0.14, -k * 0.42); c.lineTo(k * 0.02, -k * 0.3); c.fill(); }
        break;
      }
      case 'golem': {
        const k = s * 1.1;
        c.fillStyle = '#5e5a66';
        rr(c, -k * 0.3, -k * 0.3, k * 0.6, k * 0.62, k * 0.06); c.fill();
        c.fillStyle = '#4a4652';
        c.fillRect(-k * 0.42, -k * 0.18, k * 0.12, k * 0.36);
        c.fillRect(k * 0.3, -k * 0.18, k * 0.12, k * 0.36);
        c.strokeStyle = '#7fe0d8';
        c.shadowColor = '#7fe0d8';
        c.shadowBlur = k * 0.2;
        c.beginPath(); c.moveTo(-k * 0.1, -k * 0.05); c.lineTo(0, k * 0.12); c.lineTo(k * 0.1, -k * 0.05); c.stroke();
        c.fillStyle = '#7fe0d8';
        c.fillRect(-k * 0.14, -k * 0.2, k * 0.08, k * 0.05);
        c.fillRect(k * 0.06, -k * 0.2, k * 0.08, k * 0.05);
        break;
      }
      case 'hydra': {
        const k = s * 1.15;
        c.fillStyle = '#2f7a6a';
        c.beginPath(); c.ellipse(0, k * 0.16, k * 0.3, k * 0.18, 0, 0, Math.PI * 2); c.fill();
        for (let i = -1; i <= 1; i++) {
          const sway = Math.sin(t * 3 + i * 1.7) * k * 0.05;
          const hx = i * k * 0.24 + sway, hy = -k * 0.28 + Math.abs(i) * k * 0.08;
          c.strokeStyle = '#2f7a6a';
          c.lineWidth = k * 0.09;
          c.beginPath(); c.moveTo(i * k * 0.1, k * 0.06); c.quadraticCurveTo(i * k * 0.2, -k * 0.05, hx, hy); c.stroke();
          c.fillStyle = '#3c9a86';
          c.beginPath(); c.arc(hx, hy, k * 0.08, 0, Math.PI * 2); c.fill();
          c.fillStyle = P.gold;
          c.beginPath(); c.arc(hx + k * 0.03, hy - k * 0.01, k * 0.018, 0, Math.PI * 2); c.fill();
        }
        break;
      }
      case 'demonlord': {
        const k = s * 1.25;
        const flick = 0.7 + 0.3 * Math.sin(t * 7);
        c.fillStyle = `rgba(255,80,40,${0.25 * flick})`;
        c.beginPath(); c.arc(0, 0, k * 0.46, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#1a0a0e';
        c.beginPath(); c.moveTo(-k * 0.32, k * 0.34); c.lineTo(-k * 0.22, -k * 0.1); c.lineTo(k * 0.22, -k * 0.1); c.lineTo(k * 0.32, k * 0.34); c.closePath(); c.fill();
        c.beginPath(); c.arc(0, -k * 0.14, k * 0.16, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#3a1418';
        c.beginPath(); c.moveTo(-k * 0.1, -k * 0.24); c.quadraticCurveTo(-k * 0.36, -k * 0.34, -k * 0.3, -k * 0.5); c.quadraticCurveTo(-k * 0.24, -k * 0.34, -k * 0.04, -k * 0.28); c.fill();
        c.beginPath(); c.moveTo(k * 0.1, -k * 0.24); c.quadraticCurveTo(k * 0.36, -k * 0.34, k * 0.3, -k * 0.5); c.quadraticCurveTo(k * 0.24, -k * 0.34, k * 0.04, -k * 0.28); c.fill();
        eyes(k * 0.06, -k * 0.15, k * 0.03, `rgba(255,90,40,${flick})`);
        break;
      }
      // ------------------------------------------------ new traps
      case 'poison': {
        c.fillStyle = '#17121a'; rr(c, -s * 0.3, -s * 0.3, s * 0.6, s * 0.6, s * 0.06); c.fill();
        c.strokeStyle = o.off ? P.iron : P.venom; c.lineWidth = lw * 1.2;
        for (const [x, y] of [[-0.12, -0.1], [0.1, 0.06], [-0.04, 0.14], [0.14, -0.14]]) { c.beginPath(); c.moveTo(x * s, y * s + s * 0.06); c.lineTo(x * s, y * s - s * 0.08); c.stroke(); }
        c.fillStyle = o.off ? P.iron : P.venom; c.beginPath(); c.arc(0, 0, s * 0.05, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'alarm': {
        c.fillStyle = o.off ? P.iron : P.gold;
        c.beginPath(); c.moveTo(-s * 0.22, s * 0.16); c.quadraticCurveTo(-s * 0.22, -s * 0.28, 0, -s * 0.28); c.quadraticCurveTo(s * 0.22, -s * 0.28, s * 0.22, s * 0.16); c.closePath(); c.fill();
        c.fillRect(-s * 0.28, s * 0.14, s * 0.56, s * 0.06);
        c.fillStyle = '#3a2a10'; c.beginPath(); c.arc(0, s * 0.24, s * 0.05, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'cage': {
        c.strokeStyle = o.off ? P.iron : '#a59cad'; c.lineWidth = lw * 1.4;
        rr(c, -s * 0.32, -s * 0.32, s * 0.64, s * 0.64, s * 0.04); c.stroke();
        for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(k * s * 0.16, -s * 0.32); c.lineTo(k * s * 0.16, s * 0.32); c.stroke(); }
        break;
      }
      case 'teleport': {
        c.strokeStyle = o.off ? P.iron : '#c9a8ff'; c.shadowColor = '#b38be0'; c.shadowBlur = o.off ? 0 : s * 0.25;
        c.beginPath(); c.arc(0, 0, s * 0.32, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(0, 0, s * 0.18, t * 2, t * 2 + Math.PI * 1.4); c.stroke();
        for (let k = 0; k < 4; k++) { const a = t + (k * Math.PI) / 2; c.beginPath(); c.arc(Math.cos(a) * s * 0.32, Math.sin(a) * s * 0.32, s * 0.035, 0, Math.PI * 2); c.stroke(); }
        break;
      }
      case 'boulder': {
        c.fillStyle = o.off ? P.iron : '#6d6474'; c.beginPath(); c.arc(0, 0, s * 0.3, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#2a2430'; c.beginPath(); c.arc(-s * 0.06, -s * 0.06, s * 0.14, 0.4, 2.2); c.stroke();
        c.beginPath(); c.moveTo(s * 0.08, s * 0.06); c.lineTo(s * 0.18, s * 0.16); c.stroke();
        break;
      }
      case 'gravity': {
        const g2 = c.createRadialGradient(0, 0, 0, 0, 0, s * 0.4);
        g2.addColorStop(0, o.off ? 'rgba(80,80,90,0.6)' : 'rgba(40,10,70,0.95)'); g2.addColorStop(1, 'rgba(40,10,70,0)');
        c.fillStyle = g2; c.beginPath(); c.arc(0, 0, s * 0.4, 0, Math.PI * 2); c.fill();
        c.strokeStyle = o.off ? P.iron : '#7a5ab8';
        for (let k = 1; k <= 3; k++) { c.beginPath(); c.arc(0, 0, s * 0.1 * k + (t * 0.05 % 0.1) * s, 0, Math.PI * 2); c.stroke(); }
        break;
      }
      // ------------------------------------------------ new monsters (one shared creature shape, configured per kind)
      case 'kobold': critter(c, s * 0.72, { body: '#8a6a3a', eye: '#ffd34d', ears: 'pointy', snout: true }); break;
      case 'orc': critter(c, s * 0.95, { body: '#5f7a3a', eye: '#ff4d3d', tusks: true }); break;
      case 'lizardman': critter(c, s * 0.9, { body: '#3f7a62', eye: '#e3e36a', snout: true, spear: true }); break;
      case 'harpy': critter(c, s * 0.85, { body: '#a07850', eye: '#ffd34d', wings: '#8a5a3a', flap: t * 8 }); break;
      case 'gargoyle': critter(c, s * 1, { body: o.awake ? '#6d6878' : '#7d7880', eye: o.awake ? '#ff4d3d' : '#55505a', horns: '#4a4652', wings: '#55505a', flap: o.awake ? t * 5 : 0 }); break;
      case 'minotaur': critter(c, s * 1.05, { body: '#7a4a35', eye: '#ff4d3d', horns: '#e9e0d2', ring: P.gold }); break;
      case 'basilisk': critter(c, s * 1.05, { body: '#4a6a4a', eye: '#ffdf3d', snout: true, crest: '#a83a3a' }); break;
      case 'vampire': critter(c, s * 0.95, { body: '#2a1a2e', face: '#e8dfe8', eye: '#ff2d4d', cape: '#7a1a2a' }); break;
      case 'dullahan': critter(c, s * 1.1, { body: '#2b2a36', headless: true, eye: '#5af0ff', cape: '#1a1a26' }); break;
      case 'chimera': critter(c, s * 1.15, { body: '#a8742c', eye: '#ffd34d', mane: '#7a4a1c', horns: '#d8cbb3', wings: '#7a4a1c', flap: t * 3 }); break;
      case 'orcwarlord': critter(c, s * 1.15, { body: '#4f6a2a', eye: '#ff4d3d', tusks: true, crown: true }); break;
      case 'minotaurking': critter(c, s * 1.2, { body: '#6a3a28', eye: '#ff4d3d', horns: '#ffe6a3', crown: true }); break;
      case 'vampirelord': critter(c, s * 1.15, { body: '#1a0e1e', face: '#f0e6f0', eye: '#ff2d4d', cape: '#9a1a2a', crown: true, wings: '#2a0e1e', flap: t * 2 }); break;
      // ------------------------------------------------ hordes, rooms and the seal
      case 'warren': case 'warband': case 'nest': {
        c.fillStyle = '#17121a'; c.beginPath(); c.ellipse(0, s * 0.12, s * 0.36, s * 0.2, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = type === 'nest' ? '#a07850' : '#6d5a3a'; c.lineWidth = lw * 1.4;
        for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(0, s * 0.12, s * (0.2 + 0.04 * k), Math.PI * 1.05, Math.PI * 1.95); c.stroke(); }
        const pk = RD.ITEMS[type].pack;
        RD.glyph(c, pk, -s * 0.14, -s * 0.06, s * 0.5, { awake: true });
        RD.glyph(c, pk, s * 0.16, -s * 0.1, s * 0.5, { awake: true });
        break;
      }
      case 'banner': {
        c.strokeStyle = P.bone; c.lineWidth = lw * 1.4; c.beginPath(); c.moveTo(-s * 0.2, s * 0.36); c.lineTo(-s * 0.2, -s * 0.36); c.stroke();
        c.fillStyle = P.malice; c.beginPath(); c.moveTo(-s * 0.18, -s * 0.34); c.lineTo(s * 0.28, -s * 0.24 + Math.sin(t * 4) * s * 0.03); c.lineTo(s * 0.16, -s * 0.08); c.lineTo(s * 0.28, s * 0.06 + Math.sin(t * 4 + 1) * s * 0.03); c.lineTo(-s * 0.18, -s * 0.02); c.closePath(); c.fill();
        c.fillStyle = P.bone; c.beginPath(); c.arc(s * 0.04, -s * 0.17, s * 0.06, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'sigil': {
        c.strokeStyle = P.gold; c.shadowColor = P.gold; c.shadowBlur = s * 0.15;
        c.beginPath(); for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3 + t * 0.5; c[k ? 'lineTo' : 'moveTo'](Math.cos(a) * s * 0.32, Math.sin(a) * s * 0.32); } c.closePath(); c.stroke();
        c.beginPath(); c.arc(0, 0, s * 0.12, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(-s * 0.08, 0); c.lineTo(s * 0.08, 0); c.moveTo(0, -s * 0.08); c.lineTo(0, s * 0.08); c.stroke();
        break;
      }
      case 'seal': {
        c.fillStyle = 'rgba(196,60,104,0.18)'; c.beginPath(); c.arc(0, 0, s * 0.42, 0, Math.PI * 2); c.fill();
        c.strokeStyle = P.maliceHi; c.lineWidth = lw * 1.6; c.shadowColor = P.malice; c.shadowBlur = s * 0.2 * (0.6 + 0.4 * Math.sin(t * 3));
        c.beginPath(); c.arc(0, 0, s * 0.32, 0, Math.PI * 2); c.stroke();
        c.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5; c[k ? 'lineTo' : 'moveTo'](Math.cos(a) * s * 0.28, Math.sin(a) * s * 0.28); } c.closePath(); c.stroke();
        break;
      }
      case 'mimic': {
        const open = o.awake ? 0.5 + 0.3 * Math.sin(t * 10) : 0;
        c.fillStyle = '#6b4424';
        rr(c, -s * 0.32, -s * 0.06, s * 0.64, s * 0.32, s * 0.04);
        c.fill();
        c.save();
        c.translate(0, -s * 0.06);
        c.rotate(-open * 0.6);
        c.fillStyle = '#7d5230';
        rr(c, -s * 0.32, -s * 0.2, s * 0.64, s * 0.2, s * 0.08);
        c.fill();
        c.fillStyle = P.gold;
        c.fillRect(-s * 0.05, -s * 0.2, s * 0.1, s * 0.2);
        c.restore();
        c.fillStyle = P.gold;
        c.fillRect(-s * 0.32, s * 0.04, s * 0.64, s * 0.04);
        if (o.awake) {
          c.fillStyle = P.bone;
          for (let i = 0; i < 5; i++) { const x = -s * 0.26 + i * s * 0.13; c.beginPath(); c.moveTo(x, -s * 0.06); c.lineTo(x + s * 0.05, s * 0.04); c.lineTo(x + s * 0.1, -s * 0.06); c.fill(); }
          c.fillStyle = P.maliceHi;
          c.fillRect(-s * 0.2, -s * 0.04, s * 0.4, s * 0.03);
        }
        break;
      }
      // ------------------------------------------------ tools and powers
      case 'inspect': {
        c.strokeStyle = P.steel; c.lineWidth = lw * 1.6;
        c.beginPath(); c.arc(-s * 0.06, -s * 0.06, s * 0.2, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(s * 0.09, s * 0.09); c.lineTo(s * 0.3, s * 0.3); c.stroke();
        c.fillStyle = P.steel; c.font = `700 ${s * 0.22}px "Alegreya Sans", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('i', -s * 0.06, -s * 0.05);
        break;
      }
      case 'dig': {
        c.strokeStyle = P.bone;
        c.lineWidth = lw * 1.6;
        c.beginPath(); c.moveTo(-s * 0.25, s * 0.28); c.lineTo(s * 0.18, -s * 0.15); c.stroke();
        c.beginPath(); c.moveTo(-s * 0.05, -s * 0.33); c.quadraticCurveTo(s * 0.25, -s * 0.3, s * 0.33, -s * 0.02); c.stroke();
        break;
      }
      case 'fill': {
        c.fillStyle = P.rockFace;
        for (const [x, y, r] of [[-0.14, 0.12, 0.17], [0.14, 0.12, 0.15], [0, -0.13, 0.16]]) { c.beginPath(); c.arc(x * s, y * s, r * s, 0, Math.PI * 2); c.fill(); }
        c.strokeStyle = P.rockRim;
        c.stroke();
        break;
      }
      case 'move': {
        c.strokeStyle = P.bone;
        c.lineWidth = lw * 1.4;
        for (let k = 0; k < 4; k++) {
          c.save(); c.rotate((k * Math.PI) / 2);
          c.beginPath(); c.moveTo(0, -s * 0.1); c.lineTo(0, -s * 0.34); c.moveTo(-s * 0.08, -s * 0.26); c.lineTo(0, -s * 0.34); c.lineTo(s * 0.08, -s * 0.26); c.stroke();
          c.restore();
        }
        break;
      }
      case 'upgrade': {
        c.strokeStyle = P.gold;
        c.lineWidth = lw * 1.6;
        for (const y of [0.02, -0.16]) { c.beginPath(); c.moveTo(-s * 0.22, (y + 0.16) * s); c.lineTo(0, (y - 0.06) * s); c.lineTo(s * 0.22, (y + 0.16) * s); c.stroke(); }
        break;
      }
      case 'sell': {
        c.strokeStyle = P.maliceHi;
        c.lineWidth = lw * 1.6;
        c.beginPath(); c.moveTo(-s * 0.2, -s * 0.2); c.lineTo(s * 0.2, s * 0.2); c.moveTo(s * 0.2, -s * 0.2); c.lineTo(-s * 0.2, s * 0.2); c.stroke();
        break;
      }
      case 'hoard':
        coins(c, s, 100);
        break;
      case 'tremor': {
        c.strokeStyle = P.maliceHi;
        c.lineWidth = lw * 1.5;
        c.beginPath(); c.moveTo(-s * 0.35, 0); c.lineTo(-s * 0.18, -s * 0.2); c.lineTo(-s * 0.02, s * 0.18); c.lineTo(s * 0.14, -s * 0.22); c.lineTo(s * 0.35, 0.05 * s); c.stroke();
        break;
      }
      case 'lure': coins(c, s, 40); c.strokeStyle = 'rgba(179,139,224,0.8)'; c.setLineDash([s * 0.06, s * 0.06]); c.beginPath(); c.arc(0, 0, s * 0.34, 0, Math.PI * 2); c.stroke(); break;
      case 'collapse': {
        c.fillStyle = P.rockFace;
        for (const [x, y, r] of [[-0.18, 0.18, 0.13], [0.06, 0.2, 0.15], [0.22, 0.1, 0.1], [-0.04, -0.02, 0.12]]) { c.beginPath(); c.arc(x * s, y * s, r * s, 0, Math.PI * 2); c.fill(); }
        c.strokeStyle = P.bone; c.lineWidth = lw * 1.4;
        c.beginPath(); c.moveTo(-s * 0.1, -s * 0.36); c.lineTo(-s * 0.1, -s * 0.18); c.moveTo(s * 0.12, -s * 0.4); c.lineTo(s * 0.12, -s * 0.2); c.stroke();
        break;
      }
      case 'frenzy': {
        c.fillStyle = P.malice;
        c.beginPath(); c.moveTo(0, -s * 0.34); c.quadraticCurveTo(s * 0.3, -s * 0.02, 0, s * 0.32); c.quadraticCurveTo(-s * 0.3, -s * 0.02, 0, -s * 0.34); c.fill();
        c.fillStyle = P.maliceHi; c.beginPath(); c.arc(-s * 0.06, s * 0.06, s * 0.07, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'raise': {
        c.fillStyle = P.bone;
        c.beginPath(); c.arc(0, -s * 0.12, s * 0.16, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#1a141d'; c.beginPath(); c.arc(-s * 0.06, -s * 0.13, s * 0.04, 0, Math.PI * 2); c.arc(s * 0.06, -s * 0.13, s * 0.04, 0, Math.PI * 2); c.fill();
        c.strokeStyle = P.rockRim; c.lineWidth = lw * 1.6; c.beginPath(); c.moveTo(-s * 0.36, s * 0.22); c.lineTo(s * 0.36, s * 0.22); c.stroke();
        c.strokeStyle = P.bone; c.lineWidth = lw * 1.2; c.beginPath(); c.moveTo(-s * 0.2, s * 0.2); c.lineTo(-s * 0.26, s * 0.02); c.moveTo(s * 0.2, s * 0.2); c.lineTo(s * 0.26, s * 0.02); c.stroke();
        break;
      }
      case 'power:seal': {
        c.fillStyle = '#3c3742'; rr(c, -s * 0.3, -s * 0.34, s * 0.6, s * 0.68, s * 0.05); c.fill();
        c.strokeStyle = P.gold; c.lineWidth = lw * 1.6;
        for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(k * s * 0.15, -s * 0.3); c.lineTo(k * s * 0.15, s * 0.3); c.stroke(); }
        c.beginPath(); c.moveTo(-s * 0.3, 0); c.lineTo(s * 0.3, 0); c.stroke();
        break;
      }
      case 'mire': {
        c.fillStyle = '#5a4a2a'; c.beginPath(); c.ellipse(0, s * 0.2, s * 0.36, s * 0.12, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#a89060'; c.lineWidth = lw * 1.5;
        for (const k of [-1, 1]) { c.beginPath(); c.moveTo(k * s * 0.14, s * 0.18); c.quadraticCurveTo(k * s * 0.2, -s * 0.05, k * s * 0.1, -s * 0.28); c.stroke(); for (const t of [-0.08, 0, 0.08]) { c.beginPath(); c.moveTo(k * s * 0.1, -s * 0.28); c.lineTo(k * s * (0.1 + t), -s * 0.38); c.stroke(); } }
        break;
      }
      case 'rearm': {
        c.fillStyle = P.maliceHi;
        c.beginPath(); c.moveTo(s * 0.06, -s * 0.38); c.lineTo(-s * 0.18, s * 0.04); c.lineTo(0, s * 0.04); c.lineTo(-s * 0.06, s * 0.38); c.lineTo(s * 0.2, -s * 0.06); c.lineTo(s * 0.02, -s * 0.06); c.closePath(); c.fill();
        break;
      }
      case 'mend': {
        c.strokeStyle = P.venom; c.lineWidth = lw * 2.2;
        c.beginPath(); c.moveTo(0, -s * 0.3); c.lineTo(0, s * 0.3); c.moveTo(-s * 0.3, 0); c.lineTo(s * 0.3, 0); c.stroke();
        c.strokeStyle = P.malice; c.lineWidth = lw; c.beginPath(); c.arc(0, 0, s * 0.36, 0, Math.PI * 2); c.stroke();
        break;
      }
      case 'dread': {
        c.strokeStyle = P.violet; c.lineWidth = lw * 1.3;
        for (const r of [0.14, 0.26, 0.38]) { c.beginPath(); c.arc(-s * 0.2, 0, r * s, -0.7, 0.7); c.stroke(); }
        c.fillStyle = P.bone; c.beginPath(); c.arc(-s * 0.24, 0, s * 0.08, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'smite': {
        c.strokeStyle = P.violet; c.lineWidth = lw * 2;
        c.beginPath(); c.moveTo(-s * 0.05, -s * 0.4); c.lineTo(s * 0.12, -s * 0.08); c.lineTo(-s * 0.08, -s * 0.02); c.lineTo(s * 0.06, s * 0.36); c.stroke();
        c.fillStyle = P.maliceHi; c.beginPath(); c.arc(s * 0.06, s * 0.36, s * 0.07, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'banish': {
        c.strokeStyle = P.violet; c.lineWidth = lw * 1.5;
        c.beginPath(); for (let k = 0; k < 40; k++) { const a = k * 0.45, r = s * 0.02 + k * s * 0.009; const px = Math.cos(a) * r, py = Math.sin(a) * r; if (k) c.lineTo(px, py); else c.moveTo(px, py); } c.stroke();
        break;
      }
      case 'douse': {
        c.fillStyle = P.ash;
        c.fillRect(-s * 0.04, -s * 0.02, s * 0.08, s * 0.32);
        c.strokeStyle = P.ash;
        c.beginPath(); c.moveTo(0, -s * 0.06); c.quadraticCurveTo(s * 0.15, -s * 0.2, -s * 0.02, -s * 0.36); c.stroke();
        break;
      }
    }
    c.restore();
  };

  // One configurable creature: body, head, eyes, and optional ears, snout, tusks, horns, wings, cape, crown.
  function critter(c, k, o) {
    if (o.wings) {
      const f = Math.sin(o.flap || 0) * 0.12;
      c.fillStyle = o.wings;
      c.beginPath(); c.moveTo(-k * 0.1, 0); c.lineTo(-k * 0.46, -k * (0.24 + f)); c.lineTo(-k * 0.34, k * 0.1); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(k * 0.1, 0); c.lineTo(k * 0.46, -k * (0.24 + f)); c.lineTo(k * 0.34, k * 0.1); c.closePath(); c.fill();
    }
    if (o.cape) { c.fillStyle = o.cape; c.beginPath(); c.moveTo(-k * 0.3, k * 0.34); c.lineTo(-k * 0.2, -k * 0.12); c.lineTo(k * 0.2, -k * 0.12); c.lineTo(k * 0.3, k * 0.34); c.closePath(); c.fill(); }
    c.fillStyle = o.body;
    c.beginPath(); c.ellipse(0, k * 0.12, k * 0.24, k * 0.22, 0, 0, Math.PI * 2); c.fill();
    if (o.mane) { c.fillStyle = o.mane; c.beginPath(); c.arc(0, -k * 0.12, k * 0.22, 0, Math.PI * 2); c.fill(); }
    if (!o.headless) {
      c.fillStyle = o.face || o.body;
      c.beginPath(); c.arc(0, -k * 0.12, k * 0.17, 0, Math.PI * 2); c.fill();
      if (o.snout) { c.beginPath(); c.ellipse(0, -k * 0.04, k * 0.09, k * 0.06, 0, 0, Math.PI * 2); c.fill(); }
      if (o.ears === 'pointy') { c.beginPath(); c.moveTo(-k * 0.14, -k * 0.2); c.lineTo(-k * 0.28, -k * 0.34); c.lineTo(-k * 0.06, -k * 0.26); c.moveTo(k * 0.14, -k * 0.2); c.lineTo(k * 0.28, -k * 0.34); c.lineTo(k * 0.06, -k * 0.26); c.fill(); }
      if (o.horns) { c.fillStyle = o.horns; c.beginPath(); c.moveTo(-k * 0.12, -k * 0.24); c.quadraticCurveTo(-k * 0.34, -k * 0.3, -k * 0.3, -k * 0.46); c.quadraticCurveTo(-k * 0.24, -k * 0.32, -k * 0.04, -k * 0.28); c.moveTo(k * 0.12, -k * 0.24); c.quadraticCurveTo(k * 0.34, -k * 0.3, k * 0.3, -k * 0.46); c.quadraticCurveTo(k * 0.24, -k * 0.32, k * 0.04, -k * 0.28); c.fill(); }
      if (o.crest) { c.fillStyle = o.crest; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * k * 0.07 - k * 0.03, -k * 0.27); c.lineTo(i * k * 0.07, -k * 0.4); c.lineTo(i * k * 0.07 + k * 0.03, -k * 0.27); c.fill(); } }
      c.fillStyle = o.eye;
      c.beginPath(); c.arc(-k * 0.065, -k * 0.13, k * 0.035, 0, Math.PI * 2); c.arc(k * 0.065, -k * 0.13, k * 0.035, 0, Math.PI * 2); c.fill();
      if (o.tusks) { c.fillStyle = P.bone; c.beginPath(); c.moveTo(-k * 0.08, -k * 0.02); c.lineTo(-k * 0.06, -k * 0.1); c.lineTo(-k * 0.03, -k * 0.02); c.moveTo(k * 0.08, -k * 0.02); c.lineTo(k * 0.06, -k * 0.1); c.lineTo(k * 0.03, -k * 0.02); c.fill(); }
      if (o.ring) { c.strokeStyle = o.ring; c.lineWidth = Math.max(1, k / 22); c.beginPath(); c.arc(0, -k * 0.02, k * 0.04, 0, Math.PI * 2); c.stroke(); }
      if (o.crown) { c.fillStyle = P.gold; c.beginPath(); c.moveTo(-k * 0.14, -k * 0.26); c.lineTo(-k * 0.14, -k * 0.38); c.lineTo(-k * 0.06, -k * 0.31); c.lineTo(0, -k * 0.42); c.lineTo(k * 0.06, -k * 0.31); c.lineTo(k * 0.14, -k * 0.38); c.lineTo(k * 0.14, -k * 0.26); c.closePath(); c.fill(); }
    } else {
      // a headless rider: a cold flame where the head should be
      c.fillStyle = o.eye; c.globalAlpha *= 0.8;
      c.beginPath(); c.moveTo(-k * 0.08, -k * 0.06); c.quadraticCurveTo(0, -k * 0.34, k * 0.08, -k * 0.06); c.closePath(); c.fill();
      c.globalAlpha /= 0.8;
    }
    if (o.spear) { c.strokeStyle = P.bone; c.lineWidth = Math.max(1, k / 18); c.beginPath(); c.moveTo(k * 0.28, k * 0.34); c.lineTo(k * 0.28, -k * 0.4); c.stroke(); c.beginPath(); c.moveTo(k * 0.24, -k * 0.32); c.lineTo(k * 0.28, -k * 0.44); c.lineTo(k * 0.32, -k * 0.32); c.stroke(); }
  }

  function aura(c, s, col, t) {
    const a = 0.25 + 0.15 * Math.sin(t * 2.5);
    const g = c.createRadialGradient(0, 0, s * 0.15, 0, 0, s * 0.55);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, hexA(col, a));
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, s * 0.55, 0, Math.PI * 2); c.fill();
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  RD.hexA = hexA;

  // a small steel eye: "the guild knows about this"
  function eye(c, x, y, r) {
    c.fillStyle = 'rgba(13,11,16,0.85)';
    c.beginPath(); c.arc(x, y, r * 1.35, 0, Math.PI * 2); c.fill();
    c.strokeStyle = P.steel;
    c.lineWidth = Math.max(1, r * 0.35);
    c.beginPath(); c.moveTo(x - r, y); c.quadraticCurveTo(x, y - r * 0.9, x + r, y); c.quadraticCurveTo(x, y + r * 0.9, x - r, y); c.stroke();
    c.fillStyle = P.steel;
    c.beginPath(); c.arc(x, y, r * 0.35, 0, Math.PI * 2); c.fill();
  }

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function bar(c, x, y, w, f, color) {
    const h = Math.max(2, w / 9);
    c.fillStyle = 'rgba(10,8,12,0.85)';
    c.fillRect(x - 1, y - 1, w + 2, h + 2);
    c.fillStyle = color;
    c.fillRect(x, y, w * Math.max(0, f), h);
  }

  function coins(c, s, gold) {
    const n = Math.max(1, Math.min(9, Math.ceil(gold / 12)));
    const spots = [[0, 0.12], [-0.17, 0.16], [0.17, 0.16], [-0.08, 0.02], [0.09, 0.02], [0, -0.1], [-0.2, 0.02], [0.2, 0.02], [0, -0.2]];
    for (let k = 0; k < n; k++) {
      const [x, y] = spots[k];
      c.fillStyle = P.goldDk;
      c.beginPath(); c.ellipse(x * s, y * s + s * 0.03, s * 0.13, s * 0.08, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = P.gold;
      c.beginPath(); c.ellipse(x * s, y * s, s * 0.13, s * 0.08, 0, 0, Math.PI * 2); c.fill();
    }
    const tw = Math.sin(V.time * 2.3) * 0.5 + 0.5;
    c.fillStyle = `rgba(255,248,220,${0.4 + tw * 0.6})`;
    c.beginPath(); c.arc(-s * 0.05, -s * 0.08, s * 0.03 * (0.5 + tw), 0, Math.PI * 2); c.fill();
  }

  // A hero token: class colour inside a ring of its rank colour, with a class emblem.
  function heroGlyph(c, h, s) {
    const col = P.hero[h.cls];
    c.fillStyle = RD.TIER_COLOR[h.tier];
    c.beginPath(); c.arc(0, 0, s * 0.29, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#121016';
    c.beginPath(); c.arc(0, 0, s * 0.25, 0, Math.PI * 2); c.fill();
    if (h.title) {
      c.strokeStyle = P.gold;
      c.lineWidth = Math.max(1, s / 20);
      c.setLineDash([s * 0.05, s * 0.05]);
      c.beginPath(); c.arc(0, 0, s * 0.35, V.time, V.time + Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }
    c.fillStyle = col;
    c.beginPath(); c.arc(0, 0, s * 0.21, 0, Math.PI * 2); c.fill();
    emblem(c, h.cls, s * 0.13);
  }
  function emblem(c, cls, k) {
    c.fillStyle = '#121016';
    c.strokeStyle = '#121016';
    c.lineWidth = Math.max(1, k / 2);
    switch (cls) {
      case 'knight': case 'paladin':
        c.beginPath(); c.moveTo(-k, -k); c.lineTo(k, -k); c.lineTo(k, 0); c.quadraticCurveTo(k, k, 0, k * 1.3); c.quadraticCurveTo(-k, k, -k, 0); c.closePath(); c.fill();
        if (cls === 'paladin') { c.fillStyle = P.gold; c.fillRect(-k * 0.15, -k * 0.75, k * 0.3, k * 1.3); c.fillRect(-k * 0.55, -k * 0.35, k * 1.1, k * 0.3); }
        break;
      case 'rogue': c.beginPath(); c.moveTo(-k, k); c.lineTo(k, -k); c.stroke(); c.beginPath(); c.moveTo(-k * 0.8, k * 0.2); c.lineTo(-k * 0.2, k * 0.8); c.stroke(); break;
      case 'mage': case 'archmage':
        c.beginPath(); for (let i = 0; i < (cls === 'archmage' ? 6 : 4); i++) { const n = cls === 'archmage' ? 6 : 4; const a = (i * Math.PI * 2) / n; c.lineTo(Math.cos(a) * k * 1.2, Math.sin(a) * k * 1.2); c.lineTo(Math.cos(a + Math.PI / n) * k * 0.35, Math.sin(a + Math.PI / n) * k * 0.35); } c.fill(); break;
      case 'cleric': c.fillRect(-k * 0.25, -k, k * 0.5, k * 2); c.fillRect(-k * 0.8, -k * 0.45, k * 1.6, k * 0.5); break;
      case 'saint': c.beginPath(); c.arc(0, 0, k * 0.8, 0, Math.PI * 2); c.stroke(); c.fillRect(-k * 0.2, -k * 0.6, k * 0.4, k * 1.2); break;
      case 'swordsaint': c.beginPath(); c.moveTo(-k, k); c.lineTo(k, -k); c.moveTo(k, k); c.lineTo(-k, -k); c.stroke(); break;
      case 'ranger': c.beginPath(); c.arc(-k * 0.3, 0, k, -Math.PI / 2, Math.PI / 2); c.moveTo(-k * 0.3, -k); c.lineTo(-k * 0.3, k); c.moveTo(-k, 0); c.lineTo(k, 0); c.stroke(); break;
      case 'berserker': c.beginPath(); c.moveTo(0, -k); c.lineTo(0, k * 1.1); c.stroke(); c.beginPath(); c.moveTo(0, -k * 0.8); c.quadraticCurveTo(k * 1.1, -k * 0.6, k * 0.9, k * 0.2); c.lineTo(0, -k * 0.1); c.fill(); c.beginPath(); c.moveTo(0, -k * 0.8); c.quadraticCurveTo(-k * 1.1, -k * 0.6, -k * 0.9, k * 0.2); c.lineTo(0, -k * 0.1); c.fill(); break;
      case 'alchemist': c.beginPath(); c.moveTo(-k * 0.25, -k); c.lineTo(k * 0.25, -k); c.lineTo(k * 0.25, -k * 0.3); c.lineTo(k * 0.9, k * 0.9); c.lineTo(-k * 0.9, k * 0.9); c.lineTo(-k * 0.25, -k * 0.3); c.closePath(); c.fill(); break;
      case 'bard': c.beginPath(); c.arc(-k * 0.35, k * 0.6, k * 0.4, 0, Math.PI * 2); c.fill(); c.fillRect(-k * 0.05, -k, k * 0.22, k * 1.6); c.beginPath(); c.moveTo(k * 0.17, -k); c.quadraticCurveTo(k * 1, -k * 0.7, k * 0.6, -k * 0.1); c.stroke(); break;
      case 'monk': c.beginPath(); c.arc(0, 0, k * 0.9, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, k * 0.3, 0, Math.PI * 2); c.fill(); break;
      case 'tamer': c.beginPath(); c.arc(0, k * 0.3, k * 0.5, 0, Math.PI * 2); c.fill(); for (const [x, y] of [[-0.6, -0.4], [-0.2, -0.8], [0.2, -0.8], [0.6, -0.4]]) { c.beginPath(); c.arc(x * k, y * k, k * 0.22, 0, Math.PI * 2); c.fill(); } break;
      case 'ninja': for (let i = 0; i < 4; i++) { c.save(); c.rotate((i * Math.PI) / 2 + Math.PI / 4); c.beginPath(); c.moveTo(0, 0); c.lineTo(k * 0.25, -k * 0.25); c.lineTo(0, -k * 1.1); c.lineTo(-k * 0.25, -k * 0.25); c.closePath(); c.fill(); c.restore(); } break;
      case 'samurai': c.beginPath(); c.moveTo(-k, k * 0.9); c.quadraticCurveTo(0, -k * 0.2, k * 1.1, -k); c.stroke(); c.fillRect(-k * 0.6, k * 0.35, k * 0.45, k * 0.18); break;
      case 'darkknight': c.beginPath(); c.moveTo(-k, -k); c.lineTo(k, -k); c.lineTo(k, 0); c.quadraticCurveTo(k, k, 0, k * 1.3); c.quadraticCurveTo(-k, k, -k, 0); c.closePath(); c.fill(); c.fillStyle = '#e05a86'; c.beginPath(); c.arc(0, -k * 0.1, k * 0.25, 0, Math.PI * 2); c.fill(); break;
      case 'shieldhero': c.beginPath(); c.moveTo(-k * 1.1, -k * 1.1); c.lineTo(k * 1.1, -k * 1.1); c.lineTo(k * 1.1, k * 0.1); c.quadraticCurveTo(k, k * 1.2, 0, k * 1.4); c.quadraticCurveTo(-k, k * 1.2, -k * 1.1, k * 0.1); c.closePath(); c.fill(); c.fillStyle = '#7fe0d8'; c.beginPath(); c.arc(0, -k * 0.1, k * 0.3, 0, Math.PI * 2); c.fill(); break;
      case 'goblinslayer': c.fillRect(-k * 0.9, -k * 0.6, k * 1.8, k * 0.3); c.fillRect(-k * 0.9, -k * 0.6, k * 0.3, k * 1.6); c.fillRect(k * 0.6, -k * 0.6, k * 0.3, k * 1.6); c.fillRect(-k * 0.15, -k * 0.3, k * 0.3, k * 1.3); break;
      case 'phantomthief': c.beginPath(); c.ellipse(0, 0, k * 1.1, k * 0.5, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#e3b04b'; c.beginPath(); c.arc(-k * 0.45, 0, k * 0.2, 0, Math.PI * 2); c.arc(k * 0.45, 0, k * 0.2, 0, Math.PI * 2); c.fill(); break;
      case 'sage': c.fillRect(-k * 0.9, -k * 0.7, k * 0.85, k * 1.4); c.fillRect(k * 0.05, -k * 0.7, k * 0.85, k * 1.4); c.strokeStyle = '#b8e0f0'; c.beginPath(); c.moveTo(0, -k * 0.7); c.lineTo(0, k * 0.7); c.stroke(); break;
      case 'dragonslayer': c.fillRect(-k * 0.12, -k * 1.2, k * 0.24, k * 1.7); c.fillRect(-k * 0.75, k * 0.35, k * 1.5, k * 0.25); c.beginPath(); c.arc(0, k * 0.95, k * 0.22, 0, Math.PI * 2); c.fill(); break;
      case 'shadow': c.beginPath(); c.arc(0, 0, k, Math.PI * 0.3, Math.PI * 1.7); c.arc(k * 0.4, 0, k * 0.8, Math.PI * 1.6, Math.PI * 0.4, true); c.fill(); break;
      case 'chosen':
        c.beginPath(); c.moveTo(0, -k * 1.3); c.lineTo(k * 0.25, -k * 0.2); c.lineTo(-k * 0.25, -k * 0.2); c.closePath(); c.fill();
        c.fillRect(-k * 0.7, -k * 0.2, k * 1.4, k * 0.25); c.fillRect(-k * 0.12, 0, k * 0.24, k * 0.9); break;
      default: c.beginPath(); c.moveTo(-k, k * 0.6); c.lineTo(0, -k * 0.6); c.lineTo(k, k * 0.6); c.stroke(); c.beginPath(); c.moveTo(-k * 0.6, k * 1.1); c.lineTo(0, 0); c.lineTo(k * 0.6, k * 1.1); c.stroke();
    }
  }
  RD.heroIcon = function (cv, h, size) {
    const d = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * d; cv.height = size * d;
    cv.style.width = cv.style.height = size + 'px';
    const c = cv.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    c.translate(size / 2, size / 2);
    heroGlyph(c, { cls: h.cls, tier: h.tier, title: h.title }, size * 0.95);
  };

  // rank letter and level pips on a placed piece, drawn once per size and reused as an image
  const badgeCache = new Map();
  function badge(c, cx, cy, T, tier, lv) {
    if (T < 20) return;
    const key = `${tier}|${lv}|${T}|${V.dpr}`;
    let img = badgeCache.get(key);
    if (!img) {
      if (badgeCache.size > 400) badgeCache.clear();
      img = document.createElement('canvas');
      img.width = img.height = Math.ceil(T * V.dpr);
      const b = img.getContext('2d');
      b.scale(V.dpr, V.dpr);
      drawBadge(b, T / 2, T / 2, T, tier, lv);
      badgeCache.set(key, img);
    }
    c.drawImage(img, cx - T / 2, cy - T / 2, T, T);
  }
  function drawBadge(c, cx, cy, T, tier, lv) {
    const L = RD.TIERS[tier];
    const fs = Math.max(8, Math.round(T * 0.24));
    c.font = `600 ${fs}px "DM Mono", monospace`;
    const w = c.measureText(L).width + fs * 0.5;
    const x = cx - T * 0.48, y = cy + T * 0.2;
    c.fillStyle = 'rgba(13,11,16,0.85)';
    c.fillRect(x, y, w, fs * 1.1);
    c.fillStyle = RD.TIER_COLOR[tier];
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(L, x + fs * 0.25, y + fs * 0.58);
    if (lv > 1) {
      c.fillStyle = P.gold;
      for (let k = 0; k < lv - 1; k++) { c.beginPath(); c.arc(cx + T * 0.38 - k * T * 0.12, cy - T * 0.4, T * 0.045, 0, Math.PI * 2); c.fill(); }
    }
  }

  // ---------------------------------------------------------------- per-frame draw
  RD.draw = function (G, ui, dt) {
    if (!G || !V.ctx) return;
    V.time += dt || 0;
    if (V.floor >= G.floors) V.floor = G.floors - 1;
    if (V.dirty || V.drawn !== V.floor) { drawStatic(G); V.dirty = false; V.drawn = V.floor; }
    const c = V.ctx;
    const { T, M } = V;
    const F = V.floor;
    const on = (g) => fl(g) === F;
    c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    const shake = RD.FX.shake;
    const sx = shake ? (Math.random() - 0.5) * shake * 6 : 0, sy = shake ? (Math.random() - 0.5) * shake * 6 : 0;
    c.drawImage(V.staticC, 0, 0, V.w, V.h);
    c.save();
    c.translate(M + sx, M + sy);
    const R = G.R;
    const tc = (i) => { const [x, y] = xy(i); return [x * T + T / 2, y * T + T / 2]; };

    if (R) for (const b of R.bones) {
      if (b.f !== F) continue;
      c.save(); c.translate(b.x * T, b.y * T); c.rotate(b.r);
      c.strokeStyle = 'rgba(233,224,210,0.35)'; c.lineWidth = Math.max(1, T / 14);
      c.beginPath(); c.moveTo(-T * 0.15, 0); c.lineTo(T * 0.15, 0); c.moveTo(0, -T * 0.1); c.lineTo(T * 0.05, T * 0.12); c.stroke();
      c.restore();
    }

    // range previews
    const hov = V.hover;
    const showRange = (i) => {
      const it = G.items.get(i);
      const type = it ? it.type : ui.tool;
      const d = RD.ITEMS[type];
      if (!d) return;
      if (d.kind === 'turret' && !d.chain) {
        c.fillStyle = 'rgba(196,60,104,0.16)';
        const [x0, y0] = xy(i);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let s = 1; s <= d.range; s++) {
          const x = x0 + dx * s, y = y0 + dy * s;
          if (x < 0 || y < 0 || x >= COLS || y >= ROWS || G.tiles[RD.idx(x, y, F)] === 0) break;
          c.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
        }
      } else if (d.kind === 'monster' || d.chain) {
        const [cx, cy] = tc(i);
        c.fillStyle = 'rgba(196,60,104,0.12)';
        c.strokeStyle = 'rgba(224,90,134,0.5)';
        c.setLineDash([4, 4]);
        c.beginPath(); c.arc(cx, cy, ((d.chain ? d.range : d.leash) + 0.5) * T, 0, Math.PI * 2); c.fill(); c.stroke();
        c.setLineDash([]);
      } else if (d.radius) {
        const [cx, cy] = tc(i);
        c.fillStyle = 'rgba(255,138,61,0.12)';
        c.fillRect(cx - T * 1.5, cy - T * 1.5, T * 3, T * 3);
      }
    };
    if (G.phase === 'build' && hov >= 0) showRange(hov);

    // hoard
    if (on(G.hoard)) {
      const [cx, cy] = tc(G.hoard);
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, T * 0.9);
      g.addColorStop(0, 'rgba(227,176,75,0.35)');
      g.addColorStop(1, 'rgba(227,176,75,0)');
      c.fillStyle = g;
      c.fillRect(cx - T, cy - T, T * 2, T * 2);
      c.save(); c.translate(cx, cy); coins(c, T, G.gold); c.restore();
    }

    // pieces
    for (const it of G.items.values()) {
      if (!on(it.tile)) continue;
      const d = RD.ITEMS[it.type];
      const [cx, cy] = tc(it.tile);
      if (d.kind === 'monster') {
        if (!R) { RD.glyph(c, it.type, cx, cy, T, { alpha: ui.carry === it.tile ? 0.25 : null }); badge(c, cx, cy, T, d.tier, it.lv); }
        continue;
      }
      const o = { off: it.off || it.spent || it.jamT > 0 || (it.cd > 0 && G.phase === 'raid' && d.kind === 'trap'), broken: it.broken, hp: d.kind === 'door' ? it.hp / RD.scaled(it.type, 'hp', it.lv) : null };
      if (d.kind === 'turret') {
        const dirs = [[1, 0, 0], [-1, 0, Math.PI], [0, 1, Math.PI / 2], [0, -1, -Math.PI / 2]];
        const [x, y] = xy(it.tile);
        const open = dirs.find(([dx, dy]) => G.tiles[RD.idx(Math.max(0, Math.min(COLS - 1, x + dx)), Math.max(0, Math.min(ROWS - 1, y + dy)), F)] === 1) || dirs[0];
        o.dir = open[2];
      }
      if (d.hidden && G.phase === 'raid') o.alpha = o.off ? 0.35 : 0.6;
      if (ui.carry === it.tile) o.alpha = 0.25;
      RD.glyph(c, it.type, cx, cy, T, o);
      if (G.phase === 'build') badge(c, cx, cy, T, d.tier, it.lv);
    }

    if (R && R.lure && on(R.lure.tile)) {
      const [cx, cy] = tc(R.lure.tile);
      c.save(); c.globalAlpha = 0.6 + 0.3 * Math.sin(V.time * 6); c.translate(cx, cy); coins(c, T, 60); c.restore();
    }
    if (R && R.sealT > 0 && F === 0) {
      const [gx, gy] = tc(G.entrance);
      c.strokeStyle = P.gold; c.lineWidth = Math.max(2, T / 10);
      for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(gx + k * T * 0.25, gy - T * 0.45); c.lineTo(gx + k * T * 0.25, gy + T * 0.45); c.stroke(); }
    }
    if (R) for (const cl of R.clouds) {
      if (cl.f !== F) continue;
      const a = Math.min(1, cl.t / 0.6) * 0.45;
      for (let k = 0; k < 6; k++) {
        const ang = V.time * 0.8 + k;
        c.fillStyle = `rgba(134,192,106,${a * 0.6})`;
        c.beginPath(); c.arc(cl.x * T + Math.cos(ang) * T * 0.6, cl.y * T + Math.sin(ang * 1.3) * T * 0.6, T * 0.7, 0, Math.PI * 2); c.fill();
      }
    }

    if (R) for (const m of R.monsters) {
      if (m.dead || !on(m.tile)) continue;
      const lx = m.lunge > 0 ? (m.face || 1) * T * 0.08 : 0;
      if (m.calmT > 0) { c.fillStyle = '#a8d48a'; c.font = `600 ${Math.round(T * 0.28)}px sans-serif`; c.textAlign = 'center'; c.fillText('z', m.x * T + T * 0.3, m.y * T - T * 0.35); }
      if (R.frenzyT > 0) { c.fillStyle = 'rgba(224,90,134,0.28)'; c.beginPath(); c.arc(m.x * T, m.y * T, T * 0.45, 0, Math.PI * 2); c.fill(); }
      RD.glyph(c, m.type, m.x * T + lx, m.y * T, T, { awake: !m.dormant });
      if (m.hp < m.maxHp) bar(c, m.x * T - T * 0.35, m.y * T - T * 0.55, T * 0.7, m.hp / m.maxHp, P.maliceHi);
      badge(c, m.x * T + lx, m.y * T, T, m.tier, m.lv);
    }

    if (R) for (const h of R.heroes) {
      if (!RD.heroAlive(h) || !on(h.tile)) continue;
      const bob = Math.sin(h.bob) * T * 0.03;
      const ox = (RD.hash(h.id, 1) - 0.5) * T * 0.34, oy = (RD.hash(h.id, 2) - 0.5) * T * 0.26;
      c.save();
      c.translate(h.x * T + ox, h.y * T + oy + bob);
      if (h.stun > 0) c.rotate(Math.sin(V.time * 20) * 0.2);
      heroGlyph(c, h, T);
      const fl2 = 0.7 + Math.random() * 0.3;
      c.fillStyle = `rgba(255,170,80,${fl2})`;
      c.beginPath(); c.arc(T * 0.24, -T * 0.22, T * 0.06, 0, Math.PI * 2); c.fill();
      if (h.carry) { c.fillStyle = P.gold; c.beginPath(); c.arc(-T * 0.22, T * 0.2, T * 0.08, 0, Math.PI * 2); c.fill(); }
      c.restore();
      if (h.hp < h.maxHp) bar(c, h.x * T - T * 0.3, h.y * T - T * 0.5, T * 0.6, h.hp / h.maxHp, P.steel);
      if (h.confuse > 0 || h.stun > 0 || h.rootT > 0) {
        c.fillStyle = h.stun > 0 ? P.gold : h.rootT > 0 ? P.ash : P.violet;
        for (let k = 0; k < 3; k++) { const a = V.time * 5 + (k * Math.PI * 2) / 3; c.beginPath(); c.arc(h.x * T + Math.cos(a) * T * 0.25, h.y * T - T * 0.4 + Math.sin(a) * T * 0.08, T * 0.04, 0, Math.PI * 2); c.fill(); }
      }
      if (h.slowT > 0) { c.strokeStyle = 'rgba(207,233,255,0.6)'; c.lineWidth = 1.5; c.beginPath(); c.arc(h.x * T, h.y * T, T * 0.33, 0, Math.PI * 2); c.stroke(); }
      if (h.cageT > 0) { c.strokeStyle = '#a59cad'; c.lineWidth = 2; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(h.x * T + k * T * 0.18, h.y * T - T * 0.36); c.lineTo(h.x * T + k * T * 0.18, h.y * T + T * 0.34); c.stroke(); } }
      if (h.poison) { c.fillStyle = 'rgba(134,192,106,0.35)'; c.beginPath(); c.arc(h.x * T, h.y * T, T * 0.3, 0, Math.PI * 2); c.fill(); }
      if (h.fearT > 0) { c.fillStyle = '#5af0ff'; c.font = `700 ${Math.round(T * 0.3)}px sans-serif`; c.textAlign = 'center'; c.fillText('!', h.x * T + T * 0.3, h.y * T - T * 0.3); }
      if (h.disarmAt >= 0 || h.doorAt >= 0 || h.state === 'loot') {
        const C = RD.CLASSES[h.cls];
        const f = h.state === 'loot' ? 1 - h.lootT / 1.2 : h.disarmAt >= 0 ? 1 - h.disarmT / (C.disarm || 1) : 0;
        c.strokeStyle = h.state === 'loot' ? P.gold : P.steel;
        c.lineWidth = 2;
        c.beginPath(); c.arc(h.x * T, h.y * T, T * 0.38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (f || (V.time % 1)), false); c.stroke();
      }
    }

    for (const s of RD.FX.shots) {
      if (s.f !== F) continue;
      c.strokeStyle = s.color;
      c.globalAlpha = 1 - s.t / s.life;
      c.lineWidth = Math.max(1, T / 18);
      c.beginPath(); c.moveTo(s.x1 * T, s.y1 * T); c.lineTo(s.x2 * T, s.y2 * T); c.stroke();
    }
    c.globalAlpha = 1;
    for (const r of RD.FX.rings) {
      if (r.f !== F) continue;
      c.strokeStyle = r.color;
      c.globalAlpha = 1 - r.t / r.life;
      c.lineWidth = 3;
      c.beginPath(); c.arc(r.x * T, r.y * T, r.r * T * (0.3 + (0.7 * r.t) / r.life), 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;
    for (const p of RD.FX.parts) {
      if (p.f !== F) continue;
      c.fillStyle = p.color;
      c.globalAlpha = 1 - p.t / p.life;
      const sz = Math.max(1.5, T / 14);
      c.fillRect(p.x * T - sz / 2, p.y * T - sz / 2, sz, sz);
    }
    c.globalAlpha = 1;

    // torchlight: the dungeon is dark where nobody carries a flame
    if (R) {
      const L = V.lightC.getContext('2d');
      L.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
      L.globalCompositeOperation = 'source-over';
      L.clearRect(0, 0, V.w, V.h);
      L.fillStyle = `rgba(6,4,9,${0.5 + F * 0.06})`;
      L.fillRect(0, 0, V.w, V.h);
      L.globalCompositeOperation = 'destination-out';
      const hole = (x, y, r, a) => {
        const g = L.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(0,0,0,${a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        L.fillStyle = g;
        L.fillRect(x - r, y - r, r * 2, r * 2);
      };
      const gate = F === 0 ? G.entrance : F * N + G.gates[F];
      const [ex, ey] = tc(gate);
      hole(M + ex, M + ey, T * (F === 0 ? 2 : 1.2), F === 0 ? 0.9 : 0.5);
      if (on(G.hoard)) { const [gx, gy] = tc(G.hoard); hole(M + gx, M + gy, T * 1.2, 0.6); }
      for (const m of R.monsters) if (!m.dead && on(m.tile) && m.d.boss) hole(M + m.x * T, M + m.y * T, T * 1.1, 0.5);
      for (const h of R.heroes) if (RD.heroAlive(h) && on(h.tile)) {
        const vis = R.douseT > 0 ? 1.2 : h.vision * 0.8 + 0.6;
        hole(M + h.x * T, M + h.y * T, T * vis * (0.95 + Math.random() * 0.05), 1);
      }
      for (const r of RD.FX.rings) if (r.f === F) hole(M + r.x * T, M + r.y * T, T * 2.2, 1 - r.t / r.life);
      c.restore();
      c.drawImage(V.lightC, 0, 0, V.w, V.h);
      c.save();
      c.translate(M + sx, M + sy);
      c.globalCompositeOperation = 'lighter';
      for (const h of R.heroes) if (RD.heroAlive(h) && on(h.tile) && R.douseT <= 0) {
        const g = c.createRadialGradient(h.x * T, h.y * T, 0, h.x * T, h.y * T, T * 1.6);
        g.addColorStop(0, 'rgba(255,150,60,0.16)');
        g.addColorStop(1, 'rgba(255,150,60,0)');
        c.fillStyle = g;
        c.fillRect(h.x * T - T * 2, h.y * T - T * 2, T * 4, T * 4);
      }
      c.globalCompositeOperation = 'source-over';
    }

    if (V.guildMap) drawGuildMap(c, G, R ? (R.feud ? G.guild.K : R.shared) : G.guild.K);

    // tutorial markers: pulsing gold rings on the tiles the coach is talking about
    for (const g of V.marks) {
      if (!on(g)) continue;
      const [cx, cy] = tc(g);
      const p = 0.5 + 0.5 * Math.sin(V.time * 4);
      c.strokeStyle = `rgba(227,176,75,${0.45 + 0.45 * p})`;
      c.lineWidth = 3;
      c.beginPath(); c.arc(cx, cy, T * (0.46 + 0.08 * p), 0, Math.PI * 2); c.stroke();
    }

    if (hov >= 0 && G.phase === 'build') {
      const [x, y] = xy(hov);
      const err = ui.previewError;
      c.strokeStyle = err ? P.maliceHi : P.bone;
      c.lineWidth = 2;
      c.setLineDash(err ? [3, 3] : []);
      c.strokeRect(x * T + 1.5, y * T + 1.5, T - 3, T - 3);
      c.setLineDash([]);
      const ghost = ui.carry != null ? G.items.get(ui.carry) && G.items.get(ui.carry).type : RD.ITEMS[ui.tool] ? ui.tool : ui.tool === 'hoard' ? 'hoard' : null;
      if (ghost && !err) RD.glyph(c, ghost, x * T + T / 2, y * T + T / 2, T, { alpha: 0.55 });
    }
    if (hov >= 0 && G.phase === 'raid' && ui.power && RD.POWERS[ui.power].target) {
      const [cx, cy] = tc(hov);
      c.strokeStyle = P.maliceHi;
      c.setLineDash([4, 4]);
      c.beginPath(); c.arc(cx, cy, T * RD.POWERS[ui.power].radius, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      RD.glyph(c, ui.power === 'seal' ? 'power:seal' : ui.power, cx, cy, T * 0.8, { alpha: 0.6 });
    }

    // what the party already knows: an eye on every hidden trap in their shared map
    if (R && G.phase === 'raid') {
      const K = R.shared;
      for (const [t, v] of K.traps) {
        if (!on(t) || v.off) continue;
        const [cx, cy] = tc(t);
        eye(c, cx - T * 0.3, cy - T * 0.3, T * 0.13);
      }
    }

    // speech bubbles
    c.font = `600 ${Math.max(10, Math.round(T * 0.3))}px "Alegreya Sans", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const b of RD.FX.bubbles) {
      const h = b.h;
      if (!RD.heroAlive(h) || !on(h.tile)) continue;
      const a = Math.min(1, b.t / 0.12, (b.life - b.t) / 0.4);
      const w = c.measureText(b.text).width + T * 0.3, hh = T * 0.42;
      const x = Math.max(w / 2, Math.min(COLS * T - w / 2, h.x * T)), y = h.y * T - T * 0.85;
      c.globalAlpha = a;
      c.fillStyle = 'rgba(233,224,210,0.95)';
      rr(c, x - w / 2, y - hh / 2, w, hh, hh * 0.35);
      c.fill();
      c.beginPath(); c.moveTo(h.x * T - T * 0.08, y + hh / 2 - 1); c.lineTo(h.x * T, y + hh / 2 + T * 0.12); c.lineTo(h.x * T + T * 0.08, y + hh / 2 - 1); c.fill();
      c.fillStyle = '#17121a';
      c.fillText(b.text, x, y + 0.5);
    }
    c.globalAlpha = 1;

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const f of RD.FX.floaters) {
      if (f.f !== F) continue;
      const a = 1 - Math.max(0, (f.t - f.life * 0.6) / (f.life * 0.4));
      c.globalAlpha = a;
      c.font = `${f.big ? 600 : 500} ${Math.max(10, T * (f.big ? 0.42 : 0.34))}px "DM Mono", ui-monospace, monospace`;
      c.fillStyle = '#0d0b10';
      c.fillText(f.text, f.x * T + 1, f.y * T + 1);
      c.fillStyle = f.color;
      c.fillText(f.text, f.x * T, f.y * T);
    }
    c.globalAlpha = 1;
    c.restore();
  };

  const SHORT = { kobold: 'Kb', orc: 'Or', lizardman: 'Lz', harpy: 'Hp', gargoyle: 'Gg', minotaur: 'Mn', basilisk: 'Bs', vampire: 'Vp', dullahan: 'Du', chimera: 'Ch',
    warren: 'W!', warband: 'O!', nest: 'H!', orcwarlord: 'OW', minotaurking: 'MK', vampirelord: 'VL',
    goblin: 'Gb', skeleton: 'Sk', slime: 'Sl', mimic: 'Mi', spider: 'Sp', brute: 'Br', wraith: 'Wr', troll: 'Tr', wyvern: 'Wy', golem: 'Go',
    goblinking: 'GK', lich: 'Li', dragon: 'Dr', hydra: 'Hy', behemoth: 'Be', demonlord: 'DL' };

  function drawGuildMap(c, G, K) {
    const { T } = V;
    const F = V.floor, base = F * N;
    c.save();
    for (let i = 0; i < N; i++) {
      const g = base + i;
      const [x, y] = xy(g);
      if (K.tiles[g] === -1) {
        c.fillStyle = 'rgba(13,11,16,0.72)';
        c.fillRect(x * T, y * T, T, T);
        c.strokeStyle = 'rgba(111,147,189,0.18)';
        c.lineWidth = 1;
        c.beginPath();
        for (let k = -T; k < T; k += Math.max(5, T / 4)) { c.moveTo(x * T + Math.max(0, k), y * T + Math.max(0, -k)); c.lineTo(x * T + Math.min(T, k + T), y * T + Math.min(T, T - k)); }
        c.stroke();
      } else if (K.tiles[g] !== G.tiles[g]) {
        c.strokeStyle = 'rgba(156,192,230,0.75)';
        c.setLineDash([3, 3]);
        c.strokeRect(x * T + 3, y * T + 3, T - 6, T - 6);
        c.setLineDash([]);
      }
    }
    const mark = (i, label, stale) => {
      if (fl(i) !== F) return;
      const [x, y] = xy(i);
      const cx = x * T + T * 0.78, cy = y * T + T * 0.22;
      c.fillStyle = stale ? 'rgba(13,11,16,0.85)' : P.ink;
      c.strokeStyle = P.steel;
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(cx, cy, T * 0.17, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = stale ? P.steel : '#0d0b10';
      c.font = `600 ${Math.max(8, T * 0.2)}px "DM Mono", ui-monospace, monospace`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, cx, cy + 0.5);
      if (stale) { c.strokeStyle = P.maliceHi; c.beginPath(); c.moveTo(cx - T * 0.15, cy + T * 0.15); c.lineTo(cx + T * 0.15, cy - T * 0.15); c.stroke(); }
    };
    const real = (i, kind) => { const it = G.items.get(i); return it && (kind ? kind(it) : true); };
    for (const [i] of K.traps) mark(i, '!', !real(i, (it) => RD.ITEMS[it.type].kind === 'trap'));
    for (const [i, type] of K.turrets) mark(i, '»', !real(i, (it) => it.type === type));
    for (const [i, t] of K.lairs) mark(i, SHORT[t] || '?', !real(i, (it) => it.type === t));
    for (const i of K.doors) mark(i, '#', !real(i, (it) => RD.ITEMS[it.type].kind === 'door'));
    for (const i of K.chests) if (!K.mimics.has(i)) mark(i, '$', !real(i, (it) => it.type === 'mimic'));
    for (const i of K.stairs) mark(i, '↓', false);
    if (K.hoard >= 0 && fl(K.hoard) === F) {
      const [x, y] = xy(K.hoard);
      const stale = K.hoard !== G.hoard;
      c.strokeStyle = stale ? P.steel : P.ink;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(x * T + T * 0.2, y * T + T * 0.2); c.lineTo(x * T + T * 0.8, y * T + T * 0.8);
      c.moveTo(x * T + T * 0.8, y * T + T * 0.2); c.lineTo(x * T + T * 0.2, y * T + T * 0.8);
      c.stroke();
      if (stale) {
        c.fillStyle = P.steel;
        c.font = `600 ${Math.max(8, T * 0.22)}px "DM Mono", ui-monospace, monospace`;
        c.textAlign = 'center';
        c.fillText('old', x * T + T / 2, y * T + T * 0.95);
      }
    }
    c.restore();
  }

  RD.drawIcon = function (canvas, type, size) {
    const d = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * d;
    canvas.height = size * d;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    const c = canvas.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, size, size);
    if (RD.ITEMS[type] && RD.ITEMS[type].place === 'wall') {
      c.fillStyle = P.rockB;
      c.fillRect(0, 0, size * 0.5, size);
      c.fillStyle = P.floorA;
      c.fillRect(size * 0.5, 0, size * 0.5, size);
      RD.glyph(c, type, size * (type === 'darts' ? 0.3 : 0.5), size / 2, size * 0.9, { dir: 0 });
      return;
    }
    RD.glyph(c, type, size / 2, size / 2, size * 0.95, { awake: false });
  };
})();
