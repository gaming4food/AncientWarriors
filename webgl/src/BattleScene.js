// BattleScene.js — GPU-rendered battle. Same data, assets and lane geometry as the
// Canvas 2D build; the difference is that every sprite here is a batched WebGL quad
// and the glow/impact effects are additive-blended rather than CPU-composited.
import { W, H, AH, slotPos, enemyPos, advanceEnemy, setGeometry, geo } from './geometry.js';

const SPRITE_H = 56, ENEMY_SCALE = 4.4;

export default class BattleScene extends Phaser.Scene {
  constructor() { super('battle'); }

  init(data) { this.D = data.gameData; setGeometry(data.gameData.geometry); }

  preload() {
    const D = this.D;
    this.load.image('arena', '../assets/arena.png');
    // only the heroes we field + the enemy art we spawn (keeps the atlas small)
    this.squadDefs = [0, 4, 12, 17, 18, 10, 15, 19].map(id => D.warriors.find(w => w.id === id));
    this.squadDefs.forEach(w => this.load.image('w' + w.id, `../assets/warriors/w${w.id}.png`));
    D.mythics.forEach(m => this.load.image('m' + m.id, `../assets/warriors/m${m.id}.png`));
    ['goblin', 'skeleton', 'orc', 'shieldbearer', 'gargoyle', 'ogre']
      .forEach(k => this.load.image('e_' + k, `../assets/enemies/${k}.png`));
  }

  create() {
    // ── arena background, cover-fit exactly like drawCover() ──
    const src = this.textures.get('arena').getSourceImage();
    const s = Math.max(W / src.width, H / src.height);
    this.bgW = src.width; this.bgH = src.height;
    this.add.image(W / 2, H / 2, 'arena').setDisplaySize(src.width * s, src.height * s).setDepth(0);

    // ── layers: additive FX sit above units so glows read on the GPU ──
    this.unitLayer = this.add.container(0, 0).setDepth(10);
    this.fxLayer = this.add.container(0, 0).setDepth(20);
    this.projLayer = this.add.container(0, 0).setDepth(15);

    this.warriors = []; this.enemies = []; this.projs = []; this.eid = 0;
    this.bloom = true;

    // deploy a squad onto the real 4x3 tile grid (both halves)
    this.squadDefs.slice(0, 5).forEach((def, i) => this.deploy(def, i + 4, true));
    this.squadDefs.slice(0, 4).forEach((def, i) => this.deploy(def, i + 4, false));

    this.addEnemies(24);

    this.fpsText = this.add.text(6, 6, '', { fontSize: '11px', color: '#8be06a', fontStyle: 'bold' })
      .setDepth(100);
    this.countText = this.add.text(6, 20, '', { fontSize: '10px', color: '#c8a24a' }).setDepth(100);
  }

