// BootScene — loads JSON data, wires up the engine-free systems, and bakes
// pixel-hero textures. After this scene, everything the game needs lives in
// the Phaser registry under 'ctx'.

import { createRng } from '../systems/rng.js';
import { createStorage } from '../systems/storage.js';
import { createCollection } from '../systems/collection.js';
import { heroPixelGrid, HERO_GRID } from '../systems/heroPixels.js';

export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.json('warriors', './src/data/warriors.json');
    this.load.json('enemies', './src/data/enemies.json');
    this.load.json('rarity', './src/data/rarity.json');
    this.load.json('progression', './src/data/progression.json');
    this.load.json('balance', './src/data/balance.json');
  }

  create() {
    const data = {
      warriors: this.cache.json.get('warriors').warriors,
      enemies: this.cache.json.get('enemies'),
      rarity: this.cache.json.get('rarity'),
      progression: this.cache.json.get('progression'),
      balance: this.cache.json.get('balance'),
    };

    const rng = createRng();
    const storage = createStorage(window.localStorage);
    const collection = createCollection({ ...data, storage, rng });
    collection.load();

    this.bakeHeroTextures(data.warriors);
    this.bakeMobTextures(data.enemies.types);

    this.registry.set('ctx', { data, rng, storage, collection });
    this.scene.start('Menu');
  }

  // Rasterize each warrior's engine-free pixel grid into a Phaser texture.
  bakeHeroTextures(warriors) {
    const CELL = 3;
    for (const w of warriors) {
      const key = 'hero_' + w.id;
      if (this.textures.exists(key)) continue;
      const grid = heroPixelGrid(w.pix);
      const cv = this.textures.createCanvas(key, HERO_GRID.w * CELL, HERO_GRID.h * CELL);
      const c = cv.getContext();
      for (let y = 0; y < HERO_GRID.h; y++) for (let x = 0; x < HERO_GRID.w; x++) {
        if (!grid[y][x]) continue;
        c.fillStyle = grid[y][x];
        c.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
      cv.refresh();
    }
  }

  // Simple pixel monsters: shaded blob + horns/ears per type.
  bakeMobTextures(types) {
    for (const t of types) {
      const key = 'mob_' + t.key;
      if (this.textures.exists(key)) continue;
      const r = t.radius * 2;                       // texture radius (2px cells)
      const S = r * 2 + 8;
      const cv = this.textures.createCanvas(key, S, S);
      const c = cv.getContext();
      const cx = S / 2, cy = S / 2;
      c.fillStyle = t.col;
      c.beginPath(); c.ellipse(cx, cy, r, r * 1.05, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.beginPath(); c.arc(cx, cy + r * 0.1, r * 0.95, 0.35, Math.PI - 0.35); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.28)';
      c.beginPath(); c.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.3, r * 0.2, -0.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(26,18,10,0.8)'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(cx, cy, r, r * 1.05, 0, 0, Math.PI * 2); c.stroke();
      // eyes
      c.fillStyle = t.boss ? '#ff00ff' : t.key === 'orc' ? '#ff5500' : t.key === 'skeleton' ? '#7de8ff' : '#ffe000';
      c.beginPath(); c.arc(cx - r * 0.32, cy - r * 0.2, r * 0.18, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(cx + r * 0.32, cy - r * 0.2, r * 0.18, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1a120a';
      c.beginPath(); c.arc(cx - r * 0.3, cy - r * 0.18, r * 0.08, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(cx + r * 0.34, cy - r * 0.18, r * 0.08, 0, Math.PI * 2); c.fill();
      // horns for orc/boss, ears for goblin
      c.fillStyle = t.boss ? '#2a0a33' : '#3a2418';
      if (t.boss || t.key === 'orc') {
        c.beginPath(); c.moveTo(cx - r * 0.4, cy - r * 0.8); c.lineTo(cx - r * 0.8, cy - r * 1.5); c.lineTo(cx - r * 0.1, cy - r * 0.95); c.fill();
        c.beginPath(); c.moveTo(cx + r * 0.4, cy - r * 0.8); c.lineTo(cx + r * 0.8, cy - r * 1.5); c.lineTo(cx + r * 0.1, cy - r * 0.95); c.fill();
      } else if (t.key === 'goblin') {
        c.fillStyle = t.col;
        c.beginPath(); c.moveTo(cx - r, cy); c.lineTo(cx - r - 6, cy - r * 0.7); c.lineTo(cx - r + 3, cy + r * 0.2); c.fill();
        c.beginPath(); c.moveTo(cx + r, cy); c.lineTo(cx + r + 6, cy - r * 0.7); c.lineTo(cx + r - 3, cy + r * 0.2); c.fill();
      }
      // fangs
      c.fillStyle = '#fff';
      c.beginPath(); c.moveTo(cx - r * 0.2, cy + r * 0.35); c.lineTo(cx - r * 0.1, cy + r * 0.6); c.lineTo(cx, cy + r * 0.38); c.fill();
      c.beginPath(); c.moveTo(cx + r * 0.2, cy + r * 0.35); c.lineTo(cx + r * 0.1, cy + r * 0.6); c.lineTo(cx, cy + r * 0.38); c.fill();
      cv.refresh();
    }
  }
}
