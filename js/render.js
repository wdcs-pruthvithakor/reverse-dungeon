'use strict';
// Canvas drawing: stone, pieces, heroes, torchlight, and the guild's map overlay.
(function () {
  const RD = window.RD;
  const { COLS, ROWS, N } = RD;
  const xy = RD.xy;

  const P = (RD.PAL = {
    void: '#0d0b10', rockA: '#1f1a24', rockB: '#272030', rockFace: '#3a3142', rockRim: '#57495f',
    floorA: '#4b3f3b', floorB: '#574942', seam: '#2d2526', moss: '#4f5a3b',
    malice: '#c43c68', maliceHi: '#e05a86', gold: '#e3b04b', goldDk: '#9c6f1f',
    bone: '#e9e0d2', ash: '#9a8f9c', steel: '#9cc0e6', ink: '#6f93bd',
    venom: '#86c06a', fire: '#ff8a3d', violet: '#b38be0', iron: '#5b5562',
    hero: { knight: '#d6dde8', rogue: '#7fbca6', mage: '#98a4f4', cleric: '#f0d9a0', scout: '#9fd2e9' },
  });

  const V = (RD.view = { canvas: null, ctx: null, T: 32, M: 18, dpr: 1, hover: -1, guildMap: false, staticC: null, dirty: true, time: 0 });

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

  RD.tileAt = function (px, py) {
    const x = Math.floor((px - V.M) / V.T), y = Math.floor((py - V.M) / V.T);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return -1;
    return RD.idx(x, y);
  };

  // ---------------------------------------------------------------- static stone layer
  function drawStatic(G) {
    const c = V.staticC.getContext('2d');
    const { T, M } = V;
    c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    c.fillStyle = P.void;
    c.fillRect(0, 0, V.w, V.h);
    c.translate(M, M);
    for (let i = 0; i < N; i++) {
      const [x, y] = xy(i);
      const px = x * T, py = y * T;
      const r = RD.hash(i, G.seed);
      if (G.tiles[i] === 0) {
        c.fillStyle = r < 0.5 ? P.rockA : P.rockB;
        c.fillRect(px, py, T, T);
        c.fillStyle = 'rgba(87,73,95,0.35)';
        for (let k = 0; k < 4; k++) {
          const a = RD.hash(i * 7 + k, G.seed + 3), b = RD.hash(i * 13 + k, G.seed + 5);
          c.fillRect(px + a * (T - 3), py + b * (T * 0.6), Math.max(1, T / 14), Math.max(1, T / 14));
        }
        // wall face where a corridor runs below
        const below = y < ROWS - 1 ? G.tiles[i + COLS] : 0;
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
        // flagstones laid in a running bond
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
          c.ellipse(px + T * RD.hash(i, 9), py + T * 0.85, T * 0.18, T * 0.08, 0, 0, Math.PI * 2);
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
        // shade under the wall above
        if (y > 0 && G.tiles[i - COLS] === 0) {
          const g = c.createLinearGradient(0, py, 0, py + T * 0.4);
          g.addColorStop(0, 'rgba(10,8,12,0.55)');
          g.addColorStop(1, 'rgba(10,8,12,0)');
          c.fillStyle = g;
          c.fillRect(px, py, T, T * 0.4);
        }
        if (x > 0 && G.tiles[i - 1] === 0) { c.fillStyle = 'rgba(10,8,12,0.3)'; c.fillRect(px, py, T * 0.12, T); }
      }
    }
    // entrance: daylight spilling in
    const [ex, ey] = xy(G.entrance);
    const cx = ex * T + T / 2, cy = ey * T + T / 2;
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, T * 1.6);
    g.addColorStop(0, 'rgba(214,226,240,0.55)');
    g.addColorStop(1, 'rgba(214,226,240,0)');
    c.fillStyle = g;
    c.fillRect(cx - T * 2, cy - T * 2, T * 4, T * 4);
    c.strokeStyle = 'rgba(233,224,210,0.55)';
    c.lineWidth = Math.max(1, T / 16);
    for (let k = 1; k <= 3; k++) {
      c.beginPath();
      if (ex === 0 || ex === COLS - 1) { c.moveTo(ex * T + (k * T) / 4, ey * T + T * 0.15); c.lineTo(ex * T + (k * T) / 4, ey * T + T * 0.85); }
      else { c.moveTo(ex * T + T * 0.15, ey * T + (k * T) / 4); c.lineTo(ex * T + T * 0.85, ey * T + (k * T) / 4); }
      c.stroke();
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
    switch (type) {
      case 'spikes': {
        c.fillStyle = '#17121a';
        rr(c, -s * 0.36, -s * 0.36, s * 0.72, s * 0.72, s * 0.08);
        c.fill();
        c.fillStyle = o.off ? P.iron : P.bone;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const x = -s * 0.22 + i * s * 0.22, y = -s * 0.16 + j * s * 0.2;
          c.beginPath();
          c.moveTo(x - s * 0.06, y + s * 0.07);
          c.lineTo(x, y - s * 0.09);
          c.lineTo(x + s * 0.06, y + s * 0.07);
          c.fill();
        }
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
      case 'chasm': {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, s * 0.42);
        g.addColorStop(0, '#000');
        g.addColorStop(0.7, 'rgba(15,10,20,0.9)');
        g.addColorStop(1, 'rgba(15,10,20,0)');
        c.fillStyle = g;
        c.fillRect(-s / 2, -s / 2, s, s);
        c.setLineDash([s * 0.08, s * 0.08]);
        c.strokeStyle = P.violet;
        c.globalAlpha *= 0.7;
        rr(c, -s * 0.38, -s * 0.38, s * 0.76, s * 0.76, s * 0.1);
        c.stroke();
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
      case 'door': {
        if (o.broken) {
          c.strokeStyle = P.iron;
          c.lineWidth = lw * 2;
          c.beginPath(); c.moveTo(-s * 0.35, s * 0.2); c.lineTo(-s * 0.05, -s * 0.05); c.moveTo(s * 0.35, -s * 0.2); c.lineTo(s * 0.08, s * 0.12); c.stroke();
          break;
        }
        c.fillStyle = '#3c3742';
        rr(c, -s * 0.4, -s * 0.42, s * 0.8, s * 0.84, s * 0.06);
        c.fill();
        c.strokeStyle = '#7a7383';
        c.lineWidth = lw * 1.5;
        for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(k * s * 0.22, -s * 0.38); c.lineTo(k * s * 0.22, s * 0.38); c.stroke(); }
        c.beginPath(); c.moveTo(-s * 0.38, 0); c.lineTo(s * 0.38, 0); c.stroke();
        c.fillStyle = P.gold;
        c.beginPath(); c.arc(s * 0.3, s * 0.12, s * 0.05, 0, Math.PI * 2); c.fill();
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
      case 'skeleton': {
        const k = s * 0.9;
        c.fillStyle = P.bone;
        c.beginPath(); c.arc(0, -k * 0.06, k * 0.24, 0, Math.PI * 2); c.fill();
        rr(c, -k * 0.13, k * 0.08, k * 0.26, k * 0.17, k * 0.04); c.fill();
        c.fillStyle = '#1a141d';
        c.beginPath(); c.arc(-k * 0.09, -k * 0.07, k * 0.065, 0, Math.PI * 2); c.arc(k * 0.09, -k * 0.07, k * 0.065, 0, Math.PI * 2); c.fill();
        c.fillRect(-k * 0.01, k * 0.02, k * 0.02, k * 0.05);
        for (let i = -1; i <= 1; i++) c.fillRect(i * k * 0.06 - k * 0.008, k * 0.13, k * 0.016, k * 0.1);
        break;
      }
      case 'brute': {
        const k = s * 1.05;
        c.fillStyle = '#7a3a35';
        c.beginPath(); c.ellipse(0, k * 0.04, k * 0.36, k * 0.3, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#d8cbb3';
        c.beginPath(); c.moveTo(-k * 0.26, -k * 0.14); c.quadraticCurveTo(-k * 0.42, -k * 0.38, -k * 0.2, -k * 0.36); c.lineTo(-k * 0.16, -k * 0.2); c.fill();
        c.beginPath(); c.moveTo(k * 0.26, -k * 0.14); c.quadraticCurveTo(k * 0.42, -k * 0.38, k * 0.2, -k * 0.36); c.lineTo(k * 0.16, -k * 0.2); c.fill();
        c.fillStyle = P.fire;
        c.beginPath(); c.arc(-k * 0.1, -k * 0.02, k * 0.04, 0, Math.PI * 2); c.arc(k * 0.1, -k * 0.02, k * 0.04, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#3d1c1a';
        c.beginPath(); c.moveTo(-k * 0.12, k * 0.14); c.lineTo(k * 0.12, k * 0.14); c.stroke();
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
        c.fillStyle = '#1d2a18';
        c.beginPath(); c.arc(-s * 0.06, s * 0.02, s * 0.03, 0, Math.PI * 2); c.arc(s * 0.08, s * 0.02, s * 0.03, 0, Math.PI * 2); c.fill();
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

  function heroGlyph(c, h, s) {
    const col = P.hero[h.cls];
    c.fillStyle = '#121016';
    c.beginPath(); c.arc(0, 0, s * 0.27, 0, Math.PI * 2); c.fill();
    c.fillStyle = col;
    c.beginPath(); c.arc(0, 0, s * 0.23, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#121016';
    c.strokeStyle = '#121016';
    c.lineWidth = Math.max(1, s / 16);
    const k = s * 0.13;
    if (h.cls === 'knight') { c.beginPath(); c.moveTo(-k, -k); c.lineTo(k, -k); c.lineTo(k, 0); c.quadraticCurveTo(k, k, 0, k * 1.3); c.quadraticCurveTo(-k, k, -k, 0); c.closePath(); c.fill(); }
    else if (h.cls === 'rogue') { c.beginPath(); c.moveTo(-k, k); c.lineTo(k, -k); c.stroke(); c.beginPath(); c.moveTo(-k * 0.8, k * 0.2); c.lineTo(-k * 0.2, k * 0.8); c.stroke(); }
    else if (h.cls === 'mage') { c.beginPath(); for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; c.lineTo(Math.cos(a) * k * 1.2, Math.sin(a) * k * 1.2); c.lineTo(Math.cos(a + Math.PI / 4) * k * 0.35, Math.sin(a + Math.PI / 4) * k * 0.35); } c.fill(); }
    else if (h.cls === 'cleric') { c.fillRect(-k * 0.25, -k, k * 0.5, k * 2); c.fillRect(-k * 0.8, -k * 0.45, k * 1.6, k * 0.5); }
    else { c.beginPath(); c.moveTo(-k, k * 0.6); c.lineTo(0, -k * 0.6); c.lineTo(k, k * 0.6); c.stroke(); c.beginPath(); c.moveTo(-k * 0.6, k * 1.1); c.lineTo(0, 0); c.lineTo(k * 0.6, k * 1.1); c.stroke(); }
  }

  // ---------------------------------------------------------------- per-frame draw
  function rankBadge(c, cx, cy, T, rank) {
    const x = cx + T * 0.3, y = cy - T * 0.3, r = T * 0.17;
    c.fillStyle = RD.PAL.gold;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#121016';
    c.font = `600 ${Math.round(T * 0.22)}px "DM Mono", monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(rank, x, y + T * 0.01);
  }

  RD.draw = function (G, ui, dt) {
    if (!G || !V.ctx) return;
    V.time += dt || 0;
    if (V.dirty) { drawStatic(G); V.dirty = false; }
    const c = V.ctx;
    const { T, M } = V;
    c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    const shake = RD.FX.shake;
    const sx = shake ? (Math.random() - 0.5) * shake * 6 : 0, sy = shake ? (Math.random() - 0.5) * shake * 6 : 0;
    c.drawImage(V.staticC, 0, 0, V.w, V.h);
    c.save();
    c.translate(M + sx, M + sy);
    const R = G.R;
    const tc = (i) => { const [x, y] = xy(i); return [x * T + T / 2, y * T + T / 2]; };

    // bones of the fallen
    if (R) for (const b of R.bones) {
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
      if (d.kind === 'turret') {
        c.fillStyle = 'rgba(196,60,104,0.16)';
        const [x0, y0] = xy(i);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let s = 1; s <= d.range; s++) {
          const x = x0 + dx * s, y = y0 + dy * s;
          if (x < 0 || y < 0 || x >= COLS || y >= ROWS || G.tiles[RD.idx(x, y)] === 0) break;
          c.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
        }
      } else if (d.kind === 'monster') {
        const [cx, cy] = tc(i);
        c.fillStyle = 'rgba(196,60,104,0.12)';
        c.strokeStyle = 'rgba(224,90,134,0.5)';
        c.setLineDash([4, 4]);
        c.beginPath(); c.arc(cx, cy, (d.leash + 0.5) * T, 0, Math.PI * 2); c.fill(); c.stroke();
        c.setLineDash([]);
      } else if (d.radius) {
        const [cx, cy] = tc(i);
        c.fillStyle = 'rgba(255,138,61,0.12)';
        c.fillRect(cx - T * 1.5, cy - T * 1.5, T * 3, T * 3);
      }
    };
    if (G.phase === 'build' && hov >= 0) showRange(hov);

    // hoard
    {
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
      const d = RD.ITEMS[it.type];
      if (d.kind === 'monster') { if (!R) RD.glyph(c, it.type, ...tc(it.tile), T, {}); continue; }
      const [cx, cy] = tc(it.tile);
      const o = { off: it.off || it.spent || (it.cd > 0 && G.phase === 'raid'), broken: it.broken, hp: d.kind === 'door' ? it.hp / d.hp : null };
      if (d.kind === 'turret') {
        const dirs = [[1, 0, 0], [-1, 0, Math.PI], [0, 1, Math.PI / 2], [0, -1, -Math.PI / 2]];
        const [x, y] = xy(it.tile);
        const open = dirs.find(([dx, dy]) => G.tiles[RD.idx(Math.max(0, Math.min(COLS - 1, x + dx)), Math.max(0, Math.min(ROWS - 1, y + dy)))] === 1) || dirs[0];
        o.dir = open[2];
      }
      if (d.hidden && G.phase === 'raid') o.alpha = o.off ? 0.35 : 0.6;
      if (ui.carry === it.tile) o.alpha = 0.25;
      RD.glyph(c, it.type, cx, cy, T, o);
    }
    if (G.phase === 'build') for (const it of G.items.values()) if ((it.rank || 1) > 1) rankBadge(c, ...tc(it.tile), T, it.rank);

    // clouds
    if (R) for (const cl of R.clouds) {
      const a = Math.min(1, cl.t / 0.6) * 0.45;
      for (let k = 0; k < 6; k++) {
        const ang = V.time * 0.8 + k;
        c.fillStyle = `rgba(134,192,106,${a * 0.6})`;
        c.beginPath(); c.arc(cl.x * T + Math.cos(ang) * T * 0.6, cl.y * T + Math.sin(ang * 1.3) * T * 0.6, T * 0.7, 0, Math.PI * 2); c.fill();
      }
    }

    // monsters
    if (R) for (const m of R.monsters) {
      if (m.dead) continue;
      const lx = m.lunge > 0 ? (m.face || 1) * T * 0.08 : 0;
      RD.glyph(c, m.type, m.x * T + lx, m.y * T, T, { awake: !m.dormant });
      if (m.hp < m.maxHp) bar(c, m.x * T - T * 0.35, m.y * T - T * 0.5, T * 0.7, m.hp / m.maxHp, P.maliceHi);
      if (m.rank > 1) rankBadge(c, m.x * T + lx, m.y * T, T, m.rank);
    }

    // heroes
    if (R) for (const h of R.heroes) {
      if (!RD.heroAlive(h)) continue;
      const bob = Math.sin(h.bob) * T * 0.03;
      // spread a party out a little so heroes on one tile stay readable
      const ox = (RD.hash(h.id, 1) - 0.5) * T * 0.34, oy = (RD.hash(h.id, 2) - 0.5) * T * 0.26;
      c.save();
      c.translate(h.x * T + ox, h.y * T + oy + bob);
      if (h.stun > 0) c.rotate(Math.sin(V.time * 20) * 0.2);
      heroGlyph(c, h, T);
      // torch
      const fl = 0.7 + Math.random() * 0.3;
      c.fillStyle = `rgba(255,170,80,${fl})`;
      c.beginPath(); c.arc(T * 0.22, -T * 0.2, T * 0.06, 0, Math.PI * 2); c.fill();
      if (h.carry) { c.fillStyle = P.gold; c.beginPath(); c.arc(-T * 0.2, T * 0.18, T * 0.08, 0, Math.PI * 2); c.fill(); }
      c.restore();
      if (h.hp < h.maxHp) bar(c, h.x * T - T * 0.3, h.y * T - T * 0.48, T * 0.6, h.hp / h.maxHp, P.steel);
      if (h.confuse > 0 || h.stun > 0) {
        c.fillStyle = h.stun > 0 ? P.gold : P.violet;
        for (let k = 0; k < 3; k++) { const a = V.time * 5 + (k * Math.PI * 2) / 3; c.beginPath(); c.arc(h.x * T + Math.cos(a) * T * 0.25, h.y * T - T * 0.4 + Math.sin(a) * T * 0.08, T * 0.04, 0, Math.PI * 2); c.fill(); }
      }
      if (h.disarmAt >= 0 || h.doorAt >= 0 || h.state === 'loot') {
        const f = h.state === 'loot' ? 1 - h.lootT / 1.2 : h.disarmAt >= 0 ? 1 - h.disarmT / RD.CLASSES.rogue.disarm : 0;
        c.strokeStyle = h.state === 'loot' ? P.gold : P.steel;
        c.lineWidth = 2;
        c.beginPath(); c.arc(h.x * T, h.y * T, T * 0.36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (f || (V.time % 1)), false); c.stroke();
      }
    }

    // shots, rings, particles
    for (const s of RD.FX.shots) {
      c.strokeStyle = s.color;
      c.globalAlpha = 1 - s.t / s.life;
      c.lineWidth = Math.max(1, T / 18);
      c.beginPath(); c.moveTo(s.x1 * T, s.y1 * T); c.lineTo(s.x2 * T, s.y2 * T); c.stroke();
    }
    c.globalAlpha = 1;
    for (const r of RD.FX.rings) {
      c.strokeStyle = r.color;
      c.globalAlpha = 1 - r.t / r.life;
      c.lineWidth = 3;
      c.beginPath(); c.arc(r.x * T, r.y * T, r.r * T * (0.3 + (0.7 * r.t) / r.life), 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;
    for (const p of RD.FX.parts) {
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
      L.fillStyle = 'rgba(6,4,9,0.5)';
      L.fillRect(0, 0, V.w, V.h);
      L.globalCompositeOperation = 'destination-out';
      const hole = (x, y, r, a) => {
        const g = L.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(0,0,0,${a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        L.fillStyle = g;
        L.fillRect(x - r, y - r, r * 2, r * 2);
      };
      const [ex, ey] = tc(G.entrance);
      hole(M + ex, M + ey, T * 2, 0.9);
      const [gx, gy] = tc(G.hoard);
      hole(M + gx, M + gy, T * 1.2, 0.6);
      for (const h of R.heroes) if (RD.heroAlive(h)) {
        const vis = R.douseT > 0 ? 1.2 : h.vision * 0.8 + 0.6;
        hole(M + h.x * T, M + h.y * T, T * vis * (0.95 + Math.random() * 0.05), 1);
      }
      for (const r of RD.FX.rings) hole(M + r.x * T, M + r.y * T, T * 2.2, 1 - r.t / r.life);
      c.restore();
      c.drawImage(V.lightC, 0, 0, V.w, V.h);
      c.save();
      c.translate(M + sx, M + sy);
      // warm tint around torches
      c.globalCompositeOperation = 'lighter';
      for (const h of R.heroes) if (RD.heroAlive(h) && R.douseT <= 0) {
        const g = c.createRadialGradient(h.x * T, h.y * T, 0, h.x * T, h.y * T, T * 1.6);
        g.addColorStop(0, 'rgba(255,150,60,0.16)');
        g.addColorStop(1, 'rgba(255,150,60,0)');
        c.fillStyle = g;
        c.fillRect(h.x * T - T * 2, h.y * T - T * 2, T * 4, T * 4);
      }
      c.globalCompositeOperation = 'source-over';
    }

    // the guild's map: what the heroes believe, drawn in surveyor's ink
    if (V.guildMap) drawGuildMap(c, G, R ? (R.feud ? G.guild.K : R.shared) : G.guild.K);

    // hover and placement preview
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
    if (hov >= 0 && G.phase === 'raid' && ui.power === 'tremor') {
      const [cx, cy] = tc(hov);
      c.strokeStyle = P.maliceHi;
      c.setLineDash([4, 4]);
      c.beginPath(); c.arc(cx, cy, T * 1.6, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }

    // floating text
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const f of RD.FX.floaters) {
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

  function drawGuildMap(c, G, K) {
    const { T } = V;
    c.save();
    for (let i = 0; i < N; i++) {
      const [x, y] = xy(i);
      if (K.tiles[i] === -1) {
        c.fillStyle = 'rgba(13,11,16,0.72)';
        c.fillRect(x * T, y * T, T, T);
        c.strokeStyle = 'rgba(111,147,189,0.18)';
        c.lineWidth = 1;
        c.beginPath();
        for (let k = -T; k < T; k += Math.max(5, T / 4)) { c.moveTo(x * T + Math.max(0, k), y * T + Math.max(0, -k)); c.lineTo(x * T + Math.min(T, k + T), y * T + Math.min(T, T - k)); }
        c.stroke();
      } else if (K.tiles[i] !== G.tiles[i]) {
        // the guild's map is out of date here
        c.strokeStyle = 'rgba(156,192,230,0.75)';
        c.setLineDash([3, 3]);
        c.strokeRect(x * T + 3, y * T + 3, T - 6, T - 6);
        c.setLineDash([]);
      }
    }
    const mark = (i, label, stale) => {
      const [x, y] = xy(i);
      const cx = x * T + T * 0.78, cy = y * T + T * 0.22;
      c.fillStyle = stale ? 'rgba(13,11,16,0.85)' : P.ink;
      c.strokeStyle = P.steel;
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(cx, cy, T * 0.17, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = stale ? P.steel : '#0d0b10';
      c.font = `600 ${Math.max(8, T * 0.22)}px "DM Mono", ui-monospace, monospace`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, cx, cy + 0.5);
      if (stale) { c.strokeStyle = P.maliceHi; c.beginPath(); c.moveTo(cx - T * 0.15, cy + T * 0.15); c.lineTo(cx + T * 0.15, cy - T * 0.15); c.stroke(); }
    };
    const real = (i, kind) => { const it = G.items.get(i); return it && (kind ? kind(it) : true); };
    for (const [i, v] of K.traps) mark(i, '!', !real(i, (it) => RD.ITEMS[it.type].kind === 'trap'));
    for (const [i] of K.turrets) mark(i, '»', !real(i, (it) => it.type === 'darts'));
    for (const [i, t] of K.lairs) mark(i, { skeleton: 'Sk', slime: 'Sl', brute: 'Br', mimic: 'Mi' }[t] || '?', !real(i, (it) => it.type === t));
    for (const i of K.doors) mark(i, '#', !real(i, (it) => it.type === 'door'));
    for (const i of K.chests) if (!K.mimics.has(i)) mark(i, '$', !real(i, (it) => it.type === 'mimic'));
    if (K.hoard >= 0) {
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
      RD.glyph(c, type, size * 0.3, size / 2, size * 0.9, { dir: 0 });
      return;
    }
    RD.glyph(c, type, size / 2, size / 2, size * 0.95, { awake: false });
  };
})();
