// main.js — Phaser bootstrap only. All game logic lives in ./systems (engine-free)
// and all presentation in ./scenes. Unity port: this file's role is played by
// a GameInstaller/Bootstrap MonoBehaviour that wires systems to views.

import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import CollectionScene from './scenes/CollectionScene.js';
import MarketScene from './scenes/MarketScene.js';
import BattleScene from './scenes/BattleScene.js';

window.__game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 375,
  height: 700,
  backgroundColor: '#0d0a06',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, MenuScene, CollectionScene, MarketScene, BattleScene],
});
