// lane-main.js — bootstrap for the playable perspective lane + the collection/economy meta.
import LaneScene from './LaneScene.js';
import { Meta, wellRegenMs, startElixir } from './meta.js';
import { initMetaUI, metaHandlers } from './meta-ui.js';

const gameData = await fetch('./data/game-data.json').then(r => r.json());

// Probe for production art BEFORE Phaser boots (keeps the console clean).
const DEFAULT_SQUAD = [2, 15, 4, 10, 8];      // Robin, Joan, Merlin, Viking, Cleopatra
const probe = url => fetch(url, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
const art = { corridorTop: await probe('../assets/lane/corridor_top.png'),
              corridor: await probe('../assets/lane/corridor.png'),
              corridorFull: await probe('../assets/lane/corridor_full.png'), back: {} };
// probe back-view art for every warrior that could be fielded
const probeIds = [...new Set([...DEFAULT_SQUAD, ...gameData.warriors.map(w => w.id)])];
await Promise.all(probeIds.map(async id => { art.back[id] = await probe(`../assets/warriors/back/b${id}.png`); }));
gameData.art = art;

// ── the persistent player save (gold, roster, squad, castle) ──
Meta.init(gameData);
const metaUI = initMetaUI({ toast: txt => AWLANE.menuToast(txt) });

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: 375,
  height: 700,
  backgroundColor: '#0b0906',
  scale: { mode: Phaser.Scale.NONE },
  render: { antialias: true },
  scene: [LaneScene],
});

// The battle idles while 'running' is false — the MAIN MENU shows first.
game.registry.set('running', false);
pushMetaToRegistry();
game.scene.start('lane', { gameData });

// ── squad helpers ──
// Base warrior ids the battle should field, derived from the squad chosen in My Warriors.
function squadIds() {
  const ids = Meta.teamInstances().map(w => w.id);
  return ids.length ? ids.slice(0, 5) : DEFAULT_SQUAD;
}
// Feed the current save into the scene's registry (read at battle start).
function pushMetaToRegistry() {
  game.registry.set('squad', squadIds());
  game.registry.set('baseLvl', Meta.baseLvl);
  game.registry.set('wellRegenMs', wellRegenMs());
  game.registry.set('startElixir', startElixir());
}

// ── card tray (mirrors the fielded squad) ──
function buildCards() {
  const cards = document.getElementById('cards');
  cards.innerHTML = '';
  const defs = squadIds().map(id => gameData.warriors.find(x => x.id === id) || gameData.mythics.find(m => m.id === id));
  defs.forEach((w, i) => {
    if (!w) return;
    const pfx = w.id >= 100 ? 'm' : 'w';
    const el = document.createElement('div');
    el.className = 'card'; el.id = 'card-' + i;
    el.innerHTML = `<img src="../assets/warriors/${pfx}${w.id}.png" alt="${w.name}">
      <div class="lvl" id="clvl-${i}">SUMMON</div>
      <div class="cost">💧 <span id="cost-${i}">—</span></div>`;
    el.onclick = () => AWLANE.card(i);
    cards.appendChild(el);
  });
}
buildCards();

// Elixir pips
const bar = document.getElementById('elixbar');
for (let i = 0; i < 10; i++) bar.appendChild(document.createElement('div'));

// ── menu chrome (gold + gems + glory + hero lineup) ──
function refreshMenu() {
  const g = document.getElementById('mn-gold');
  if (g) g.textContent = '🪙 ' + Meta.gold.toLocaleString();
  const gm = document.getElementById('mn-gems');
  if (gm) gm.textContent = '💎 ' + Meta.gems.toLocaleString();
  const gp = Meta.gloryProgress();
  const pl = document.getElementById('mn-plvl');
  if (pl) pl.textContent = 'Glory Level ' + gp.lvl;
  const gb = document.getElementById('mn-gbar');
  if (gb) gb.style.width = Math.round(gp.cur / gp.need * 100) + '%';
  const mnArt = document.getElementById('mn-art');
  if (mnArt) {
    mnArt.innerHTML = '';
    squadIds().forEach(id => {
      const w = gameData.warriors.find(x => x.id === id) || gameData.mythics.find(m => m.id === id);
      const pfx = id >= 100 ? 'm' : 'w';
      const im = document.createElement('img');
      im.src = `../assets/warriors/${pfx}${id}.png`;
      if (w) im.alt = w.name;
      mnArt.appendChild(im);
    });
  }
}
refreshMenu();

