'use strict';
// DOM wiring: blueprints, floors, the ledger, modals, input, and the frame loop.
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
  const tierTag = (t) => `<span class="tier" style="--tc:${RD.TIER_COLOR[t]}">${RD.TIERS[t]}</span>`;

  const ui = (RD.ui = { tool: 'spikes', carry: null, power: null, speed: 1, previewError: null, follow: true, diff: 'normal', hoverIt: null });
  let G = null;

  // ---------------------------------------------------------------- storage (best effort)
  const store = {
    del(k) { try { localStorage.removeItem('rd.' + k); } catch (e) { /* private mode */ } },
    get(k, d) { try { const v = localStorage.getItem('rd.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('rd.' + k, JSON.stringify(v)); } catch (e) { /* private mode or full */ } },
  };
  ui.diff = store.get('diff', 'normal');

  // ---------------------------------------------------------------- toast
  let toastT = 0;
  function toast(msg, good) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (good ? ' good' : '');
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.className = 'toast'), good ? 3200 : 1800);
  }

  // ---------------------------------------------------------------- blueprints
  function selectTool(t) {
    ui.tool = t;
    ui.carry = null;
    renderBlueprints();
  }

  function card(type, sale, locked) {
    const d = RD.ITEMS[type];
    const cost = RD.costOf(G, type);
    const b = el('button', 'card' + (ui.tool === type ? ' on' : '') + (G.malice < cost ? ' poor' : '') + (locked ? ' locked' : '') + (d.boss ? ' boss' : ''));
    b.type = 'button';
    b.setAttribute('aria-pressed', ui.tool === type);
    const cv = el('canvas');
    RD.drawIcon(cv, type, 36);
    const kind = d.boss ? (d.lord ? 'Demon Lord' : d.myth ? 'Myth boss' : 'Boss') : { trap: d.hidden ? 'Hidden trap' : 'Trap', turret: 'Wall piece', monster: d.elite ? 'Elite monster' : 'Monster', door: 'Obstacle' }[d.kind];
    const sub = locked ? `Unlocks night ${RD.TIER_UNLOCK[d.tier]}` : `${kind}${sale ? ' · <span class="sale">30% OFF</span>' : ''}`;
    b.append(cv, el('span', 'name', `${tierTag(d.tier)} ${esc(d.name)}<small>${sub}</small>`), el('span', 'cost', locked ? '—' : cost));
    if (locked) b.disabled = true;
    else b.onclick = () => selectTool(type);
    return b;
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
      b.append(cv, el('span', null, { hoard: 'Hoard', upgrade: 'Level' }[k] || T.name));
      b.onclick = () => selectTool(k);
      tools.append(b);
    }
    const top = RD.unlocked(G);
    $('basic').replaceChildren(...RD.BASIC.map((t) => card(t)));
    $('offers').replaceChildren(...(G.offers.length ? G.offers.map((t) => card(t, G.sale === t)) : [el('p', 'empty', 'Nothing yet. Higher-rank blueprints start turning up on night ' + RD.TIER_UNLOCK[1] + '.')]));
    const bosses = RD.BOSSES.filter((b) => RD.ITEMS[b].tier <= top).map((b) => card(b));
    const nextBoss = RD.BOSSES.find((b) => RD.ITEMS[b].tier > top);
    if (nextBoss) bosses.push(card(nextBoss, false, true));
    $('bosses').replaceChildren(...bosses);
    const nu = RD.nextUnlock(G);
    $('unlock').innerHTML = nu ? `Next: ${tierTag(nu.tier)} blueprints on night ${nu.night}: ${nu.items.map((k) => esc(RD.ITEMS[k].name)).join(', ')}.` : 'Every rank is open to you.';
    renderDetail();
  }

  function statTable(type, lv, next) {
    const now = RD.pieceStats(type, lv);
    const after = next ? RD.pieceStats(type, lv + 1) : null;
    return `<table class="st">${now.map(([k, v], i) => {
      const n = after && after[i] && after[i][1] !== v ? `<td class="up">→ ${esc(after[i][1])}</td>` : after ? '<td></td>' : '';
      return `<tr><th>${esc(k)}</th><td>${esc(v)}</td>${n}</tr>`;
    }).join('')}</table>`;
  }

  // The detail panel describes whatever you are pointing at: a placed piece, else the selected blueprint or tool.
  function renderDetail() {
    const box = $('detail');
    const it = ui.hoverIt && G.items.get(ui.hoverIt.tile) === ui.hoverIt ? ui.hoverIt : null;
    if (it && G.phase === 'build') {
      const d = RD.ITEMS[it.type];
      const lv = it.lv || 1;
      const max = lv >= RD.MAX_LEVEL;
      let foot = '';
      if (ui.tool === 'upgrade') foot = max ? `<p class="foot">Lv${RD.MAX_LEVEL} is the most a ${RD.TIERS[d.tier]}-rank piece can reach. A higher-rank piece is the next step.</p>` : `<p class="foot">Level up to Lv${lv + 1} for <b class="m">${RD.levelCost(it)}</b> malice.</p>`;
      if (ui.tool === 'sell') foot = `<p class="foot">Sell for <b class="m">${Math.round((d.cost + (it.paid || 0)) * 0.6)}</b> malice.</p>`;
      box.innerHTML = `<b>${tierTag(d.tier)} ${esc(d.name)} <span class="lv">Lv${lv}/${RD.MAX_LEVEL}</span></b>${statTable(it.type, lv, ui.tool === 'upgrade' && !max)}${foot}`;
      return;
    }
    if (RD.ITEMS[ui.tool]) {
      const d = RD.ITEMS[ui.tool];
      const cost = RD.costOf(G, ui.tool);
      box.innerHTML = `<b>${tierTag(d.tier)} ${esc(d.name)} · <span class="m">${cost}</span></b>${esc(d.desc)}${statTable(ui.tool, 1, false)}`;
      return;
    }
    const d = RD.TOOLS[ui.tool];
    let extra = '';
    if (ui.tool === 'move' && ui.carry != null) extra = `<br><em>Carrying the ${esc(RD.ITEMS[G.items.get(ui.carry).type].name.toLowerCase())} from ${RD.coord(ui.carry)}. Click a tile to set it down (switch floors to carry it deeper), or Esc to cancel.</em>`;
    const cost = RD.costOf(G, ui.tool);
    box.innerHTML = `<b>${esc(d.name)}${cost ? ` · <span class="m">${cost}</span>` : ''}</b>${esc(d.desc)}${extra}`;
  }

  // ---------------------------------------------------------------- floors
  function setFloor(f, manual) {
    if (f < 0 || f >= G.floors) return;
    if (manual && G.phase === 'raid') ui.follow = false;
    RD.view.floor = f;
    RD.fxFloor(f);
    renderFloors();
  }

  function renderFloors() {
    const box = $('floors');
    box.innerHTML = '';
    const R = G.R;
    for (let f = 0; f < G.floors; f++) {
      const b = el('button', 'floor' + (RD.view.floor === f ? ' on' : ''));
      b.type = 'button';
      let n = 0;
      if (R) for (const h of R.heroes) if (RD.heroAlive(h) && RD.fl(h.tile) === f) n++;
      const hoard = RD.fl(G.hoard) === f ? '<i class="dot gold" title="The hoard"></i>' : '';
      const boss = [...G.items.values()].find((it) => RD.fl(it.tile) === f && RD.ITEMS[it.type].boss);
      b.innerHTML = `Floor ${RD.ROMAN[f]}${hoard}${boss ? ` <small>${esc(RD.ITEMS[boss.type].name)}</small>` : ''}${n ? ` <span class="count">${n}</span>` : ''}`;
      b.setAttribute('aria-pressed', RD.view.floor === f);
      b.onclick = () => setFloor(f, true);
      box.append(b);
    }
    if (G.floors < RD.MAX_FLOORS && G.phase === 'build') {
      const err = RD.canOpenFloor(G);
      const night = RD.FLOOR_UNLOCK[G.floors];
      const b = el('button', 'floor dig' + (err ? ' wait' : ''));
      b.type = 'button';
      b.innerHTML = G.raid < night ? `Floor ${RD.ROMAN[G.floors]} <small>night ${night}</small>` : `+ Dig floor ${RD.ROMAN[G.floors]} <span class="m">${RD.FLOOR_COST[G.floors]}</span>`;
      b.title = err || 'Dig a new floor below. Your hoard is carried down to it.';
      b.onclick = () => {
        const res = RD.openFloor(G);
        if (res.err) return toast(res.err);
        setFloor(res.floor);
        RD.view.dirty = true;
        save();
        renderAll();
        toast(`Floor ${RD.ROMAN[res.floor]} is dug. Stairs at ${RD.coord(res.stairs)}, and your hoard was carried down to ${RD.coord(G.hoard)}.`, true);
      };
      box.append(b);
    }
  }

  // ---------------------------------------------------------------- ledger
  function heroRow(h, live) {
    const li = el('li', 'hero' + (h.title ? ' legend' : ''));
    const cv = el('canvas');
    RD.heroIcon(cv, h, 28);
    const C = RD.CLASSES[h.cls];
    const chips = (h.traits || []).map((t) => `<span class="chip${t === 'stone' ? ' stone' : ''}" title="${esc(RD.TRAITS[t].desc)}">${esc(RD.TRAITS[t].name)}</span>`).join('');
    const vet = h.lvl > 1 ? `<span class="chip vet" title="Survived an earlier raid and came back stronger">Returns ×${h.lvl - 1}</span>` : '';
    let state = '';
    if (live) {
      const st = { seek: h.K && h.K.hoard >= 0 ? 'heading for the hoard' : 'exploring', loot: 'looting', escape: 'leaving with gold', flee: 'running', dead: 'dead', out: h.carry ? `escaped with ${h.carry} gold` : 'escaped' };
      state = `<span class="state">${st[h.state] || 'waiting at the gate'}${h.tile != null && RD.heroAlive(h) && G.floors > 1 ? ` · floor ${RD.ROMAN[RD.fl(h.tile)]}` : ''}</span>`;
      if (h.state === 'dead') li.classList.add('dead');
      if (h.state === 'out') li.classList.add('out');
    }
    const hp = live ? Math.max(0, Math.ceil(h.hp)) : h.maxHp;
    li.title = `${C.desc}\nHealth ${h.maxHp} · Damage ${Math.round(h.dmg)} every ${h.rate}s`;
    li.innerHTML = `<span></span><div class="who"><b>${tierTag(h.tier)} ${esc(h.name)}</b><small>${h.title ? `<em>${esc(h.title)}</em> · ` : ''}${C.name}${live ? ' · ' : ''}</small>${state}<div class="chips">${vet}${chips}</div>${live ? `<div class="bar"><i style="width:${(100 * hp) / h.maxHp}%"></i></div>` : ''}</div><span class="hp">${hp}<br><small>hp</small></span>`;
    li.firstChild.replaceWith(cv);
    return li;
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

  const logItems = (L) => L.map((l) => `<li class="t-${l.tone}"><span>${fmtT(l.t)}</span>${esc(l.text)}</li>`).join('');
  function renderLog() {
    const raid = G.R && G.phase !== 'build';
    const last = G.history[0];
    $('log-h').textContent = raid ? 'Raid log' : last ? `Last raid · night ${last.raid}` : 'Raid log';
    const L = raid ? G.R.log : last ? last.log : [];
    $('log').innerHTML = L.length ? logItems(L) : '<p class="empty">Quiet. Nothing has happened yet.</p>';
    $('reports').hidden = !G.history.length;
  }
  const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  const last = {};
  function setStat(id, v, color) {
    const e = $(id);
    if (color) e.style.color = color;
    if (last[id] === v) return;
    if (last[id] != null) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
    last[id] = v;
    e.textContent = v;
  }
  function renderStats() {
    setStat('st-raid', G.endless ? `${G.raid}` : `${G.raid} / ${RD.winAt(G)}`);
    setStat('st-gold', String(G.gold));
    setStat('st-malice', String(G.malice));
    const t = Math.round(G.guild.threat);
    setStat('st-rating', RD.TIERS[t], RD.TIER_COLOR[t]);
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
    renderFloors();
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
    const prevHover = ui.hoverIt;
    ui.hoverIt = i >= 0 && G.phase === 'build' ? G.items.get(i) || null : null;
    if (ui.hoverIt !== prevHover) renderDetail();
    if (i < 0 || G.phase !== 'build') { ui.previewError = null; return; }
    if (ui.tool === 'move') ui.previewError = ui.carry != null ? RD.check(G, 'move', i, ui.carry) : G.items.has(i) ? null : 'Pick a piece to move.';
    else ui.previewError = RD.check(G, ui.tool, i);
    const it = G.items.get(i);
    let what = it ? ` · ${RD.TIERS[RD.ITEMS[it.type].tier]}-rank ${RD.ITEMS[it.type].name} Lv${it.lv || 1}` : i === G.hoard ? ' · the hoard' : RD.isGate(G, i) ? (i === G.entrance ? ' · the gate' : ' · stairs up') : RD.isStairs(G, i) ? ' · stairs down' : '';
    if (it && ui.tool === 'upgrade' && !ui.previewError) what += ` · Lv${(it.lv || 1) + 1} for ${RD.levelCost(it)} malice`;
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
    if (res.lv) RD.floater(x + 0.5, y - 0.1, 'Lv' + res.lv, RD.PAL.gold, true);
    RD.burst(x + 0.5, y + 0.5, res.map ? RD.PAL.rockRim : RD.PAL.malice, 8, 1.5);
    afterBuild();
    ui.hoverIt = null;
    preview(RD.view.hover);
  }

  function afterBuild() {
    save();
    renderStats();
    renderBlueprints();
    renderFloors();
    preview(RD.view.hover);
  }

  // ---------------------------------------------------------------- raid flow
  function startRaid() {
    if (G.phase !== 'build') return;
    ui.carry = null;
    ui.power = null;
    ui.hoverIt = null;
    ui.follow = true;
    RD.startRaid(G);
    setFloor(0);
    renderAll();
  }

  // during a raid, keep the camera on the floor where the heroes are
  function follow() {
    if (!ui.follow || !G.R) return;
    const live = G.R.heroes.filter(RD.heroAlive);
    if (!live.length || live.some((h) => RD.fl(h.tile) === RD.view.floor)) return;
    setFloor(Math.max(...live.map((h) => RD.fl(h.tile))));
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

  // what tonight brings that last night did not
  function announce() {
    const top = RD.unlocked(G);
    const msgs = [];
    if (RD.TIER_UNLOCK[top] === G.raid && top > 0) msgs.push(`${RD.TIERS[top]}-rank blueprints unlocked`);
    if (G.floors < RD.MAX_FLOORS && RD.FLOOR_UNLOCK[G.floors] === G.raid) msgs.push(`floor ${RD.ROMAN[G.floors]} can be dug`);
    const legend = G.party.find((h) => h.title);
    if (legend) msgs.push(`a legend is coming: ${legend.name} ${legend.title}`);
    toast(`Night ${G.raid}. ${G.party.length} heroes are coming${msgs.length ? '. ' + msgs.join(', ') : ''}.`, true);
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
    const diffs = Object.entries(RD.DIFF).map(([k, d]) => `<label class="diff${ui.diff === k ? ' on' : ''}"><input type="radio" name="diff" value="${k}"${ui.diff === k ? ' checked' : ''}><b>${esc(d.name)}</b><span>${esc(d.blurb)} Hold ${d.win} nights.</span></label>`).join('');
    openModal(`
      ${live ? `<div class="resume">
        <div><b>Your dungeon awaits</b><span>${esc(RD.DIFF[live.diff].name)} · night ${live.raid}${live.endless ? ' (endless)' : ` of ${RD.winAt(live)}`} · ${live.floors} floor${live.floors > 1 ? 's' : ''} · ${live.gold} gold · ${live.malice} malice · rated ${RD.rating(live.guild.threat)}</span></div>
        <button type="button" class="go" id="resume" data-focus>Resume</button>
      </div>` : ''}
      <p class="eyebrow">Strategy · Dungeon builder</p>
      <h2 id="sheet-title">The Reverse Dungeon</h2>
      <p class="lede">You play the dungeon, not the hero. Adventurers come for your gold every night. The ones who get out alive tell the guild what they saw, and the next party walks in knowing it.</p>
      <div class="cols">
        <div>
          <h3>Between raids</h3>
          <ul class="rules">
            <li><span>Build traps, monsters and bosses. Everything has a rank from F to SSS. Higher ranks and deeper floors unlock as you survive.</span></li>
            <li><span>The guild rates your dungeon by what survivors saw. Show them an S-rank monster and S-rank heroes come for it.</span></li>
          </ul>
        </div>
        <div>
          <h3>During a raid</h3>
          <ul class="rules">
            <li><span>Heroes who escape share their map. Kill them before they reach the gate and your secrets stay secret.</span></li>
            <li><span>Rare legends join some parties. Raise a Demon Lord and the guild sends its Chosen Hero.</span></li>
          </ul>
        </div>
      </div>
      <h3>Difficulty</h3>
      <div class="diffs" role="radiogroup">${diffs}</div>
      ${best ? `<p class="record">Your best: held ${best.held} raid${best.held === 1 ? '' : 's'}, ${best.slain} heroes slain.</p>` : ''}
      <form class="seedrow" id="seedform">
        <label for="seed">Seed</label>
        <input id="seed" name="seed" inputmode="numeric" value="${seed}" autocomplete="off">
        <button type="button" class="ghost" id="reroll">New seed</button>
        <button type="submit" class="${live ? 'ghost' : 'go'}" ${live ? '' : 'data-focus'}>${live ? 'Start a new dungeon' : 'Wake the dungeon'}</button>
      </form>
      ${live ? '<p class="note">Starting a new dungeon replaces your saved one. Difficulty applies to new dungeons.</p>' : ''}`, (s) => {
      const r = s.querySelector('#resume');
      if (r) r.onclick = () => closeModal();
      for (const inp of s.querySelectorAll('input[name=diff]')) inp.onchange = () => {
        ui.diff = inp.value;
        store.set('diff', ui.diff);
        for (const l of s.querySelectorAll('.diff')) l.classList.toggle('on', l.querySelector('input').checked);
      };
      s.querySelector('#reroll').onclick = () => { s.querySelector('#seed').value = (Math.random() * 1e6) | 0; };
      s.querySelector('#seedform').onsubmit = (e) => {
        e.preventDefault();
        const v = parseInt(s.querySelector('#seed').value, 10);
        newGame(Number.isFinite(v) ? v : (Math.random() * 1e6) | 0, null, ui.diff);
        save();
        closeModal();
        announce();
      };
    });
  }

  const heroLi = (h, cls, extra) => `<li class="${cls}${h.title ? ' legend' : ''}">${tierTag(h.tier)} ${esc(h.name)}${h.title ? ` <em>${esc(h.title)}</em>` : ''} · ${RD.CLASSES[h.cls].name}${extra || ''}</li>`;

  function showDebrief() {
    const d = G.debrief;
    if (!d) return;
    const over = G.phase === 'over';
    const names = (list, cls, f) => list.length ? list.map((h) => heroLi(h, cls, f ? f(h) : '')).join('') : '<li class="empty">None</li>';
    const rum = d.rumors.length ? d.rumors.map((x) => `<li><q>${esc(x.text)}</q><cite>${esc(x.who)}</cite></li>`).join('') : '';
    let title = `Raid ${d.raid}: the reckoning`, eyebrow = 'Dawn', lede = '';
    if (!d.escaped.length && d.killed.length) lede = 'Nobody walked out. Whatever they learned tonight died with them.';
    else if (d.escaped.length && !d.killed.length) lede = 'Every hero walked out. The guild’s map just got better.';
    else lede = `${d.escaped.length} got out and reported to the guild. Expect them to plan around what they saw.`;
    if (over && G.result === 'lost') { eyebrow = 'The dungeon falls'; title = 'The hoard is empty'; lede = `The guild carried off the last of your gold on raid ${d.raid}. You slew ${G.stats.slain} heroes${G.stats.legends ? `, ${G.stats.legends} of them legends,` : ''} before the end.`; }
    if (over && G.result === 'won') { eyebrow = 'The guild gives up'; title = 'The dungeon endures'; lede = `You held your hoard through ${RD.winAt(G)} raids with ${G.gold} gold left and ${G.stats.slain} heroes slain. The guild has struck your dungeon from its maps.`; }
    const a = RD.assess(G);
    openModal(`
      <p class="eyebrow">${eyebrow}</p>
      <h2 id="sheet-title">${title}</h2>
      <p class="lede">${lede}</p>
      <dl class="tally">
        <div><dt>Slain</dt><dd style="color:var(--malice-hi)">${d.killed.length}</dd></div>
        <div><dt>Escaped</dt><dd style="color:var(--steel)">${d.escaped.length}</dd></div>
        <div><dt>Gold lost</dt><dd style="color:var(--gold)">${d.goldLost}</dd></div>
        <div><dt>Malice earned</dt><dd style="color:var(--malice-hi)">${d.malice + d.income}</dd></div>
        ${over ? '' : `<div><dt>Next rating</dt><dd style="color:${RD.TIER_COLOR[Math.round(a.threat)]}">${RD.rating(a.threat)}</dd></div>`}
      </dl>
      <div class="cols">
        <div><h3>Slain</h3><ul class="names">${names(d.killed, 'k')}</ul></div>
        <div><h3>Escaped</h3><ul class="names">${names(d.escaped, 'e', (h) => (h.carry ? ` · ${h.carry} gold` : ''))}</ul></div>
      </div>
      ${rum ? `<h3>What the guild heard</h3><ul class="rumors">${rum}</ul>` : ''}
      <div class="seedrow">
        ${over ? `<button type="button" class="go" id="again" data-focus>Wake a new dungeon</button>${G.result === 'won' ? '<button type="button" class="ghost" id="endless">Keep going (endless)</button>' : ''}` : `<button type="button" class="go" id="next" data-focus>Prepare the next night</button>`}
        <button type="button" class="ghost" id="log-btn">Full raid log</button>
      </div>`, (s) => {
      const n = s.querySelector('#next');
      if (n) n.onclick = () => { RD.nextNight(G); save(); RD.FX.floaters.length = RD.FX.parts.length = 0; closeModal(); renderAll(); announce(); };
      const ag = s.querySelector('#again');
      if (ag) ag.onclick = () => showIntro();
      const en = s.querySelector('#endless');
      if (en) en.onclick = () => { G.endless = true; G.phase = 'debrief'; RD.nextNight(G); save(); closeModal(); renderAll(); announce(); };
      s.querySelector('#log-btn').onclick = () => showReports(0, true);
    });
  }

  // The last five raids, kept in the save so they survive a refresh.
  function showReports(i, fromDebrief) {
    const H = G.history;
    if (!H.length) return;
    i = Math.max(0, Math.min(H.length - 1, i));
    const r = H[i];
    const names = (list, cls) => list.length ? list.map((h) => heroLi(h, cls, h.carry ? ` · ${h.carry} gold` : '')).join('') : '<li class="empty">None</li>';
    openModal(`
      <p class="eyebrow">Raid reports</p>
      <h2 id="sheet-title">Night ${r.raid}</h2>
      <div class="seg tabs" role="tablist">${H.map((h, k) => `<button type="button" role="tab" data-k="${k}" class="${k === i ? 'on' : ''}" aria-selected="${k === i}">Night ${h.raid}</button>`).join('')}</div>
      <p class="lede">${esc(r.omen)} · guild rating ${esc(r.rating)} · ${r.floors} floor${r.floors > 1 ? 's' : ''}</p>
      <dl class="tally">
        <div><dt>Slain</dt><dd style="color:var(--malice-hi)">${r.killed.length}</dd></div>
        <div><dt>Escaped</dt><dd style="color:var(--steel)">${r.escaped.length}</dd></div>
        <div><dt>Gold lost</dt><dd style="color:var(--gold)">${r.goldLost}</dd></div>
        <div><dt>Malice earned</dt><dd style="color:var(--malice-hi)">${r.malice}</dd></div>
      </dl>
      <div class="cols">
        <div><h3>Slain</h3><ul class="names">${names(r.killed, 'k')}</ul></div>
        <div><h3>Escaped</h3><ul class="names">${names(r.escaped, 'e')}</ul></div>
      </div>
      ${r.rumors.length ? `<h3>What the guild heard</h3><ul class="rumors">${r.rumors.map((x) => `<li><q>${esc(x.text)}</q><cite>${esc(x.who)}</cite></li>`).join('')}</ul>` : ''}
      <h3>Full log, oldest first</h3>
      <ol class="log full">${logItems(r.log.slice().reverse())}</ol>
      <div class="seedrow"><button type="button" class="go" id="close-r" data-focus>${fromDebrief ? 'Back to the reckoning' : 'Close'}</button></div>`, (s) => {
      for (const b of s.querySelectorAll('.tabs button')) b.onclick = () => showReports(+b.dataset.k, fromDebrief);
      s.querySelector('#close-r').onclick = () => (fromDebrief && G.debrief && (G.phase === 'debrief' || G.phase === 'over') ? showDebrief() : closeModal());
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
  function newGame(seed, loaded, diff) {
    G = loaded || RD.newGame(seed, diff);
    ui.tool = 'spikes';
    ui.carry = null;
    ui.power = null;
    ui.hoverIt = null;
    setSpeed(1);
    RD.view.floor = 0;
    RD.fxFloor(0);
    RD.view.dirty = true;
    RD.FX.floaters.length = RD.FX.parts.length = 0;
    fit();
    renderAll();
  }

  function fit() {
    const wrap = $('board-wrap');
    const w = wrap.clientWidth - 18;
    const h = Math.max(300, window.innerHeight - 290);
    RD.resize(w, h);
  }

  function bind() {
    $('menu').onclick = () => { if (G.phase !== 'raid') showIntro(); else toast('Wait for dawn before leaving the dungeon.'); };
    $('reports').onclick = () => showReports(0);
    const cv = $('board');
    RD.initRender(cv);
    cv.addEventListener('pointermove', (e) => {
      const i = canvasTile(e);
      if (i !== RD.view.hover) { RD.view.hover = i; preview(i); }
    });
    cv.addEventListener('pointerleave', () => {
      RD.view.hover = -1;
      ui.previewError = null;
      if (ui.hoverIt) { ui.hoverIt = null; renderDetail(); }
      if (G && G.phase === 'build') $('hint').textContent = 'Pick a blueprint, then click the map.';
    });
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
      else if (e.key === '[') setFloor(RD.view.floor - 1, true);
      else if (e.key === ']') setFloor(RD.view.floor + 1, true);
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
        follow();
        renderStats();
        renderParty();
        renderLog();
        renderFloors();
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
    else if (loaded.diff) ui.diff = loaded.diff;
    newGame((Math.random() * 1e6) | 0, loaded, ui.diff);
    showIntro();
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
