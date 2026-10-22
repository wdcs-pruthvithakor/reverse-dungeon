'use strict';
// How to play: one short looping scene per idea, drawn with the game's own art.
// Each lesson has a map (# rock, . corridor, G gate, $ hoard, S stairs down), a loop length in seconds,
// and play(s, t), which draws the moment t of the loop. `show` names what "Show me on the map" points at.
(function () {
  const RD = window.RD;
  const P = RD.PAL;
  const T = 34;

  const clamp = (v) => Math.max(0, Math.min(1, v));
  const span = (t, a, b) => clamp((t - a) / (b - a)); // 0 before a, 1 after b
  const ease = (p) => p * p * (3 - 2 * p);
  // a point along a path of tile coordinates, p from 0 to 1
  function along(pts, p) {
    if (p <= 0) return pts[0];
    if (p >= 1) return pts[pts.length - 1];
    const n = pts.length - 1, f = p * n, i = Math.floor(f), k = f - i;
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
  }

  function scene(cv, map) {
    const rows = map.length, cols = map[0].length;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const CAP = T * 0.66; // a strip under the map for the caption
    cv.width = cols * T * dpr;
    cv.height = (rows * T + CAP) * dpr;
    cv.style.aspectRatio = `${cols * T} / ${rows * T + CAP}`;
    const c = cv.getContext('2d');
    const at = (x) => x * T + T / 2;
    const s = {
      c, T, t: 0,
      // the map, with `over` swapping single tiles ('x,y' → char) for digging and filling
      base(over) {
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.fillStyle = P.void;
        c.fillRect(0, 0, cols * T, rows * T + CAP);
        const ch = (x, y) => (over && over[x + ',' + y]) || map[y][x];
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const k = ch(x, y), px = x * T, py = y * T, r = RD.hash(x * 31 + y, 7);
          if (k === '#') {
            c.fillStyle = r < 0.5 ? P.rockA : P.rockB;
            c.fillRect(px, py, T, T);
            if (y < rows - 1 && ch(x, y + 1) !== '#') { c.fillStyle = P.rockFace; c.fillRect(px, py + T * 0.64, T, T * 0.36); c.fillStyle = P.rockRim; c.fillRect(px, py + T * 0.64, T, 2); }
          } else {
            c.fillStyle = r < 0.5 ? P.floorA : P.floorB;
            c.fillRect(px, py, T, T);
            c.strokeStyle = P.seam; c.lineWidth = 1;
            c.beginPath(); c.moveTo(px, py + T / 2 + 0.5); c.lineTo(px + T, py + T / 2 + 0.5); c.stroke();
            if (k === 'G') {
              const g = c.createRadialGradient(at(x), at(y), 0, at(x), at(y), T * 1.6);
              g.addColorStop(0, 'rgba(214,226,240,0.55)'); g.addColorStop(1, 'rgba(214,226,240,0)');
              c.fillStyle = g; c.fillRect(px - T, py - T, T * 3, T * 3);
              c.strokeStyle = 'rgba(233,224,210,0.6)'; c.lineWidth = 2;
              for (let i = 1; i <= 3; i++) { c.beginPath(); c.moveTo(px + (i * T) / 4, py + T * 0.15); c.lineTo(px + (i * T) / 4, py + T * 0.85); c.stroke(); }
            }
            if (k === 'S') RD.drawStairs(c, at(x), at(y), T, false);
            if (k === '$') RD.glyph(c, 'hoard', at(x), at(y), T);
          }
        }
      },
      piece(type, x, y, o) { RD.glyph(c, type, at(x), at(y), T, o || {}); },
      hero(cls, x, y, o) {
        o = o || {};
        if (o.alpha != null) c.globalAlpha = o.alpha;
        RD.drawHero(c, { cls, tier: o.tier || 0, title: '' }, at(x), at(y) + Math.sin(s.t * 12 + x) * 1.2, T * 0.95);
        if (o.gold) RD.glyph(c, 'hoard', at(x) + T * 0.28, at(y) - T * 0.3, T * 0.45);
        if (o.hp != null) {
          c.fillStyle = '#2a2026'; c.fillRect(at(x) - T * 0.35, at(y) - T * 0.52, T * 0.7, 3);
          c.fillStyle = o.hp > 0.5 ? '#86c06a' : o.hp > 0.25 ? '#e3b04b' : '#e46a7c'; c.fillRect(at(x) - T * 0.35, at(y) - T * 0.52, T * 0.7 * clamp(o.hp), 3);
        }
        c.globalAlpha = 1;
      },
      // the player's pointer; `press` from 0 to 1 draws the click ripple
      cursor(x, y, press) {
        const px = at(x) + T * 0.1, py = at(y) + T * 0.1;
        if (press > 0 && press < 1) { c.strokeStyle = `rgba(227,176,75,${1 - press})`; c.lineWidth = 2; c.beginPath(); c.arc(at(x), at(y), T * (0.2 + 0.5 * press), 0, Math.PI * 2); c.stroke(); }
        c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(px, py); c.lineTo(px, py + 16); c.lineTo(px + 4.5, py + 12); c.lineTo(px + 8, py + 19); c.lineTo(px + 10.5, py + 18); c.lineTo(px + 7, py + 11); c.lineTo(px + 12, py + 11); c.closePath(); c.fill(); c.stroke();
      },
      // text that rises and fades as p goes 0 → 1
      float(x, y, text, color, p) {
        if (p <= 0 || p >= 1) return;
        c.globalAlpha = 1 - p * p;
        c.font = `600 ${T * 0.38}px "DM Mono", monospace`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 3; c.strokeStyle = '#0d0b10'; c.strokeText(text, at(x), at(y) - p * T * 0.8);
        c.fillStyle = color; c.fillText(text, at(x), at(y) - p * T * 0.8);
        c.globalAlpha = 1;
      },
      ring(x, y, r, color, a) { c.globalAlpha = a == null ? 1 : a; c.strokeStyle = color; c.lineWidth = 2.5; c.beginPath(); c.arc(at(x), at(y), T * r, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; },
      // a pulsing gold ring: "look here"
      mark(x, y) { const p = 0.5 + 0.5 * Math.sin(s.t * 6); s.ring(x, y, 0.46 + 0.06 * p, 'rgba(227,176,75,0.9)', 0.5 + 0.5 * p); },
      tag(x, y, text, color) {
        c.font = `700 ${T * 0.3}px "DM Mono", monospace`;
        const w = c.measureText(text).width + 6;
        c.fillStyle = '#0d0b10'; c.fillRect(at(x) + T * 0.12, at(y) + T * 0.12, w, T * 0.34);
        c.strokeStyle = color; c.lineWidth = 1; c.strokeRect(at(x) + T * 0.12, at(y) + T * 0.12, w, T * 0.34);
        c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(text, at(x) + T * 0.12 + 3, at(y) + T * 0.29);
      },
      // a caption pinned to the bottom of the scene
      say(text, color) {
        c.font = `500 ${T * 0.34}px "Alegreya Sans", sans-serif`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = color || P.bone; c.fillText(text, cols * T / 2, rows * T + CAP / 2);
      },
      // a stand-in for a screen control (a button, a counter) drawn inside the scene
      chip(x, y, text, color, lit) {
        c.font = `600 ${T * 0.32}px "DM Mono", monospace`;
        const w = c.measureText(text).width + 14;
        c.fillStyle = lit ? 'rgba(196,60,104,0.35)' : '#1d1820'; c.fillRect(x * T, y * T + T * 0.18, w, T * 0.64);
        c.strokeStyle = color; c.lineWidth = lit ? 2 : 1; c.strokeRect(x * T + 0.5, y * T + T * 0.18 + 0.5, w - 1, T * 0.64 - 1);
        c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(text, x * T + 7, y * T + T / 2);
        return w / T;
      },
    };
    return s;
  }

  // ---------------------------------------------------------------- the lessons
  const corridor = ['########', 'G.....$#', '########'];
  RD.HOWTO = [
    {
      id: 'gate', title: 'The gate', show: 'gate', dur: 5, map: corridor,
      text: 'Heroes come in through the bright gate at the edge of your map, every night, and walk toward your gold. Press Open the gate when your dungeon is ready.',
      play(s, t) {
        s.base();
        s.mark(0, 1);
        for (let k = 0; k < 3; k++) { const p = span(t, 0.6 + k * 0.5, 4.2 + k * 0.4); if (p > 0 && p < 1) s.hero(['knight', 'rogue', 'mage'][k], ...along([[0, 1], [5, 1]], ease(p))); }
        s.say('The gate: heroes enter here');
      },
    },
    {
      id: 'hoard', title: 'Your hoard', show: 'hoard', dur: 6, map: corridor,
      text: 'The pile of gold is your hoard. Heroes grab some and run for the gate. The Hoard counter at the top is how much is left: if it reaches 0, the dungeon falls.',
      play(s, t) {
        s.base();
        s.mark(6, 1);
        const p1 = span(t, 0.2, 2.4), p2 = span(t, 3, 5.4);
        if (t < 2.8) s.hero('rogue', ...along([[0, 1], [5, 1]], ease(p1)));
        else s.hero('rogue', ...along([[5, 1], [0, 1]], ease(p2)), { gold: true, alpha: p2 > 0.95 ? 0 : 1 });
        s.float(6, 1, '−12 gold', P.gold, span(t, 2.5, 3.6));
        s.say(t < 2.6 ? 'They want your gold…' : '…and run out with it');
      },
    },
    {
      id: 'malice', title: 'Malice', show: 'malice', dur: 5, map: ['########', 'G..^..$#', '########'],
      text: 'Malice is your money for building. Every hero you kill pays malice, and you earn more each night. Spend it on traps, monsters, digging and levels.',
      play(s, t) {
        s.base();
        s.piece('spikes', 3, 1, { alpha: 0.35 });
        const p = span(t, 0.3, 2);
        if (t < 2.2) s.hero('knight', ...along([[0, 1], [3, 1]], ease(p)), { hp: 1 });
        else if (t < 2.8) { s.piece('spikes', 3, 1); s.hero('knight', 3, 1, { hp: 0, alpha: 1 - span(t, 2.2, 2.8) }); }
        s.float(3, 1, '+14 malice', P.maliceHi, span(t, 2.3, 3.8));
        const w = s.chip(0.15, 2, `Malice ${t > 3 ? 164 : 150}`, P.maliceHi, t > 3 && t < 3.8);
        s.say('Kill heroes → earn malice', P.maliceHi);
        return w;
      },
    },
    {
      id: 'place', title: 'Placing a trap or monster', show: 'catalog', dur: 5, map: ['#######', '#.....#', '#######'],
      text: 'Pick a blueprint from the list on the left (its price in malice is on the right), then click a corridor tile on the map. A red outline means it can’t go there.',
      play(s, t) {
        s.base();
        const w = s.chip(0.1, 0, 'Spike Pit  14', P.maliceHi, t > 0.6 && t < 2.6);
        const press = span(t, 0.4, 0.9), press2 = span(t, 2.4, 2.9);
        const [cx, cy] = t < 1.2 ? [w * 0.6, 0] : along([[w * 0.6, 0], [3, 1]], ease(span(t, 1.2, 2.3)));
        if (t > 1 && t < 2.5) s.piece('spikes', 3, 1, { alpha: 0.4 });
        if (t >= 2.5) s.piece('spikes', 3, 1);
        s.float(3, 1, '−14', P.maliceHi, span(t, 2.6, 3.6));
        s.cursor(cx, cy, t < 1.2 ? press : press2);
        s.say(t < 1.2 ? '1. pick a blueprint' : '2. click the map');
      },
    },
    {
      id: 'trap', title: 'Traps', show: 'catalog', dur: 5.5, map: ['########', 'G..^...#', '########'],
      text: 'Traps hide in the floor and fire when a hero steps on them, then rearm after a few seconds. Heroes who survive tell the guild, and next time they walk around it or a rogue disarms it, so move known traps.',
      play(s, t) {
        s.base();
        const fired = t > 1.8 && t < 2.6;
        s.piece('spikes', 3, 1, { alpha: fired ? 1 : 0.35 });
        const p = span(t, 0.2, 4.6);
        const [x, y] = along([[0, 1], [6, 1]], ease(p));
        s.hero('rogue', x, y, { hp: t < 1.9 ? 1 : 0.45 });
        s.float(3, 1, '44', '#e46a7c', span(t, 1.9, 3));
        if (fired) s.ring(3, 1, 0.5, P.maliceHi, 1 - span(t, 1.8, 2.6));
        s.say(t < 1.8 ? 'Hidden until stepped on…' : t < 3.4 ? 'Snap! 44 damage' : 'It rearms for the next one');
      },
    },
    {
      id: 'monster', title: 'Monsters', show: 'catalog', dur: 6, map: ['########', 'G....s.#', '########'],
      text: 'Monsters guard a few tiles around their post and fight any hero who comes close. They also chase heroes who run away with gold. Bosses (one per floor) are the strongest.',
      play(s, t) {
        s.base();
        const p = span(t, 0.2, 2.2);
        const [hx] = along([[0, 1], [4, 1]], ease(p));
        const hit = t > 2.2 && t < 4.4;
        const lunge = hit ? Math.sin(t * 9) * 0.12 : 0;
        if (t < 4.6) s.hero('knight', hx, 1, { hp: 1 - span(t, 2.2, 4.4) });
        s.piece('skeleton', 5 - Math.max(0, lunge), 1);
        s.ring(5, 1, 3, 'rgba(196,60,104,0.5)', 0.35);
        if (hit) { s.float(4, 1, '13', '#e46a7c', (t * 1.4) % 1); s.float(5, 1, '9', '#cfe3f2', (t * 1.4 + 0.5) % 1); }
        s.float(4, 1, '+12 malice', P.maliceHi, span(t, 4.4, 5.6));
        s.say(t < 2.2 ? 'A skeleton guards its post' : 'Fight!');
      },
    },
    {
      id: 'dig', title: 'Dig and fill', show: 'tools', dur: 6, map: ['#######', '#..#..#', '#######'],
      text: 'With Dig you click rock to carve a new corridor; with Fill you turn a corridor back into rock. Longer, twisting routes give your traps and monsters more time on each hero. The hoard must stay reachable.',
      play(s, t) {
        const dug = t > 1.4, filled = t > 4;
        const over = {};
        if (dug) over['3,1'] = '.';
        if (filled) over['5,1'] = '#';
        s.base(over);
        s.chip(0.1, 0, t < 3 ? 'Dig' : 'Fill', P.bone, true);
        if (t < 3) s.cursor(3, 1, span(t, 1, 1.5)); else s.cursor(5, 1, span(t, 3.6, 4.1));
        s.float(3, 1, '−6', P.maliceHi, span(t, 1.4, 2.4));
        s.say(t < 3 ? 'Dig: rock → corridor' : 'Fill: corridor → rock');
      },
    },
    {
      id: 'move', title: 'Move (free)', show: 'tools', dur: 5, map: ['#######', '#.....#', '#######'],
      text: 'Pick Move, click one of your pieces to lift it, then click where it should go, even on another floor. It is free. Moving traps the guild already knows about is the best way to keep heroes guessing.',
      play(s, t) {
        s.base();
        s.chip(0.1, 0, 'Move', P.bone, true);
        const p = ease(span(t, 1.4, 3));
        const [x, y] = along([[1, 1], [5, 1]], p);
        if (t > 1 && t < 3.2) { s.c.setLineDash([4, 4]); s.ring(x, y, 0.42, P.gold, 0.8); s.c.setLineDash([]); }
        s.piece('spikes', x, y);
        s.cursor(x, y, t < 1.4 ? span(t, 0.8, 1.3) : span(t, 3, 3.5));
        s.say(t < 1.4 ? 'Click a piece to lift it' : t < 3.3 ? 'Carry it…' : '…click to set it down');
      },
    },
    {
      id: 'level', title: 'Level up', show: 'tools', dur: 5, map: ['#####', '#...#', '#####'],
      text: 'Pick Level and click a placed piece to raise it, up to Lv5. Each level adds 15% damage and health, makes pins and stuns last longer and traps rearm faster. Higher ranks of blueprint unlock as nights go by.',
      play(s, t) {
        s.base();
        s.chip(0.1, 0, 'Level', P.gold, true);
        const lv = t < 1.2 ? 1 : t < 2.8 ? 2 : 3;
        s.piece('skeleton', 2, 1);
        s.tag(2, 1, 'Lv' + lv, P.gold);
        s.cursor(2, 1, t < 1.2 ? span(t, 0.7, 1.2) : span(t, 2.3, 2.8));
        s.float(2, 1, 'Lv2', P.gold, span(t, 1.2, 2.2));
        s.float(2, 1, 'Lv3', P.gold, span(t, 2.8, 3.8));
        const st = Object.fromEntries(RD.pieceStats('skeleton', lv));
        s.say(`Lv${lv}: ${st.Health} health, ${st.Hit} damage`, P.gold);
      },
    },
    {
      id: 'sell', title: 'Sell', show: 'tools', dur: 4, map: ['#####', '#...#', '#####'],
      text: 'Pick Sell and click a piece to remove it. You get back 60% of everything you spent on it (its price plus its levels). Use it to swap old, low-rank pieces for stronger ones.',
      play(s, t) {
        s.base();
        s.chip(0.1, 0, 'Sell', P.maliceHi, true);
        if (t < 1.5) s.piece('goblin', 2, 1); else s.piece('goblin', 2, 1, { alpha: 1 - span(t, 1.5, 2) });
        s.cursor(2, 1, span(t, 1, 1.5));
        s.float(2, 1, '+7 malice', P.maliceHi, span(t, 1.6, 2.8));
        s.say('60% of what you spent comes back');
      },
    },
    {
      id: 'hoardmove', title: 'Move the hoard', show: 'hoard', dur: 5, map: ['########', 'G......#', '########'],
      text: 'The Hoard tool hauls your gold to another tile (costs a little malice). Heroes who knew the old spot walk to the wrong place, through your traps.',
      play(s, t) {
        s.base();
        s.chip(0.1, 0, 'Hoard', P.gold, true);
        const p = ease(span(t, 1, 2.4));
        s.piece('hoard', ...along([[6, 1], [2, 1]], p));
        if (t > 2.4) { s.c.globalAlpha = 0.6; s.float(6, 1, '?', P.steel, 0.2); s.c.globalAlpha = 1; }
        s.cursor(...along([[6, 1], [2, 1]], p), t < 1 ? span(t, 0.5, 1) : span(t, 2.4, 2.9));
        s.say(t < 2.4 ? 'Haul the gold somewhere new' : 'The guild’s map is now wrong');
      },
    },
    {
      id: 'guild', title: 'The guild remembers', show: 'guild', dur: 7, map: ['########', 'G..^..$#', '#.....##', '########'],
      text: 'Anyone who escapes reports to the guild. Press G (or Guild’s map) to see what they know: an eye marks known traps. The next party walks around them. Kill every hero and they learn nothing.',
      play(s, t) {
        s.base();
        const known = t > 3.2;
        s.piece('spikes', 3, 1, { alpha: 0.4 });
        if (known) {
          s.c.fillStyle = P.steel; s.c.beginPath(); s.c.ellipse(3 * T + T * 0.25, T + T * 0.25, T * 0.14, T * 0.08, 0, 0, Math.PI * 2); s.c.fill();
          s.c.fillStyle = '#0d0b10'; s.c.beginPath(); s.c.arc(3 * T + T * 0.25, T + T * 0.25, T * 0.04, 0, Math.PI * 2); s.c.fill();
        }
        if (t < 3) s.hero('scout', ...along([[0, 1], [5, 1], [0, 1]], span(t, 0.2, 2.9)), { hp: t > 1 ? 0.6 : 1 });
        else s.hero('knight', ...along([[0, 1], [1, 1], [1, 2], [5, 2], [5, 1]], ease(span(t, 3.4, 6.6))));
        s.say(t < 3 ? 'A survivor reports the trap…' : '…so the next party goes around it', P.steel);
      },
    },
    {
      id: 'stairs', title: 'Floors and stairs', show: 'floors', dur: 5, map: ['########', 'G.....S#', '########'],
      text: 'From night 4 you can dig a new floor with the tab above the map. Stairs lead down to it and your hoard moves to the bottom, so heroes have to get past every floor first.',
      play(s, t) {
        s.base();
        s.mark(6, 1);
        const p = span(t, 0.3, 3);
        if (t < 3.3) s.hero('knight', ...along([[0, 1], [6, 1]], ease(p)), { alpha: 1 - span(t, 3, 3.3) });
        s.chip(0.1, 2, 'Floor I', P.bone, t < 3.3);
        s.chip(2.4, 2, 'Floor II', P.gold, t >= 3.3);
        s.say(t < 3.2 ? 'Stairs down to the next floor' : 'The view follows them below');
      },
    },
    {
      id: 'powers', title: 'Raid powers', show: 'powers', dur: 6, map: ['########', 'G.......', '########'],
      text: 'During a raid you can spend malice on powers at the bottom of the screen. Click a power, then a tile on the map. Hover a power to see what it does; the Guide’s Powers tab lists them all.',
      play(s, t) {
        s.base();
        const lit = t > 1.2 && t < 2.6;
        s.chip(0.1, 2, 'Tremor 12', P.maliceHi, lit);
        const [cx, cy] = t < 1.4 ? [0.8, 2] : along([[0.8, 2], [4, 1]], ease(span(t, 1.4, 2.4)));
        const boom = t > 2.6 && t < 4;
        const hx = along([[0, 1], [7, 1]], span(t, 0, 5.8))[0];
        s.hero('knight', hx, 1, { alpha: hx > 6.8 ? 0 : 1 });
        s.hero('mage', hx - 0.8, 1, { alpha: hx - 0.8 > 6.8 || hx < 0.8 ? 0 : 1 });
        if (boom) { s.ring(4, 1, 1.6 * span(t, 2.6, 3.2), P.maliceHi, 1 - span(t, 2.6, 4)); s.float(4, 1, 'knocked down', P.maliceHi, span(t, 2.6, 3.8)); }
        s.cursor(cx, cy, t < 1.4 ? span(t, 0.8, 1.3) : span(t, 2.3, 2.8));
        s.say(t < 1.4 ? '1. click a power' : '2. click the map');
      },
    },
    {
      id: 'ranks', title: 'Ranks', show: 'rating', dur: 6, map: ['#######', '#.....#', '#######'],
      text: 'Everything has a rank from F up to SSS: your blueprints, the heroes, and the guild’s rating of your dungeon (top bar). Higher ranks unlock as you survive more nights. Escaping heroes who saw strong pieces raise the rating, and stronger parties come.',
      play(s, t) {
        s.base();
        const tiers = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
        const k = Math.min(tiers.length - 1, Math.floor(t));
        // the cheapest ordinary monster of each rank
        const mon = Object.keys(RD.ITEMS).filter((x) => RD.ITEMS[x].kind === 'monster' && !RD.ITEMS[x].den && !RD.ITEMS[x].summonOnly && RD.ITEMS[x].tier === k).sort((a, b) => RD.ITEMS[a].cost - RD.ITEMS[b].cost)[0] || 'goblin';
        s.piece(mon, 3, 1);
        s.tag(3, 1, tiers[k], RD.TIER_COLOR[k]);
        s.say(`${tiers[k]}-rank: unlocks on night ${RD.TIER_UNLOCK[k]}`, RD.TIER_COLOR[k]);
      },
    },
    {
      id: 'boss', title: 'Bosses and the Boss Seal', show: 'catalog', dur: 6.5, map: ['########', '#...B..#', '########'],
      text: 'One boss can guard each floor. Place a Boss Seal on that floor and nobody can take the stairs or leave until the boss dies, so heroes who try to run have to fight it.',
      play(s, t) {
        s.base();
        RD.drawStairs(s.c, 1 * T + T / 2, T + T / 2, T, true);
        s.piece('goblinking', 4, 1);
        const sealed = t > 2.9 && t < 3.9;
        s.piece('seal', 1, 1, { alpha: sealed ? 1 : 0.5 });
        if (sealed) s.ring(1, 1, 0.55, P.gold, 1 - span(t, 2.9, 3.9));
        let x;
        if (t < 2) x = along([[1, 1], [3, 1]], ease(span(t, 0.2, 1.8)))[0];
        else if (t < 3) x = along([[3, 1], [1.6, 1]], ease(span(t, 2, 2.9)))[0];
        else x = along([[1.6, 1], [3.2, 1]], ease(span(t, 3.4, 4.2)))[0];
        s.hero('rogue', x, 1, { hp: 1 - 0.7 * span(t, 4.2, 6.2) });
        if (t > 4.2) s.float(3, 1, String(30 + Math.round(t * 7) % 9), '#e46a7c', (t * 1.3) % 1);
        s.say(t < 2 ? 'A boss guards the floor…' : t < 3.4 ? 'The hero tries to run back up…' : 'Sealed in: fight the boss', P.gold);
      },
    },
    {
      id: 'dropgate', title: 'One-way roads: Drop Gate and Exit Gate', show: 'catalog', dur: 7.5, map: ['########', 'G.....$#', '#.####.#', '#......#', '########'],
      text: 'Make heroes come in one way and leave by another. The Drop Gate is open and the Exit Gate is shut when the raid begins. Once the whole party has walked through the Drop Gate it crashes down and the Exit Gate opens, so the way out is the road you chose, past whatever waits there.',
      play(s, t) {
        s.base();
        const [x, y] = t < 2.6 ? along([[0, 1], [6, 1]], ease(span(t, 0.2, 2.4))) : along([[6, 1], [6, 3], [1, 3], [1, 1], [0, 1]], span(t, 2.8, 7));
        const shut = t > 0.95;
        s.piece('dropgate', 2, 1, { closed: shut });
        s.piece('exitgate', 6, 2, { closed: !shut });
        if (t > 0.95 && t < 1.8) { s.ring(2, 1, 0.55, P.maliceHi, 1 - span(t, 0.95, 1.8)); s.ring(6, 2, 0.55, P.venom, 1 - span(t, 0.95, 1.8)); }
        s.piece('skeleton', 3, 3);
        s.hero('rogue', x, y, { gold: t > 2.6, alpha: t > 6.9 ? 0 : 1, hp: 1 - 0.4 * span(t, 4.4, 5.2) });
        s.say(!shut ? 'In by the Drop Gate (exit still shut)…' : t < 2.8 ? 'Crash! The Exit Gate opens' : 'Out the long way, past the skeleton', shut ? P.venom : P.bone);
      },
    },
    {
      id: 'bait', title: 'Bait Chests', show: 'catalog', dur: 6, map: ['########', 'G.....$#', '#..#####', '########'],
      text: 'A Bait Chest holds real coin. Greedy heroes, and strike teams passing close by, go out of their way for it and stand still for 2 seconds to open it: the perfect moment for an ambush. Kill them before they leave, or whoever carries it out takes its gold from your hoard.',
      play(s, t) {
        s.base();
        const opened = t > 2.6;
        s.piece('bait', 2, 2, { off: opened });
        s.piece('skeleton', 1, 2);
        const [x, y] = t < 1.6 ? along([[0, 1], [2, 1], [2, 2]], ease(span(t, 0.2, 1.6))) : [2, 2];
        const hit = t > 1.8 && t < 4;
        s.hero('rogue', x + (hit ? Math.sin(t * 20) * 0.03 : 0), y, { hp: 1 - span(t, 1.8, 4.2), alpha: t > 4.4 ? 0 : 1 });
        if (t > 1.6 && t < 2.6) s.float(2, 2, 'opening…', P.gold, (t - 1.6));
        if (t > 4.2) s.float(2, 2, '+malice, gold safe', P.maliceHi, span(t, 4.2, 5.4));
        s.say(t < 1.6 ? 'Greedy heroes leave the road for it…' : t < 4.2 ? '…and stand still to open it' : 'Ambushed. The gold stays yours', P.gold);
      },
    },
    {
      id: 'ghost', title: 'Ghosts of legends', show: 'catalog', dur: 6, map: ['########', 'G......#', '########'],
      text: 'A legend who dies in your dungeon may return as a ghost where they fell (the Chosen Hero always does). Haunting ghosts frighten heroes, whispering ones feed the guild lies, vengeful ones rise as spectres and fight for you. A cleric, paladin, saint or sage can lay one to rest.',
      play(s, t) {
        s.base();
        const p = 0.5 + 0.5 * Math.sin(t * 2);
        s.c.save(); s.c.globalAlpha = 0.3 + 0.2 * p; RD.drawHero(s.c, { cls: 'chosen', tier: 6, title: 'x' }, 4 * T + T / 2, T + T / 2 - 3 * p, T * 0.9); s.c.restore();
        s.ring(4, 1, 0.45 + 0.05 * p, 'rgba(179,139,224,0.8)', 0.6);
        const [x] = t < 2.4 ? along([[0, 1], [2.4, 1]], ease(span(t, 0.2, 2.2))) : along([[2.4, 1], [0, 1]], ease(span(t, 2.8, 4.6)));
        s.hero('knight', x, 1, { alpha: t > 4.6 ? 0 : 1 });
        if (t > 2.3 && t < 3.4) s.float(2.4, 1, 'A ghost!', '#cfe3f2', span(t, 2.3, 3.4));
        s.say(t < 2.3 ? 'The Chosen Hero fell here…' : 'Haunting: heroes lose their nerve', '#b38be0');
      },
    },
    {
      id: 'undo', title: 'Undo and saved layouts', show: 'tools', dur: 5, map: ['######', '#....#', '######'],
      text: 'Undo (or Ctrl+Z) takes back any build action until you open the gate, with every bit of malice refunded. Layouts saves a floor and rebuilds it later in one go, paying only for what differs.',
      play(s, t) {
        s.base();
        const placed = t > 0.8 && t < 2.8;
        if (placed) s.piece('goblin', 3, 1);
        s.chip(0.1, 0, 'Undo', P.bone, t > 2.4 && t < 3);
        s.chip(1.7, 0, 'Layouts', P.gold, t > 3.6);
        if (t < 2.2) s.cursor(3, 1, span(t, 0.4, 0.9)); else if (t < 3.4) s.cursor(0.6, 0, span(t, 2.4, 2.9)); else s.cursor(2.6, 0, span(t, 3.8, 4.3));
        s.float(3, 1, '+12 back', P.maliceHi, span(t, 2.8, 3.8));
        s.say(t < 2.4 ? 'Placed by mistake?' : t < 3.6 ? 'Undo: every malice back' : 'Layouts: save and rebuild a floor');
      },
    },
    {
      id: 'combo', title: 'Combos', show: 'catalog', dur: 6, map: ['########', 'G......#', '########'],
      text: 'Some pieces work together. A hero pinned by a Bear Trap takes +50% from a Dart Slit (Skewered); a slowed hero takes double from a crushing trap (Shatter). The first time you pull one off it is added to the Guide’s Combos tab, where the rest are hinted.',
      play(s, t) {
        s.base();
        s.piece('darts', 3, 0);
        const pinned = t > 1.8 && t < 4.4;
        s.piece('snare', 3, 1, { alpha: pinned ? 1 : 0.4 });
        const x = t < 1.8 ? along([[0, 1], [3, 1]], ease(span(t, 0.2, 1.8)))[0] : t < 4.4 ? 3 : along([[3, 1], [6, 1]], span(t, 4.4, 5.8))[0];
        s.hero('knight', x, 1, { hp: 1 - 0.25 * span(t, 1.8, 2) - 0.45 * span(t, 2.6, 2.8) });
        if (t > 2.5 && t < 2.8) { s.c.strokeStyle = '#e9e0d2'; s.c.lineWidth = 2; s.c.beginPath(); s.c.moveTo(3 * T + T / 2, T * 0.8); s.c.lineTo(3 * T + T / 2, T * 1.4); s.c.stroke(); }
        s.float(3, 1, 'Skewered! ×1.5', '#ffd34d', span(t, 2.6, 4));
        s.say(t < 1.8 ? 'A Bear Trap in a Dart Slit’s line…' : t < 2.6 ? 'Pinned…' : 'Combo: +50% damage', '#ffd34d');
      },
    },
    {
      id: 'scry', title: 'Scry the raid', show: 'scry', dur: 6, map: ['########', 'G..^..s#', '#.....$#', '########'],
      text: 'Before you open the gate, Scry the raid (next to Open the gate, costs malice) rehearses tonight’s party against your dungeon: blue footprints show where they walk, and a card says how many should fall and which pieces do the work. Change anything and the scry goes stale.',
      play(s, t) {
        s.base();
        s.piece('spikes', 3, 1);
        s.piece('skeleton', 6, 1);
        s.chip(0.1, 3, 'Scry 22', P.steel, t > 0.7 && t < 1.5);
        s.cursor(0.8, 3, span(t, 0.6, 1.1));
        const p = span(t, 1.3, 4);
        const path = [[0, 1], [1, 1], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2]];
        for (let i = 0; i < path.length * p; i++) {
          const [x, y] = path[Math.min(path.length - 1, i)];
          s.c.fillStyle = 'rgba(156,192,230,0.6)';
          s.c.beginPath(); s.c.ellipse(x * T + T * 0.4, y * T + T * 0.55, 3, 5, 0, 0, Math.PI * 2); s.c.ellipse(x * T + T * 0.62, y * T + T * 0.42, 3, 5, 0.4, 0, Math.PI * 2); s.c.fill();
        }
        if (t > 4) s.chip(3.2, 3, '2–3 of 4 fall', P.bone, false);
        s.say(t < 1.3 ? 'Pay a little malice…' : t < 4 ? '…see where they will walk' : 'They go around your spikes!', P.steel);
      },
    },
  ];

  // play a lesson on a canvas until the returned stop() is called
  RD.playHowto = function (cv, lesson) {
    const s = scene(cv, lesson.map);
    let run = true;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    const tick = (now) => {
      if (!run || !cv.isConnected) return;
      s.t = ((now - t0) / 1000) % lesson.dur;
      if (reduced) s.t = lesson.dur * 0.6; // one still frame that shows the idea
      lesson.play(s, s.t);
      if (!reduced) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { run = false; };
  };
})();