  // ── units ────────────────────────────────────────────────────────────────
  deploy(def, slot, mine) {
    const ay = mine ? AH : 0;               // player's grid lives in the lower half
    const p = slotPos(slot, this.bgW, this.bgH);
    const key = 'w' + def.id;
    const fy = p.y + ay + 20;               // feet anchored like SPRITE_FEET
    const img = this.add.image(p.x, fy, key).setOrigin(0.5, 1);
    img.setDisplaySize(img.width * (SPRITE_H / img.height), SPRITE_H);
    this.unitLayer.add(img);
    const w = { def, img, x: p.x, y: fy, mine, ay, cd: 0, spd: def.aspd * 0.4,
                atk: def.atk * 3, range: 180, phase: Math.random() * 6.28, atkAt: -1e9, dx: 0, dy: 0 };
    // GPU glow ring (additive) — the WebGL-only win over Canvas 2D
    const glow = this.add.image(p.x, fy, key).setOrigin(0.5, 1).setVisible(false);
    glow.setDisplaySize(img.displayWidth * 1.25, SPRITE_H * 1.25);
    glow.setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd24a).setAlpha(0.5);
    this.fxLayer.add(glow); w.glow = glow;
    this.warriors.push(w);
    return w;
  }

  addEnemies(n) {
    const keys = ['goblin', 'skeleton', 'orc', 'shieldbearer', 'gargoyle', 'ogre'];
    for (let i = 0; i < n; i++) {
      const k = keys[(Math.random() * keys.length) | 0];
      const et = this.D.enemyTypes.find(e => e.label.toLowerCase() === k) || this.D.enemyTypes[0];
      const mine = Math.random() < 0.5;
      const m = { id: ++this.eid, seg: 0, sp: Math.random() * 0.5, side: Math.random() < 0.5 ? 0 : 1,
                  spd: et.spd, r: et.r, hp: et.hp, mhp: et.hp, mine, ay: mine ? AH : 0 };
      const img = this.add.image(0, 0, 'e_' + k).setOrigin(0.5, 1);
      img.setDisplaySize(img.width * ((m.r * ENEMY_SCALE) / img.height), m.r * ENEMY_SCALE);
      this.unitLayer.add(img); m.img = img;
      this.enemies.push(m);
    }
  }

  stress() { this.addEnemies(500); }
  reset() {
    this.enemies.forEach(m => m.img.destroy());
    this.enemies = [];
    this.projs.forEach(p => p.img.destroy());
    this.projs = [];
    this.addEnemies(24);
  }
  toggleBloom() {
    this.bloom = !this.bloom;
    if (!this.bloom) this.warriors.forEach(w => w.glow.setVisible(false));
    return this.bloom;
  }

  // ── frame ────────────────────────────────────────────────────────────────
  update(time, dt) {
    dt = Math.min(dt, 50);

    // enemies march the real 3-segment lane
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const m = this.enemies[i];
      advanceEnemy(m, dt);
      if (m.seg >= 3 || m.hp <= 0) { m.img.destroy(); this.enemies.splice(i, 1); continue; }
      const p = enemyPos(m, m.ay, m.mine);
      m.img.x = p.x;
      m.img.y = p.y + m.r + Math.sin(time / 130 + m.id) * 1.5;   // marching bob
      m.img.setDepth(10 + p.y / 100);
    }

    // warriors: idle breath + attack lunge (same curves as the Canvas build)
    for (const w of this.warriors) {
      const br = Math.sin(time / 620 + w.phase);
      let ox = 0, oy = br * 0.7, sy = 1 + br * 0.014;
      const el = time - w.atkAt;
      if (el >= 0 && el < 260) {
        const t = el / 260, push = Math.sin(t * Math.PI) * (1 - t * 0.35);
        ox = w.dx * push * 6; oy += w.dy * push * 4; sy *= 1 + push * 0.07;
      }
      w.img.x = w.x + ox; w.img.y = w.y + oy;
      w.img.scaleY = (SPRITE_H / w.img.height) * sy;
      w.img.setDepth(10 + w.y / 100);

      // ultimate-ready glow, additively blended on the GPU
      if (this.bloom) {
        const pulse = 0.35 + 0.25 * Math.sin(time / 220 + w.phase);
        w.glow.setVisible(true).setAlpha(pulse);
        w.glow.x = w.img.x; w.glow.y = w.img.y;
      }

      // fire at the nearest enemy on this warrior's half
      w.cd -= dt;
      if (w.cd <= 0) {
        let best = null, bd = 1e9;
        for (const m of this.enemies) {
          if (m.mine !== w.mine) continue;
          const p = enemyPos(m, m.ay, m.mine);
          const d = Math.hypot(p.x - w.x, p.y - w.y);
          if (d < w.range && d < bd) { bd = d; best = m; }
        }
        if (best) {
          w.cd = w.spd;
          const p = enemyPos(best, best.ay, best.mine);
          const d = Math.hypot(p.x - w.x, p.y - w.y) || 1;
          w.dx = (p.x - w.x) / d; w.dy = (p.y - w.y) / d;
          w.atkAt = time;
          this.fire(w, best);
        }
      }
    }

    // projectiles
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i];
      pr.x += pr.vx * dt / 1000; pr.y += pr.vy * dt / 1000; pr.life -= dt;
      pr.img.x = pr.x; pr.img.y = pr.y;
      const t = this.enemies.find(m => m.id === pr.tid);
      if (t) {
        const tp = enemyPos(t, t.ay, t.mine);
        if (Math.hypot(tp.x - pr.x, tp.y - pr.y) < 12) {
          t.hp -= pr.dmg; this.impact(tp.x, tp.y, pr.col);
          pr.img.destroy(); this.projs.splice(i, 1); continue;
        }
      }
      if (pr.life <= 0) { pr.img.destroy(); this.projs.splice(i, 1); }
    }

    if (time - (this._lastHud || 0) > 250) {
      this._lastHud = time;
      const fps = Math.round(this.game.loop.actualFps);
      this.fpsText.setText(fps + ' FPS');
      this.fpsText.setColor(fps >= 55 ? '#8be06a' : fps >= 35 ? '#ffd24a' : '#ff6a6a');
      const sprites = this.enemies.length + this.warriors.length * 2 + this.projs.length;
      this.countText.setText(this.enemies.length + ' enemies · ' + sprites + ' sprites');
      const el = document.getElementById('stat');
      if (el) el.textContent = fps + ' FPS · ' + sprites + ' sprites';
    }
  }

  fire(w, target) {
    const p = enemyPos(target, target.ay, target.mine);
    const d = Math.hypot(p.x - w.x, p.y - w.y) || 1;
    const col = Phaser.Display.Color.HexStringToColor(w.def.pc || '#ffffff').color;
    const img = this.add.circle(w.x, w.y - 20, 3, col).setBlendMode(Phaser.BlendModes.ADD);
    this.projLayer.add(img);
    this.projs.push({ x: w.x, y: w.y - 20, vx: (p.x - w.x) / d * 290, vy: (p.y - w.y) / d * 290,
                      tid: target.id, dmg: w.atk, life: 3000, img, col });
  }

  // additive impact burst — cheap on the GPU, expensive in Canvas 2D
  impact(x, y, col) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * 6.28, sp = 30 + Math.random() * 60;
      const c = this.add.circle(x, y, 2, col).setBlendMode(Phaser.BlendModes.ADD);
      this.fxLayer.add(c);
      this.tweens.add({
        targets: c, x: x + Math.cos(a) * sp, y: y + Math.sin(a) * sp,
        alpha: 0, scale: 0.2, duration: 320, onComplete: () => c.destroy(),
      });
    }
    const ring = this.add.circle(x, y, 6, col, 0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.fxLayer.add(ring);
    this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
  }
}
