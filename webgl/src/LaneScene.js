// LaneScene.js — PERSPECTIVE LANE BATTLER (the new target style).
// Enemies march down a corridor toward the camera, scaling up with proximity;
// your warriors hold the foreground on glowing summon platforms.
//
// Depth model: every unit carries t in [0,1]  (0 = far horizon, 1 = player line).
// A single project() maps (t, laneX) -> screen x/y/scale, so gameplay logic stays
// in depth-space and never touches pixels — the same split a 3D port would use.

const W = 375, H = 700;

// Corridor tuning (fractions of the canvas)
const HORIZON_Y = 0.30 * H;   // where the lane vanishes
const NEAR_Y    = 0.74 * H;   // the player's front line
const HALF_FAR  = 0.055 * W;  // lane half-width at the horizon
const HALF_NEAR = 0.46 * W;   // lane half-width at the camera
const SCALE_FAR = 0.16, SCALE_NEAR = 1.0;

// Perspective easing — units bunch up near the horizon, spread out near camera
function persp(t) { return t * t * 0.68 + t * 0.32; }

export function project(t, laneX) {
  const p = persp(Phaser.Math.Clamp(t, 0, 1));
  const y = HORIZON_Y + (NEAR_Y - HORIZON_Y) * p;
  const half = HALF_FAR + (HALF_NEAR - HALF_FAR) * p;
  return { x: W / 2 + laneX * half, y, scale: SCALE_FAR + (SCALE_NEAR - SCALE_FAR) * p, p };
}

export default class LaneScene extends Phaser.Scene {
  constructor() { super('lane'); }
  init(data) { this.D = data.gameData; }

  preload() {
    const D = this.D;
    this.squadDefs = [15, 2, 4, 10, 8].map(id => D.warriors.find(w => w.id === id));
    this.squadDefs.forEach(w => this.load.image('w' + w.id, `../assets/warriors/w${w.id}.png`));
    ['goblin', 'skeleton', 'orc', 'shieldbearer', 'ogre', 'boss']
      .forEach(k => this.load.image('e_' + k, `../assets/enemies/${k}.png`));
  }

  create() {
    this.buildCorridor();

    this.enemyLayer = this.add.container(0, 0).setDepth(20);
    this.warriorLayer = this.add.container(0, 0).setDepth(60);
    this.fxLayer = this.add.container(0, 0).setDepth(80);

    this.enemies = []; this.eid = 0; this.projs = [];
    this.enemyFortress = { hp: 8200, max: 10000 };
    this.yourFortress = { hp: 10000, max: 10000 };

    this.deploySquad();
    this.spawnTimer = 0;
    for (let i = 0; i < 6; i++) this.spawnEnemy(Math.random() * 0.55);

    this.hudSync();
  }

  // ── environment: procedural stand-in for the painted corridor art ──────────
  buildCorridor() {
    const g = this.add.graphics().setDepth(0);
    // sky / far haze
    g.fillGradientStyle(0xc9a06a, 0xc9a06a, 0x6b4a2c, 0x6b4a2c, 1);
    g.fillRect(0, 0, W, HORIZON_Y + 20);
    // ground plane
    g.fillGradientStyle(0x7a5a34, 0x7a5a34, 0xc2a173, 0xc2a173, 1);
    g.fillRect(0, HORIZON_Y, W, H - HORIZON_Y);

    // the lane itself — a trapezoid narrowing to the vanishing point
    const nl = project(1, -1), nr = project(1, 1), fl = project(0, -1), fr = project(0, 1);
    g.fillStyle(0xd8bd92, 1);
    g.beginPath();
    g.moveTo(fl.x, fl.y); g.lineTo(fr.x, fr.y); g.lineTo(nr.x, H); g.lineTo(nl.x, H);
    g.closePath(); g.fillPath();

    // paving bands recede with depth — sells the perspective
    g.lineStyle(1, 0xa8895f, 0.55);
    for (let i = 1; i <= 14; i++) {
      const t = i / 14, a = project(t, -1), b = project(t, 1);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokePath();
    }
    // flanking pillars, scaled by depth (drawn far -> near so nearer overlaps)
    for (let i = 0; i <= 9; i++) {
      const t = i / 9, s = project(t, 0).scale;
      for (const side of [-1, 1]) {
        const p = project(t, side * 1.32);
        const pw = 24 * s, ph = 96 * s;
        g.fillStyle(0x8d7350, 1);
        g.fillRect(p.x - pw / 2, p.y - ph, pw, ph);
        g.fillStyle(0xb09468, 1);                       // lit edge
        g.fillRect(p.x - pw / 2, p.y - ph, pw * 0.28, ph);
        g.fillStyle(0x5e4a2e, 1);                       // cap
        g.fillRect(p.x - pw * 0.62, p.y - ph - 5 * s, pw * 1.24, 6 * s);
      }
    }
    this.corridor = g;

    // fortress silhouettes at both ends
    const ef = this.add.rectangle(W / 2, HORIZON_Y - 14, 120, 54, 0x6a4a86).setDepth(1).setAlpha(0.95);
    this.add.rectangle(W / 2, HORIZON_Y - 14, 120, 54).setStrokeStyle(2, 0xffd24a, 0.7).setDepth(2);
    this.efIcon = ef;
  }

