// meta-ui.js — HTML overlay screens for the collection/economy layer, ported from
// the classic index.html: My Warriors, Warriors Market, Castle Upgrades, Armory.
// Renders into #screen / #sc-body in lane.html, driven entirely by meta.js.
import { Meta, warriorStats, warriorValue, rollGrade, gradeColor, sacXpFor, xpNeed,
         RARITIES, RARITY_CLASSES, RARITY_STARS, RARITY_FRAME, RARITY_VALUE, ELIXIR_COST, ULTS,
         baseMaxHp, baseUpCost, wellUpCost, wellRegenMs, startElixir, BASTION_MAX } from './meta.js';

const $ = id => document.getElementById(id);
const portrait = w => w.mythic ? `../assets/warriors/m${w.id}.png` : `../assets/warriors/w${w.id}.png`;

let current = null;         // active screen key
let enhanceTarget = null;   // iid being enhanced in My Warriors
let onToast = () => {};

const TITLES = {
  warriors: '🛡️ My Warriors', market: '🏺 Warriors Market',
  castle: '🏰 Castle Upgrades', armory: '⚒️ Armory',
};

export function initMetaUI(opts = {}) {
  onToast = opts.toast || (() => {});
  return { open, close, closeReveal };
}

function open(key) {
  current = key; enhanceTarget = null;
  $('menu').style.display = 'none';
  $('sc-title').textContent = TITLES[key] || '—';
  $('screen').classList.add('on');
  render();
}
function close() {
  $('screen').classList.remove('on');
  current = null; enhanceTarget = null;
  $('menu').style.display = 'flex';
  if (window.AWLANE && window.AWLANE.refreshMenu) window.AWLANE.refreshMenu();
}
function render() {
  $('sc-gold').textContent = '🪙 ' + Meta.gold.toLocaleString();
  const body = $('sc-body');
  if (current === 'warriors') body.innerHTML = renderWarriors();
  else if (current === 'market') body.innerHTML = renderMarket();
  else if (current === 'castle') body.innerHTML = renderCastle();
  else if (current === 'armory') body.innerHTML = renderArmory();
}

// ── My Warriors ─────────────────────────────────────────────────────────────
function starRow(w) {
  const ri = w.ri || 0;
  if (w.mythic) return '<div class="wc-stars" style="color:#ff2d95">◈ 1 OF 6</div>';
  const n = RARITY_STARS[ri] || 1, col = RARITY_FRAME[ri][0];
  let s = '';
  for (let i = 0; i < 5; i++) s += `<span style="color:${i < n ? col : '#39332a'}">★</span>`;
  return `<div class="wc-stars">${s}</div>`;
}
function renderWarriors() {
  const roster = [...Meta.roster].sort((a, b) => (b.ri || 0) - (a.ri || 0) || (b.lvl || 1) - (a.lvl || 1));
  const head = `<div class="sc-sub" style="margin-bottom:8px">Squad <b style="color:#8be06a">${Meta.team.length}/5</b> ·
    tap a card to field it · ⬆ Enhance to level up or fuse duplicates to ascend</div>`;
  const cards = roster.map(w => {
    const ri = w.ri || 0, lvl = w.lvl || 1, st = warriorStats(w);
    const need = xpNeed(lvl), pct = Math.min(100, Math.round((w.xp || 0) / need * 100));
    const inTeam = Meta.inTeam(w.iid);
    const isTgt = enhanceTarget === w.iid;
    // enhance button state
    let btn;
    if (isTgt) btn = `<button class="wc-btn" onclick="AWLANE.metaEnhance(${w.iid},event)">✕ Cancel</button>`;
    else if (enhanceTarget != null) {
      if (Meta.canAscend(enhanceTarget, w.iid))
        btn = `<button class="wc-btn asc" onclick="AWLANE.metaFeed(${w.iid},event)">★ Ascend</button>`;
      else
        btn = `<button class="wc-btn feed" onclick="AWLANE.metaFeed(${w.iid},event)">⚗ Feed +${sacXpFor(w).toLocaleString()}</button>`;
    } else btn = `<button class="wc-btn" onclick="AWLANE.metaEnhance(${w.iid},event)">⬆ Enhance</button>`;
    const ult = ULTS[w.ab];
    return `<div class="wcard ${inTeam ? 'sel' : ''} ${isTgt ? 'tgt' : ''}" onclick="AWLANE.metaTeam(${w.iid})">
      <div class="wc-badge ${RARITY_CLASSES[ri]}">${w.mythic ? '1 OF 1' : w.rarity}</div>
      ${inTeam ? '<div class="wc-team">FIELDED</div>' : ''}
      <img class="wc-img" src="${portrait(w)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="wc-name">${w.name}${(w.asc || 0) ? ` <span class="wc-star">${'✦'.repeat(w.asc)}</span>` : ''}</div>
      ${starRow(w)}
      <div class="wc-lv">Lv ${lvl} · ${(w.xp || 0).toLocaleString()}/${need.toLocaleString()} XP</div>
      <div class="xpbar"><i style="width:${pct}%"></i></div>
      <div class="wc-stats"><span>⚔${st.atk.toLocaleString()}</span><span>⚡${(1000 / st.spd).toFixed(1)}</span><span>🎯${st.range}</span></div>
      <div class="wc-ab" style="color:#7ec8ff">${ult ? `✨ ${ult.n}` : (w.abd || '')}</div>
      ${btn}
    </div>`;
  }).join('');
  return head + `<div class="wgrid">${cards}</div>`;
}

