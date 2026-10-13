'use strict';
// DOM wiring: blueprints, the ledger, modals, input, and the frame loop.
(function () {
  const RD = window.RD;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const ui = (RD.ui = { tool: 'spikes', carry: null, power: null, speed: 1, previewError: null });
  let G = null;

  // ---------------------------------------------------------------- storage (best effort)
  const store = {
    del(k) { try { localStorage.removeItem('rd.' + k); } catch (e) { /* private mode */ } },
    get(k, d) { try { const v = localStorage.getItem('rd.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('rd.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  // ---------------------------------------------------------------- toast
  let toastT = 0;
  function toast(msg, good) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (good ? ' good' : '');
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.className = 'toast'), 1800);
  }

  // ---------------------------------------------------------------- blueprints
  function selectTool(t) {
    ui.tool = t;
    ui.carry = null;
    renderBlueprints();
  }

  function renderBlueprints() {
    const tools = $('tools');
    tools.innerHTML = '';
    for (const k of ['dig', 'fill', 'move', 'upgrade', 'hoard', 'sell']) {
      const T = RD.TOOLS[k];
      const b = el('button', 'tool' + (ui.tool === k ? ' on' : ''));
      b.type = 'button';
      b.title = `${T.name}${T.cost ? ' · ' + RD.costOf(G, k) + ' malice' : ''}`;
      b.setAttribute('aria-pressed', ui.tool === k);
      const cv = el('canvas');
      RD.drawIcon(cv, k, 26);
      b.append(cv, el('span', null, { hoard: 'Hoard', upgrade: 'Rank' }[k] || T.name));
      b.onclick = () => selectTool(k);
      tools.append(b);
    }
    const card = (type, sale) => {
      const d = RD.ITEMS[type];
      const cost = RD.costOf(G, type);
      const b = el('button', 'card' + (ui.tool === type ? ' on' : '') + (G.malice < cost ? ' poor' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', ui.tool === type);
      const cv = el('canvas');
      RD.drawIcon(cv, type, 36);
      const kind = { trap: d.hidden ? 'Hidden trap' : 'Trap', turret: 'Wall piece', monster: 'Monster', door: 'Obstacle' }[d.kind];
      b.append(cv, el('span', 'name', `${esc(d.name)}<small>${kind}${sale ? ' · <span class="sale">30% OFF</span>' : ''}</small>`), el('span', 'cost', cost));
      b.onclick = () => selectTool(type);
      return b;
    };
    $('basic').replaceChildren(...RD.BASIC.map((t) => card(t)));
    $('offers').replaceChildren(...G.offers.map((t) => card(t, G.sale === t)));
    renderDetail();
  }

  function renderDetail() {
    const d = RD.ITEMS[ui.tool] || RD.TOOLS[ui.tool];
    let extra = '';
    if (ui.tool === 'move' && ui.carry != null) extra = `<br><em>Carrying the ${esc(RD.ITEMS[G.items.get(ui.carry).type].name.toLowerCase())} from ${RD.coord(ui.carry)}. Click a tile to set it down, or Esc to cancel.</em>`;
    const cost = RD.costOf(G, ui.tool);
    $('detail').innerHTML = `<b>${esc(d.name)}${cost ? ` · <span style="color:var(--malice-hi)">${cost}</span>` : ''}</b>${esc(d.desc)}${extra}`;
  }

  // ---------------------------------------------------------------- ledger
  function heroRow(h, live) {
    const li = el('li', 'hero');
    const cv = el('canvas');
    drawHeroIcon(cv, h.cls);
    const C = RD.CLASSES[h.cls];
    const chips = h.traits.map((t) => `<span class="chip${t === 'stone' ? ' stone' : ''}" title="${esc(RD.TRAITS[t].desc)}">${esc(RD.TRAITS[t].name)}</span>`).join('');
    const vet = h.lvl > 1 ? `<span class="chip vet" title="Survived an earlier raid and came back stronger">Returns ×${h.lvl - 1}</span>` : '';
    let state = '';
    if (live) {
      const st = { seek: h.K && h.K.hoard >= 0 ? 'heading for the hoard' : 'exploring', loot: 'looting', escape: 'leaving with gold', flee: 'running', dead: 'dead', out: h.carry ? `escaped with ${h.carry} gold` : 'escaped' };
      state = `<span class="state">${st[h.state] || 'waiting at the gate'}</span>`;
      if (h.state === 'dead') li.classList.add('dead');
      if (h.state === 'out') li.classList.add('out');
    }
    const hp = live ? Math.max(0, Math.ceil(h.hp)) : h.maxHp;
    li.title = C.desc;
    li.innerHTML = `<span></span><div class="who"><b>${esc(h.name)}</b><small>${C.name}${live ? ' · ' : ''}</small>${state}<div class="chips">${vet}${chips}</div>${live ? `<div class="bar"><i style="width:${(100 * hp) / h.maxHp}%"></i></div>` : ''}</div><span class="hp">${hp}<br><small>hp</small></span>`;
    li.firstChild.replaceWith(cv);
    return li;
  }

  function drawHeroIcon(cv, cls) {
    const d = Math.min(2, window.devicePixelRatio || 1);
    cv.width = 28 * d; cv.height = 28 * d;
    cv.style.width = cv.style.height = '28px';
    const c = cv.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    c.translate(14, 14);
    const col = RD.PAL.hero[cls];
    c.fillStyle = col;
    c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#121016';
    c.font = '600 11px "DM Mono", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(RD.CLASSES[cls].name[0], 0, 1);
  }

  function renderParty() {
    const live = G.phase !== 'build' && G.R;
    $('party-h').textContent = live ? 'In your halls' : 'Coming tonight';
    $('adapt').textContent = live ? '' : G.adapt;
    $('adapt').hidden = !!live;
    const list = live ? G.R.heroes.concat(G.R.queue) : G.party;
    $('party').replaceChildren(...list.map((h) => heroRow(h, live)));
  }

  function renderRumors() {
    const r = G.guild.rumors;
    if (!r.length) { $('rumors').innerHTML = '<p class="empty">Nobody has been inside yet. The guild knows nothing.</p>'; return; }
    $('rumors').innerHTML = r.map((x) => `<li><q>${esc(x.text)}</q><cite>${esc(x.who)}</cite></li>`).join('');
  }

  function renderLog() {
    const L = G.R ? G.R.log : [];
    if (!L.length) { $('log').innerHTML = '<p class="empty">Quiet. Nothing has happened yet tonight.</p>'; return; }
    $('log').innerHTML = L.map((l) => `<li class="${l.tone}"><span>${fmtT(l.t)}</span>${esc(l.text)}</li>`).join('');
  }
  const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  const last = {};
  function setStat(id, v) {
    const e = $(id);
    if (last[id] === v) return;
    if (last[id] != null) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
    last[id] = v;
    e.textContent = v;
  }
  function renderStats() {
    setStat('st-raid', G.endless ? `${G.raid}` : `${G.raid} / ${RD.RAIDS_TO_WIN}`);
    setStat('st-gold', String(G.gold));
    setStat('st-malice', String(G.malice));
    setStat('st-known', Math.round(RD.coverage(G, G.guild.K) * 100) + '%');
  }

  function renderOmen() {
    $('omen').innerHTML = `<span class="tag">Tonight’s omen</span><b>${esc(G.omen.name)}</b><span>${esc(G.omen.text)}</span>`;
  }

  function renderPhase() {
    const raid = G.phase === 'raid';
    $('build-actions').hidden = raid;
    $('raid-actions').hidden = !raid;
    $('blueprints').classList.toggle('locked', G.phase !== 'build');
    if (raid) renderPowers();
  }

  function renderPowers() {
    const box = $('powers');
    box.innerHTML = '';
    for (const k of Object.keys(RD.POWERS)) {
      const p = RD.POWERS[k];
      const b = el('button', 'power' + (ui.power === k ? ' on' : ''));
      b.type = 'button';
      b.dataset.power = k;
      b.title = p.desc;
      const cv = el('canvas');
      RD.drawIcon(cv, k, 28);
      b.append(cv, el('span', null, `${p.name} <span class="cost">${p.cost}</span>`), el('i', 'cool'));
      b.onclick = () => {
        if (k === 'douse') {
          const err = RD.usePower(G, 'douse');
          toast(err || 'The torches gutter out.', !err);
          ui.power = null;
        } else ui.power = ui.power === k ? null : k;
        renderPowers();
      };
      box.append(b);
    }
  }
  function tickPowers() {
    for (const b of document.querySelectorAll('.power')) {
      const k = b.dataset.power;
      const cd = G.R.powers[k];
      b.disabled = cd > 0 || G.malice < RD.POWERS[k].cost;
      b.querySelector('.cool').style.width = cd > 0 ? (100 * cd) / RD.POWERS[k].cd + '%' : '0';
    }
  }

  function renderAll() {
    renderStats();
    renderOmen();
    renderBlueprints();
    renderParty();
    renderRumors();
    renderLog();
    renderPhase();
  }

  // ---------------------------------------------------------------- map input
  function canvasTile(e) {
    const r = RD.view.canvas.getBoundingClientRect();
    const sx = RD.view.w / r.width, sy = RD.view.h / r.height;
    return RD.tileAt((e.clientX - r.left) * sx, (e.clientY - r.top) * sy);
  }

  function preview(i) {
    if (i < 0 || G.phase !== 'build') { ui.previewError = null; return; }
    if (ui.tool === 'move') ui.previewError = ui.carry != null ? RD.check(G, 'move', i, ui.carry) : G.items.has(i) ? null : 'Pick a piece to move.';
    else ui.previewError = RD.check(G, ui.tool, i);
    const it = G.items.get(i);
    let what = it ? ` · ${RD.ITEMS[it.type].name}${(it.rank || 1) > 1 ? ` (rank ${it.rank})` : ''}` : i === G.hoard ? ' · the hoard' : i === G.entrance ? ' · the gate' : '';
    if (it && ui.tool === 'upgrade' && !ui.previewError) what += ` · rank ${(it.rank || 1) + 1} for ${RD.upgradeCost(it)} malice`;
    $('hint').innerHTML = `<b>${RD.coord(i)}</b>${esc(what)}${ui.previewError ? ' · ' + esc(ui.previewError) : ''}`;
  }

  function click(i) {
    if (i < 0) return;
    if (G.phase === 'raid') {
      if (ui.power === 'tremor') {
        const err = RD.usePower(G, 'tremor', i);
        if (err) toast(err);
        ui.power = null;
        renderPowers();
      }
      return;
    }
    if (G.phase !== 'build') return;
    if (ui.tool === 'move') {
      if (ui.carry == null) {
        if (!G.items.has(i)) return toast('Pick up a piece first.');
        ui.carry = i;
        renderDetail();
        return;
      }
      if (i === ui.carry) { ui.carry = null; renderDetail(); return; }
      const res = RD.apply(G, 'move', i, ui.carry);
      if (res.err) return toast(res.err);
      ui.carry = null;
      renderDetail();
      afterBuild();
      return;
    }
    const res = RD.apply(G, ui.tool, i);
    if (res.err) return toast(res.err);
    if (res.map) RD.view.dirty = true;
    const [x, y] = RD.xy(i);
    if (res.spent) RD.floater(x + 0.5, y + 0.3, '−' + res.spent, RD.PAL.maliceHi);
    if (res.gained) RD.floater(x + 0.5, y + 0.3, '+' + res.gained, RD.PAL.maliceHi);
    if (res.rank) RD.floater(x + 0.5, y - 0.1, 'Rank ' + res.rank, RD.PAL.gold, true);
    RD.burst(x + 0.5, y + 0.5, res.map ? RD.PAL.rockRim : RD.PAL.malice, 8, 1.5);
    afterBuild();
  }

  function afterBuild() {
    save();
    renderStats();
    renderBlueprints();
    preview(RD.view.hover);
  }

  // ---------------------------------------------------------------- raid flow
  function startRaid() {
    if (G.phase !== 'build') return;
    ui.carry = null;
    ui.power = null;
    RD.startRaid(G);
    renderAll();
  }

  RD.onRaidEnd = function () {
    renderAll();
    saveRecord();
    if (G.phase === 'over') store.del('save');
    else store.set('save', RD.saveGame(G, true));
    setTimeout(() => showDebrief(), 700);
  };

  function setSpeed(s) {
    ui.speed = s;
    for (const b of document.querySelectorAll('.speed button')) b.classList.toggle('on', +b.dataset.speed === s);
  }

  // ---------------------------------------------------------------- modals
  function openModal(html, onReady) {
    $('sheet').innerHTML = html;
    $('modal').hidden = false;
    if (onReady) onReady($('sheet'));
    const f = $('sheet').querySelector('[data-focus]');
    if (f) f.focus();
  }
  function closeModal() { $('modal').hidden = true; }
  const isOpen = () => !$('modal').hidden;

  function showIntro() {
    const best = store.get('best', null);
    const seed = (Math.random() * 1e6) | 0;
    const live = G && G.phase === 'build' && hasSave() ? G : null;
    openModal(`
      ${live ? `<div class="resume">
        <div><b>Your dungeon awaits</b><span>Night ${live.raid}${live.endless ? ' (endless)' : ` of ${RD.RAIDS_TO_WIN}`} · ${live.gold} gold · ${live.malice} malice · seed ${live.seed}</span></div>
        <button type="button" class="go" id="resume" data-focus>Resume</button>
      </div>` : ''}
      <p class="eyebrow">Strategy · Dungeon builder</p>
      <h2 id="sheet-title">The Reverse Dungeon</h2>
      <p class="lede">You play the dungeon, not the hero. Adventurers come for your gold every night. The ones who get out alive tell the guild what they saw, and the next party walks in knowing it.</p>
      <div class="cols">
        <div>
          <h3>Between raids</h3>
          <ul class="rules">
            <li><span>Dig and fill corridors, place traps and monsters, and move your hoard.</span></li>
            <li><span>Moving a piece is free. A trap the guild knows about is a trap they will step around.</span></li>
          </ul>
        </div>
        <div>
          <h3>During a raid</h3>
          <ul class="rules">
            <li><span>Heroes who escape share their map. Kill them before they reach the gate.</span></li>
            <li><span>Use the Guild’s map view to see what they believe, then turn it against them.</span></li>
          </ul>
        </div>
      </div>
      <p class="lede" style="margin-top:16px">Hold the hoard for ${RD.RAIDS_TO_WIN} raids. If it runs dry, the dungeon falls. Every seed builds a different dungeon, offers different blueprints and draws different omens.</p>
      ${best ? `<p class="record">Your best: held ${best.held} raid${best.held === 1 ? '' : 's'}, ${best.slain} heroes slain.</p>` : ''}
      <form class="seedrow" id="seedform">
        <label for="seed">Seed</label>
        <input id="seed" name="seed" inputmode="numeric" value="${seed}" autocomplete="off">
        <button type="button" class="ghost" id="reroll">New seed</button>
        <button type="submit" class="${live ? 'ghost' : 'go'}" ${live ? '' : 'data-focus'}>${live ? 'Start a new dungeon' : 'Wake the dungeon'}</button>
      </form>
      ${live ? '<p class="note">Starting a new dungeon replaces your saved one.</p>' : ''}`, (s) => {
      const r = s.querySelector('#resume');
      if (r) r.onclick = () => closeModal();
      s.querySelector('#reroll').onclick = () => { s.querySelector('#seed').value = (Math.random() * 1e6) | 0; };
      s.querySelector('#seedform').onsubmit = (e) => {
        e.preventDefault();
        const v = parseInt(s.querySelector('#seed').value, 10);
        newGame(Number.isFinite(v) ? v : (Math.random() * 1e6) | 0);
        save();
        closeModal();
      };
    });
  }

  function showDebrief() {
    const d = G.debrief;
    if (!d) return;
    const over = G.phase === 'over';
    const names = (list, cls, f) => list.length ? list.map((h) => `<li class="${cls}">${esc(h.name)} · ${RD.CLASSES[h.cls].name}${f ? f(h) : ''}</li>`).join('') : '<li class="empty">None</li>';
    const rum = d.rumors.length ? d.rumors.map((x) => `<li><q>${esc(x.text)}</q><cite>${esc(x.who)}</cite></li>`).join('') : '';
    let title = `Raid ${d.raid}: the reckoning`, eyebrow = 'Dawn', lede = '';
    if (!d.escaped.length && d.killed.length) lede = 'Nobody walked out. Whatever they learned tonight died with them.';
    else if (d.escaped.length && !d.killed.length) lede = 'Every hero walked out. The guild’s map just got better.';
    else lede = `${d.escaped.length} got out and reported to the guild. Expect them to plan around what they saw.`;
    if (over && G.result === 'lost') { eyebrow = 'The dungeon falls'; title = 'The hoard is empty'; lede = `The guild carried off the last of your gold on raid ${d.raid}. You slew ${G.stats.slain} heroes before the end.`; }
    if (over && G.result === 'won') { eyebrow = 'The guild gives up'; title = 'The dungeon endures'; lede = `You held your hoard through ${RD.RAIDS_TO_WIN} raids with ${G.gold} gold left and ${G.stats.slain} heroes slain. The guild has struck your dungeon from its maps.`; }
    openModal(`
      <p class="eyebrow">${eyebrow}</p>
      <h2 id="sheet-title">${title}</h2>
      <p class="lede">${lede}</p>
      <dl class="tally">
        <div><dt>Slain</dt><dd style="color:var(--malice-hi)">${d.killed.length}</dd></div>
        <div><dt>Escaped</dt><dd style="color:var(--steel)">${d.escaped.length}</dd></div>
        <div><dt>Gold lost</dt><dd style="color:var(--gold)">${d.goldLost}</dd></div>
        <div><dt>Malice earned</dt><dd style="color:var(--malice-hi)">${d.malice + d.income}</dd></div>
      </dl>
      <div class="cols">
        <div><h3>Slain</h3><ul class="names">${names(d.killed, 'k')}</ul></div>
        <div><h3>Escaped</h3><ul class="names">${names(d.escaped, 'e', (h) => (h.carry ? ` · ${h.carry} gold` : ''))}</ul></div>
      </div>
      ${rum ? `<h3>What the guild heard</h3><ul class="rumors">${rum}</ul>` : ''}
      <div class="seedrow">
        ${over ? `<button type="button" class="go" id="again" data-focus>Wake a new dungeon</button>${G.result === 'won' ? '<button type="button" class="ghost" id="endless">Keep going (endless)</button>' : ''}` : `<button type="button" class="go" id="next" data-focus>Prepare the next night</button>`}
      </div>`, (s) => {
      const n = s.querySelector('#next');
      if (n) n.onclick = () => { RD.nextNight(G); save(); RD.FX.floaters.length = RD.FX.parts.length = 0; closeModal(); renderAll(); toast(`Night ${G.raid}. ${G.party.length} heroes are coming.`, true); };
      const a = s.querySelector('#again');
      if (a) a.onclick = () => showIntro();
      const en = s.querySelector('#endless');
      if (en) en.onclick = () => { G.endless = true; G.phase = 'debrief'; RD.nextNight(G); save(); closeModal(); renderAll(); };
    });
  }

  // The game auto-saves at the start of each night and after every build action.
  // A refresh mid-raid replays that night from the build you left it in.
  const hasSave = () => store.get('save', null) != null;
  function save() { if (G && G.phase === 'build') store.set('save', RD.saveGame(G)); }

  function saveRecord() {
    const best = store.get('best', { held: 0, slain: 0 });
    const held = G.result === 'lost' ? G.stats.held - 1 : G.stats.held;
    if (held > best.held || (held === best.held && G.stats.slain > best.slain)) store.set('best', { held, slain: G.stats.slain });
  }

  // ---------------------------------------------------------------- setup
  function newGame(seed, loaded) {
    G = loaded || RD.newGame(seed);
    ui.tool = 'spikes';
    ui.carry = null;
    ui.power = null;
    setSpeed(1);
    RD.view.dirty = true;
    RD.FX.floaters.length = RD.FX.parts.length = 0;
    fit();
    renderAll();
  }

  function fit() {
    const wrap = $('board-wrap');
    const w = wrap.clientWidth - 18;
    const h = Math.max(300, window.innerHeight - 250);
    RD.resize(w, h);
  }

  function bind() {
    $('menu').onclick = () => { if (G.phase !== 'raid') showIntro(); else toast('Wait for dawn before leaving the dungeon.'); };
    const cv = $('board');
    RD.initRender(cv);
    cv.addEventListener('pointermove', (e) => {
      const i = canvasTile(e);
      if (i !== RD.view.hover) { RD.view.hover = i; preview(i); }
    });
    cv.addEventListener('pointerleave', () => { RD.view.hover = -1; ui.previewError = null; if (G && G.phase === 'build') $('hint').textContent = 'Pick a blueprint, then click the map.'; });
    cv.addEventListener('click', (e) => { const i = canvasTile(e); RD.view.hover = i; click(i); });
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); ui.carry = null; ui.power = null; renderDetail(); });
    $('go').onclick = startRaid;
    $('view-truth').onclick = () => setView(false);
    $('view-guild').onclick = () => setView(true);
    for (const b of document.querySelectorAll('.speed button')) b.onclick = () => setSpeed(+b.dataset.speed);
    window.addEventListener('resize', () => { if (G) fit(); });
    document.addEventListener('keydown', (e) => {
      if (isOpen() || e.target.tagName === 'INPUT') return;
      if (e.key === ' ') {
        e.preventDefault();
        if (G.phase === 'build') startRaid();
        else if (G.phase === 'raid') setSpeed(ui.speed ? 0 : 1);
      } else if (e.key === 'g' || e.key === 'G') setView(!RD.view.guildMap);
      else if (e.key === 'Escape') { ui.carry = null; ui.power = null; renderDetail(); if (G.phase === 'raid') renderPowers(); }
      else if (G.phase === 'raid' && '124'.includes(e.key)) setSpeed(+e.key);
    });
    $('modal').addEventListener('keydown', (e) => { if (e.key === 'Escape' && G && G.phase !== 'over' && G.phase !== 'debrief') closeModal(); });
  }

  function setView(guild) {
    RD.view.guildMap = guild;
    $('view-truth').classList.toggle('on', !guild);
    $('view-guild').classList.toggle('on', guild);
    $('view-truth').setAttribute('aria-pressed', !guild);
    $('view-guild').setAttribute('aria-pressed', guild);
  }

  let lastT = performance.now(), slowT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (G) {
      if (G.phase === 'raid' && ui.speed > 0 && !isOpen()) {
        let t = dt * ui.speed;
        while (t > 1e-6 && G.phase === 'raid') { const s = Math.min(t, 1 / 60); RD.step(G, s); t -= s; }
        RD.fxUpdate(dt * ui.speed);
      } else RD.fxUpdate(dt);
      RD.draw(G, ui, dt);
      slowT += dt;
      if (slowT > 0.2 && G.phase === 'raid') {
        slowT = 0;
        renderStats();
        renderParty();
        renderLog();
        tickPowers();
      }
    }
    requestAnimationFrame(frame);
  }

  function boot() {
    bind();
    let loaded = null;
    try { loaded = RD.loadGame(store.get('save', null)); } catch (e) { loaded = null; }
    if (!loaded) store.del('save');
    newGame((Math.random() * 1e6) | 0, loaded);
    showIntro();
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
