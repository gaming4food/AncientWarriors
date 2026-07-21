// main.js — WebGL bootstrap. Forces Phaser.WEBGL (not AUTO) so this prototype is
// always an honest GPU comparison against the Canvas 2D build.
import BattleScene from './BattleScene.js';

const gameData = await fetch('./data/game-data.json').then(r => r.json());

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: 375,
  height: 700,
  backgroundColor: '#0d0a06',
  scale: { mode: Phaser.Scale.NONE },
  render: { antialias: true, roundPixels: false },
  scene: [BattleScene],
});

game.scene.start('battle', { gameData });

// Small control surface for the A/B buttons in index.html
window.AWGL = {
  scene: () => game.scene.getScene('battle'),
  addEnemies(n) { this.scene().addEnemies(n); },
  stress() { this.scene().stress(); },
  reset() { this.scene().reset(); },
  toggleBloom() {
    const on = this.scene().toggleBloom();
    const b = [...document.querySelectorAll('#hud button')].find(x => x.textContent.startsWith('Bloom'));
    if (b) b.textContent = 'Bloom: ' + (on ? 'ON' : 'OFF');
  },
  renderer: () => game.renderer.type === Phaser.WEBGL ? 'WEBGL' : 'CANVAS',
};