// team toggle from a card tap
export function metaTeam(iid) {
  if (enhanceTarget != null) return;  // ignore field-taps while choosing an enhance target
  if (!Meta.toggleTeam(iid) && !Meta.inTeam(iid)) { onToast('Squad is full (5/5)'); return; }
  render();
  if (window.AWLANE && window.AWLANE.syncSquad) window.AWLANE.syncSquad();
}
// start/cancel enhance targeting
export function metaEnhance(iid, ev) {
  if (ev) ev.stopPropagation();
  enhanceTarget = (enhanceTarget === iid) ? null : iid;
  render();
}
// feed / ascend the chosen sacrifice into the target
export function metaFeed(iid, ev) {
  if (ev) ev.stopPropagation();
  if (enhanceTarget == null) return;
  const res = Meta.enhance(enhanceTarget, iid);
  if (!res) return;
  if (res.err) { onToast(res.err); return; }
  if (res.ascend) onToast(`✦ ${res.name} ascended to ${res.star}★!`);
  else onToast(`⚗ +${res.xp.toLocaleString()} XP${res.levels ? ` · ${res.name} → Lv ${Meta.byIid(enhanceTarget).lvl}` : ''}`);
  enhanceTarget = null;
  render();
  if (window.AWLANE && window.AWLANE.syncSquad) window.AWLANE.syncSquad();
}

// ── Warriors Market ─────────────────────────────────────────────────────────
function renderMarket() {
  const canBuy = Meta.canRecruit();
  const recruitCard = `<div class="mk-card" onclick="AWLANE.metaRecruit()">
    <div class="mk-ic">🎲</div>
    <div class="mk-name">Recruit a Warrior</div>
    <div class="mk-desc">Every recruit is a brand-new Level 1 warrior with individually rolled stats and rarity.
      Hunt for Legendary rolls — then feed spares to your champions as XP.</div>
    <div class="mk-cost ${canBuy ? '' : 'off'}">🪙 ${Meta.recruitCost.toLocaleString()} Gold</div>
  </div>`;
  // sell list: spares not in the squad
  const spares = Meta.roster.filter(w => !Meta.inTeam(w.iid) && !w.mythic)
    .sort((a, b) => (a.ri || 0) - (b.ri || 0) || (a.lvl || 1) - (b.lvl || 1));
  const sellHead = `<div class="sc-sub" style="margin:14px 0 8px">💰 Sell spares for gold (squad members are protected)</div>`;
  const sellList = spares.length ? `<div class="wgrid">` + spares.map(w => {
    const price = Meta.sellPrice(w);
    return `<div class="wcard">
      <div class="wc-badge ${RARITY_CLASSES[w.ri || 0]}">${w.rarity}</div>
      <img class="wc-img" src="${portrait(w)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="wc-name">${w.name}</div>
      <div class="wc-lv">Lv ${w.lvl || 1}</div>
      <button class="wc-btn asc" onclick="AWLANE.metaSell(${w.iid},event)">💰 Sell · ${price.toLocaleString()}</button>
    </div>`;
  }).join('') + `</div>`
    : `<div class="sc-empty">No spare warriors to sell.<br>Every warrior you own is in your squad.</div>`;
  return recruitCard + sellHead + sellList;
}
export function metaRecruit() {
  if (!Meta.canRecruit()) { onToast(`Need 🪙 ${Meta.recruitCost.toLocaleString()} to recruit`); return; }
  const inst = Meta.recruit();
  if (!inst) return;
  showReveal(inst);
  render();
}
export function metaSell(iid, ev) {
  if (ev) ev.stopPropagation();
  const res = Meta.sell(iid);
  if (!res) return;
  if (res.err) { onToast(res.err); return; }
  onToast(`💰 Sold ${res.name} for ${res.gold.toLocaleString()} 🪙`);
  render();
}
function showReveal(w) {
  const ri = w.ri || 0, fr = RARITY_FRAME[ri];
  $('rv-card').style.borderColor = fr[0];
  $('rv-card').style.background = fr[1];
  $('rv-rar').textContent = w.rarity + (rollGrade(w) === 'S' || rollGrade(w) === 'A' ? ` · ${rollGrade(w)} ROLL` : '');
  $('rv-rar').style.color = fr[0];
  $('rv-img').src = portrait(w);
  $('rv-name').textContent = w.name;
  $('rv-stars').innerHTML = starRow(w).replace('wc-stars', '');
  $('reveal').classList.add('on');
}
function closeReveal() { $('reveal').classList.remove('on'); }