let _toastT = null;
window.AWLANE = {
  scene: () => game.scene.getScene('lane'),
  renderer: () => (game.renderer.type === Phaser.WEBGL ? 'WEBGL' : 'CANVAS'),
  card(i) { this.scene().cardTap(i); },
  arm(key) { this.scene().armSpell(key); },

  // ── menu <-> battle flow ──
  play() {                                   // Enter Battle: fresh run, hide menu
    document.getElementById('endov').style.display = 'none';
    document.getElementById('menu').style.display = 'none';
    document.getElementById('screen').classList.remove('on');
    pushMetaToRegistry();                     // carry squad + castle upgrades into the run
    buildCards();
    game.scene.stop('lane');
    game.scene.start('lane', { gameData });
    game.registry.set('running', true);
    document.getElementById('pausebtn').textContent = '❚❚';
    document.getElementById('spdbtn').textContent = '1X';
  },
  menu() {                                   // back to the main menu
    document.getElementById('endov').style.display = 'none';
    game.registry.set('running', false);
    refreshMenu();
    document.getElementById('menu').style.display = 'flex';
  },

  // ── close the loop: bank spoils + paint the rewards screen ──
  onBattleEnd(result) {
    const rw = Meta.bankBattle(result);       // gold/gems/glory into the save
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('end-title2', result.victory ? '🏆 VICTORY!' : '💀 DEFEATED');
    set('end-msg', `${result.msg}  ·  Wave ${result.wave}  ·  ${result.kills} kills`);
    const gp = Meta.gloryProgress();
    const parts = [];
    parts.push(`<div class="rw-row">
      <div class="rw-chip">🪙 +${rw.gold.toLocaleString()}</div>
      ${rw.gems ? `<div class="rw-chip gem">💎 +${rw.gems.toLocaleString()}</div>` : ''}
      <div class="rw-chip glory">⭐ +${rw.glory}</div>
    </div>`);
    if (rw.firstWin) parts.push(`<div class="rw-first">✨ First Victory bonus · +${rw.firstBonus} 🪙</div>`);
    parts.push(`<div class="rw-glory">
      <div class="rw-lvl">Glory Level ${gp.lvl}${rw.leveledUp ? ' <span class="rw-lup">▲ LEVEL UP!</span>' : ''}</div>
      <div class="rw-gbar"><i style="width:${Math.round(gp.cur / gp.need * 100)}%"></i></div>
    </div>`);
    const box = document.getElementById('end-rewards');
    if (box) box.innerHTML = parts.join('');
    refreshMenu();
    document.getElementById('endov').style.display = 'flex';
  },

  // ── meta screens ──
  openScreen(key) { metaUI.open(key); },
  closeScreen() { metaUI.close(); },
  closeReveal() { metaHandlers.closeReveal(); },
  refreshMenu() { refreshMenu(); },
  syncSquad() { pushMetaToRegistry(); buildCards(); refreshMenu(); },
  // collection handlers (called from screen markup)
  metaTeam(iid) { metaHandlers.metaTeam(iid); },
  metaEnhance(iid, ev) { metaHandlers.metaEnhance(iid, ev); },
  metaFeed(iid, ev) { metaHandlers.metaFeed(iid, ev); },
  metaRecruit() { metaHandlers.metaRecruit(); },
  metaSell(iid, ev) { metaHandlers.metaSell(iid, ev); },
  metaUpBase() { metaHandlers.metaUpBase(); },
  metaUpWell() { metaHandlers.metaUpWell(); },

  menuToast(txt) {
    const t = document.getElementById('mn-toast');
    if (!t) return;
    t.textContent = txt; t.style.opacity = '1';
    clearTimeout(_toastT); _toastT = setTimeout(() => { t.style.opacity = '0'; }, 1700);
  },
  pause() {
    const paused = this.scene().togglePause();
    document.getElementById('pausebtn').textContent = paused ? '▶' : '❚❚';
  },
  speed() {
    const s = this.scene().cycleSpeed();
    document.getElementById('spdbtn').textContent = s + 'X';
  },
};
