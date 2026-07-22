// LaneScene.js — PLAYABLE perspective lane battler.
// Waves of enemies march down the corridor toward the camera; your five heroes
// hold the front line. Kills chip the ENEMY FORTRESS, breaches chip YOURS.
// Win: enemy fortress destroyed (or all waves cleared). Lose: your fortress falls.
//
// Depth model: t in [0,1] (0 = horizon, 1 = player line); project() maps
// (t, laneX) -> screen x/y/scale so gameplay stays in depth-space.

const W = 375, H = 700;
// Horizon sits at the painted fortress gate; near line at the summon platforms.
const HORIZON_Y = 0.17 * H, NEAR_Y = 0.775 * H;
const HALF_FAR = 0.05 * W, HALF_NEAR = 0.45 * W;
const SCALE_FAR = 0.13, SCALE_NEAR = 1.0;
const MAX_WAVE = 20, FORT_MAX = 10000;
const ELIXIR_MAX = 10, ELIXIR_MS = 1400;

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
    const D = this.D, art = D.art || { corridor: false, corridorFull: false, back: {} };
    // Order matches the painted plate left -> right:
    // Robin Hood (archer), Joan (knight), Merlin, Viking, Cleopatra
    this.squadDefs = [2, 15, 4, 10, 8].map(id => D.warriors.find(w => w.id === id));
    this.squadDefs.forEach(w => {
      if (art.back[w.id]) this.load.image('b' + w.id, `../assets/warriors/back/b${w.id}.png`);
      else this.load.image('w' + w.id, `../assets/warriors/w${w.id}.png`);
    });
    if (art.corridorTop) this.load.image('corridor_top', '../assets/lane/corridor_top.png');
    else if (art.corridorFull) this.load.image('corridor_full', '../assets/lane/corridor_full.png');
    else if (art.corridor) this.load.image('corridor', '../assets/lane/corridor.png');
    ['goblin', 'skeleton', 'orc', 'shieldbearer', 'ogre', 'boss']
      .forEach(k => this.load.image('e_' + k, `../assets/enemies/${k}.png`));
  }

  create() {
    // Preferred: painted lane on top (no heroes) + procedural spawn plaza beneath,
    // so heroes summon in via cards. Falls back to plate / clean / procedural.
    this.plate = false;
    if (this.textures.exists('corridor_top')) {
      const src = this.textures.get('corridor_top').getSourceImage();
      // cover down to ~72% height so the painted lane is large; crop the outer sides
      const s = Math.max(W / src.width, (0.72 * H) / src.height);
      const dw = src.width * s, dh = src.height * s;
      this.add.image(W / 2, 0, 'corridor_top').setOrigin(0.5, 0).setDisplaySize(dw, dh).setDepth(0);
      this.buildPlaza(dh);                                   // near foreground stone + platforms
    } else if (this.textures.exists('corridor_full')) {
      this.plate = true;
      const src = this.textures.get('corridor_full').getSourceImage();
      const s = Math.max(W / src.width, H / src.height);
      this.add.image(W / 2, H / 2, 'corridor_full').setDisplaySize(src.width * s, src.height * s).setDepth(0);
    } else if (this.textures.exists('corridor')) {
      const src = this.textures.get('corridor').getSourceImage();
      const s = Math.max(W / src.width, H / src.height);
      this.add.image(W / 2, H / 2, 'corridor').setDisplaySize(src.width * s, src.height * s).setDepth(0);
    } else this.buildCorridor();

    this.enemyLayer = this.add.container(0, 0).setDepth(20);
    this.warriorLayer = this.add.container(0, 0).setDepth(60);
    this.fxLayer = this.add.container(0, 0).setDepth(80);

    // ── game state ──
    this.enemies = []; this.projs = []; this.eid = 0;
    this.enemyFortress = FORT_MAX; this.yourFortress = FORT_MAX;
    this.gold = 350; this.gems = 180; this.kills = 0;
    this.elixir = 7; this.elixAcc = 0;
    this.spellCharges = 3;
    this.wave = 0; this.waveSpawned = 0; this.waveKilled = 0; this.waveTarget = 0;
    this.spawnAcc = 0; this.over = false; this.speed = 1;

    this.deploySquad();
    this.nextWave();
    this.hudSync(true);
  }

  // ── procedural corridor fallback (unchanged look) ──
  buildCorridor() {
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(0xc9a06a, 0xc9a06a, 0x6b4a2c, 0x6b4a2c, 1); g.fillRect(0, 0, W, HORIZON_Y + 20);
    g.fillGradientStyle(0x7a5a34, 0x7a5a34, 0xc2a173, 0xc2a173, 1); g.fillRect(0, HORIZON_Y, W, H - HORIZON_Y);
    const fl = project(0, -1), fr = project(0, 1), nl = project(1, -1), nr = project(1, 1);
    g.fillStyle(0xd8bd92, 1); g.beginPath();
    g.moveTo(fl.x, fl.y); g.lineTo(fr.x, fr.y); g.lineTo(nr.x, H); g.lineTo(nl.x, H);
    g.closePath(); g.fillPath();
    g.lineStyle(1, 0xa8895f, 0.55);
    for (let i = 1; i <= 14; i++) { const t = i / 14, a = project(t, -1), b = project(t, 1);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokePath(); }
    for (let i = 0; i <= 9; i++) {
      const t = i / 9, s = project(t, 0).scale;
      for (const side of [-1, 1]) {
        const p = project(t, side * 1.32), pw = 24 * s, ph = 96 * s;
        g.fillStyle(0x8d7350, 1); g.fillRect(p.x - pw / 2, p.y - ph, pw, ph);
        g.fillStyle(0xb09468, 1); g.fillRect(p.x - pw / 2, p.y - ph, pw * 0.28, ph);
        g.fillStyle(0x5e4a2e, 1); g.fillRect(p.x - pw * 0.62, p.y - ph - 5 * s, pw * 1.24, 6 * s);
      }
    }
    this.add.rectangle(W / 2, HORIZON_Y - 14, 120, 54, 0x6a4a86).setDepth(1).setAlpha(0.95);
  }

  // Procedural near-foreground plaza that continues the painted lane down to the
  // summon platforms — where the player's heroes spawn in.
  buildPlaza(fromY) {
    const g = this.add.graphics().setDepth(1);
    // warm stone flagstones continuing the painted lane, darkening into the foreground
    g.fillGradientStyle(0x9c7c4c, 0x9c7c4c, 0x2e2415, 0x2e2415, 1);
    g.fillRect(0, fromY - 8, W, H - fromY + 8);
    // converging paving seams toward the vanishing point (perspective)
    g.lineStyle(1.5, 0x5a4626, 0.55);
    for (let i = 1; i <= 5; i++) {
      const yy = fromY + (H - fromY) * (i / 5);
      g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.strokePath();
    }
    // lane rails narrowing to the horizon
    const nl = project(1, -1.12), nr = project(1, 1.12);
    g.lineStyle(2.5, 0x7a5e2c, 0.5);
    g.beginPath(); g.moveTo(nl.x, H); g.lineTo(W / 2 - 30, fromY - 4); g.strokePath();
    g.beginPath(); g.moveTo(nr.x, H); g.lineTo(W / 2 + 30, fromY - 4); g.strokePath();
    // seam blend: a soft dark gradient right at the painted-edge to hide the join
    const seam = this.add.graphics().setDepth(1);
    seam.fillStyle(0x000000, 0.28); seam.fillRect(0, fromY - 14, W, 22);
    // bottom vignette
    const vg = this.add.graphics().setDepth(2);
    vg.fillStyle(0x000000, 0.4); vg.fillRect(0, H - 90, W, 90);
    this.plazaTop = fromY;
  }

  // ── heroes ────────────────────────────────────────────────────────────────
  deploySquad() {
    this.warriors = [];
    const lanes = [-0.78, -0.39, 0, 0.39, 0.78];
    this.squadDefs.forEach((def, i) => {
      const laneX = lanes[i], pos = project(1, laneX);
      // glowing hex summon platform (echoes the mockup)
      const plat = this.add.container(pos.x, pos.y + 30).setDepth(50);
      const disc = this.add.ellipse(0, 0, 78, 30, 0xffd24a, 0.16).setStrokeStyle(2.5, 0xffe9a0, 0.85);
      const inner = this.add.ellipse(0, 0, 52, 20, 0xffe9a0, 0.10).setStrokeStyle(1, 0xfff2c0, 0.5);
      plat.add([disc, inner]);
      plat.setAlpha(0.5);
      const key = this.textures.exists('b' + def.id) ? 'b' + def.id : 'w' + def.id;
      const img = this.add.image(pos.x, pos.y + 26, key).setOrigin(0.5, 1);
      img.setDisplaySize(img.width * (132 / img.height), 132);
      this.warriorLayer.add(img);
      const w = { def, img, plat, laneX, x: pos.x, y: pos.y + 26,
                  deployed: this.plate,             // plate mode: painted heroes start fielded
                  lvl: 1, cost: [2, 3, 3, 4, 3][i],   // costs follow the painted order
                  cd: 0, spd: def.aspd * 0.55, range: 0.9,
                  phase: Math.random() * 6.28, atkAt: -1e9 };
      w.badge = this.add.text(pos.x - 36, pos.y - 128, '1',
        { fontSize: '12px', color: '#fff', fontStyle: 'bold',
          backgroundColor: '#1a2a5e', padding: { x: 5, y: 2 } }).setDepth(70);
      if (this.plate) { img.setVisible(false); plat.setVisible(false); }   // painted plate has them
      else if (!w.deployed) { img.setVisible(false); w.badge.setVisible(false); plat.setAlpha(0.4); }
      this.warriors.push(w);
    });
  }

  heroAtk(w) { return Math.round(w.def.atk * 3 * (1 + 0.4 * (w.lvl - 1))); }
  upCost(w) { return w.deployed ? w.cost + w.lvl : w.cost; }

  // card tap: summon if empty, upgrade if fielded. Returns a status string for the HUD.
  cardTap(i) {
    if (this.over) return 'over';
    const w = this.warriors[i];
    const cost = this.upCost(w);
    if (this.elixir < cost) { this.toast('Need ' + cost + ' elixir!', '#7ec8ff'); return 'poor'; }
    this.elixir -= cost;
    if (!w.deployed) {
      w.deployed = true;
      if (!this.plate) { w.img.setVisible(true); w.badge.setVisible(true); w.plat.setAlpha(1); }
      this.summonFx(w);
      this.toast(w.def.name + ' takes the field!', '#ffd24a');
    } else {
      w.lvl++;
      this.summonFx(w);
      this.toast(w.def.name + ' → Lv ' + w.lvl + '  (⚔ ' + this.heroAtk(w) + ')', '#8be06a');
    }
    this.hudSync(true);
    return 'ok';
  }

  summonFx(w) {
    const ring = this.add.ellipse(w.x, w.y + 10, 40, 15).setStrokeStyle(3, 0xffe9a0, 1).setDepth(85);
    this.tweens.add({ targets: ring, scaleX: 2.4, scaleY: 2.4, alpha: 0, duration: 420, onComplete: () => ring.destroy() });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.28, c = this.add.circle(w.x, w.y, 2.5, 0xffd24a).setBlendMode(Phaser.BlendModes.ADD).setDepth(86);
      this.tweens.add({ targets: c, x: w.x + Math.cos(a) * 34, y: w.y - 20 - Math.random() * 30, alpha: 0, duration: 460, onComplete: () => c.destroy() });
    }
  }

  castSpell() {
    if (this.over || this.spellCharges <= 0) return;
    this.spellCharges--;
    const dmg = 600 + this.wave * 120;
    this.cameras.main.shake(220, 0.012);
    for (const m of [...this.enemies]) {
      m.hp -= dmg;
      const p = project(m.t, m.laneX);
      this.burst({ t: m.t, laneX: m.laneX }, false, 0xffb020);
    }
    this.toast('⚡ JUDGEMENT — ' + dmg + ' to all foes!', '#ffb020');
    this.hudSync(true);
  }

  // ── waves ────────────────────────────────────────────────────────────────
  nextWave() {
    if (this.wave >= MAX_WAVE) { this.finish(true, 'All waves repelled!'); return; }
    this.wave++;
    this.waveSpawned = 0; this.waveKilled = 0;
    this.waveTarget = 6 + this.wave * 2 + (this.wave % 5 === 0 ? 1 : 0);
    this.spellCharges = Math.min(3, this.spellCharges + 1);
    this.elixir = Math.min(ELIXIR_MAX, this.elixir + 2);
    this.toast('🌊 WAVE ' + this.wave + (this.wave % 5 === 0 ? ' — BOSS!' : ''), '#ffd27a');
    this.hudSync(true);
  }

  spawnEnemy() {
    const boss = this.wave % 5 === 0 && this.waveSpawned === this.waveTarget - 1;
    const keys = this.wave < 4 ? ['goblin', 'skeleton'] :
                 this.wave < 8 ? ['goblin', 'skeleton', 'orc'] :
                 this.wave < 13 ? ['skeleton', 'orc', 'shieldbearer'] :
                 ['orc', 'shieldbearer', 'ogre'];
    const k = boss ? 'boss' : keys[(Math.random() * keys.length) | 0];
    const et = this.D.enemyTypes.find(e => e.label.toLowerCase() === k) || this.D.enemyTypes[0];
    const hpMul = 0.3 + this.wave * 0.16;
    const m = { id: ++this.eid, t: 0, laneX: Math.random() * 1.5 - 0.75,
                spd: (boss ? 0.02 : 0.026 + Math.random() * 0.012) * (1 + this.wave * 0.012),
                hp: Math.round(et.hp * hpMul * (boss ? 2.2 : 1)),
                mhp: 0, boss, dmgFort: boss ? 900 : 180 + this.wave * 14,
                hitFort: Math.round(et.hp * hpMul * (boss ? 2.2 : 1) / 14) };
    m.mhp = m.hp;
    m.img = this.add.image(0, 0, 'e_' + k).setOrigin(0.5, 1);
    m.baseH = boss ? 150 : 108;
    this.enemyLayer.add(m.img);
    m.bar = this.makeBar(0, 0, boss ? 44 : 30, 0xe23c3c);
    this.enemies.push(m);
  }

  makeBar(x, y, width, color) {
    const bg = this.add.rectangle(x, y, width, 7, 0x000000, 0.65).setDepth(70);
    const fill = this.add.rectangle(x - width / 2 + 1, y, width - 2, 5, color).setOrigin(0, 0.5).setDepth(71);
    return { bg, fill, width };
  }

  removeEnemy(i) {
    const m = this.enemies[i];
    m.img.destroy(); m.bar.bg.destroy(); m.bar.fill.destroy();
    this.enemies.splice(i, 1);
  }

  killEnemy(i) {
    const m = this.enemies[i];
    this.kills++; this.waveKilled++;
    this.gold += m.boss ? 60 : 6; this.gems += m.boss ? 5 : (Math.random() < 0.12 ? 1 : 0);
    this.enemyFortress = Math.max(0, this.enemyFortress - m.hitFort);
    this.burst(m, false, m.boss ? 0xffd24a : 0xff6a3c);
    this.removeEnemy(i);
    if (this.enemyFortress <= 0) { this.finish(true, 'Enemy fortress destroyed!'); return; }
    if (this.waveKilled >= this.waveTarget) this.nextWave();
  }

  // ── frame ────────────────────────────────────────────────────────────────
  update(time, rawDt) {
    if (this.over) return;
    const dt = Math.min(rawDt, 50) * this.speed;

    // elixir regen
    this.elixAcc += dt;
    while (this.elixAcc >= ELIXIR_MS) { this.elixAcc -= ELIXIR_MS; this.elixir = Math.min(ELIXIR_MAX, this.elixir + 1); }

    // wave spawner
    this.spawnAcc += dt;
    const interval = Math.max(520, 1350 - this.wave * 40);
    if (this.spawnAcc >= interval && this.waveSpawned < this.waveTarget) {
      this.spawnAcc = 0; this.waveSpawned++; this.spawnEnemy();
    }

    // enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const m = this.enemies[i];
      m.t += m.spd * dt / 1000;
      if (m.hp <= 0) { this.killEnemy(i); continue; }
      if (m.t >= 1) {                        // breach!
        this.yourFortress = Math.max(0, this.yourFortress - m.dmgFort);
        this.cameras.main.shake(140, 0.008);
        this.waveKilled++;                   // breached counts toward wave completion
        this.removeEnemy(i);
        if (this.yourFortress <= 0) { this.finish(false, 'Your fortress has fallen…'); return; }
        if (this.waveKilled >= this.waveTarget) this.nextWave();
        continue;
      }
      const p = project(m.t, m.laneX);
      const h = m.baseH * p.scale;
      m.img.x = p.x; m.img.y = p.y + Math.sin(time / 150 + m.id) * 1.2 * p.scale;
      m.img.setDisplaySize(m.img.width * (h / m.img.height), h);
      m.img.setDepth(20 + p.p * 30);
      const bw = m.bar.width * p.scale;
      m.bar.bg.setPosition(p.x, m.img.y - h - 6).setSize(bw, 5 * p.scale + 2).setDepth(70);
      m.bar.fill.setPosition(p.x - bw / 2 + 1, m.img.y - h - 6)
        .setSize((bw - 2) * Math.max(0, m.hp / m.mhp), 3 * p.scale + 1).setDepth(71);
    }

    // heroes
    for (const w of this.warriors) {
      if (!w.deployed) continue;
      if (!this.plate) {
        const br = Math.sin(time / 620 + w.phase);
        let oy = br * 1.2, sy = 1 + br * 0.012;
        const el = time - w.atkAt;
        if (el >= 0 && el < 260) {
          const t = el / 260, push = Math.sin(t * Math.PI) * (1 - t * 0.35);
          oy -= push * 7; sy *= 1 + push * 0.05;
        }
        w.img.y = w.y + oy;
        w.img.scaleY = (132 / w.img.height) * sy;
      }
      w.cd -= dt;
      if (w.cd <= 0) {
        let best = null, bt = -1;
        for (const m of this.enemies) {        // focus the FURTHEST-advanced target in reach
          if (1 - m.t > w.range) continue;
          if (m.t > bt) { bt = m.t; best = m; }
        }
        if (best) { w.cd = w.spd; w.atkAt = time; this.fire(w, best); }
      }
    }

    // projectiles (travel up the lane in depth)
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i];
      pr.t -= pr.spd * dt / 1000;
      const tgt = this.enemies.find(m => m.id === pr.tid);
      if (!tgt || pr.t <= tgt.t) {
        if (tgt) { tgt.hp -= pr.dmg; this.burst(tgt, true, pr.tint); }
        pr.img.destroy(); this.projs.splice(i, 1); continue;
      }
      // drift laneX toward the target so shots track
      pr.laneX += (tgt.laneX - pr.laneX) * Math.min(1, dt / 240);
      const p = project(pr.t, pr.laneX);
      pr.img.setPosition(p.x, p.y - 20 * p.scale).setScale(p.scale * 1.7).setDepth(55);
    }

    if (time - (this._hud || 0) > 200) { this._hud = time; this.hudSync(); }
  }

  fire(w, target) {
    const col = Phaser.Display.Color.HexStringToColor(w.def.pc || '#ffffff').color;
    const p0 = project(0.97, w.laneX);
    const img = this.add.circle(p0.x, p0.y, 3.2, col).setBlendMode(Phaser.BlendModes.ADD);
    this.projs.push({ t: 0.97, laneX: w.laneX, spd: 1.6, tid: target.id,
                      dmg: this.heroAtk(w), img, tint: col });
  }

  burst(m, small, tint) {
    const p = project(m.t, m.laneX);
    const n = small ? 4 : 9;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = (18 + Math.random() * 40) * p.scale;
      const c = this.add.circle(p.x, p.y - 14 * p.scale, 2 * p.scale + 1, tint || 0xff6a3c)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(85);
      this.tweens.add({ targets: c, x: p.x + Math.cos(a) * sp, y: p.y - 14 * p.scale + Math.sin(a) * sp,
        alpha: 0, duration: 300, onComplete: () => c.destroy() });
    }
  }

  toast(txt, color) {
    const t = this.add.text(W / 2, 118, txt, { fontSize: '13px', fontStyle: 'bold', color: color || '#fff',
      stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(95);
    this.tweens.add({ targets: t, y: 96, alpha: 0, duration: 1600, ease: 'Cubic.Out', onComplete: () => t.destroy() });
  }

  finish(victory, msg) {
    if (this.over) return; this.over = true;
    this.hudSync(true);
    const ov = document.getElementById('endov');
    if (ov) {
      document.getElementById('end-title2').textContent = victory ? '🏆 VICTORY!' : '💀 DEFEATED';
      document.getElementById('end-msg').textContent = msg + '  ·  Wave ' + this.wave + '  ·  ' + this.kills + ' kills';
      ov.style.display = 'flex';
    }
  }

  togglePause() { if (this.scene.isPaused()) this.scene.resume(); else this.scene.pause(); return this.scene.isPaused(); }
  cycleSpeed() { this.speed = this.speed >= 2 ? 1 : this.speed + 1; return this.speed; }

  // ── HUD sync (HTML overlay) ──────────────────────────────────────────────
  hudSync(full) {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('hud-gold', this.gold); set('hud-gems', this.gems);
    set('hud-kills', this.waveKilled + ' / ' + this.waveTarget);
    set('hud-wave', 'WAVE ' + this.wave + ' / ' + MAX_WAVE);
    set('ef-hp', this.enemyFortress + ' / ' + FORT_MAX);
    set('yf-hp', this.yourFortress + ' / ' + FORT_MAX);
    const bar = (id, cur) => { const e = document.getElementById(id); if (e) e.style.width = (cur / FORT_MAX * 100) + '%'; };
    bar('ef-fill', this.enemyFortress); bar('yf-fill', this.yourFortress);
    set('elixnum', Math.floor(this.elixir));
    set('spell-n', this.spellCharges + '/3');
    const pips = document.querySelectorAll('#elixbar div');
    pips.forEach((d, i) => d.className = i < Math.floor(this.elixir) ? 'on' : '');
    if (full) this.warriors.forEach((w, i) => {
      set('cost-' + i, this.upCost(w));
      set('clvl-' + i, w.deployed ? 'Lv ' + w.lvl : 'SUMMON');
      if (w.badge) w.badge.setText(String(w.lvl));
    });
    set('lane-fps', Math.round(this.game.loop.actualFps) + ' FPS');
    set('lane-count', this.enemies.length + ' enemies');
  }
}