// ── Castle Upgrades ─────────────────────────────────────────────────────────
function renderCastle() {
  const baseMax = Meta.baseLvl >= BASTION_MAX, wellMax = Meta.wellLvl >= BASTION_MAX;
  const gate = `<div class="bs-card">
    <div class="bs-ic">🏰</div>
    <div class="bs-tx">
      <div class="bs-t">Golden Gate · Lv ${Meta.baseLvl}${baseMax ? ' · MAX' : ''}</div>
      <div class="bs-d">Your fortress survives ❤ ${baseMaxHp()} breaches</div>
      ${baseMax ? '' : `<div class="bs-next">Next: ❤ ${baseMaxHp() + 2} — the fortress grows stronger</div>`}
    </div>
    ${baseMax ? '<div class="bs-max">★ MAX</div>'
      : `<button class="bs-btn" onclick="AWLANE.metaUpBase()" ${Meta.gold < baseUpCost() ? 'disabled' : ''}>🪙 ${baseUpCost().toLocaleString()}</button>`}
  </div>`;
  const well = `<div class="bs-card">
    <div class="bs-ic">⛲</div>
    <div class="bs-tx">
      <div class="bs-t">Elixir Well · Lv ${Meta.wellLvl}${wellMax ? ' · MAX' : ''}</div>
      <div class="bs-d">💧 every ${(wellRegenMs() / 1000).toFixed(2)}s · start battles with ${startElixir()}💧</div>
      ${wellMax ? '' : `<div class="bs-next">Next: faster regen${Meta.wellLvl % 3 === 0 ? ' · +1 starting 💧' : ''}</div>`}
    </div>
    ${wellMax ? '<div class="bs-max">★ MAX</div>'
      : `<button class="bs-btn" onclick="AWLANE.metaUpWell()" ${Meta.gold < wellUpCost() ? 'disabled' : ''}>🪙 ${wellUpCost().toLocaleString()}</button>`}
  </div>`;
  return `<div class="sc-sub" style="margin-bottom:10px">Spend gold on permanent upgrades that carry into every battle.</div>`
    + gate + well;
}
export function metaUpBase() { if (Meta.upgradeBase()) { onToast('🏰 Golden Gate reinforced!'); render(); } }
export function metaUpWell() { if (Meta.upgradeWell()) { onToast('⛲ Elixir Well deepened!'); render(); } }

// ── Armory (equipment) ──────────────────────────────────────────────────────
function renderArmory() {
  return `<div class="sc-empty">⚒️ <b style="color:#d4a017">Armory</b><br><br>
    Equipment &amp; gear sets are the next system to come online.<br>
    Your roster, squad, market and castle are live now — gear up here soon.</div>`;
}

// expose the click handlers on window.AWLANE via lane-main
export const metaHandlers = { metaTeam, metaEnhance, metaFeed, metaRecruit, metaSell, metaUpBase, metaUpWell, closeReveal };