  // ── units ─────────────────────────────────────────────────────────────────
  deploySquad() {
    this.warriors = [];
    const lanes = [-0.78, -0.39, 0, 0.39, 0.78];
    this.squadDefs.forEach((def, i) => {
      const laneX = lanes[i];
      const pos = project(1, laneX);
      // glowing summon platform
      const plat = this.add.ellipse(pos.x, pos.y + 26, 74, 26, 0xffd24a, 0.18).setDepth(50);
      plat.setStrokeStyle(2, 0xffe9a0, 0.75);
      const img = this.add.image(pos.x, pos.y + 26, 'w' + def.id).setOrigin(0.5, 1);
      const targetH = 132;
      img.setDisplaySize(img.width * (targetH / img.height), targetH);
      this.warriorLayer.add(img);
      const w = { def, img, plat, laneX, x: pos.x, y: pos.y + 26,
                  hp: 100, mhp: 100, lvl: [2, 3, 3, 4, 3][i],
                  cd: 0, spd: def.aspd * 0.4, atk: def.atk * 3, range: 0.85,
                  phase: Math.random() * 6.28, atkAt: -1e9 };
      w.bar = this.makeBar(pos.x, pos.y - 118, 46, 0x36d14a);
      w.badge = this.add.text(pos.x - 34, pos.y - 126, String(w.lvl),
        { fontSize: '11px', color: '#fff', fontStyle: 'bold',
          backgroundColor: '#1a2a5e', padding: { x: 4, y: 2 } }).setDepth(70);
      this.warriors.push(w);
    });
  }

  makeBar(x, y, width, color) {
    const bg = this.add.rectangle(x, y, width, 7, 0x000000, 0.65).setDepth(70);
    bg.setStrokeStyle(1, 0x000000, 0.9);
    const fill = this.add.rectangle(x - width / 2 + 1, y, width - 2, 5, color).setOrigin(0, 0.5).setDepth(71);
    return { bg, fill, width };
  }

  spawnEnemy(t0 = 0) {
    const keys = ['goblin', 'skeleton', 'orc', 'shieldbearer', 'ogre'];
    const k = keys[(Math.random() * keys.length) | 0];
    const et = this.D.enemyTypes.find(e => e.label.toLowerCase() === k) || this.D.enemyTypes[0];
    const laneX = (Math.random() * 1.5 - 0.75);
    const m = { id: ++this.eid, t: t0, laneX, spd: 0.028 + Math.random() * 0.012,
                hp: et.hp, mhp: et.hp, key: k };
    m.img = this.add.image(0, 0, 'e_' + k).setOrigin(0.5, 1);
    m.baseH = 108;
    this.enemyLayer.add(m.img);
    m.bar = this.makeBar(0, 0, 30, 0xe23c3c);
    this.enemies.push(m);
  }

  removeEnemy(i) {
    const m = this.enemies[i];
    m.img.destroy(); m.bar.bg.destroy(); m.bar.fill.destroy();
    this.enemies.splice(i, 1);
  }

