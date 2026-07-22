// lane-main.js — bootstrap for the playable perspective lane.
import LaneScene from './LaneScene.js';

const gameData = await fetch('./data/game-data.json').then(r => r.json());

// Probe for production art BEFORE Phaser boots (keeps the console clean):
// - ../assets/lane/corridor_full.png   FULL SCENE PLATE (heroes baked in) — engine
//                                      hides its own hero visuals over it
// - ../assets/lane/corridor.png        clean painted background (separated layers)
// - ../assets/warriors/back/b<id>.png  back-view hero sprites
// Order matches the painted plate left -> right: Robin Hood, Joan, Merlin, Viking, Cleopatra
const SQUAD_IDS = [2, 15, 4, 10, 8];
const probe = url => fetch(url, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
const art = { corridorTop: await probe('../assets/lane/corridor_top.png'),
              corridor: await probe('../assets/lane/corridor.png'),
              corridorFull: await probe('../assets/lane/corridor_full.png'), back: {} };
await Promise.all(SQUAD_IDS.map(async id => { art.back[id] = await probe(`../assets/warriors/back/b${id}.png`); }));
gameData.art = art;
console.log('[lane] production art:', JSON.stringify(art));

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
game.scene.start('lane', { gameData });

// Build the card tray from the same squad the scene fields
const cards = document.getElementById('cards');
SQUAD_IDS.forEach((id, i) => {
  const w = gameData.warriors.find(x => x.id === id);
  const el = document.createElement('div');
  el.className = 'card'; el.id = 'card-' + i;
  el.innerHTML = `<img src="../assets/warriors/w${id}.png" alt="${w.name}">
    <div class="lvl" id="clvl-${i}">SUMMON</div>
    <div class="cost">💧 <span id="cost-${i}">—</span></div>`;
  el.onclick = () => AWLANE.card(i);
  cards.appendChild(el);
});

// Elixir pips
const bar = document.getElementById('elixbar');
for (let i = 0; i < 10; i++) bar.appendChild(document.createElement('div'));

window.AWLANE = {
  scene: () => game.scene.getScene('lane'),
  renderer: () => (game.renderer.type === Phaser.WEBGL ? 'WEBGL' : 'CANVAS'),
  card(i) { this.scene().cardTap(i); },
  spell() { this.scene().castSpell(); },
  pause() {
    const paused = this.scene().togglePause();
    document.getElementById('pausebtn').textContent = paused ? '▶' : '❚❚';
  },
  speed() {
    const s = this.scene().cycleSpeed();
    document.getElementById('spdbtn').textContent = s + 'X';
  },
};
