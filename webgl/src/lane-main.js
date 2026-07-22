// lane-main.js — bootstrap for the perspective lane prototype.
import LaneScene from './LaneScene.js';

const gameData = await fetch('./data/game-data.json').then(r => r.json());

// Probe for production art BEFORE Phaser boots, so preload only requests files
// that exist (keeps the console clean and enables graceful fallbacks).
// - ../assets/lane/corridor.png            painted corridor background
// - ../assets/warriors/back/b<id>.png      back-view hero sprites
// - ../assets/lane/corridor_full.png       FULL SCENE PLATE (heroes + bars baked in,
//                                          e.g. the reference mockup) — engine hides
//                                          its own hero sprites/bars over it
const SQUAD_IDS = [15, 2, 4, 10, 8];
const probe = url => fetch(url, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
const art = { corridor: await probe('../assets/lane/corridor.png'),
              corridorFull: await probe('../assets/lane/corridor_full.png'), back: {} };
await Promise.all(SQUAD_IDS.map(async id => { art.back[id] = await probe(`../assets/warriors/back/b${id}.png`); }));
gameData.art = art;
console.log('[lane] production art:', JSON.stringify(art));
// the scene plate already paints fortress bars — hide the HTML duplicates
if (art.corridorFull) ['ef', 'yf'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: 375,
  height: 700,
  transparent: false,
  backgroundColor: '#0b0906',
  scale: { mode: Phaser.Scale.NONE },
  render: { antialias: true },
  scene: [LaneScene],
});
game.scene.start('lane', { gameData });

// Build the bottom card tray from the same squad the scene fields
const SQUAD = [15, 2, 4, 10, 8], COSTS = [3, 2, 3, 4, 3];
const cards = document.getElementById('cards');
SQUAD.forEach((id, i) => {
  const w = gameData.warriors.find(x => x.id === id);
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `<img src="../assets/warriors/w${id}.png" alt="${w.name}"
      style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top">
    <div class="cost">💎 ${COSTS[i]}</div>`;
  cards.appendChild(el);
});

// Elixir pips (7 / MAX 10)
const bar = document.getElementById('elixbar');
for (let i = 0; i < 10; i++) {
  const d = document.createElement('div');
  if (i < 7) d.className = 'on';
  bar.appendChild(d);
}

window.AWLANE = {
  scene: () => game.scene.getScene('lane'),
  renderer: () => (game.renderer.type === Phaser.WEBGL ? 'WEBGL' : 'CANVAS'),
};