  // ── frame ─────────────────────────────────────────────────────────────────
  update(time, dt) {
    dt = Math.min(dt, 50);

    // steady trickle of attackers
    this.spawnTimer += dt;
    if (this.spawnTimer > 1400 && this.enemies.length < 26) { this.spawnTimer = 0; this.spawnEnemy(0); }

    // enemies advance in DEPTH, not pixels
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const m = this.enemies[i];
      m.t += m.spd * dt / 1000;
      if (m.t >= 1) {                       // reached your line
        this.yourFortress.hp = Math.max(0, this.yourFortress.hp - 120);
        this.hudSync(); this.removeEnemy(i); continue;
      }
      if (m.hp <= 0) { this.burst(m); this.removeEnemy(i); continue; }
      const p = project(m.t, m.laneX);
      const h = m.baseH * p.scale;
      m.img.x = p.x; m.img.y = p.y + Math.sin(time / 150 + m.id) * 1.2 * p.scale;
      m.img.setDisplaySize(m.img.width * (h / m.img.height), h);
      m.img.setDepth(20 + p.p * 30);        // nearer = drawn in front
      // health bar rides above the sprite, shrinking with distance
      const bw = 30 * p.scale;
      m.bar.bg.setPosition(p.x, m.img.y - h - 6).setSize(bw, 5 * p.scale + 2).setDepth(70);
      m.bar.fill.setPosition(p.x - bw / 2 + 1, m.img.y - h - 6)
        .setSize((bw - 2) * (m.hp / m.mhp), 3 * p.scale + 1).setDepth(71);
    }

    // warriors: idle breath + attack lunge, and they shoot up the lane
    for (const w of this.warriors) {
      const br = Math.sin(time / 620 + w.phase);
      let oy = br * 1.2, sy = 1 + br * 0.012;
      const el = time - w.atkAt;
      if (el >= 0 && el < 260) {
        const t = el / 260, push = Math.sin(t * Math.PI) * (1 - t * 0.35);
        oy -= push * 7; sy *= 1 + push * 0.05;   // lunge "up" the lane = toward the foe
      }
      w.img.y = w.y + oy;
      w.img.scaleY = (132 / w.img.height) * sy;

      w.cd -= dt;
      if (w.cd <= 0) {
        // nearest enemy within this warrior's depth reach
        let best = null, bd = 1e9;
        for (const m of this.enemies) {
          const d = 1 - m.t;                    // depth distance to the front line
          if (d < bd && d < w.range) { bd = d; best = m; }
        }
        if (best) { w.cd = w.spd; w.atkAt = time; this.fire(w, best); }
      }
    }

    // projectiles travel in depth toward their target
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i];
      pr.t -= pr.spd * dt / 1000;
      const tgt = this.enemies.find(m => m.id === pr.tid);
      if (!tgt || pr.t <= tgt.t) {
        if (tgt) { tgt.hp -= pr.dmg; this.burst(tgt, true); }
        pr.img.destroy(); this.projs.splice(i, 1); continue;
      }
      const p = project(pr.t, pr.laneX);
      pr.img.setPosition(p.x, p.y - 18 * p.scale).setScale(p.scale * 1.6).setDepth(55);
    }

    if (time - (this._hud || 0) > 200) { this._hud = time; this.hudSync(); }
  }

  fire(w, target) {
    const p = project(0.98, w.laneX);
    const col = Phaser.Display.Color.HexStringToColor(w.def.pc || '#ffffff').color;
    const img = this.add.circle(p.x, p.y, 3, col).setBlendMode(Phaser.BlendModes.ADD);
    this.projs.push({ t: 0.98, laneX: w.laneX, spd: 1.5, tid: target.id, dmg: w.atk, img });
  }

  burst(m, small) {
    const p = project(m.t, m.laneX);
    const n = small ? 4 : 9;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = (18 + Math.random() * 40) * p.scale;
      const c = this.add.circle(p.x, p.y - 14 * p.scale, 2 * p.scale + 1, small ? 0xffd24a : 0xff6a3c)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(85);
      this.tweens.add({ targets: c, x: p.x + Math.cos(a) * sp, y: p.y - 14 * p.scale + Math.sin(a) * sp,
        alpha: 0, duration: 300, onComplete: () => c.destroy() });
    }
  }

  hudSync() {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const bar = (id, cur, max) => { const e = document.getElementById(id); if (e) e.style.width = (cur / max * 100) + '%'; };
    set('ef-hp', `${this.enemyFortress.hp} / ${this.enemyFortress.max}`);
    bar('ef-fill', this.enemyFortress.hp, this.enemyFortress.max);
    set('yf-hp', `${this.yourFortress.hp} / ${this.yourFortress.max}`);
    bar('yf-fill', this.yourFortress.hp, this.yourFortress.max);
    set('lane-fps', Math.round(this.game.loop.actualFps) + ' FPS');
    set('lane-count', this.enemies.length + ' enemies');
  }
}
