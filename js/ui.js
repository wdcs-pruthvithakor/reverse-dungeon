'use strict';
// DOM wiring: blueprints, floors, the ledger, modals, input, the tutorial, portal hooks and the frame loop.
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

  const ui = (RD.ui = {
    partyKey: '', logKey: '', idle: 0, drawnAt: 0, drawnHover: -2,
    tool: 'spikes', carry: null, power: null, speed: 1, previewError: null, follow: true, diff: 'easy', mode: 'campaign', pact: null, twists: [], challenge: null, hoverIt: null, groups: {},
    touch: false, armed: -1, adPause: false, canSave: true, tut: 0,
  });
  let G = null;
  const P = RD.portal;
  const sfx = (n) => RD.sfx(n);

  // ---------------------------------------------------------------- storage (best effort)
  // The portal's data module when there is one (it syncs to the player's account), else localStorage.
  const store = {
    del(k) { try { P.storage().removeItem('rd.' + k); } catch (e) { /* storage blocked */ } },
    get(k, d) { try { const v = P.storage().getItem('rd.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { P.storage().setItem('rd.' + k, JSON.stringify(v)); } catch (e) { ui.canSave = false; } },
  };
  // ---------------------------------------------------------------- what carries over between dungeons
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const seedOf = (str) => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) % 1e6; };
  const meta = () => ({ trophies: {}, slain: 0, runs: 0, best: {}, daily: {}, souls: 0, heart: {}, streak: 0, lastDay: null, gift: null, ...store.get('meta', {}) });
  // the daily dungeon's two twists, the same for everyone on a given day
  const dailyTwists = (day) => {
    const rng = RD.makeRng(seedOf('rd-twists-' + day));
    return rng.shuffle(Object.keys(RD.TWISTS)).slice(0, 2);
  };
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // coming back on consecutive days keeps a streak; the first dungeon of each day pays a gift of souls
  function touchStreak() {
    const m = meta(), day = today();
    if (m.lastDay === day) return;
    m.streak = m.lastDay === yesterday() ? m.streak + 1 : 1;
    m.lastDay = day;
    store.set('meta', m);
    if (m.streak >= 7) award('streak7');
  }
  function claimGift() {
    const m = meta(), day = today();
    if (m.gift === day) return 0;
    const n = Math.min(20, 2 * m.streak);
    m.gift = day;
    m.souls += n;
    store.set('meta', m);
    return n;
  }
  const has = (id) => !!meta().trophies[id];
  function award(id) {
    const m = meta();
    if (m.trophies[id] || !RD.TROPHIES[id]) return;
    m.trophies[id] = today();
    store.set('meta', m);
    const pact = Object.entries(RD.PACTS).find(([, p]) => p.trophy === id);
    setTimeout(() => toast(`Trophy: ${RD.TROPHIES[id].name}.${pact ? ` New pact unlocked: ${pact[1].name}.` : ''}`, true), 900);
    sfx('level');
    P.happytime();
  }
  // checks after a build action, and after a raid
  function checkBuild(res, type) {
    if (res.lv >= RD.MAX_LEVEL) award('maxed');
    const d = type && RD.ITEMS[type];
    if (d && d.boss) award('boss');
    if (d && d.myth) award('myth');
    if (d && d.lord) award('lord');
    if (G.floors >= RD.MAX_FLOORS) award('deep');
  }
  function checkRaid(d) {
    const m = meta();
    m.slain += d.killed.length;
    store.set('meta', m);
    if (d.killed.length) award('first_blood');
    if (d.killed.length >= 2 && !d.escaped.length) award('perfect');
    if (d.killed.some((h) => h.title)) award('legend');
    if (d.killed.some((h) => h.cls === 'chosen')) award('chosen');
    if (d.killed.some((h) => h.nemesis)) award('nemesis');
    const team = d.killed.concat(d.escaped).filter((h) => h.team);
    if (team.length && team.every((h) => d.killed.includes(h))) award('hunters');
    if (G.stats.held >= 5) award('survive5');
    if (G.gold >= 500) award('rich');
    if (m.slain >= 100) award('slay100');
    if (G.phase !== 'over' && !(G.result === 'won')) return;
    // the run is over: score it
    if (G.mode === 'daily') award('daily');
    if (G.result === 'won') {
      award('win_any');
      if (G.mode !== 'campaign') award('quick');
      if (G.diff === 'hard' || G.diff === 'nightmare') award('win_hard');
      if (G.diff === 'nightmare') award('win_abyss');
      if ((G.twists || []).length >= 3) award('twisted');
    }
  }
  function recordRun() {
    const m = meta();
    const score = RD.score(G);
    const key = `${G.mode}:${G.diff}`;
    const prev = m.best[key] || 0;
    const souls = RD.souls(G);
    m.souls += souls;
    m.runs++;
    if (score > prev) m.best[key] = score;
    if (G.mode === 'daily' && G.daily) m.daily[G.daily] = Math.max(m.daily[G.daily] || 0, score);
    store.set('meta', m);
    return { score, best: Math.max(prev, score), isBest: score > prev, souls };
  }

  function probeStorage() {
    try {
      const s = P.storage();
      s.setItem('rd.probe', '1');
      ui.canSave = s.getItem('rd.probe') === '1';
      s.removeItem('rd.probe');
    } catch (e) { ui.canSave = false; }
  }

  // ---------------------------------------------------------------- toast
  let toastT = 0;
  function toast(msg, good) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (good ? ' good' : '');
    if (!good) sfx('error');
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
    const sub = locked ? `Unlocks night ${RD.realNight(G, RD.TIER_UNLOCK[d.tier])}` : `${kind}${sale ? ' · <span class="sale">30% OFF</span>' : ''}`;
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
    $('offers').replaceChildren(...G.offers.map((t) => card(t, true)), dealsBar());
    // the whole catalogue, newest ranks first; the next locked piece in each group shows when it opens
    const box = $('catalog');
    box.innerHTML = '';
    for (const g of RD.GROUPS) {
      const all = Object.keys(RD.ITEMS).filter((k) => RD.inGroup(g, k)).sort((a, b) => RD.ITEMS[b].tier - RD.ITEMS[a].tier || RD.ITEMS[a].cost - RD.ITEMS[b].cost);
      const open = all.filter((k) => RD.ITEMS[k].tier <= top);
      const next = all.filter((k) => RD.ITEMS[k].tier > top).sort((a, b) => RD.ITEMS[a].tier - RD.ITEMS[b].tier)[0];
      const det = el('details', 'group');
      det.open = ui.groups[g.id] !== false;
      det.ontoggle = () => { ui.groups[g.id] = det.open; };
      det.append(el('summary', null, `${esc(g.name)} <small>${open.length}</small>`));
      const cards = el('div', 'cards');
      cards.append(...open.map((t) => card(t, G.offers.includes(t))));
      if (next) cards.append(card(next, false, true));
      if (!open.length && !next) continue;
      det.append(cards);
      box.append(det);
    }
    const nu = RD.nextUnlock(G);
    $('unlock').innerHTML = nu ? `Next: ${tierTag(nu.tier)} blueprints on night ${nu.night}: ${nu.items.map((k) => esc(RD.ITEMS[k].name)).join(', ')}.` : 'Every rank is open to you.';
    renderDetail();
  }

  // New deals for malice, or once a night after an optional ad where the portal has ads.
  function dealsBar() {
    const bar = el('div', 'reroll');
    const cost = RD.rerollCost(G);
    const paid = el('button', 'ghost small', `Reroll deals · <span class="m">${cost}</span>`);
    paid.type = 'button';
    paid.onclick = () => {
      if (G.malice < cost) return toast(`Needs ${cost} malice.`);
      G.malice -= cost;
      RD.rerollDeals(G);
      sfx('sell');
      afterBuild();
    };
    bar.append(paid);
    if (P.ads && G.adReroll !== G.raid) {
      const free = el('button', 'ghost small rewarded', '🎬 Reroll free');
      free.type = 'button';
      free.onclick = () => P.rewarded((ok) => {
        if (!ok) return;
        G.adReroll = G.raid;
        RD.rerollDeals(G);
        afterBuild();
      });
      bar.append(free);
    }
    return bar;
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
    $('cancel').hidden = ui.carry == null;
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
    if (ui.tool === 'move' && ui.carry != null) extra = `<br><em>Carrying the ${esc(RD.ITEMS[G.items.get(ui.carry).type].name.toLowerCase())} from ${RD.coord(ui.carry)}. Pick a tile to set it down (switch floors to carry it deeper), or Cancel.</em>`;
    const cost = RD.costOf(G, ui.tool);
    box.innerHTML = `<b>${esc(d.name)}${cost ? ` · <span class="m">${cost}</span>` : ''}</b>${esc(d.desc)}${extra}`;
  }

  // ---------------------------------------------------------------- floors
  function setFloor(f, manual) {
    if (f < 0 || f >= G.floors) return;
    if (manual && G.phase === 'raid') { ui.follow = false; ui.followHold = 4; }
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
      const b = el('button', 'floor dig' + (err ? ' wait' : ''));
      b.type = 'button';
      b.innerHTML = RD.age(G) < RD.FLOOR_UNLOCK[G.floors] ? `Floor ${RD.ROMAN[G.floors]} <small class="n">night ${RD.floorNight(G, G.floors)}</small>` : `+ Dig floor ${RD.ROMAN[G.floors]} <span class="m">${RD.FLOOR_COST[G.floors]}</span>`;
      b.title = err || 'Dig a new floor below. Your hoard is carried down to it.';
      b.onclick = () => {
        const res = RD.openFloor(G);
        if (res.err) return toast(res.err);
        setFloor(res.floor);
        RD.view.dirty = true;
        sfx('dig');
        P.happytime();
        checkBuild({}, null);
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
    const vet = h.lvl > 1 ? `<span class="chip vet" title="Earned it in an earlier raid: fought, looted or mapped, and came back stronger">Veteran ×${h.lvl - 1}</span>` : '';
    let state = '';
    if (live) {
      const st = { seek: h.K && h.K.hoard >= 0 ? 'heading for the hoard' : 'exploring', loot: 'looting', escape: 'leaving with gold', flee: 'running', dead: 'dead', out: h.carry ? `escaped with ${h.carry} gold` : 'escaped' };
      state = `<span class="state">${st[h.state] || 'waiting at the gate'}${h.tile != null && RD.heroAlive(h) && G.floors > 1 ? ` · floor ${RD.ROMAN[RD.fl(h.tile)]}` : ''}</span>`;
      if (h.state === 'dead') li.classList.add('dead');
      if (h.state === 'out') li.classList.add('out');
    }
    const hp = live ? Math.max(0, Math.ceil(h.hp)) : h.maxHp;
    li.title = `${C.desc}\nHealth ${h.maxHp} · Damage ${Math.round(h.dmg)} every ${h.rate}s`;
    const prey = h.hunt != null && G.items.get(h.hunt);
    const wanted = h.nemesis ? `<span class="chip wanted" title="Escaped you ${h.escapes} times. Killing them pays a triple bounty.">Nemesis · escaped ${h.escapes}×</span>` : '';
    const hunt = h.hunt != null ? `<span class="chip hunt" title="Part of a strike team. Goes for this boss before the hoard.">Hunting ${prey ? esc(RD.ITEMS[prey.type].name) : 'a boss'}</span>` : '';
    li.innerHTML = `<span></span><div class="who"><b>${tierTag(h.tier)} ${esc(h.name)}</b><small>${h.title ? `<em>${esc(h.title)}</em> · ` : ''}${C.name}${live ? ' · ' : ''}</small>${state}<div class="chips">${wanted}${hunt}${vet}${chips}</div>${live ? `<div class="bar"><i style="width:${(100 * hp) / h.maxHp}%"></i></div>` : ''}</div><span class="hp">${hp}<br><small>hp</small></span>`;
    li.firstChild.replaceWith(cv);
    return li;
  }

  function renderParty() {
    const live = G.phase !== 'build' && G.R;
    $('party-h').textContent = live ? 'In your halls' : 'Coming tonight';
    $('adapt').textContent = live ? '' : G.adapt;
    $('adapt').hidden = !!live;
    const list = live ? G.R.heroes.concat(G.R.queue) : G.party;
    const key = (live ? 'L' : 'B') + list.map((h) => `${h.id}:${h.state}:${Math.ceil(h.hp)}:${h.carry || 0}:${h.tile != null ? RD.fl(h.tile) : ''}`).join('|');
    if (key === ui.partyKey) return;
    ui.partyKey = key;
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
    const key = `${raid ? 'R' : 'H'}${L.length}:${L[0] ? L[0].t + L[0].text : ''}`;
    if (key === ui.logKey) return;
    ui.logKey = key;
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
    $('st-raid').parentNode.title = `${RD.modeOf(G).name} · ${RD.DIFF[G.diff].name}${G.pact ? ' · ' + RD.PACTS[G.pact].name : ''}`;
    setStat('st-gold', String(G.gold));
    setStat('st-malice', String(G.malice));
    const t = Math.round(G.guild.threat);
    setStat('st-rating', RD.TIERS[t] + (G.guild.renown > 0.005 ? '+' : ''), RD.TIER_COLOR[t]);
    $('st-rating').parentNode.title = `What the guild thinks your dungeon is worth.${G.guild.renown > 0.005 ? ` Renown +${Math.round(G.guild.renown * 100)}%: every night they fail to take gold, they train harder.` : ''}`;
    setStat('st-known', Math.round(RD.coverage(G, G.guild.K) * 100) + '%');
  }

  function renderOmen() {
    const tw = (G.twists || []).map((k) => `<b class="twist" title="${esc(RD.TWISTS[k].desc)}">${esc(RD.TWISTS[k].name)}</b>`).join('');
    $('omen').innerHTML = `<span class="tag">Tonight’s omen</span><b>${esc(G.omen.name)}</b>${tw}<span>${esc(G.omen.text)}</span>`;
  }

  function renderPhase() {
    const raid = G.phase === 'raid';
    $('build-actions').hidden = raid;
    $('raid-actions').hidden = !raid;
    $('blueprints').classList.toggle('locked', G.phase !== 'build');
    if (raid) renderPowers();
  }

  // the raid's power bar: open powers, plus the next one to come with the night it opens
  function renderPowers() {
    const box = $('powers');
    box.innerHTML = '';
    const keys = Object.keys(RD.POWERS);
    const next = keys.find((k) => !RD.powerOpen(G, k));
    for (const k of keys) {
      const open = RD.powerOpen(G, k);
      if (!open && k !== next) continue;
      const p = RD.POWERS[k];
      const b = el('button', 'power' + (ui.power === k ? ' on' : '') + (open ? '' : ' locked'));
      b.type = 'button';
      b.dataset.power = k;
      b.title = open ? `${p.name}: ${p.desc}` : `${p.name} opens on night ${RD.realNight(G, p.night)}. ${p.desc}`;
      const cv = el('canvas');
      RD.drawIcon(cv, k, 28);
      b.append(cv, el('span', null, `<span class="pname">${esc(p.name)}</span> <span class="cost">${open ? RD.powerCost(G, k) : 'night ' + RD.realNight(G, p.night)}</span>`), el('i', 'cool'));
      b.onclick = () => {
        if (!open) return toast(`${p.name} opens on night ${RD.realNight(G, p.night)}.`);
        if (!p.target) {
          const err = RD.usePower(G, k);
          toast(err || `${p.name}!`, !err);
          ui.power = null;
        } else {
          ui.power = ui.power === k ? null : k;
          if (ui.power) toast(`${p.name}: pick a tile on the map.`, true);
        }
        ui.armed = -1;
        renderPowers();
        tickPowers();
      };
      box.append(b);
    }
  }
  function tickPowers() {
    for (const b of document.querySelectorAll('.power')) {
      const k = b.dataset.power;
      if (!RD.powerOpen(G, k)) { b.disabled = false; continue; }
      const cd = G.R.powers[k];
      b.disabled = cd > 0 || G.malice < RD.powerCost(G, k);
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
    const confirm = ui.touch && ui.armed === i && !ui.previewError ? ' · tap again to confirm' : '';
    $('hint').innerHTML = `<b>${RD.coord(i)}</b>${esc(what)}${ui.previewError ? ' · ' + esc(ui.previewError) : ''}${confirm}`;
  }

  function click(i) {
    if (i < 0) return;
    if (G.phase === 'raid') {
      if (ui.power && RD.POWERS[ui.power].target) {
        const err = RD.usePower(G, ui.power, i);
        if (err) return toast(err);
        ui.power = null;
        renderPowers();
        tickPowers();
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
      sfx('place');
      renderDetail();
      afterBuild();
      return;
    }
    const res = RD.apply(G, ui.tool, i);
    if (res.err) return toast(res.err);
    if (res.map) RD.view.dirty = true;
    sfx(res.map ? 'dig' : res.lv ? 'level' : res.gained ? 'sell' : 'place');
    if (RD.ITEMS[ui.tool]) tutorial('placed', RD.ITEMS[ui.tool]);
    checkBuild(res, RD.ITEMS[ui.tool] ? ui.tool : null);
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
    sfx('gate');
    tutorial('raid');
    renderAll();
  }

  // during a raid, keep the camera on the floor where the heroes are
  function follow() {
    if (!G.R) return;
    // looking at another floor on purpose holds the camera for a few seconds, unless you are aiming a power
    if (!ui.follow) {
      if (ui.power) ui.followHold = 4;
      if ((ui.followHold -= 0.2) > 0) return;
      ui.follow = true;
    }
    const live = G.R.heroes.filter(RD.heroAlive);
    if (!live.length || live.some((h) => RD.fl(h.tile) === RD.view.floor)) return;
    setFloor(Math.max(...live.map((h) => RD.fl(h.tile))));
  }

  const canRevive = () => P.ads && G.result === 'lost' && !G.stats.revived;
  RD.onRaidEnd = function () {
    checkRaid(G.debrief);
    renderAll();
    if (G.phase === 'over' && !canRevive()) { saveRecord(); store.del('save'); }
    else if (G.phase !== 'over') store.set('save', RD.saveGame(G, true));
    setTimeout(() => showDebrief(), 700);
  };

  function setSpeed(s) {
    ui.speed = s;
    for (const b of document.querySelectorAll('.speed button')) b.classList.toggle('on', +b.dataset.speed === s);
  }

  // what tonight brings that last night did not
  function announce() {
    const top = RD.unlocked(G);
    G.raid--;
    const was = RD.unlocked(G);
    G.raid++;
    const msgs = [];
    if (top > was && G.raid > 1) msgs.push(`${RD.TIERS[top]}-rank blueprints unlocked`);
    if (G.floors < RD.MAX_FLOORS && RD.floorNight(G, G.floors) === G.raid) msgs.push(`floor ${RD.ROMAN[G.floors]} can be dug`);
    const legend = G.party.find((h) => h.title);
    if (legend) msgs.push(`a legend is coming: ${legend.name} ${legend.title}`);
    toast(`Night ${G.raid}. ${G.party.length} heroes are coming${msgs.length ? '. ' + msgs.join(', ') : ''}.`, true);
    P.context({ night: G.raid, difficulty: G.diff, mode: G.mode });
  }

  // ---------------------------------------------------------------- modals
  function openModal(html, onReady) {
    P.gameplayStop();
    $('sheet').innerHTML = html;
    $('modal').hidden = false;
    $('modal').scrollTop = 0;
    if (onReady) onReady($('sheet'));
    const f = $('sheet').querySelector('[data-focus]');
    if (f) f.focus();
  }
  function closeModal() { $('modal').hidden = true; if (G) P.gameplayStart(); }
  const isOpen = () => !$('modal').hidden;

  function showIntro() {
    const m = meta();
    const seed = (Math.random() * 1e6) | 0;
    const live = G && G.phase === 'build' && hasSave() ? G : null;
    const day = today();
    const dailyBest = m.daily[day];
    const dTw = dailyTwists(day);
    const radios = (name, entries, cur) => entries.map(([k, d, locked]) => `<label class="diff${cur === k ? ' on' : ''}${locked ? ' off' : ''}"><input type="radio" name="${name}" value="${k}"${cur === k ? ' checked' : ''}${locked ? ' disabled' : ''}><b>${esc(d.name)}</b><span>${esc(d.blurb || d.desc)}</span></label>`).join('');
    const modes = radios('mode', Object.entries(RD.MODES).filter(([k]) => k !== 'daily'), ui.mode);
    const diffs = radios('diff', Object.entries(RD.DIFF).map(([k, d]) => [k, { name: d.name, blurb: `${d.blurb} Hold ${d.win} nights.` }]), ui.diff);
    const pacts = radios('pact', [['', { name: 'No pact', desc: 'Start as you are.' }]].concat(Object.entries(RD.PACTS).map(([k, p]) => [k, { name: p.name, desc: m.trophies[p.trophy] ? p.desc : `Locked. Earn “${RD.TROPHIES[p.trophy].name}”: ${RD.TROPHIES[p.trophy].desc}` }, !m.trophies[p.trophy]])), ui.pact || '');
    const twists = Object.entries(RD.TWISTS).map(([k, t]) => `<label class="diff${ui.twists.includes(k) ? ' on' : ''}"><input type="checkbox" name="twist" value="${k}"${ui.twists.includes(k) ? ' checked' : ''}><b>${esc(t.name)}</b><span>${esc(t.desc)}</span></label>`).join('');
    const summary = () => `${RD.MODES[ui.mode].name} · ${RD.DIFF[ui.diff].name} · hold ${RD.MODES[ui.mode].win || RD.DIFF[ui.diff].win} nights${ui.pact ? ' · ' + RD.PACTS[ui.pact].name : ''}${ui.twists.length ? ` · ${ui.twists.length} twist${ui.twists.length > 1 ? 's' : ''} (+${15 * ui.twists.length}% score)` : ''}`;
    const got = Object.keys(m.trophies).length;
    const chal = ui.challenge;
    openModal(`
      ${chal ? `<div class="resume challenge">
        <div><b>A friend challenged you</b><span>${esc(RD.MODES[chal.mode].name)} · ${esc(RD.DIFF[chal.diff].name)} · seed ${chal.seed}${chal.twists.length ? ' · ' + chal.twists.map((k) => esc(RD.TWISTS[k].name)).join(', ') : ''}${chal.score ? ` · beat ${chal.score}` : ''}</span></div>
        <button type="button" class="go" id="accept" data-focus>Accept</button>
      </div>` : ''}
      ${live ? `<div class="resume">
        <div><b>Your dungeon awaits</b><span>${esc(RD.modeOf(live).name)} · ${esc(RD.DIFF[live.diff].name)} · night ${live.raid}${live.endless ? ' (endless)' : ` of ${RD.winAt(live)}`} · ${live.gold} gold · rated ${RD.rating(live.guild.threat)}</span></div>
        <button type="button" class="go" id="resume" ${chal ? '' : 'data-focus'}>Resume</button>
      </div>` : ''}
      <h2 id="sheet-title">The Reverse Dungeon</h2>
      <p class="lede">You are the dungeon. Build traps and monsters, then watch heroes try to steal your gold. Survivors tell the guild what they saw, so kill them before they get out.</p>
      <form id="seedform">
        <div class="playrow">
          <button type="submit" class="${live || chal ? 'ghost' : 'go big'}" ${live || chal ? '' : 'data-focus'}>${live ? 'New dungeon' : 'Play'}</button>
          <button type="button" class="ghost daily-btn" id="daily" title="${esc(dTw.map((k) => RD.TWISTS[k].name + ': ' + RD.TWISTS[k].desc).join('  '))}">Daily: ${esc(dTw.map((k) => RD.TWISTS[k].name).join(' + '))}${dailyBest ? ` · best ${dailyBest}` : ''}</button>
          <button type="button" class="ghost" id="heart-btn">Dungeon Heart · ${m.souls} souls</button>
          <button type="button" class="ghost" id="trophies">Trophies ${got}/${Object.keys(RD.TROPHIES).length}</button>
        </div>
        <p class="note" id="summary">${esc(summary())}${live ? ' · replaces your saved dungeon' : ''}</p>
        ${m.streak > 1 ? `<p class="note streak">Day ${m.streak} in a row${m.gift === day ? '' : ` · your first dungeon today brings ${Math.min(20, 2 * m.streak)} souls`}</p>` : ''}
        <details class="more">
          <summary>Mode, difficulty, pact, twists and seed</summary>
          <h3>Mode</h3><div class="diffs" role="radiogroup">${modes}</div>
          <h3>Difficulty</h3><div class="diffs" role="radiogroup">${diffs}</div>
          <h3>Dark pact</h3><div class="diffs" role="radiogroup">${pacts}</div>
          <h3>Twists · each adds 15% to your score</h3><div class="diffs">${twists}</div>
          <div class="seedrow">
            <label for="seed">Seed</label>
            <input id="seed" name="seed" inputmode="numeric" value="${seed}" autocomplete="off">
            <button type="button" class="ghost" id="reroll">New seed</button>
          </div>
        </details>
      </form>
      ${m.runs ? `<p class="record">${m.runs} dungeon${m.runs === 1 ? '' : 's'} so far, ${m.slain} heroes slain.${m.best[`${ui.mode}:${ui.diff}`] ? ` Best ${esc(RD.MODES[ui.mode].name)} · ${esc(RD.DIFF[ui.diff].name)} score: ${m.best[`${ui.mode}:${ui.diff}`]}.` : ''}</p>` : ''}
      ${ui.canSave ? '' : '<p class="note warn">This browser window is blocking storage, so progress will not be saved.</p>'}`, (s) => {
      const r = s.querySelector('#resume');
      if (r) r.onclick = () => closeModal();
      const refresh = () => {
        for (const l of s.querySelectorAll('.diff')) l.classList.toggle('on', l.querySelector('input').checked);
        s.querySelector('#summary').textContent = summary() + (live ? ' · replaces your saved dungeon' : '');
      };
      const savePrefs = () => store.set('prefs', { mode: ui.mode, diff: ui.diff, pact: ui.pact, twists: ui.twists });
      for (const inp of s.querySelectorAll('input[type=radio], input[type=checkbox]')) inp.onchange = () => {
        if (inp.name === 'mode') ui.mode = inp.value;
        if (inp.name === 'diff') ui.diff = inp.value;
        if (inp.name === 'pact') ui.pact = inp.value || null;
        if (inp.name === 'twist') ui.twists = [...s.querySelectorAll('input[name=twist]:checked')].map((x) => x.value);
        savePrefs();
        refresh();
      };
      s.querySelector('#reroll').onclick = () => { s.querySelector('#seed').value = (Math.random() * 1e6) | 0; };
      s.querySelector('#trophies').onclick = () => showTrophies();
      s.querySelector('#heart-btn').onclick = () => showHeart();
      const begin = (seedV, mode, diff, tw) => {
        newGame(seedV, null, diff, mode, ui.pact, tw);
        if (mode === 'daily') G.daily = day;
        const gift = claimGift();
        save();
        closeModal();
        if (store.get('tut', null) !== 'done') tutorial('start');
        else announce();
        if (gift) setTimeout(() => toast(`Day ${meta().streak} streak: +${gift} souls for the Dungeon Heart.`, true), 3300);
      };
      s.querySelector('#daily').onclick = () => begin(seedOf('rd-daily-' + day), 'daily', 'normal', dTw);
      const acc = s.querySelector('#accept');
      if (acc) acc.onclick = () => { ui.challenge = null; begin(chal.seed, chal.mode, chal.diff, chal.twists); };
      s.querySelector('#seedform').onsubmit = (e) => {
        e.preventDefault();
        const v = parseInt(s.querySelector('#seed').value, 10);
        begin(Number.isFinite(v) ? v : (Math.random() * 1e6) | 0, ui.mode, ui.diff, ui.twists.slice());
      };
    });
  }

  // permanent upgrades bought with souls
  function showHeart() {
    const m = meta();
    const rows = Object.entries(RD.HEART).map(([k, h]) => {
      const lv = m.heart[k] || 0;
      const cost = h.costs[lv];
      return `<li><div><b>${esc(h.name)}</b> <span class="lv">${'●'.repeat(lv)}${'○'.repeat(h.costs.length - lv)}</span><span>${esc(h.desc)}</span></div>
        ${cost == null ? '<em>Full</em>' : `<button type="button" class="ghost small" data-k="${k}"${m.souls < cost ? ' disabled' : ''}>${cost} souls</button>`}</li>`;
    }).join('');
    openModal(`
      <p class="eyebrow">Permanent · bought with souls</p>
      <h2 id="sheet-title">The Dungeon Heart</h2>
      <p class="lede">Every dungeon you run feeds the Heart. You have <b class="soulcount">${m.souls}</b> souls. Earn more from your score, from nemeses, and from playing on consecutive days. Upgrades apply to new dungeons.</p>
      <ul class="heart">${rows}</ul>
      <div class="seedrow"><button type="button" class="go" id="back" data-focus>Back</button></div>`, (s) => {
      for (const b of s.querySelectorAll('[data-k]')) b.onclick = () => {
        const mm = meta(), k = b.dataset.k, lv = mm.heart[k] || 0, cost = RD.HEART[k].costs[lv];
        if (cost == null || mm.souls < cost) return;
        mm.souls -= cost;
        mm.heart[k] = lv + 1;
        store.set('meta', mm);
        sfx('level');
        showHeart();
      };
      s.querySelector('#back').onclick = () => showIntro();
    });
  }

  // a link that starts a friend on this exact dungeon: same seed, mode, difficulty and twists
  function shareChallenge(score) {
    const url = P.inviteLink({ seed: G.seed, mode: G.mode, diff: G.diff, twists: (G.twists || []).join('.'), score: score || 0 });
    const done = () => toast('Challenge link copied. Send it to a friend.', true);
    const fallback = () => { window.prompt('Copy this link and send it to a friend:', url); };
    try { navigator.clipboard.writeText(url).then(done, fallback); } catch (e) { fallback(); }
  }
  function readChallenge() {
    const seed = parseInt(P.inviteParam('seed'), 10);
    if (!Number.isFinite(seed)) return null;
    const mode = RD.MODES[P.inviteParam('mode')] ? P.inviteParam('mode') : 'quick';
    const diff = RD.DIFF[P.inviteParam('diff')] ? P.inviteParam('diff') : 'normal';
    const twists = (P.inviteParam('twists') || '').split('.').filter((k) => RD.TWISTS[k]);
    return { seed, mode: mode === 'daily' ? 'quick' : mode, diff, twists, score: parseInt(P.inviteParam('score'), 10) || 0 };
  }

  function showTrophies() {
    const m = meta();
    const list = Object.entries(RD.TROPHIES).map(([k, t]) => {
      const pact = Object.values(RD.PACTS).find((p) => p.trophy === k);
      return `<li class="${m.trophies[k] ? 'got' : ''}"><b>${esc(t.name)}</b><span>${esc(t.desc)}${pact ? ` Unlocks the <em>${esc(pact.name)}</em> pact.` : ''}</span>${m.trophies[k] ? `<small>${esc(m.trophies[k])}</small>` : ''}</li>`;
    }).join('');
    openModal(`
      <p class="eyebrow">Kept across every dungeon</p>
      <h2 id="sheet-title">Trophies</h2>
      <ul class="trophies">${list}</ul>
      <div class="seedrow"><button type="button" class="go" id="back" data-focus>Back</button></div>`, (s) => {
      s.querySelector('#back').onclick = () => showIntro();
    });
  }

  const heroLi = (h, cls, extra) => `<li class="${cls}${h.title ? ' legend' : ''}">${tierTag(h.tier)} ${h.nemesis ? '<span class="chip wanted">Nemesis</span> ' : ''}${esc(h.name)}${h.title ? ` <em>${esc(h.title)}</em>` : ''} · ${RD.CLASSES[h.cls].name}${extra || ''}</li>`;

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
    const perfect = !over && d.killed.length >= 2 && !d.escaped.length;
    if (perfect) eyebrow = 'Perfect night';
    if (d.raid === 1 && !over) lede += d.escaped.length
      ? ' Anyone who escapes adds what they saw to the Guild’s map (press G or the Guild’s map button to see it), and the next party plans around it.'
      : ' Nobody got out, so the guild still knows nothing about your dungeon. Keep it that way.';
    if (perfect || (over && G.result === 'won') || d.killed.some((h) => h.title)) P.happytime();
    sfx(over ? (G.result === 'won' ? 'win' : 'lose') : 'dawn');
    const revive = over && canRevive();
    let scoreLine = '';
    if (over || G.result === 'won') {
      const rec = revive ? { score: RD.score(G) } : G.runRecord || (G.runRecord = recordRun());
      scoreLine = `<p class="score">Score <b>${rec.score}</b>${rec.isBest ? ' · new best' : rec.best ? ` · best ${rec.best}` : ''}${rec.souls ? ` · +${rec.souls} souls` : ''}${G.mode === 'daily' ? ` · daily dungeon ${esc(G.daily || '')}` : ''}</p>`;
    }
    const a = RD.assess(G);
    openModal(`
      <p class="eyebrow">${eyebrow}</p>
      <h2 id="sheet-title">${title}</h2>
      <p class="lede">${lede}</p>
      ${scoreLine}
      <dl class="tally">
        <div><dt>Slain</dt><dd style="color:var(--malice-hi)">${d.killed.length}</dd></div>
        <div><dt>Escaped</dt><dd style="color:var(--steel)">${d.escaped.length}</dd></div>
        <div><dt>Gold lost</dt><dd style="color:var(--gold)">${d.goldLost}</dd></div>
        <div><dt>Malice earned</dt><dd style="color:var(--malice-hi)">${d.malice + d.income}</dd></div>
        ${over ? '' : `<div><dt>Next rating</dt><dd style="color:${RD.TIER_COLOR[Math.round(a.threat)]}">${RD.rating(a.threat)}</dd></div>`}
      </dl>
      <div class="cols">
        <div><h3>Slain</h3><ul class="names">${names(d.killed, 'k')}</ul></div>
        <div><h3>Escaped</h3><ul class="names">${names(d.escaped, 'e', (h) => (h.carry ? ` · ${h.carry} gold` : '') + (h.growth ? ` · <span class="growth">${esc(h.growth)}</span>` : ''))}</ul></div>
      </div>
      ${rum ? `<h3>What the guild heard</h3><ul class="rumors">${rum}</ul>` : ''}
      <div class="seedrow">
        ${revive ? '<button type="button" class="go plain pair" id="again" data-focus>Accept defeat</button><button type="button" class="go rewarded pair" id="revive">🎬 Second chance: refill the hoard</button>' : over ? `<button type="button" class="go" id="again" data-focus>Wake a new dungeon</button>${G.result === 'won' ? '<button type="button" class="ghost" id="endless">Keep going (endless)</button>' : ''}` : `<button type="button" class="go" id="next" data-focus>Prepare the next night</button>`}
        <button type="button" class="ghost" id="log-btn">Full raid log</button>
        ${over ? '<button type="button" class="ghost" id="challenge">Challenge a friend</button>' : ''}
      </div>`, (s) => {
      const ch = s.querySelector('#challenge');
      if (ch) ch.onclick = () => shareChallenge(RD.score(G));
      countUp(s);
      const go = (ad) => {
        const next = () => { RD.nextNight(G); save(); RD.FX.floaters.length = RD.FX.parts.length = RD.FX.bubbles.length = 0; closeModal(); renderAll(); announce(); };
        // a natural break between nights, never in the first few minutes
        if (ad && G.raid >= 3) P.midgame(next);
        else next();
      };
      const n = s.querySelector('#next');
      if (n) n.onclick = () => go(true);
      const rv = s.querySelector('#revive');
      if (rv) rv.onclick = () => P.rewarded((ok) => {
        if (!ok) return toast('No ad was available. You can still accept defeat.');
        G.stats.revived = true;
        G.gold = Math.max(40, Math.round(RD.DIFF[G.diff].gold * 0.6));
        G.result = null;
        G.phase = 'debrief';
        go(false);
        toast(`The hoard is refilled with ${G.gold} gold. This only happens once per dungeon.`, true);
      });
      const ag = s.querySelector('#again');
      if (ag) ag.onclick = () => { if (G.phase === 'over') { saveRecord(); store.del('save'); if (!G.runRecord) G.runRecord = recordRun(); } showIntro(); };
      const en = s.querySelector('#endless');
      if (en) en.onclick = () => { G.endless = true; G.runRecord = null; G.phase = 'debrief'; RD.nextNight(G); save(); closeModal(); renderAll(); announce(); };
      s.querySelector('#log-btn').onclick = () => showReports(0, true);
    });
  }

  // dawn report numbers tick up instead of appearing
  function countUp(root) {
    for (const dd of root.querySelectorAll('.tally dd')) {
      const to = parseInt(dd.textContent, 10);
      if (!Number.isFinite(to) || to <= 0) continue;
      const t0 = performance.now();
      const tick = (now) => {
        const f = Math.min(1, (now - t0) / 700);
        dd.textContent = Math.round(to * (1 - (1 - f) ** 3));
        if (f < 1) requestAnimationFrame(tick);
      };
      dd.textContent = '0';
      requestAnimationFrame(tick);
    }
  }

  // ---------------------------------------------------------------- the guided first night
  // Four short steps: place a trap on the heroes' path, place a monster by the hoard, open the gate, watch.
  function routeTiles() {
    const { prev } = RD.dijkstra(G, G.entrance, (j) => (G.tiles[j] ? 1 : Infinity));
    const p = [];
    for (let s = G.hoard; s >= 0 && s !== G.entrance; s = prev[s]) p.push(s);
    return p.reverse();
  }
  function coach(html, marks) {
    $('coach').hidden = !html;
    $('coach-text').innerHTML = html || '';
    RD.view.marks = marks || [];
    $('go').classList.toggle('pulse', ui.tut === 3);
  }
  function endTutorial() {
    ui.tut = 0;
    coach(null);
    store.set('tut', 'done');
  }
  function tutorial(ev, d) {
    if (ev === 'start') {
      ui.tut = 1;
      selectTool('spikes');
      const r = routeTiles();
      const spot = r.slice(Math.floor(r.length * 0.3)).find((t) => !RD.check(G, 'spikes', t));
      coach('Heroes come in through the bright <b>gate</b> and head for your <b>gold</b>. The Spike Pit is selected: put it on their path, for example on the glowing tile.', [G.entrance, G.hoard, spot].filter((t) => t != null));
      return;
    }
    if (!ui.tut) return;
    if (ev === 'placed' && ui.tut === 1 && d.kind === 'trap') {
      ui.tut = 2;
      selectTool('skeleton');
      const r = routeTiles();
      const spot = r.slice().reverse().slice(1, 6).find((t) => !RD.check(G, 'skeleton', t));
      coach('Now a monster. The <b>Skeleton</b> is selected: put it near your gold. Monsters fight any hero who comes close.', [spot, G.hoard].filter((t) => t != null));
    } else if (ev === 'placed' && ui.tut === 2 && d.kind === 'monster') {
      ui.tut = 3;
      coach('Ready. Press <b>Open the gate</b>. Kill every hero and the guild learns nothing about you.', []);
    } else if (ev === 'raid') {
      ui.tut = 4;
      coach('Watch the raid. Survivors carry a report back to the guild. You can also speed it up below.', []);
      setTimeout(() => { if (ui.tut === 4) endTutorial(); }, 9000);
    }
  }

  // The last five raids, kept in the save so they survive a refresh.
  function showReports(i, fromDebrief) {
    const H = G.history;
    if (!H.length) return;
    i = Math.max(0, Math.min(H.length - 1, i));
    const r = H[i];
    const names = (list, cls) => list.length ? list.map((h) => heroLi(h, cls, (h.carry ? ` · ${h.carry} gold` : '') + (h.growth ? ` · <span class="growth">${esc(h.growth)}</span>` : ''))).join('') : '<li class="empty">None</li>';
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
  function newGame(seed, loaded, diff, mode, pact, twists) {
    G = loaded || RD.newGame(seed, diff, mode, pact, { twists: twists || [], heart: meta().heart });
    ui.tool = 'spikes';
    ui.carry = null;
    ui.power = null;
    ui.hoverIt = null;
    ui.armed = -1;
    if (ui.tut) { ui.tut = 0; coach(null); }
    setSpeed(1);
    RD.view.floor = 0;
    RD.fxFloor(0);
    RD.view.dirty = true;
    RD.FX.floaters.length = RD.FX.parts.length = RD.FX.bubbles.length = 0;
    fit();
    renderAll();
  }

  // the map fills whatever room the board area has, times the zoom
  const ZOOMS = [1, 1.5, 2, 2.75];
  function fit() {
    const wrap = $('board-wrap');
    const z = ZOOMS[ui.zoom || 0];
    RD.resize(Math.max(200, wrap.clientWidth - 10) * z, Math.max(140, wrap.clientHeight - 10) * z);
    wrap.classList.toggle('zoomed', z > 1);
    $('zoom-out').disabled = !ui.zoom;
    $('zoom-in').disabled = ui.zoom >= ZOOMS.length - 1;
  }
  // zoom in or out, keeping the same point of the map under the middle of the board
  function setZoom(z, fx, fy) {
    z = Math.max(0, Math.min(ZOOMS.length - 1, z));
    if (z === (ui.zoom || 0)) return;
    const sc = $('board-scroll');
    const cx = fx != null ? fx : (sc.scrollLeft + sc.clientWidth / 2) / Math.max(1, sc.scrollWidth);
    const cy = fy != null ? fy : (sc.scrollTop + sc.clientHeight / 2) / Math.max(1, sc.scrollHeight);
    ui.zoom = z;
    fit();
    sc.scrollLeft = cx * sc.scrollWidth - sc.clientWidth / 2;
    sc.scrollTop = cy * sc.scrollHeight - sc.clientHeight / 2;
  }
  // while zoomed during a raid, keep the leading hero on screen
  function cameraFollow() {
    if (!ui.zoom || !G.R || !ui.follow) return;
    const live = G.R.heroes.filter((h) => RD.heroAlive(h) && RD.fl(h.tile) === RD.view.floor);
    if (!live.length) return;
    const lead = live.reduce((a, h) => (RD.tdist(h.tile, G.entrance) > RD.tdist(a.tile, G.entrance) ? h : a), live[0]);
    const sc = $('board-scroll'), T = RD.view.T, M = RD.view.M;
    const k = sc.scrollWidth / RD.view.w;
    const px = (M + lead.x * T) * k, py = (M + lead.y * T) * k;
    const pad = 60;
    if (px < sc.scrollLeft + pad || px > sc.scrollLeft + sc.clientWidth - pad || py < sc.scrollTop + pad || py > sc.scrollTop + sc.clientHeight - pad) {
      sc.scrollTo({ left: px - sc.clientWidth / 2, top: py - sc.clientHeight / 2, behavior: 'smooth' });
    }
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
    cv.addEventListener('pointerdown', (e) => { ui.touch = e.pointerType !== 'mouse'; });
    // touch: the first tap shows what would happen (details, range, outline), the second tap does it
    cv.addEventListener('click', (e) => {
      const i = canvasTile(e);
      const aiming = G.phase === 'build' || (G.phase === 'raid' && !!ui.power);
      if (ui.touch && aiming && i >= 0 && ui.armed !== i) {
        ui.armed = i;
        RD.view.hover = i;
        ui.hoverIt = null;
        preview(i);
        if (G.phase === 'raid') toast(`Tap again to use ${RD.POWERS[ui.power].name} here.`, true);
        return;
      }
      ui.armed = -1;
      RD.view.hover = i;
      click(i);
    });
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); ui.carry = null; ui.power = null; renderDetail(); });
    $('go').onclick = startRaid;
    $('zoom-in').onclick = () => setZoom((ui.zoom || 0) + 1);
    $('zoom-out').onclick = () => setZoom((ui.zoom || 0) - 1);

    // two-finger pinch on touch screens
    const pts = new Map();
    let pinch = 0;
    const span = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    cv.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) pinch = span(); } });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size !== 2 || !pinch) return;
      const r = span() / pinch;
      if (r > 1.25 || r < 0.8) {
        const [a, b] = [...pts.values()], box = cv.getBoundingClientRect();
        setZoom((ui.zoom || 0) + (r > 1 ? 1 : -1), ((a.x + b.x) / 2 - box.left) / box.width, ((a.y + b.y) / 2 - box.top) / box.height);
        pinch = span();
        ui.armed = -1;
      }
    });
    const lift = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
    cv.addEventListener('pointerup', lift);
    cv.addEventListener('pointercancel', lift);
    $('cancel').onclick = () => { ui.carry = null; ui.armed = -1; renderDetail(); };
    const drawer = (open) => { $('ledger').classList.toggle('open', open); $('ledger-btn').setAttribute('aria-expanded', open); };
    $('ledger-btn').onclick = () => drawer(!$('ledger').classList.contains('open'));
    $('ledger-close').onclick = () => drawer(false);
    $('coach-skip').onclick = endTutorial;
    const soundBtn = $('sound-btn');
    const setSound = (v, keep) => { RD.audio.setOn(v); soundBtn.setAttribute('aria-pressed', v); if (keep) store.set('sound', v); };
    soundBtn.onclick = () => setSound(!RD.audio.isOn(), true);
    setSound(store.get('sound', true) && !P.muted(), false);
    P.onMute = (m) => setSound(!m && store.get('sound', true), false);
    // browsers only allow sound after a gesture
    const unlock = () => RD.audio.unlock();
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
    document.addEventListener('click', (e) => { if (e.target.closest('.card, .tool, .floor, .seg button, .icon-btn')) sfx('click'); });
    // freeze everything while an ad plays or the tab is hidden
    P.onPause = () => { ui.adPause = true; RD.audio.duck(true); };
    P.onResume = () => { ui.adPause = false; RD.audio.duck(false); lastT = performance.now(); };
    document.addEventListener('visibilitychange', () => { RD.audio.duck(document.hidden || ui.adPause); lastT = performance.now(); });
    // keep keys and the wheel from scrolling a portal's page
    window.addEventListener('keydown', (e) => { if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && e.target.tagName !== 'INPUT') e.preventDefault(); });
    // the wheel never scrolls the portal page: ctrl+wheel (and trackpad pinch) zooms around the pointer,
    // a plain wheel pans the map when zoomed in
    cv.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        setZoom((ui.zoom || 0) + (e.deltaY < 0 ? 1 : -1), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      } else if (!ui.zoom) e.preventDefault();
    }, { passive: false });
    if (window.ResizeObserver) new ResizeObserver(() => { if (G) fit(); }).observe($('board-wrap'));
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
      else if (e.key === 'Escape') { ui.carry = null; ui.power = null; ui.armed = -1; renderDetail(); if (G.phase === 'raid') renderPowers(); }
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
    // browsers stop animation frames in hidden tabs on their own; ads need an explicit freeze
    if (G && !ui.adPause) {
      if (G.phase === 'raid' && ui.speed > 0 && !isOpen()) {
        let t = dt * ui.speed;
        while (t > 1e-6 && G.phase === 'raid') { const s = Math.min(t, 1 / 60); RD.step(G, s); t -= s; }
        RD.fxUpdate(dt * ui.speed);
      } else RD.fxUpdate(dt);
      // between raids, with nothing moving, ten frames a second is plenty and saves phones' batteries
      const fx = RD.FX, busy = G.phase === 'raid' || fx.floaters.length || fx.parts.length || fx.rings.length || fx.shots.length || RD.view.dirty || RD.view.hover !== ui.drawnHover;
      ui.idle = busy ? 0 : ui.idle + dt;
      if (busy || ui.idle === 0 || (now - (ui.drawnAt || 0)) > 100) {
        RD.draw(G, ui, dt);
        ui.drawnAt = now;
        ui.drawnHover = RD.view.hover;
      } else RD.view.time += dt;
      slowT += dt;
      if (slowT > 0.2 && G.phase === 'raid') {
        slowT = 0;
        follow();
        cameraFollow();
        renderStats();
        renderParty();
        renderLog();
        renderFloors();
        tickPowers();
      }
    }
    requestAnimationFrame(frame);
  }

  async function boot() {
    P.loadingStart();
    await P.init();
    probeStorage();
    bind();
    const prefs = store.get('prefs', null);
    ui.diff = (prefs && prefs.diff) || store.get('diff', null) || (store.get('best', null) ? 'normal' : 'easy');
    ui.mode = (prefs && RD.MODES[prefs.mode] && prefs.mode !== 'daily' && prefs.mode) || 'campaign';
    ui.pact = (prefs && prefs.pact && RD.PACTS[prefs.pact] && has(RD.PACTS[prefs.pact].trophy) && prefs.pact) || null;
    ui.twists = ((prefs && prefs.twists) || []).filter((k) => RD.TWISTS[k]);
    ui.challenge = readChallenge();
    touchStreak();
    let loaded = null;
    try { loaded = RD.loadGame(store.get('save', null)); } catch (e) { loaded = null; }
    if (!loaded) store.del('save');
    else if (loaded.diff) ui.diff = loaded.diff;
    newGame((Math.random() * 1e6) | 0, loaded, ui.diff);
    showIntro();
    requestAnimationFrame(frame);
    // the cached map layer draws text, so redraw it once the bundled fonts are in
    const done = () => { RD.view.dirty = true; fit(); P.loadingStop(); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(done, done);
    else done();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
