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
  const meta = () => ({ trophies: {}, slain: 0, runs: 0, best: {}, daily: {}, souls: 0, heart: {}, streak: 0, lastDay: null, gift: null, combos: {}, ...store.get('meta', {}) });
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
    if (G.floors >= RD.BASE_FLOORS) award('deep');
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
  function toast(msg, good, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (good ? ' good' : '');
    if (!good) sfx('error');
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.className = 'toast'), ms || (good ? 3200 : 1800));
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
    const kind = d.boss ? (d.lord ? 'Demon Lord' : d.myth ? 'Myth boss' : 'Boss') : d.den ? 'Horde' : { trap: d.hidden ? 'Hidden trap' : 'Trap', turret: 'Wall piece', monster: d.elite ? 'Elite monster' : 'Monster', door: 'Obstacle', totem: 'Room', seal: 'Boss seal', bait: 'Bait' }[d.kind];
    const sub = locked ? `Unlocks night ${RD.realNight(G, RD.TIER_UNLOCK[d.tier])}` : `${kind}${sale ? ' · <span class="sale">30% OFF</span>' : ''}`;
    b.append(cv, el('span', 'name', `${tierTag(d.tier)} ${esc(d.name)}<small>${sub}</small>`), el('span', 'cost', locked ? '—' : cost));
    if (locked) b.disabled = true;
    else b.onclick = () => selectTool(type);
    return b;
  }

  function renderBlueprints() {
    const tools = $('tools');
    tools.innerHTML = '';
    for (const k of ['inspect', 'dig', 'fill', 'move', 'upgrade', 'hoard', 'sell']) {
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
      pushUndo();
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
      if (ui.tool === 'sell') foot = `<p class="foot">Sell for <b class="m">${RD.refund(it)}</b> malice.</p>`;
      box.innerHTML = `<b>${tierTag(d.tier)} ${esc(d.name)} <span class="lv">Lv${lv}/${RD.MAX_LEVEL}</span></b>${statTable(it.type, lv, ui.tool === 'upgrade' && !max)}${foot}`;
      return;
    }
    if (RD.ITEMS[ui.tool]) {
      const d = RD.ITEMS[ui.tool];
      const cost = RD.costOf(G, ui.tool);
      box.innerHTML = `<b>${tierTag(d.tier)} ${esc(d.name)} · <span class="m">${cost}</span></b>${esc(d.desc)}${statTable(ui.tool, 1, false)}<button type="button" class="ghost small" id="piece-more">Full details</button>`;
      const t = ui.tool;
      box.querySelector('#piece-more').onclick = () => showPiece(t);
      return;
    }
    const d = RD.TOOLS[ui.tool];
    let extra = '';
    if (ui.tool === 'move' && ui.carry != null) extra = `<br><em>Carrying the ${esc(RD.ITEMS[G.items.get(ui.carry).type].name.toLowerCase())} from ${RD.coord(ui.carry)}. Pick a tile to set it down (switch floors to carry it deeper), or Cancel.</em>`;
    const cost = RD.costOf(G, ui.tool);
    box.innerHTML = `<b>${esc(d.name)}${cost ? ` · <span class="m">${cost}</span>` : ''}</b>${esc(d.desc)}${extra}`;
  }

  // ---------------------------------------------------------------- floors
  // Choosing a floor during a raid turns off auto-follow until you press Follow heroes again.
  function setFloor(f, manual) {
    if (f < 0 || f >= G.floors) return;
    if (manual && G.phase === 'raid') ui.follow = false;
    RD.view.floor = f;
    RD.fxFloor(f);
    renderFloors();
  }

  // The floor buttons are built once per layout and then only updated in place, so a click that lands
  // while the hero counts change is never lost.
  function renderFloors() {
    const box = $('floors');
    const R = G.R, raid = G.phase === 'raid';
    const digErr = G.floors < RD.maxFloors(G) && G.phase === 'build' ? RD.canOpenFloor(G) || '' : null;
    const shape = `${G.floors}|${raid}|${G.phase}|${digErr}|${G.hoard}|${(G.themes || []).join()}|${[...G.items.values()].filter((it) => RD.ITEMS[it.type].boss || it.type === 'seal').map((it) => it.type + it.tile).join()}`;
    if (shape !== ui.floorShape) {
      ui.floorShape = shape;
      box.innerHTML = '';
      // past three floors the tabs get a scrolling row of their own; past five they drop their labels
      // (theme and boss stay in each tab's tooltip)
      box.classList.toggle('many', G.floors > 3);
      box.classList.toggle('compact', G.floors > 5);
      if (raid) {
        const fb = el('button', 'floor follow', 'Follow heroes');
        fb.type = 'button';
        fb.id = 'follow';
        fb.title = 'Keep the view on the floor where the heroes are';
        fb.onclick = () => { ui.follow = !ui.follow; follow(); renderFloors(); };
        box.append(fb);
      }
      for (let f = 0; f < G.floors; f++) {
        const b = el('button', 'floor');
        b.type = 'button';
        b.dataset.f = f;
        const hoard = RD.fl(G.hoard) === f ? '<i class="dot gold" title="The hoard"></i>' : '';
        const boss = [...G.items.values()].find((it) => RD.fl(it.tile) === f && RD.ITEMS[it.type].boss);
        const th = RD.themeOf(G, f * RD.N);
        const sealed = [...G.items.values()].some((it) => it.type === 'seal' && RD.fl(it.tile) === f);
        b.title = `${th.name}: ${th.desc}${boss ? ` Boss: ${RD.ITEMS[boss.type].name}.` : ''}${sealed ? ' Sealed while the boss lives.' : ''}`;
        b.innerHTML = `<span class="fl-word">Floor </span>${RD.ROMAN[f]}${hoard}${sealed ? ' <span title="Sealed while the boss lives">🔒</span>' : ''}${G.themes && G.themes[f] && G.themes[f] !== 'halls' ? ` <small class="theme">${esc(th.name)}</small>` : ''}${boss ? ` <small>${esc(RD.ITEMS[boss.type].name)}</small>` : ''} <span class="count" hidden></span>`;
        b.setAttribute('aria-label', `Floor ${RD.ROMAN[f]}`);
        b.onclick = () => setFloor(f, true);
        box.append(b);
      }
      if (digErr != null) {
        const b = el('button', 'floor dig' + (digErr ? ' wait' : ''));
        b.type = 'button';
        b.innerHTML = G.raid < RD.floorNight(G, G.floors) ? `Floor ${RD.ROMAN[G.floors]} <small class="n">night ${RD.floorNight(G, G.floors)}</small>` : `+ Dig floor ${RD.ROMAN[G.floors]} <span class="m">${RD.floorCost(G)}</span>`;
        b.title = digErr || 'Dig a new floor below. Your hoard is carried down to it.';
        b.onclick = () => {
          const err = RD.canOpenFloor(G);
          if (err) return toast(err);
          pickTheme((theme) => digFloor(theme));
        };
        box.append(b);
      }
    }
    // in place: which floor is shown, and how many heroes are on each
    updateFloors();
  }

  // digging a floor: choose one of three themes for it
  function pickTheme(done) {
    const opts = RD.themeChoices(G);
    openModal(`
      <p class="eyebrow">Floor ${RD.ROMAN[G.floors]} · ${RD.floorCost(G)} malice</p>
      <h2 id="sheet-title">What lies below?</h2>
      <p class="lede">Choose what this floor becomes. Pieces that match its theme are stronger here.</p>
      <div class="diffs themes">${opts.map((k) => `<button type="button" class="diff theme-pick" data-k="${k}"><b>${esc(RD.THEMES[k].name)}</b><span>${esc(RD.THEMES[k].desc)}</span></button>`).join('')}</div>
      <div class="seedrow"><button type="button" class="ghost" id="cancel-dig">Not yet</button></div>`, (s) => {
      for (const b of s.querySelectorAll('.theme-pick')) b.onclick = () => { closeModal(); done(b.dataset.k); };
      s.querySelector('#cancel-dig').onclick = () => closeModal();
    });
  }
  function digFloor(theme) {
    const snap = snapshot();
    const res = RD.openFloor(G, theme);
    if (res.err) return toast(res.err);
    pushUndo(snap);
    setFloor(res.floor);
    RD.view.dirty = true;
    sfx('dig');
    P.happytime();
    checkBuild({}, null);
    save();
    renderAll();
    toast(`Floor ${RD.ROMAN[res.floor]} (${RD.THEMES[G.themes[res.floor]].name}) is dug. Stairs at ${RD.coord(res.stairs)}, and your hoard was carried down to ${RD.coord(G.hoard)}.`, true);
  }
  function updateFloors() {
    const box = $('floors');
    const R = G.R;
    for (const b of box.querySelectorAll('[data-f]')) {
      const f = +b.dataset.f;
      b.classList.toggle('on', RD.view.floor === f);
      b.setAttribute('aria-pressed', RD.view.floor === f);
      let n = 0;
      if (R) for (const h of R.heroes) if (RD.heroAlive(h) && RD.fl(h.tile) === f) n++;
      const c = b.querySelector('.count');
      if (c.textContent !== String(n)) c.textContent = n;
      c.hidden = !n;
    }
    const fb = $('follow');
    if (fb) { fb.classList.toggle('on', ui.follow); fb.setAttribute('aria-pressed', ui.follow); }
    // keep the floor on show in view when the tabs scroll
    if (box.classList.contains('many') && ui.tabFloor !== RD.view.floor) {
      ui.tabFloor = RD.view.floor;
      const on = box.querySelector('.floor.on');
      if (on) box.scrollLeft = Math.max(0, on.offsetLeft - box.offsetLeft - box.clientWidth / 2 + on.offsetWidth / 2);
    }
  }

  // ---------------------------------------------------------------- ledger
  function heroRow(h, live) {
    const li = el('li', 'hero' + (h.title ? ' legend' : ''));
    const cv = el('canvas');
    RD.heroIcon(cv, h, 28);
    const C = RD.CLASSES[h.cls];
    const chips = (h.traits || []).map((t) => `<span class="chip${t === 'stone' ? ' stone' : ''}" title="${esc(RD.TRAITS[t].desc)}"><span class="ti" aria-hidden="true">${RD.TRAITS[t].icon}</span>${esc(RD.TRAITS[t].name)}</span>`).join('');
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
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.title += '\nClick for full details.';
    li.onclick = () => showHero(h);
    li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showHero(h); } };
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
    const t = Math.max(0, Math.min(RD.MAX_TIER, Math.round(G.guild.threat))); // threat can climb past EX late in a run
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
    $('app').classList.toggle('raiding', raid);
    if (raid) renderPowers();
    renderForecast();
    renderUndo();
  }

  // ---------------------------------------------------------------- scrying
  // Rehearse tonight's raid on copies of the dungeon. Paid in malice; any change to the build makes it stale.
  function scry() {
    if (G.phase !== 'build') return;
    const cost = RD.scryCost(G);
    if (G.malice < cost) return toast(`Scrying needs ${cost} malice. You have ${G.malice}.`);
    G.malice -= cost;
    $('scry').disabled = true;
    $('scry').textContent = 'Scrying…';
    // let the button repaint before three rehearsals run
    setTimeout(() => {
      ui.forecast = RD.forecast(G, 3);
      ui.showHeat = true;
      sfx('summon');
      save();
      renderStats();
      renderForecast();
      $('forecast').hidden = false;
      hideDispatch();
    }, 30);
  }
  function renderForecast() {
    const b = $('scry');
    const build = G.phase === 'build';
    b.disabled = false;
    b.innerHTML = `Scry<span class="long"> the raid</span> <span class="m">${RD.scryCost(G)}</span>`;
    const f = ui.forecast;
    if (!f || !build || f.night !== G.raid) { $('forecast').hidden = true; if (f && f.night !== G.raid) ui.forecast = null; return; }
    f.stale = f.sig !== RD.buildSig(G);
    $('forecast-title').textContent = `Night ${G.raid}: ${f.runs} rehearsals`;
    const rng = (a, b2) => (a === b2 ? `${a}` : `${a}–${b2}`);
    const top = f.pieces.slice(0, 4);
    const max = Math.max(1, ...top.map((p) => p.dmg));
    $('forecast-body').innerHTML = f.stale
      ? `<p class="note warn">You changed the dungeon since this was scried, so it no longer holds. Scry again to see the new picture.</p>`
      : `<p class="big">${rng(...f.range.killed)} of ${f.party} heroes fall${f.range.gold[1] > 0 ? ` · ${rng(Math.round(f.range.gold[0]), Math.round(f.range.gold[1]))} gold taken` : ' · the hoard holds'}</p>
        <p class="note">Blue footprints on the map show where they walk. Heroes vary a little from the scry, so the real night can differ.</p>
        ${top.length ? `<ul class="dmg">${top.map((p) => `<li><span class="nm">${esc(p.name)}${p.tile != null ? ` <small>${RD.coord(p.tile)}</small>` : ''}</span><span class="bar"><i style="width:${(100 * p.dmg) / max}%"></i></span><span class="v">${p.dmg}${p.kills >= 0.5 ? ` · ${p.kills.toFixed(p.kills % 1 ? 1 : 0)} kills` : ''}</span></li>`).join('')}</ul>` : '<p class="note">None of your pieces would touch them.</p>'}
        ${f.idle.length ? `<p class="note">${f.idle.length} piece${f.idle.length > 1 ? 's' : ''} would never see a hero (ringed in gold).</p>` : ''}
        ${Object.keys(f.combos).length ? `<p class="note">Combos: ${Object.entries(f.combos).map(([k, v]) => `${esc(RD.COMBOS[k].name)} ×${Math.round(v / f.runs)}`).join(', ')}</p>` : ''}
        <label class="heat"><input type="checkbox" id="heat-toggle"${ui.showHeat ? ' checked' : ''}> Show footprints</label>`;
    const ht = $('heat-toggle');
    if (ht) ht.onchange = () => { ui.showHeat = ht.checked; };
    if (!ui.tut) RD.view.marks = f.stale ? [] : f.idle.slice();
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
      RD.drawIcon(cv, k === 'seal' ? 'power:seal' : k, 28);
      b.append(cv, el('span', null, `<span class="pname">${esc(p.name)}</span> <span class="cost">${open ? RD.powerCost(G, k) : 'night ' + RD.realNight(G, p.night)}</span>`), el('i', 'cool'));
      const tip = () => powerTip(k);
      b.onmouseenter = tip;
      b.onfocus = tip;
      b.onmouseleave = b.onblur = () => powerTip(ui.power);
      b.onclick = () => {
        if (!open) { powerTip(k); return toast(`${p.name} opens on night ${RD.realNight(G, p.night)}.`); }
        if (!p.target) {
          const err = RD.usePower(G, k);
          toast(err || `${p.name}!`, !err);
          ui.power = null;
        } else {
          ui.power = ui.power === k ? null : k;
          if (ui.power) toast(`${p.name}: ${ui.touch ? 'tap' : 'click'} a tile on the map.`, true);
        }
        ui.armed = -1;
        renderPowers();
        tickPowers();
        powerTip(ui.power || k);
        if (!ui.power) setTimeout(() => { if (!ui.power) powerTip(null); }, 2500);
      };
      box.append(b);
    }
    box.classList.toggle('compact', box.children.length > 7);
  }
  function powerTip(k) {
    const t = $('ptip');
    if (!k || G.phase !== 'raid') { t.hidden = true; return; }
    const p = RD.POWERS[k];
    const open = RD.powerOpen(G, k);
    t.innerHTML = `<b>${esc(p.name)}</b> <span class="m">${open ? RD.powerCost(G, k) + ' malice' : 'opens night ' + RD.realNight(G, p.night)}</span> · recovers in ${p.cd}s${ui.power === k ? ' · <em>pick a tile</em>' : ''}<br>${esc(p.desc)}`;
    t.hidden = false;
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
    if (i < 0 || G.phase !== 'build') { ui.previewError = null; ui.trouble = null; return; }
    if (ui.tool === 'move') ui.previewError = ui.carry != null ? RD.check(G, 'move', i, ui.carry) : G.items.has(i) ? null : 'Pick a piece to move.';
    else if (ui.tool === 'inspect') ui.previewError = G.items.has(i) || ghostAt(i) ? null : 'Nothing to inspect here.';
    else ui.previewError = RD.check(G, ui.tool, i);
    // a refused gate shows which corridors it would cut off
    ui.trouble = ui.previewError && RD.gateTrouble && RD.ITEMS[ui.tool] && (RD.ITEMS[ui.tool].oneway || RD.ITEMS[ui.tool].exit) ? RD.gateTrouble.slice() : null;
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
        return;
      }
      if (!ui.power) inspectAt(i);
      return;
    }
    if (G.phase !== 'build') return;
    if (ui.tool === 'inspect') {
      const it = G.items.get(i);
      if (!it) return ghostAt(i) ? showGhost(ghostAt(i)) : toast('Nothing here. Click a placed piece.');
      return showPiece(it.type, { it });
    }
    if (ui.tool === 'move') {
      if (ui.carry == null) {
        if (!G.items.has(i)) return toast('Pick up a piece first.');
        ui.carry = i;
        renderDetail();
        return;
      }
      if (i === ui.carry) { ui.carry = null; renderDetail(); return; }
      const snap = snapshot();
      const res = RD.apply(G, 'move', i, ui.carry);
      if (res.err) return toast(res.err);
      pushUndo(snap);
      ui.carry = null;
      sfx('place');
      renderDetail();
      afterBuild();
      return;
    }
    const snap = snapshot();
    const res = RD.apply(G, ui.tool, i);
    if (res.err) return toast(res.err);
    pushUndo(snap);
    if (ui.touch && /^Tap again/.test($('toast').textContent)) $('toast').className = 'toast'; // the "tap again" hint has done its job
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

  // what a second tap on a tile will do, in words
  function tapVerb(i) {
    const t = ui.tool, it = G.items.get(i);
    if (RD.ITEMS[t]) return `place the ${RD.ITEMS[t].name} (${RD.costOf(G, t)} malice)`;
    if (t === 'move') return ui.carry != null ? 'set it down here' : 'pick this up';
    if (t === 'upgrade') return it ? `level up the ${RD.ITEMS[it.type].name} (${RD.levelCost(it)} malice)` : 'level up';
    if (t === 'sell') return it ? `sell the ${RD.ITEMS[it.type].name} for ${RD.refund(it)} malice` : 'sell';
    if (t === 'inspect') return 'see its details';
    return { dig: `dig here (${RD.costOf(G, 'dig')} malice)`, fill: `fill this in (${RD.costOf(G, 'fill')} malice)`, hoard: `move the hoard here (${RD.costOf(G, 'hoard')} malice)` }[t] || 'confirm';
  }

  // during a raid: the hero or monster nearest the click, else the piece on that tile
  function inspectAt(i) {
    const [cx, cy] = [RD.xy(i)[0] + 0.5, RD.xy(i)[1] + 0.5], f = RD.fl(i);
    const near = (list) => list.filter((a) => a.tile != null && RD.fl(a.tile) === f && Math.hypot(a.x - cx, a.y - cy) <= 0.8).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
    const h = near(G.R.heroes.filter(RD.heroAlive));
    if (h) return showHero(h);
    const m = near(G.R.monsters.filter((x) => !x.dead));
    if (m) return showPiece(m.type, { m });
    const it = G.items.get(i);
    if (it) return showPiece(it.type, { it });
    if (ghostAt(i)) showGhost(ghostAt(i));
  }
  const ghostAt = (i) => (G.ghosts || []).find((gh) => !gh.gone && gh.tile === i);
  function showGhost(gh) {
    toast(`Ghost of ${gh.name} ${gh.title} (${RD.GHOSTS[gh.kind].name}): ${RD.GHOSTS[gh.kind].desc} Fades after night ${gh.fade}.`, true, 7000);
  }

  // ---------------------------------------------------------------- undo and saved layouts
  // Every build action can be undone until the gate opens: each one keeps a copy of the dungeon from just before.
  ui.undo = [];
  const snapshot = () => JSON.stringify(RD.saveGame(G));
  function pushUndo(snap) {
    ui.undo.push(snap || snapshot());
    if (ui.undo.length > 60) ui.undo.shift();
    renderUndo();
  }
  function undo() {
    if (G.phase !== 'build' || !ui.undo.length) return toast('Nothing to undo.');
    const tool = ui.tool, floor = RD.view.floor;
    G = RD.loadGame(JSON.parse(ui.undo.pop()));
    ui.tool = tool;
    ui.carry = null;
    ui.hoverIt = null;
    ui.floorShape = null;
    setFloor(Math.min(floor, G.floors - 1));
    RD.view.dirty = true;
    sfx('sell');
    save();
    renderAll();
    toast('Undone.', true);
  }
  function renderUndo() {
    const b = $('undo');
    if (b) b.disabled = !(G && G.phase === 'build' && ui.undo.length);
  }
  // three saved layouts per floor, kept with the dungeon
  function showLayouts() {
    if (G.phase !== 'build') return;
    const f = RD.view.floor;
    const slots = (G.layouts[f] = G.layouts[f] || [null, null, null]);
    const rows = slots.map((L, k) => {
      if (!L) return `<li><div><b>Slot ${k + 1}</b><span>Empty</span></div><button type="button" class="ghost small" data-save="${k}">Save floor ${RD.ROMAN[f]} here</button></li>`;
      const est = RD.layoutCost(G, f, L);
      const what = [est.placed && `${est.placed} to place`, est.sold && `${est.sold} to sell`, est.dug && `${est.dug} to dig`, est.filled && `${est.filled} to fill`, est.levelled && `${est.levelled} level-ups`].filter(Boolean).join(', ') || 'already matches';
      return `<li><div><b>Slot ${k + 1}</b><span>Saved on night ${L.night} · ${L.items.length} pieces · ${what}${est.skipped.length ? ` · ${est.skipped.length} can’t be placed` : ''}</span></div>
        <span class="acts"><button type="button" class="go small" data-load="${k}">Rebuild · <span class="m">${est.cost > 0 ? est.cost : 0}</span>${est.cost < 0 ? ` (+${-est.cost} back)` : ''}</button><button type="button" class="ghost small" data-save="${k}">Overwrite</button><button type="button" class="ghost small" data-clear="${k}">Clear</button></span></li>`;
    }).join('');
    openModal(`
      <p class="eyebrow">Floor ${RD.ROMAN[f]}</p>
      <h2 id="sheet-title">Saved layouts</h2>
      <p class="lede">Save this floor’s corridors and pieces, then rebuild them in one go on a later night. You pay only for what differs: pieces that don’t match are sold, missing ones are placed and levelled, rock is dug or filled. Anything the rules or your malice won’t allow is skipped. You can undo a rebuild.</p>
      <ul class="layouts">${rows}</ul>
      <div class="seedrow"><button type="button" class="go" id="layouts-close" data-focus>Close</button></div>`, (sh) => {
      for (const b of sh.querySelectorAll('[data-save]')) b.onclick = () => { slots[+b.dataset.save] = RD.layoutOf(G, f); save(); toast(`Floor ${RD.ROMAN[f]} saved in slot ${+b.dataset.save + 1}.`, true); showLayouts(); };
      for (const b of sh.querySelectorAll('[data-clear]')) b.onclick = () => { slots[+b.dataset.clear] = null; save(); showLayouts(); };
      for (const b of sh.querySelectorAll('[data-load]')) b.onclick = () => {
        pushUndo();
        const res = RD.applyLayout(G, f, slots[+b.dataset.load]);
        closeModal();
        RD.view.dirty = true;
        sfx('place');
        afterBuild();
        const done = [res.placed && `${res.placed} placed`, res.sold && `${res.sold} sold`, res.dug && `${res.dug} dug`, res.filled && `${res.filled} filled`, res.levelled && `${res.levelled} levelled`].filter(Boolean).join(', ') || 'nothing to change';
        toast(`Floor ${RD.ROMAN[f]} rebuilt: ${done}, ${res.cost >= 0 ? res.cost + ' malice' : -res.cost + ' malice back'}.${res.skipped.length ? ` Skipped ${res.skipped.length}: ${res.skipped[0]}${res.skipped.length > 1 ? '…' : ''}` : ''}`, !res.skipped.length, 7000);
      };
      sh.querySelector('#layouts-close').onclick = closeModal;
    });
  }

  function afterBuild() {
    renderUndo();
    save();
    renderStats();
    renderBlueprints();
    renderForecast();
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
    hideDispatch();
    $('ptip').hidden = true;
    ui.undo = [];
    renderUndo();
    if (ui.forecast && !ui.tut) RD.view.marks = [];
    ui.forecast = null;
    $('forecast').hidden = true;
    ui.stopT = ui.slowT = 0;
    bark('gate', null, 1);
    tutorial('raid');
    renderAll();
  }

  // during a raid, keep the camera on the floor where the heroes are
  function follow() {
    if (!G.R || !ui.follow) return;
    const live = G.R.heroes.filter(RD.heroAlive);
    if (!live.length || live.some((h) => RD.fl(h.tile) === RD.view.floor)) return;
    setFloor(Math.max(...live.map((h) => RD.fl(h.tile))));
  }

  const canRevive = () => P.ads && G.result === 'lost' && !G.stats.revived;
  RD.onRaidEnd = function () {
    $('ptip').hidden = true;
    checkRaid(G.debrief);
    renderAll();
    if (G.phase === 'over' && !canRevive()) { saveRecord(); store.del(slotKey()); }
    else if (G.phase !== 'over') writeSave(G, true);
    setTimeout(() => showDebrief(), ui.slowT > 0 ? 1900 : 700);
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
    if (G.floors < RD.maxFloors(G) && RD.floorNight(G, G.floors) === G.raid) msgs.push(`floor ${RD.ROMAN[G.floors]} can be dug`);
    if (msgs.length) toast(msgs.join(' · '), true);
    setTimeout(() => centerOn(G.hoard), 30);
    P.context({ night: G.raid, difficulty: G.diff, mode: G.mode });
    showDispatch();
    const d = G.history[0];
    if (G.party.some((h) => h.title)) return; // the dispatch has the Core greet the legend
    if (G.gold < 40) bark('thin', null, 2);
    else if (d && d.killed.length >= 2 && !d.escaped.length) bark('perfect', null, 1);
    else if (d && d.goldLost > 0) bark('robbed', { g: d.goldLost }, 1);
    else bark('night', { night: G.raid, k: G.party.length }, 1);
  }

  // ---------------------------------------------------------------- the dungeon's voice
  // One line at a time. A more important line can cut in; the same kind of quip waits a while before repeating.
  const voice = { until: 0, prio: -1, last: {}, timer: 0 };
  const heroVals = (h) => ({ n: h.name, t: h.title || '', c: RD.CLASSES[h.cls].name.toLowerCase(), g: h.carry || 0 });
  function bark(key, vals, prio, chance) {
    if (ui.tut || (chance != null && Math.random() > chance)) return;
    const now = performance.now();
    if (now < voice.until && (prio || 0) <= voice.prio) return;
    if (now - (voice.last[key] || -1e9) < 9000 && (prio || 0) < 2) return;
    const pool = key.startsWith('power.') ? RD.VOICE.power[key.slice(6)] : RD.VOICE[key];
    if (!pool || !pool.length) return;
    const line = pool[Math.floor(Math.random() * pool.length)].replace(/\{(\w+)\}/g, (_, k) => (vals && vals[k] != null ? vals[k] : ''));
    voice.last[key] = now;
    voice.prio = prio || 0;
    voice.until = now + 2400 + line.length * 40;
    $('voice-text').textContent = line;
    const box = $('voice');
    box.classList.remove('show');
    void box.offsetWidth;
    box.classList.add('show');
    clearTimeout(voice.timer);
    voice.timer = setTimeout(() => { box.classList.remove('show'); voice.prio = -1; }, voice.until - now);
  }

  // ---------------------------------------------------------------- game feel
  // hit-stop: the raid holds still for a few frames on a heavy blow; the last kill of a night plays in slow motion
  function hitStop(s) { ui.stopT = Math.max(ui.stopT || 0, s); }
  function slowMo() {
    ui.slowT = 1.6;
    const w = $('board-wrap');
    w.classList.remove('slowmo');
    void w.offsetWidth;
    w.classList.add('slowmo');
    clearTimeout(ui.slowTimer);
    ui.slowTimer = setTimeout(() => w.classList.remove('slowmo'), 1700);
  }
  RD.onEvent = function (type, d) {
    if (!G || !G.R || G.phase !== 'raid') return;
    const R = G.R;
    if (type === 'kill') {
      const left = R.heroes.some(RD.heroAlive) || R.queue.length;
      hitStop(d.title || d.nemesis ? 0.16 : 0.07);
      if (!left) { slowMo(); bark('last', heroVals(d), 3); }
      else if (d.nemesis) bark('nemesisKill', heroVals(d), 3);
      else if (d.title) bark('legendKill', heroVals(d), 3);
      else if (R.killed.length === 1) bark('first', heroVals(d), 2);
      else bark('kill', heroVals(d), 1, 0.6);
    } else if (type === 'bigHit') hitStop(0.05);
    else if (type === 'bossDown') { hitStop(0.2); bark('bossDown', { m: d.d.name }, 3); }
    else if (type === 'escape') bark(d.carry ? 'escapeGold' : 'escape', heroVals(d), d.carry ? 3 : 2);
    else if (type === 'loot') bark('loot', heroVals(d), 2);
    else if (type === 'flee') bark('flee', heroVals(d), 0, 0.5);
    else if (type === 'power') bark('power.' + d, null, 1, 0.7);
    else if (type === 'combo') {
      hitStop(0.06);
      sfx('level');
      const m = meta();
      if (!m.combos[d.id]) {
        m.combos[d.id] = true;
        store.set('meta', m);
        const c = RD.COMBOS[d.id];
        toast(`Combo discovered: ${c.name}! ${c.desc} (Guide → Combos)`, true, 6500);
        bark('combo', { c: c.name }, 3);
      } else bark('combo', { c: RD.COMBOS[d.id].name }, 1, 0.25);
    }
  };

  // ---------------------------------------------------------------- the guild's dispatch
  // Who is coming tonight, what each of them does, and why the guild picked them.
  function showDispatch() {
    if (ui.tut || !G.party.length) return hideDispatch();
    const legend = G.party.find((h) => h.title);
    $('dispatch-title').textContent = `Night ${G.raid}: ${G.party.length} heroes`;
    $('dispatch-list').replaceChildren(...G.party.map((h) => {
      const C = RD.CLASSES[h.cls];
      const li = el('li', h.title ? 'legend' : '');
      const cv = el('canvas');
      RD.heroIcon(cv, h, 28);
      const icons = (h.traits || []).map((t) => `<span class="ti" title="${esc(RD.TRAITS[t].name + ': ' + RD.TRAITS[t].desc)}">${RD.TRAITS[t].icon}</span>`).join('');
      const role = C.desc.replace(/^Unique\.\s*/, '').split('. ')[0].replace(/\.$/, '');
      const prey = h.hunt != null && G.items.get(h.hunt);
      li.innerHTML = `<span></span><div><b>${tierTag(h.tier)} ${esc(h.name)}${h.title ? ` <em>${esc(h.title)}</em>` : ''}</b> ${icons}<small>${esc(C.name)}${h.lvl > 1 ? ' · veteran' : ''}${h.nemesis ? ' · nemesis' : ''}${prey ? ` · hunting your ${esc(RD.ITEMS[prey.type].name)}` : ''}. ${esc(role)}.</small></div>`;
      li.firstChild.replaceWith(cv);
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.title = 'Click for full details';
      li.onclick = () => showHero(h);
      li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showHero(h); } };
      return li;
    }));
    $('dispatch-note').textContent = G.adapt || '';
    $('dispatch').hidden = false;
    if (legend) bark('legend', heroVals(legend), 2);
  }
  function hideDispatch() { $('dispatch').hidden = true; }

  // ---------------------------------------------------------------- heroes up close
  const pct = (v) => Math.round(v * 100) + '%';
  const DETECT = { mech: 'mechanisms', magic: 'magic', illusion: 'illusions' };
  // what a class can do, in numbers; `h` (optional) scales heals and door-bashing to that hero's rank
  function abilities(cls, h) {
    const C = RD.CLASSES[cls], sc = h && h.dmg ? h.dmg / C.dmg : 1, out = [];
    if (C.heal) out.push(`Heals allies within ${C.healR} tiles for ${(C.heal * sc).toFixed(1)} health a second`);
    if (C.revive) out.push('Raises the first ally who falls on the same floor, at half health, once a raid');
    if (C.cure) out.push(`Frees allies within ${C.cure} tiles from pins, dazes and slows`);
    if (C.holy) out.push(`${C.holy}× damage to the undead`);
    if (C.slayer) out.push(`${C.slayer}× damage to bosses`);
    if (C.bane) out.push(`3× damage to ${C.bane} monsters`);
    if (C.firstStrike) out.push(`${C.firstStrike}× damage on the first hit against each monster`);
    if (C.cleave) out.push(`Every swing hits all monsters within ${C.cleave} tiles`);
    if (C.splash) out.push(`Attacks splash every monster within ${C.splash} tiles for 60%`);
    if (C.rage) out.push('Hits harder as it bleeds, up to double near death');
    if (C.lifesteal) out.push(`Heals ${pct(C.lifesteal)} of the damage it deals`);
    if (C.inspire) out.push('Allies within 2½ tiles deal 25% more damage, move 10% faster and hold their nerve');
    if (C.taunt) out.push(`Draws every monster within ${C.taunt} tiles onto itself`);
    if (C.guard) out.push(`Takes ${pct(1 - C.guard)} less damage`);
    if (C.dodge) out.push(`Dodges ${pct(C.dodge)} of blows`);
    if (C.fireward) out.push(`Takes ${pct(1 - C.fireward)} less damage from blasts`);
    if (C.unbound) out.push('Shrugs off pins, slows and cages');
    if (C.tame) out.push(`Calms a beast of its rank or lower within ${C.tame} tiles (every 12s)`);
    if (C.detect) out.push(`Spots hidden traps within ${C.detectR} tiles: ${Object.entries(C.detect).map(([k, v]) => `${DETECT[k]} ${pct(v)}`).join(', ')}`);
    if (C.disarm) out.push(`Disarms a known trap in ${C.disarm}s, and jams wall traps that hit it (${(C.disarm * 3).toFixed(1)}s)`);
    if (C.pick) out.push(`Picks a locked door in ${C.pick}s`);
    else out.push(`Batters doors for ${Math.round(C.bash * sc)} a second`);
    if (C.sealwalker) out.push('Walks through Boss Seals');
    if (C.thief) out.push(`Steals ${C.thief}× as much gold`);
    return out;
  }
  function heroStats(h) {
    const C = RD.CLASSES[h.cls];
    const live = G.phase === 'raid' && h.tile != null;
    return [
      ['Health', live ? `${Math.max(0, Math.ceil(h.hp))} / ${Math.round(h.maxHp)}` : String(Math.round(h.maxHp))],
      ['Damage', `${Math.round(h.dmg)} every ${h.rate}s (${Math.round(h.dmg / h.rate)} a second)`],
      ['Reach', h.range > 1.5 ? `${h.range} tiles (ranged)` : 'melee'],
      ['Speed', `${(h.speed || C.speed).toFixed(2)} tiles a second`],
      ['Sight', `${h.vision || C.vision} tiles`],
      ['Runs at', h.fleeAt > 0 ? `${pct(h.fleeAt)} health` : 'never'],
      ['Bravery', pct(Math.min(1, h.brave != null ? h.brave : C.brave))],
      ['Greed', pct(Math.min(1, h.greed != null ? h.greed : C.greed))],
    ];
  }
  function heroState(h) {
    if (G.phase !== 'raid' || !G.R || h.id == null) return '';
    const st = { seek: 'heading for the hoard', loot: 'looting', escape: 'leaving with gold', flee: 'running for the gate', dead: 'dead', out: 'escaped' }[h.state] || 'waiting at the gate';
    const fx = [];
    if (h.stun > 0) fx.push('stunned'); if (h.rootT > 0) fx.push('pinned'); if (h.slowT > 0) fx.push('slowed');
    if (h.cageT > 0) fx.push('caged'); if (h.confuse > 0) fx.push('dazed'); if (h.poison) fx.push('poisoned');
    if (h.fearT > 0) fx.push('afraid'); if (h.soulTorn) fx.push('soul torn');
    const knows = h.K ? h.K.traps.size : 0;
    return `<p class="note">Right now: <b>${st}</b>${h.tile != null && RD.heroAlive(h) && G.floors > 1 ? ` on floor ${RD.ROMAN[RD.fl(h.tile)]}` : ''}${fx.length ? ` · ${fx.join(', ')}` : ''}${h.carry ? ` · carrying ${h.carry} gold` : ''} · knows ${knows} trap${knows === 1 ? '' : 's'}</p>`;
  }
  function showHero(h, back) {
    const C = RD.CLASSES[h.cls];
    const prey = h.hunt != null && G.items.get(h.hunt);
    const tr = (h.traits || []).map((t) => `<li><span class="ti">${RD.TRAITS[t].icon}</span><b>${esc(RD.TRAITS[t].name)}</b> ${esc(RD.TRAITS[t].desc)}</li>`).join('');
    openModal(`
      <p class="eyebrow">${C.unique ? 'Legend' : 'Adventurer'} · ${RD.TIERS[h.tier]}-rank ${esc(C.name)}</p>
      <div class="herohead"><span></span><h2 id="sheet-title">${esc(h.name)}${h.title ? ` <em>${esc(h.title)}</em>` : ''}</h2></div>
      <p class="lede">${esc(C.desc)}</p>
      <div class="chips">${h.nemesis ? `<span class="chip wanted">Nemesis · escaped ${h.escapes}×, triple bounty</span>` : ''}${h.lvl > 1 ? `<span class="chip vet">Veteran ×${h.lvl - 1}: +${(h.lvl - 1) * 10}% strength</span>` : ''}${prey ? `<span class="chip hunt">Strike team: hunting your ${esc(RD.ITEMS[prey.type].name)}</span>` : ''}</div>
      ${heroState(h)}
      <div class="cols">
        <div><h3>Stats</h3><table class="st">${heroStats(h).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table></div>
        <div><h3>Abilities</h3><ul class="abil">${abilities(h.cls, h).map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>
      </div>
      ${tr ? `<h3>Traits</h3><ul class="traits">${tr}</ul>` : ''}
      <div class="seedrow"><button type="button" class="go" id="hero-close" data-focus>${back ? 'Back' : 'Close'}</button></div>`, (sh) => {
      const cv = el('canvas');
      RD.heroIcon(cv, h, 48);
      sh.querySelector('.herohead span').replaceWith(cv);
      sh.querySelector('#hero-close').onclick = () => (back ? back() : closeModal());
    });
  }

  // ---------------------------------------------------------------- pieces up close
  const kindOf = (d) => d.boss ? (d.lord ? 'Demon Lord' : d.myth ? 'Myth boss' : 'Boss') : d.den ? 'Horde' : d.summonOnly ? 'Summoned monster' : { trap: d.hidden ? 'Hidden trap' : 'Trap', turret: 'Wall piece', monster: d.elite ? 'Elite monster' : 'Monster', door: 'Obstacle', totem: 'Room', seal: 'Boss seal', bait: 'Bait' }[d.kind];
  const SENSE = { mech: 'a mechanism', magic: 'magic', illusion: 'an illusion' };
  const classesWith = (f) => Object.values(RD.CLASSES).filter(f).map((C) => C.name);
  // the rules a piece plays by, in words
  function pieceNotes(type) {
    const d = RD.ITEMS[type], out = [];
    if (d.hidden) out.push(`Hidden until a hero spots it. It is ${SENSE[d.sense]}, so it is spotted by: ${classesWith((C) => C.detect && C.detect[d.sense]).join(', ')}.`);
    else if (d.sense) out.push(`Disguised. Seen through by: ${classesWith((C) => C.detect && C.detect[d.sense]).join(', ')}.`);
    if (d.kind === 'trap') out.push(['chasm', 'abyss'].includes(type) ? 'Cannot be disarmed; heroes who know it walk a long way around.' : `Rogues and other disarmers (${classesWith((C) => C.disarm).join(', ')}) can switch it off once they know it is there.`);
    if (d.oneShot) out.push('Fires once a raid.');
    if (d.kind === 'turret') out.push(`Shoots heroes in line${d.chain ? ' and arcs lightning between them' : ''}. A hero it has hit who can disarm may jam it for 12s.${type === 'pylon' ? ` Needs line of sight; pylons must stand ${RD.GAP.pylon} tiles apart.` : RD.GAP[type] ? ` Must stand ${RD.GAP[type]} tiles from another ${d.name.toLowerCase()}.` : ''}`);
    if (d.kind === 'door') out.push(d.oneway ? 'Open when the raid begins. Once the whole party has walked through it (the dead and anyone already running out don’t count) it falls and stays down until dawn; nobody can batter or pick it. Every Exit Gate on the same floor opens at that moment.' : d.exit ? 'Shut when the raid begins, so heroes have to come in by the Drop Gate. It opens the moment a Drop Gate on this floor falls, and every hero on the floor hears it.' : d.nopick ? 'Cannot be picked; it has to be battered down.' : 'Knights batter it, rogues pick the lock.');
    if (d.elite) out.push('Elite: outfights a whole party of its own rank.');
    if (d.boss) out.push(`Boss: one per floor and it never leaves its lair.${d.myth ? ' A myth: it comes late and hits like it.' : ''} Strike teams of specialists hunt known bosses.`);
    if (d.undead) out.push(`Undead: ${classesWith((C) => C.holy).join(', ')} deal extra damage to it.`);
    if (d.tags && d.tags.includes('beast')) out.push('A beast: Beast Tamers can calm it for a while.');
    if (d.tags && d.tags.includes('goblinoid')) out.push('A goblinoid: the Goblin Slayer deals triple damage to it.');
    if (d.boss) out.push(`Slayers (${classesWith((C) => C.slayer).join(', ')}) deal extra damage to bosses.`);
    if (d.drain) out.push(`Heals ${pct(d.drain)} of the damage it deals.`);
    if (d.slows) out.push('Its hits slow heroes.');
    if (d.lure) out.push('Looks like a treasure chest; greedy heroes walk right up to it.');
    if (d.kind === 'monster' && !d.den && !d.boss) out.push(`Guards ${d.leash} tiles around its post, and runs down heroes who flee or carry gold.`);
    if (d.kind === 'seal') out.push('While this floor’s boss lives, heroes here cannot take the stairs or leave by the gate. Anyone still sealed in when the night ends dies. Only the Phantom Thief walks through.');
    if (d.aura) out.push(d.aura === 'monster' ? 'Monsters within range: +25% damage, +15% health.' : 'Traps within range: +20% damage, rearm 40% faster.');
    const themes = Object.values(RD.THEMES).filter((t) => t.tag && d.tags && d.tags.includes(t.tag)).map((t) => t.name);
    if (themes.length) out.push(`Stronger on ${themes.join(', ')} floors.`);
    return out;
  }
  // what the floor it stands on adds to a placed piece
  function floorBonus(it) {
    const d = RD.ITEMS[it.type], out = [];
    const th = RD.themeOf(G, it.tile);
    const m = (k) => RD.themeMult(G, it.type, it.tile, k);
    const parts = [['hp', 'health'], ['dmg', 'damage'], ['speed', 'speed']].filter(([k]) => m(k) !== 1).map(([k, n]) => `${m(k) > 1 ? '+' : ''}${Math.round((m(k) - 1) * 100)}% ${n}`);
    if (parts.length) out.push(`${th.name}: ${parts.join(', ')}`);
    if (d.kind === 'monster' && RD.inAura(G, it.tile, 'monster')) out.push('War Banner nearby: +25% damage, +15% health');
    if ((d.kind === 'trap' || d.kind === 'turret') && RD.inAura(G, it.tile, 'trap')) out.push('Trapmaster’s Sigil nearby: +20% damage, rearms 40% faster');
    return out;
  }
  function levelTable(type, tier) {
    const rows = [1, 2, 3, 4, 5].map((lv) => RD.pieceStats(type, lv, tier));
    const keys = rows[0].map((r) => r[0]).filter((k, i) => rows.some((r) => r[i] && r[i][1] !== rows[0][i][1]));
    if (!keys.length) return '';
    return `<table class="st lvls"><tr><th></th>${[1, 2, 3, 4, 5].map((l) => `<th>Lv${l}</th>`).join('')}</tr>${keys.map((k) => `<tr><th>${esc(k)}</th>${rows.map((r) => `<td>${esc((r.find((x) => x[0] === k) || [])[1])}</td>`).join('')}</tr>`).join('')}</table>`;
  }
  // o: { lv, tier, it (a placed piece), m (a live monster), back }
  function showPiece(type, o) {
    o = o || {};
    const d = RD.ITEMS[type];
    const it = o.it || (o.m && o.m.item) || null;
    const lv = o.lv || (o.m && o.m.lv) || (it && it.lv) || 1;
    const tier = o.tier != null ? o.tier : o.m ? o.m.tier : d.tier;
    const me = () => showPiece(type, o);
    const mn = RD.minionOf(type, tier);
    const live = o.m && !o.m.dead ? `<p class="note">Right now: <b>${Math.max(0, Math.ceil(o.m.hp))} / ${Math.round(o.m.maxHp)}</b> health${o.m.summoner ? ` · called by the ${esc(o.m.summoner.d.name)}` : ''}${o.m.calmT > 0 ? ' · calmed' : ''}${o.m.dormant ? ' · waiting' : ''}</p>` : '';
    const bonus = it && it.tile != null && G.items.get(it.tile) === it ? floorBonus(it) : [];
    let minion = '';
    if (mn) {
      const u = RD.ITEMS[mn.type];
      minion = `<h3>${mn.kind === 'summon' ? 'Summons' : 'The horde'}</h3>
        <p class="note">${mn.kind === 'summon' ? `Calls a ${esc(u.name)} every ${mn.every}s, up to ${mn.max} at once.` : `Releases ${mn.count} × ${esc(u.name)} when the raid begins (one more on a Fungal floor).`} Each fights at <b>${RD.TIERS[mn.tier]} rank, Lv${lv}</b>${mn.tier > u.tier ? `, ${mn.tier - u.tier} rank${mn.tier - u.tier > 1 ? 's' : ''} above an ordinary ${esc(u.name.toLowerCase())}` : ''}. Summons are not weak copies.</p>
        <div class="minion"><span class="gi" data-icon="item:${mn.type}"></span>${rowsTable(RD.pieceStats(mn.type, lv, mn.tier))}</div>
        <button type="button" class="ghost small" id="open-minion">Everything about the ${esc(u.name)} at ${RD.TIERS[mn.tier]} rank</button>`;
    }
    const st = RD.pieceStats(type, lv, tier);
    openModal(`
      <p class="eyebrow">${esc(kindOf(d))}${d.tags && d.tags.length ? ' · ' + d.tags.join(', ') : ''}</p>
      <div class="herohead"><span class="gi" data-icon="item:${type}"></span><h2 id="sheet-title">${tierTag(tier)} ${esc(d.name)} <em>Lv${lv}</em></h2></div>
      <p class="lede">${esc(d.desc)}</p>
      ${live}
      <div class="cols">
        <div><h3>At Lv${lv}${tier !== d.tier ? `, ${RD.TIERS[tier]} rank` : ''}</h3><table class="st">${st.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}<tr><th>Costs</th><td>${d.summonOnly ? 'summoned only' : RD.costOf(G, type) + ' malice'}</td></tr>${it && G.phase === 'build' && G.items.get(it.tile) === it ? `<tr><th>Sells for</th><td>${RD.refund(it)} malice</td></tr>` : ''}</table>
          ${bonus.length ? `<p class="note">On this floor: ${bonus.map(esc).join(' · ')}</p>` : ''}</div>
        <div><h3>How it works</h3><ul class="abil">${pieceNotes(type).map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>
      </div>
      ${levelTable(type, tier) ? `<h3>By level</h3>${levelTable(type, tier)}` : ''}
      ${minion}
      <div class="seedrow"><button type="button" class="go" id="piece-close" data-focus>${o.back ? 'Back' : 'Close'}</button></div>`, (sh) => {
      icons(sh);
      const om = sh.querySelector('#open-minion');
      if (om) om.onclick = () => showPiece(mn.type, { lv, tier: mn.tier, back: me });
      sh.querySelector('#piece-close').onclick = () => (o.back ? o.back() : closeModal());
    });
  }
  const rowsTable = (rows) => `<table class="st">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
  // fill every <span class="gi" data-icon="kind:key"> with its drawing
  function icons(root) {
    for (const sp of root.querySelectorAll('.gi')) {
      const [kind, k] = (sp.dataset.icon || '').split(':');
      if (!kind) { sp.remove(); continue; }
      const cv = el('canvas');
      if (kind === 'hero') RD.heroIcon(cv, { cls: k, tier: RD.CLASSES[k].minTier || 0, title: RD.CLASSES[k].unique ? 'x' : '' }, 36);
      else RD.drawIcon(cv, kind === 'power' && k === 'seal' ? 'power:seal' : k, 36);
      sp.replaceWith(cv);
    }
  }
  // a typical hero of a class at its first rank, for the guide
  function sampleHero(cls) {
    const C = RD.CLASSES[cls], tier = C.minTier || 0, sc = RD.TIER_MULT[tier] * RD.DIFF[G.diff].hero;
    return { cls, tier, lvl: 1, traits: [], name: C.name, title: C.unique ? RD.TITLES[cls] : '', maxHp: Math.round(C.hp * sc), dmg: C.dmg * sc, rate: C.rate, range: C.range, speed: C.speed, vision: C.vision, fleeAt: C.fleeAt, brave: C.brave, greed: C.greed };
  }

  // "Show me on the map": close the guide and light up the real thing, a tile on the map or a control on screen
  const SHOW = {
    gate: { tile: () => G.entrance, say: 'The gate. Heroes come in here when you press Open the gate.' },
    hoard: { tile: () => G.hoard, el: 'st-gold', say: 'Your hoard, and the Hoard counter at the top: the gold you have left. At 0 the dungeon falls.' },
    malice: { el: 'st-malice', say: 'Malice: what you build with. Kills and every new night add more.' },
    catalog: { el: 'catalog', say: 'Your blueprints. Pick one, then click a corridor tile on the map.' },
    tools: { el: 'tools', say: 'Tools: Info, Dig, Fill, Move, Level, Hoard and Sell. Pick one, then click the map.' },
    guild: { el: 'view-guild', say: 'The Guild’s map (or press G): what the heroes know about your dungeon.' },
    floors: { el: 'floors', tile: () => (G.floors > 1 ? G.stairs[0] : null), say: 'Floor tabs. Dig a new floor here once it opens; the stairs lead down to it.' },
    powers: { el: () => (G.phase === 'raid' ? 'powers' : 'go'), say: () => (G.phase === 'raid' ? 'Raid powers: click one, then a tile.' : 'Powers appear here once you Open the gate and the raid begins.') },
    scry: { el: 'scry', say: 'Scry the raid: rehearse tonight’s raid before you open the gate. Costs malice; any change makes it stale.' },
    rating: { el: 'st-rating', say: 'The guild’s rating of your dungeon. Higher rating, stronger heroes.' },
  };
  function pointAt(key) {
    const d = SHOW[key];
    if (!d) return;
    closeModal();
    const tile = d.tile ? d.tile() : null;
    if (tile != null && tile >= 0) {
      if (RD.fl(tile) !== RD.view.floor) setFloor(RD.fl(tile), G.phase === 'raid');
      setTimeout(() => centerOn(tile, true), 30);
      if (!ui.tut) {
        RD.view.marks = [tile];
        clearTimeout(ui.markTimer);
        ui.markTimer = setTimeout(() => { if (!ui.tut) RD.view.marks = []; }, 6000);
      }
    }
    const id = typeof d.el === 'function' ? d.el() : d.el;
    const e = id && $(id);
    if (e) {
      const box = e.closest('.stats > div') || e;
      box.classList.remove('spot');
      void box.offsetWidth;
      box.classList.add('spot');
      if (box.scrollIntoView) box.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      setTimeout(() => box.classList.remove('spot'), 6000);
    }
    toast(typeof d.say === 'function' ? d.say() : d.say, true, 6000);
  }

  // ---------------------------------------------------------------- the guide
  // Everything in the game, locked or not: pieces with their numbers, powers, heroes, traits, floors and omens.
  const GUIDE_TABS = [['learn', 'How to play'], ['basics', 'Basics'], ['powers', 'Powers'], ...RD.GROUPS.map((g) => [g.id, g.name]), ['summons', 'Summons & hordes'], ['combos', 'Combos'], ['ghosts', 'Ghosts'], ['heroes', 'Heroes'], ['traits', 'Traits'], ['floors', 'Floor types'], ['omens', 'Omens & twists']];
  function guideBody(tab) {
    const entry = (icon, title, sub, body, open) => `<li class="gentry${open ? ' open' : ''}"${open ? ` data-open="${open}" tabindex="0" role="button"` : ''}><span class="gi" data-icon="${icon || ''}"></span><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}${body}${open ? '<span class="more">Full details ›</span>' : ''}</div></li>`;
    if (tab === 'learn') return `<p class="note">Each picture plays on a loop. <b>Show me</b> closes the guide and points at the real thing in your dungeon.</p><ul class="lessons">${RD.HOWTO.map((l) => `<li class="lesson"><canvas data-lesson="${l.id}" aria-hidden="true"></canvas><div><b>${esc(l.title)}</b><p>${esc(l.text)}</p><button type="button" class="ghost small" data-show="${l.show}">Show me on the map</button></div></li>`).join('')}</ul>`;
    if (tab === 'basics') {
      const ranks = RD.TIERS.map((t, i) => `<span class="tier" style="--tc:${RD.TIER_COLOR[i]}">${t}</span> night ${RD.realNight(G, RD.TIER_UNLOCK[i])}`).join(' · ');
      return `<div class="gtext">
        <p><b>You are the dungeon.</b> Each night you build, then heroes raid. They want your gold. Kill them and you earn <b class="m">malice</b>, the currency you build with. If the hoard reaches zero, the dungeon falls.</p>
        <p><b>The guild learns.</b> Anyone who escapes, or dies carrying a Sending Stone, reports what they saw. Press <kbd>G</kbd> for the Guild’s map. Known traps get avoided or disarmed, so move them. What nobody survives to report stays secret.</p>
        <p><b>Ranks.</b> Everything has a rank from F to SSS (and EX for the Demon Lord), each about 1.5× the one below. In this run they open on: ${ranks}.</p>
        <p><b>Levels.</b> The Level tool raises a placed piece up to Lv${RD.MAX_LEVEL}: +15% damage and health, longer holds and faster rearming per level.</p>
        <p><b>Kinds of piece.</b> Traps fire when stepped on (hidden ones until spotted). Wall pieces shoot down corridors. Monsters guard a post and chase runners. Hordes release a pack. Rooms boost what stands near them. One boss per floor; a Boss Seal locks heroes on that floor until the boss dies.</p>
        <p><b>Powers.</b> During a raid, spend malice on the bar at the bottom. Aimed powers: click the power, then a tile (on touch, tap twice).</p>
        <p><b>Heroes.</b> Click any hero in the Ledger or the dispatch card for their stats, abilities and traits.</p></div>`;
    }
    if (tab === 'powers') return `<ul class="gentries">${Object.entries(RD.POWERS).map(([k, p]) => entry('power:' + k, esc(p.name), `${RD.powerOpen(G, k) ? 'Open' : 'Opens night ' + RD.realNight(G, p.night)} · <span class="m">${RD.powerCost(G, k)}</span> malice · recovers in ${p.cd}s${p.target ? ' · aimed' : ''}`, `<p>${esc(p.desc)}</p>`)).join('')}</ul>`;
    const g = RD.GROUPS.find((x) => x.id === tab);
    if (g) {
      const top = RD.unlocked(G);
      const keys = Object.keys(RD.ITEMS).filter((k) => RD.inGroup(g, k)).sort((a, b) => RD.ITEMS[a].tier - RD.ITEMS[b].tier || RD.ITEMS[a].cost - RD.ITEMS[b].cost);
      return `<ul class="gentries">${keys.map((k) => {
        const d = RD.ITEMS[k];
        const tags = d.tags && d.tags.length ? ` · ${d.tags.join(', ')}` : '';
        return entry('item:' + k, `${tierTag(d.tier)} ${esc(d.name)}`, `${d.tier <= top ? 'Open' : 'Opens night ' + RD.realNight(G, RD.TIER_UNLOCK[d.tier])} · <span class="m">${RD.costOf(G, k)}</span> malice${tags}`, `<p>${esc(d.desc)}</p>${statTable(k, 1, false)}`, `item:${k}`);
      }).join('')}</ul>`;
    }
    if (tab === 'ghosts') {
      const live = (G.ghosts || []).filter((gh) => !gh.gone);
      return `<p class="note">A legend who dies in your dungeon may come back as a ghost in the room where they fell (the Chosen Hero always does). There can be ${RD.GHOST_MAX} at once; each fades ${RD.GHOST_NIGHTS} nights after its death, and a cleric, paladin, saint or sage who stands beside one for 3 seconds lays it to rest. Vengeful ones are laid to rest when killed.</p>
        <ul class="gentries">${Object.values(RD.GHOSTS).map((k) => entry('', esc(k.name), '', `<p>${esc(k.desc)}</p>`)).join('')}</ul>
        <h3>In your dungeon now</h3>${live.length ? `<ul class="gentries">${live.map((gh) => entry('hero:' + gh.cls, `Ghost of ${esc(gh.name)} <em>${esc(gh.title)}</em>`, `${RD.GHOSTS[gh.kind].name} · ${RD.coord(gh.tile)} · fades after night ${gh.fade}`, '')).join('')}</ul>` : '<p class="note">None yet.</p>'}`;
    }
    if (tab === 'combos') {
      const got = meta().combos;
      const n = Object.keys(RD.COMBOS).filter((k) => got[k]).length;
      return `<p class="note">One thing catches a hero, the next hits harder. When it happens you will see the combo’s name over the hero. Discovered ${n} of ${Object.keys(RD.COMBOS).length}; the rest show only a hint until you pull them off.</p><ul class="gentries">${Object.entries(RD.COMBOS).map(([k, c]) => got[k]
        ? entry('', `${esc(c.name)} <em>×${c.mult}</em>`, 'Discovered', `<p>${esc(c.desc)}</p><p class="note">${esc(c.hint)}</p>`)
        : entry('', '??? <em>undiscovered</em>', '', `<p class="note">Hint: ${esc(c.hint)}</p>`)).join('')}</ul>`;
    }
    if (tab === 'summons') {
      const parents = Object.keys(RD.ITEMS).filter((k) => RD.minionOf(k)).sort((a, b) => RD.ITEMS[a].tier - RD.ITEMS[b].tier);
      return `<p class="note">Bosses call help during a raid and hordes release a pack. They fight at their parent’s level, and summons at one rank below their boss, so a Demon Lord’s imps are SSS-rank. These are their numbers at Lv1 next to the piece that brings them.</p><ul class="gentries">${parents.map((k) => {
        const d = RD.ITEMS[k], mn = RD.minionOf(k), u = RD.ITEMS[mn.type];
        const how = mn.kind === 'summon' ? `called by the ${d.name} every ${mn.every}s, up to ${mn.max}` : `${mn.count} released by the ${d.name}`;
        return entry('item:' + mn.type, `${tierTag(mn.tier)} ${esc(u.name)}`, `${how} · fights at ${RD.TIERS[mn.tier]} rank`, `<p>${esc(u.desc)}</p>${rowsTable(RD.pieceStats(mn.type, 1, mn.tier))}`, `item:${mn.type}:${mn.tier}`);
      }).join('')}</ul>`;
    }
    if (tab === 'heroes') {
      const ks = Object.keys(RD.CLASSES).sort((a, b) => !!RD.CLASSES[a].unique - !!RD.CLASSES[b].unique || (RD.CLASSES[a].minTier || 0) - (RD.CLASSES[b].minTier || 0));
      return `<ul class="gentries">${ks.map((k) => {
        const C = RD.CLASSES[k];
        return entry('hero:' + k, `${esc(C.name)}${C.unique ? ' <em>legend</em>' : ''}`, `From ${RD.TIERS[C.minTier || 0]} rank · ${C.hp} health, ${C.dmg} damage every ${C.rate}s at F rank · ${C.range > 1.5 ? 'ranged' : 'melee'} · runs at ${pct(C.fleeAt)}`, `<p>${esc(C.desc.replace(/^Unique\.\s*/, ''))}</p><ul class="abil">${abilities(k).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`, `hero:${k}`);
      }).join('')}</ul>`;
    }
    if (tab === 'traits') return `<ul class="gentries">${Object.values(RD.TRAITS).map((t) => entry('', `<span class="ti">${t.icon}</span> ${esc(t.name)}`, '', `<p>${esc(t.desc)}</p>`)).join('')}</ul>`;
    if (tab === 'floors') return `<ul class="gentries">${Object.values(RD.THEMES).map((t) => entry('', esc(t.name), t.tag ? `Boosts ${t.tag} pieces: ${RD.TAGS[t.tag].map((k) => RD.ITEMS[k] ? RD.ITEMS[k].name : k).join(', ')}` : '', `<p>${esc(t.desc)}</p>`)).join('')}</ul><p class="note">Floors II–V open on nights ${[1, 2, 3, 4].map((f) => RD.floorNight(G, f)).join(', ')}. In endless and Saga runs you can keep digging: floor VI on night ${RD.floorNight(G, 5)}, VII on ${RD.floorNight(G, 6)}, and so on down to X.</p>`;
    if (tab === 'omens') return `<h3>Omens · one each night</h3><ul class="gentries">${RD.OMENS.map((o) => entry('', esc(o.name), '', `<p>${esc(o.text)}</p>`)).join('')}</ul><h3>Twists · chosen at the start, +15% score each</h3><ul class="gentries">${Object.values(RD.TWISTS).map((t) => entry('', esc(t.name), '', `<p>${esc(t.desc)}</p>`)).join('')}</ul>`;
    return '';
  }
  function showGuide(tab, back) {
    tab = tab || ui.guideTab || 'learn';
    ui.guideTab = tab;
    openModal(`
      <p class="eyebrow">Guide</p>
      <h2 id="sheet-title">${esc(GUIDE_TABS.find((t) => t[0] === tab)[1])}</h2>
      <div class="seg tabs guide-tabs" role="tablist">${GUIDE_TABS.map(([k, n]) => `<button type="button" role="tab" data-k="${k}" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}">${esc(n)}</button>`).join('')}</div>
      <div class="guide-body">${guideBody(tab)}</div>
      <div class="seedrow"><button type="button" class="go" id="guide-close" data-focus>${back ? 'Back' : 'Close'}</button></div>`, (sh) => {
      for (const b of sh.querySelectorAll('.guide-tabs button')) b.onclick = () => showGuide(b.dataset.k, back);
      icons(sh);
      for (const cv of sh.querySelectorAll('canvas[data-lesson]')) RD.playHowto(cv, RD.HOWTO.find((l) => l.id === cv.dataset.lesson));
      for (const b of sh.querySelectorAll('[data-show]')) b.onclick = () => pointAt(b.dataset.show);
      const again = () => showGuide(tab, back);
      for (const li of sh.querySelectorAll('.gentry[data-open]')) {
        const [kind, k, t] = li.dataset.open.split(':');
        const go = () => (kind === 'hero' ? showHero(sampleHero(k), again) : showPiece(k, { tier: t != null ? +t : undefined, back: again }));
        li.onclick = go;
        li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
      }
      const on = sh.querySelector('.guide-tabs .on');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
      sh.querySelector('#guide-close').onclick = () => (back ? back() : closeModal());
    });
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
      <ul class="slots" aria-label="Save slots">${Array.from({ length: SLOTS }, (_, k) => {
        const info = slotInfo(k), sel = k === ui.slot, playing = sel && live;
        return `<li class="slot${sel ? ' on' : ''}${info ? '' : ' empty'}" data-slot="${k}">
          <div><b>Slot ${k + 1}${playing ? ' · playing' : sel ? ' · selected' : ''}</b><span>${info ? `${esc(info.text)}${info.at ? ` · ${ago(info.at)}` : ''}` : 'Empty: a new dungeon can go here'}</span></div>
          <span class="acts">${info
            ? `<button type="button" class="go small" data-continue="${k}" ${playing && !chal ? 'id="resume" data-focus' : ''}>${playing ? 'Resume' : 'Continue'}</button><button type="button" class="ghost small" data-del="${k}">Delete</button>`
            : sel ? '' : `<button type="button" class="ghost small" data-pick="${k}">Use this slot</button>`}</span>
        </li>`;
      }).join('')}</ul>
      <h2 id="sheet-title">The Reverse Dungeon</h2>
      <p class="lede">You are the dungeon. Build traps and monsters, then watch heroes try to steal your gold. Survivors tell the guild what they saw, so kill them before they get out.</p>
      <form id="seedform">
        <div class="playrow">
          <button type="submit" class="${live || chal ? 'ghost' : 'go big'}" ${live || chal ? '' : 'data-focus'}>${slotInfo(ui.slot) ? 'New dungeon' : 'Play'}</button>
          <button type="button" class="ghost daily-btn" id="daily" title="${esc(dTw.map((k) => RD.TWISTS[k].name + ': ' + RD.TWISTS[k].desc).join('  '))}">Daily: ${esc(dTw.map((k) => RD.TWISTS[k].name).join(' + '))}${dailyBest ? ` · best ${dailyBest}` : ''}</button>
          <button type="button" class="ghost" id="heart-btn">Dungeon Heart · ${m.souls} souls</button>
          <button type="button" class="ghost" id="howto-intro">How to play</button>
          <button type="button" class="ghost" id="guide-intro">Guide</button>
          <button type="button" class="ghost" id="trophies">Trophies ${got}/${Object.keys(RD.TROPHIES).length}</button>
        </div>
        <p class="note" id="summary">${esc(summary())}${slotNote()}</p>
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
      // save slots: pick one for the next new dungeon, continue one, or delete one (asks twice)
      for (const li of s.querySelectorAll('.slot')) li.onclick = (e) => { if (e.target.closest('button')) return; pickSlot(+li.dataset.slot); showIntro(); };
      for (const b of s.querySelectorAll('[data-pick]')) b.onclick = () => { pickSlot(+b.dataset.pick); showIntro(); };
      for (const b of s.querySelectorAll('[data-continue]')) b.onclick = () => {
        const k = +b.dataset.continue;
        if (k === ui.slot && live) return closeModal();
        let g2 = null;
        try { g2 = RD.loadGame(store.get(slotKey(k), null)); } catch (e) { g2 = null; }
        if (!g2) { toast('That save could not be read.'); store.del(slotKey(k)); return showIntro(); }
        pickSlot(k);
        newGame(null, g2, g2.diff);
        closeModal();
        toast(`Slot ${k + 1}: ${RD.modeOf(G).name} · night ${G.raid}.`, true);
      };
      for (const b of s.querySelectorAll('[data-del]')) b.onclick = () => {
        if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Really delete?'; return; }
        const k = +b.dataset.del;
        store.del(slotKey(k));
        toast(`Slot ${k + 1} deleted.`, true);
        showIntro();
      };
      const refresh = () => {
        for (const l of s.querySelectorAll('.diff')) l.classList.toggle('on', l.querySelector('input').checked);
        s.querySelector('#summary').textContent = summary() + slotNote();
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
      s.querySelector('#guide-intro').onclick = () => showGuide(null, showIntro);
      s.querySelector('#howto-intro').onclick = () => showGuide('learn', showIntro);
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

  function begin(seedV, mode, diff, tw) {
    newGame(seedV, null, diff, mode, ui.pact, tw);
    if (mode === 'daily') G.daily = today();
    const gift = claimGift();
    save();
    closeModal();
    if (store.get('tut', null) !== 'done') tutorial('start');
    else announce();
    if (gift) setTimeout(() => toast(`Day ${meta().streak} streak: +${gift} souls for the Dungeon Heart.`, true), 3300);
  }

  const slotNote = () => (slotInfo(ui.slot) ? ` · replaces the dungeon in slot ${ui.slot + 1}` : ` · goes in slot ${ui.slot + 1}`);

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
    const grade = RD.nightGrade(d);
    const gc = RD.TIER_COLOR[RD.TIERS.indexOf(grade)] || 'var(--ash)';
    openModal(`
      <div class="stamp" style="--sc:${gc}" aria-label="Night grade ${grade}">${grade}<small>Night grade</small></div>
      <p class="eyebrow">${eyebrow}</p>
      <h2 id="sheet-title">${title}</h2>
      <p class="lede">${lede}</p>
      ${scoreLine}
      <dl class="tally">
        <div><dt>Slain</dt><dd style="color:var(--malice-hi)">${d.killed.length}</dd></div>
        <div><dt>Escaped</dt><dd style="color:var(--steel)">${d.escaped.length}</dd></div>
        <div><dt>Gold lost</dt><dd style="color:var(--gold)">${d.goldLost}</dd></div>
        <div><dt>Malice earned</dt><dd style="color:var(--malice-hi)">${d.malice + d.income}</dd></div>
        ${over ? '' : `<div><dt>Next rating</dt><dd style="color:${RD.TIER_COLOR[Math.max(0, Math.min(RD.MAX_TIER, Math.round(a.threat)))]}">${RD.rating(a.threat)}</dd></div>`}
      </dl>
      <div class="cols">
        <div><h3>Slain</h3><ul class="names">${names(d.killed, 'k')}</ul></div>
        <div><h3>Escaped</h3><ul class="names">${names(d.escaped, 'e', (h) => (h.carry ? ` · ${h.carry} gold` : '') + (h.growth ? ` · <span class="growth">${esc(h.growth)}</span>` : ''))}</ul></div>
      </div>
      ${reportHtml(d)}
      ${d.fallen && d.fallen.length ? `<p class="note warn fallen">Fallen for good (Mortal Monsters): ${d.fallen.map((x) => `${esc(RD.ITEMS[x.type].name)} Lv${x.lv} ${RD.coord(x.tile)}`).join(', ')}.</p>` : ''}
      ${d.risen && d.risen.length ? `<h3>Something stays behind</h3><ul class="tips ghosts">${d.risen.map((gh) => `<li>The ghost of <b>${esc(gh.name)} ${esc(gh.title)}</b> haunts ${RD.coord(gh.tile)}: <b>${esc(RD.GHOSTS[gh.kind].name)}</b>. ${esc(RD.GHOSTS[gh.kind].desc)} It fades after ${RD.GHOST_NIGHTS} nights, or sooner if a cleric, paladin, saint or sage stands by it.</li>`).join('')}</ul>` : ''}
      ${rum ? `<h3>What the guild heard</h3><ul class="rumors">${rum}</ul>` : ''}
      <div class="seedrow">
        ${revive ? '<button type="button" class="go plain pair" id="again" data-focus>Accept defeat</button><button type="button" class="go rewarded pair" id="revive">🎬 Second chance: refill the hoard</button>' : over ? `<button type="button" class="go" id="again" data-focus>Wake a new dungeon</button>${G.result === 'won' ? '<button type="button" class="ghost" id="endless">Keep going (endless)</button>' : ''}` : `<button type="button" class="go" id="next" data-focus>Prepare the next night</button>`}
        <button type="button" class="ghost" id="log-btn">Full raid log</button>
        <button type="button" class="ghost" id="share-card">Share report</button>
        ${over ? '<button type="button" class="ghost" id="challenge">Challenge a friend</button>' : ''}
      </div>`, (s) => {
      const ch = s.querySelector('#challenge');
      if (ch) ch.onclick = () => shareChallenge(RD.score(G));
      s.querySelector('#share-card').onclick = () => shareReport(d, grade);
      icons(s);
      setTimeout(() => sfx('crush'), 420);
      countUp(s);
      const go = (ad) => {
        const idle = (d.report && d.report.idle) || [];
        const next = () => {
          RD.nextNight(G); save(); RD.FX.floaters.length = RD.FX.parts.length = RD.FX.bubbles.length = 0; closeModal(); renderAll(); announce();
          const still = idle.filter((t) => G.items.has(t));
          if (still.length && !ui.tut) {
            RD.view.marks = still;
            clearTimeout(ui.markTimer);
            ui.markTimer = setTimeout(() => { if (!ui.tut && !ui.forecast) RD.view.marks = []; }, 10000);
            setTimeout(() => toast(`Gold rings: ${still.length} piece${still.length > 1 ? 's' : ''} that never touched a hero last night. Move them onto the route.`, true, 6000), 3400);
          }
        };
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
      if (ag) ag.onclick = () => { if (G.phase === 'over') { saveRecord(); store.del(slotKey()); if (!G.runRecord) G.runRecord = recordRun(); } showIntro(); };
      const en = s.querySelector('#endless');
      if (en) en.onclick = () => { G.endless = true; G.runRecord = null; G.phase = 'debrief'; RD.nextNight(G); save(); closeModal(); renderAll(); announce(); };
      s.querySelector('#log-btn').onclick = () => showReports(0, true);
    });
  }

  // A picture of the night to post anywhere: grade, tally, the fallen, and a link to the same dungeon.
  function reportCard(d, grade) {
    const W = 1200, H = 630, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const P2 = RD.PAL;
    c.fillStyle = P2.void; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W * 0.75, H * 0.2, 40, W * 0.75, H * 0.2, 700);
    g.addColorStop(0, 'rgba(196,60,104,0.28)'); g.addColorStop(1, 'rgba(196,60,104,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = P2.malice; c.lineWidth = 6; c.strokeRect(18, 18, W - 36, H - 36);
    c.strokeStyle = 'rgba(87,73,95,0.8)'; c.lineWidth = 2; c.strokeRect(30, 30, W - 60, H - 60);
    c.textBaseline = 'alphabetic';
    c.fillStyle = P2.gold; c.font = "64px 'Jacquard 24', Georgia, serif";
    c.fillText('The Reverse Dungeon', 64, 118);
    c.fillStyle = P2.ash; c.font = "26px 'DM Mono', monospace";
    const sub = `Night ${d.raid} · ${RD.modeOf(G).name} · ${RD.DIFF[G.diff].name} · seed ${G.seed}`;
    c.fillText(sub, 66, 160);
    // the stamp
    const gc = RD.TIER_COLOR[RD.TIERS.indexOf(grade)] || P2.ash;
    c.save(); c.translate(W - 190, 150); c.rotate(-0.25);
    c.strokeStyle = gc; c.lineWidth = 8; c.beginPath(); c.arc(0, 0, 92, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 78, 0, Math.PI * 2); c.stroke();
    c.fillStyle = gc; c.font = "120px 'Jacquard 24', Georgia, serif"; c.textAlign = 'center'; c.fillText(grade, 0, 40);
    c.restore();
    // the tally
    const stats = [['Slain', d.killed.length, P2.maliceHi], ['Escaped', d.escaped.length, P2.steel], ['Gold lost', d.goldLost, P2.gold], ['Hoard', G.gold, P2.gold]];
    stats.forEach(([k, v, col], i) => {
      const x = 66 + i * 230;
      c.fillStyle = P2.ash; c.font = "22px 'DM Mono', monospace"; c.textAlign = 'left'; c.fillText(k.toUpperCase(), x, 250);
      c.fillStyle = col; c.font = "700 64px 'Alegreya Sans', sans-serif"; c.fillText(String(v), x, 316);
    });
    // the fallen
    c.fillStyle = P2.bone; c.font = "700 28px 'Alegreya Sans', sans-serif";
    c.fillText(d.killed.length ? 'The fallen' : 'Nobody fell tonight', 66, 384);
    const icon = document.createElement('canvas');
    d.killed.slice(0, 6).forEach((h, i) => {
      const x = 66 + (i % 2) * 520, y = 410 + Math.floor(i / 2) * 58;
      RD.heroIcon(icon, h, 44);
      c.drawImage(icon, x, y, 44, 44);
      c.fillStyle = RD.TIER_COLOR[h.tier]; c.font = "22px 'DM Mono', monospace"; c.fillText(RD.TIERS[h.tier], x + 56, y + 30);
      c.fillStyle = h.title ? P2.gold : P2.bone; c.font = "26px 'Alegreya Sans', sans-serif";
      const name = `${h.name}${h.title ? ' ' + h.title : ''} · ${RD.CLASSES[h.cls].name}`;
      c.fillText(name.length > 34 ? name.slice(0, 33) + '…' : name, x + 96, y + 31);
    });
    if (d.killed.length > 6) { c.fillStyle = P2.ash; c.font = "22px 'Alegreya Sans', sans-serif"; c.fillText(`and ${d.killed.length - 6} more`, 66, 594); }
    c.fillStyle = P2.maliceHi; c.font = "24px 'Alegreya Sans', sans-serif"; c.textAlign = 'right';
    c.fillText('Can your dungeon do better?', W - 64, H - 50);
    return cv;
  }
  function shareReport(d, grade) {
    const cv = reportCard(d, grade);
    const link = P.inviteLink({ seed: G.seed, mode: G.mode, diff: G.diff, twists: (G.twists || []).join('.'), score: 0 });
    const text = `Night ${d.raid} in The Reverse Dungeon: grade ${grade}, ${d.killed.length} slain, ${d.escaped.length} escaped. Try the same dungeon:`;
    cv.toBlob(async (blob) => {
      if (!blob) return toast('Could not draw the report.');
      const file = new File([blob], `reverse-dungeon-night-${d.raid}.png`, { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, url: link }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      try { await navigator.clipboard.writeText(`${text} ${link}`); toast('Report saved as an image. The caption and link are on your clipboard.', true); }
      catch (e) { toast('Report saved as an image.', true); }
    }, 'image/png');
  }

  // Why the night went the way it did: each piece's damage and kills, idle pieces, combos, and up to three fixes.
  function reportHtml(d) {
    const r = d.report;
    if (!r) return '';
    const max = Math.max(1, ...r.pieces.map((p) => p.dmg));
    const icon = (p) => (p.type ? (p.type.startsWith('power:') ? p.type : 'item:' + p.type) : '');
    const idleNames = r.idle.map((t) => G.items.get(t)).filter(Boolean).map((it) => `${RD.ITEMS[it.type].name} ${RD.coord(it.tile)}`);
    const combos = Object.entries(r.combos);
    return `<h3>${d.escaped.length ? 'Why they survived' : 'Who did the killing'}</h3>
      ${r.pieces.length ? `<ul class="dmg">${r.pieces.map((p) => `<li><span class="gi" data-icon="${icon(p)}"></span><span class="nm">${esc(p.name)}${p.tile != null ? ` <small>${RD.coord(p.tile)}</small>` : ''}</span><span class="bar"><i style="width:${(100 * p.dmg) / max}%"></i></span><span class="v">${p.dmg}${p.kills ? ` · ${p.kills} kill${p.kills > 1 ? 's' : ''}` : ''}</span></li>`).join('')}</ul>` : '<p class="note">Nothing you built touched a hero tonight.</p>'}
      ${combos.length ? `<p class="note combo-line">Combos: ${combos.map(([k, v]) => `<b>${esc(RD.COMBOS[k].name)}</b> ×${v}`).join(', ')}</p>` : ''}
      ${r.healed ? `<p class="note">Healers mended ${r.healed} health.${r.disarmed ? ` Rogues disarmed ${r.disarmed} trap${r.disarmed > 1 ? 's' : ''}.` : ''}</p>` : r.disarmed ? `<p class="note">Rogues disarmed ${r.disarmed} trap${r.disarmed > 1 ? 's' : ''}.</p>` : ''}
      ${idleNames.length ? `<p class="note">Idle: ${idleNames.map(esc).join(', ')}.</p>` : ''}
      ${r.tips.length ? `<ul class="tips">${r.tips.map((t) => `<li>${esc(t.text)}</li>`).join('')}</ul>` : ''}`;
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
    const first = ui.tut && store.get('tut', null) !== 'done';
    ui.tut = 0;
    coach(null);
    store.set('tut', 'done');
    if (first) setTimeout(() => toast('Guide → How to play shows every feature with a short animation.', true), 1200);
  }
  function tutorial(ev, d) {
    if (ev === 'start') {
      ui.tut = 1;
      selectTool('spikes');
      const r = routeTiles();
      const spot = r.slice(Math.floor(r.length * 0.3)).find((t) => !RD.check(G, 'spikes', t));
      coach('You are the dungeon. Heroes come in at the bright <b>gate</b> to steal your <b>gold</b>. Tap the glowing tile to put a Spike Pit in their way.', [G.entrance, G.hoard, spot].filter((t) => t != null));
      setTimeout(() => centerOn(spot), 60);
      return;
    }
    if (!ui.tut) return;
    if (ev === 'placed' && ui.tut === 1 && d.kind === 'trap') {
      ui.tut = 2;
      selectTool('skeleton');
      const r = routeTiles();
      const spot = r.slice().reverse().slice(1, 6).find((t) => !RD.check(G, 'skeleton', t));
      coach('Now a <b>Skeleton</b> to guard the gold. Tap the glowing tile.', [spot, G.hoard].filter((t) => t != null));
      centerOn(spot, true);
    } else if (ev === 'placed' && ui.tut === 2 && d.kind === 'monster') {
      ui.tut = 3;
      coach('Ready. Press <b>Open the gate</b>. Kill them all and the guild learns nothing.', []);
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
  // Three save slots, one dungeon each. ui.slot is the one being played; the old single save becomes slot 1.
  const SLOTS = 3;
  const slotKey = (k) => 'save.' + (k == null ? ui.slot : k);
  function writeSave(G2, pending) { store.set(slotKey(), { ...RD.saveGame(G2, pending), savedAt: Date.now() }); }
  const hasSave = () => store.get(slotKey(), null) != null;
  function save() { if (G && G.phase === 'build') writeSave(G); }
  function pickSlot(k) { ui.slot = k; store.set('slot', k); }
  // what a slot holds, for the menu, without loading it into play
  function slotInfo(k) {
    const o = store.get(slotKey(k), null);
    if (!o || !o.seed) return null;
    const mode = RD.MODES[o.mode] || RD.MODES.campaign, diff = RD.DIFF[o.diff] || RD.DIFF.normal;
    const night = o.raid + (o.pending ? 1 : 0);
    return { night, gold: o.gold, floors: o.floors || 1, endless: !!o.endless, text: `${mode.name} · ${diff.name} · night ${night}${o.endless ? ' (endless)' : ` of ${mode.win || diff.win}`} · ${o.gold} gold · ${o.floors || 1} floor${(o.floors || 1) > 1 ? 's' : ''}`, at: o.savedAt };
  }
  const ago = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

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
    hideDispatch();
    ui.undo = [];
    setSpeed(1);
    RD.view.floor = 0;
    RD.fxFloor(0);
    RD.view.dirty = true;
    RD.FX.floaters.length = RD.FX.parts.length = RD.FX.bubbles.length = 0;
    fit();
    renderAll();
    setTimeout(() => { if (!ui.tut) centerOn(G.hoard); }, 50); // small screens open on the gold
  }

  // the map fills whatever room the board area has, times the zoom
  const ZOOMS = [1, 1.5, 2, 2.75];
  // Phones: tiles are made big enough for a finger (TAP_T px) by starting zoomed in, and the board scrolls.
  // Using the zoom buttons or a pinch hands the zoom back to the player.
  const TAP_T = 28;
  function fit() {
    const wrap = $('board-wrap');
    const W = Math.max(160, wrap.clientWidth - 10), H = Math.max(100, wrap.clientHeight - 10);
    if (ui.autoZoom !== false) {
      const base = Math.min((W - 14) / RD.COLS, (H - 14) / RD.ROWS);
      let k = 0;
      while (k < ZOOMS.length - 1 && base * ZOOMS[k] < TAP_T) k++;
      ui.zoom = k;
    }
    const z = ZOOMS[ui.zoom || 0];
    RD.resize(W * z, H * z);
    // the map scrolls whenever it is bigger than its box, zoomed or not
    wrap.classList.toggle('zoomed', z > 1 || RD.view.w > W + 10 || RD.view.h > H + 10);
    $('zoom-out').disabled = !ui.zoom;
    $('zoom-in').disabled = ui.zoom >= ZOOMS.length - 1;
  }
  // bring a tile to the middle of the board (when the map is bigger than the board)
  function centerOn(tile, smooth) {
    if (tile == null || tile < 0 || !$('board-wrap').classList.contains('zoomed')) return;
    if (RD.fl(tile) !== RD.view.floor) setFloor(RD.fl(tile));
    const sc = $('board-scroll'), T = RD.view.T, M = RD.view.M, [x, y] = RD.xy(tile);
    const k = sc.scrollWidth / RD.view.w;
    sc.scrollTo({ left: (M + x * T + T / 2) * k - sc.clientWidth / 2, top: (M + y * T + T / 2) * k - sc.clientHeight / 2, behavior: smooth ? 'smooth' : 'auto' });
  }
  // zoom in or out, keeping the same point of the map under the middle of the board
  function setZoom(z, fx, fy) {
    ui.autoZoom = false;
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
    if (!$('board-wrap').classList.contains('zoomed') || !G.R || !ui.follow) return;
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
    $('guide-btn').onclick = () => showGuide();
    const cv = $('board');
    RD.initRender(cv);
    cv.addEventListener('pointermove', (e) => {
      const i = canvasTile(e);
      if (i !== RD.view.hover) { RD.view.hover = i; preview(i); }
    });
    cv.addEventListener('pointerleave', () => {
      RD.view.hover = -1;
      ui.previewError = null;
      ui.trouble = null;
      if (ui.hoverIt) { ui.hoverIt = null; renderDetail(); }
      if (G && G.phase === 'build') $('hint').textContent = 'Pick a blueprint, then click the map.';
    });
    // touch or mouse: decided by whatever pressed last, anywhere on the page
    document.addEventListener('pointerdown', (e) => { ui.touch = e.pointerType !== 'mouse'; }, { capture: true, passive: true });
    // touch: the first tap shows what would happen (details, range, outline), the second tap does it
    cv.addEventListener('click', (e) => {
      const i = canvasTile(e);
      // building asks for a second tap; a raid power fires on the first (choosing the power was the first tap,
      // and heroes move between taps)
      const aiming = G.phase === 'build' && ui.tool !== 'inspect';
      if (ui.touch && aiming && i >= 0 && ui.armed !== i) {
        ui.armed = i;
        RD.view.hover = i;
        ui.hoverIt = null;
        preview(i);
        if (G.phase === 'raid') toast(`Tap again to use ${RD.POWERS[ui.power].name} here.`, true);
        else toast(ui.previewError ? ui.previewError : `Tap again to ${tapVerb(i)}.`, !ui.previewError);
        return;
      }
      ui.armed = -1;
      RD.view.hover = i;
      if (!$('dispatch').hidden) hideDispatch();
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
    $('dispatch-close').onclick = hideDispatch;
    $('scry').onclick = scry;
    $('undo').onclick = undo;
    $('layouts').onclick = showLayouts;
    $('forecast-close').onclick = () => { $('forecast').hidden = true; ui.showHeat = false; if (!ui.tut) RD.view.marks = []; };
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
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); return; }
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
      if (G.phase === 'raid' && ui.speed > 0 && !isOpen() && ui.stopT > 0) ui.stopT -= dt; // hit-stop: hold the frame
      else if (G.phase === 'raid' && ui.speed > 0 && !isOpen()) {
        const slow = ui.slowT > 0 ? 0.25 : 1;
        if (ui.slowT > 0) ui.slowT -= dt;
        let t = dt * ui.speed * slow;
        while (t > 1e-6 && G.phase === 'raid') { const s = Math.min(t, 1 / 60); RD.step(G, s); t -= s; }
        RD.fxUpdate(dt * ui.speed * slow);
      } else if (ui.slowT > 0) { ui.slowT -= dt; RD.fxUpdate(dt * 0.25); } // the last kill plays out after the raid has ended
      else RD.fxUpdate(dt);
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
    // one-time move of the old single save into slot 1
    const old = store.get('save', null);
    if (old && !store.get('save.0', null)) { store.set('save.0', { ...old, savedAt: Date.now() }); store.del('save'); }
    ui.slot = Math.max(0, Math.min(SLOTS - 1, store.get('slot', 0) | 0));
    try { loaded = RD.loadGame(store.get(slotKey(), null)); } catch (e) { loaded = null; }
    if (!loaded) store.del(slotKey());
    else if (loaded.diff) ui.diff = loaded.diff;
    // someone who has never played goes straight into the guided first night; the menu is one button away
    const fresh = !loaded && !meta().runs && store.get('tut', null) !== 'done' && !ui.challenge && ![0, 1, 2].some((k) => slotInfo(k));
    if (fresh) begin((Math.random() * 1e6) | 0, ui.mode, ui.diff, []);
    else {
      newGame((Math.random() * 1e6) | 0, loaded, ui.diff);
      showIntro();
    }
    requestAnimationFrame(frame);
    // the cached map layer draws text, so redraw it once the bundled fonts are in
    const done = () => { RD.view.dirty = true; fit(); P.loadingStop(); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(done, done);
    else done();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
