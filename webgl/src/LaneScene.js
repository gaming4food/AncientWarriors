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
const MAX_STACK = 5;   // reinforcements per platform (elixir is the allowance)
const MAX_RANK = 3;    // ascension tiers: fuse a full ×5 stack into one stronger elite
const RANK_MULT = [1, 5, 22];        // per-shot attack multiplier by rank (1..3)
const RANK_STARS = ['', '★', '★★'];   // stars shown for ascended ranks (rank 2,3)
// Signature ability unlocked at ascension (rank ≥ 2), scaling with rank.
const ABILITY_NAME = { twin: 'Twin Arrows', inspire: 'Inspire', chain: 'Chain Lightning',
                       cleave: 'Cleave', venom: 'Venom' };

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
      // clean full scene with the five painted platforms — heroes summon onto them
      const src = this.textures.get('corridor').getSourceImage();
      const s = Math.max(W / src.width, H / src.height);
      const dw = src.width * s, dh = src.height * s;
      this.add.image(W / 2, H / 2, 'corridor').setDisplaySize(dw, dh).setDepth(0);
      this.paintedPlatforms = true;
      const offX = (W - dw) / 2;                     // map normalized image coords -> canvas
      this.px = nx => nx * dw + offX;
      this.py = ny => ny * dh + (H - dh) / 2;
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
  // Platform slots — painted octagons on the clean corridor (2 back + 3 front),
  // matched to the squad order [Robin, Joan, Merlin, Viking, Cleopatra].
  // Each: normalized image centre + sprite height (back row further -> smaller).
  slotLayout() {
    const P = [
      { nx: 0.175, ny: 0.792, h: 122 },   // Robin  — front-left
      { nx: 0.308, ny: 0.652, h: 104 },   // Joan   — back-left
      { nx: 0.500, ny: 0.804, h: 130 },   // Merlin — front-centre
      { nx: 0.669, ny: 0.652, h: 104 },   // Viking — back-right
      { nx: 0.792, ny: 0.792, h: 122 },   // Cleo   — front-right
    ];
    if (this.paintedPlatforms) return P.map(p => ({ x: this.px(p.nx), y: this.py(p.ny), h: p.h }));
    // procedural fallback: a single row
    const lanes = [-0.78, -0.39, 0, 0.39, 0.78];
    return lanes.map(lx => { const p = project(1, lx); return { x: p.x, y: p.y + 26, h: 132 }; });
  }

  deploySquad() {
    this.warriors = [];
    const slots = this.slotLayout();
    this.squadDefs.forEach((def, i) => {
      const S = slots[i];
      // a subtle glow that lights the painted octagon when the hero is fielded
      const plat = this.add.container(S.x, S.y).setDepth(48);
      const disc = this.add.ellipse(0, -2, S.h * 0.62, S.h * 0.24, 0xffe9a0, 0.14)
        .setStrokeStyle(2, 0xffe9a0, 0.55).setBlendMode(Phaser.BlendModes.ADD);
      plat.add(disc); plat.setAlpha(0);
      const key = this.textures.exists('b' + def.id) ? 'b' + def.id : 'w' + def.id;
      const img = this.add.image(S.x, S.y, key).setOrigin(0.5, 1);
      img.setDisplaySize(img.width * (S.h / img.height), S.h);
      this.warriorLayer.add(img);
      const w = { def, img, plat, i, x: S.x, y: S.y, baseH: S.h, slotH: S.h, texKey: key,
                  deployed: this.plate,
                  count: this.plate ? 1 : 0, rank: 1,
                  cost: [2, 3, 3, 4, 3][i],
                  cd: 0, spd: def.aspd * 0.55, range: 0.9,
                  phase: Math.random() * 6.28, atkAt: -1e9, flankers: [] };
      w.badge = this.add.text(S.x, S.y - S.h - 6, '×1',
        { fontSize: '11px', color: '#fff', fontStyle: 'bold',
          backgroundColor: '#7a3a10', padding: { x: 5, y: 2 } }).setOrigin(0.5, 0).setDepth(70);
      // the octagon itself is tappable to summon/reinforce
      const hit = this.add.zone(S.x, S.y - S.h * 0.4, S.h * 0.7, S.h * 1.1).setOrigin(0.5, 0.5)
        .setInteractive().setDepth(90);
      hit.on('pointerdown', () => this.cardTap(i));
      w.hit = hit;
      if (this.plate) { img.setVisible(false); w.badge.setVisible(false); }
      else if (!w.deployed) { img.setVisible(false); w.badge.setVisible(false); }
      else if (w.count <= 1) w.badge.setVisible(false);
      this.warriors.push(w);
    });
  }

  // per-warrior attack, scaled by ascension rank (quantity via count, quality via rank)
  heroAtk(w) { return Math.round(w.def.atk * 3 * RANK_MULT[w.rank - 1]); }
  // rising reinforcement cost: base + units already fielded (per rank)
  upCost(w) { return w.deployed ? w.cost + w.count : w.cost; }
  // ascension cost: fuse a full ×5 stack into a rank-up elite (bigger commitment)
  ascendCost(w) { return 6 + w.rank * 2; }
  canAscend(w) { return w.deployed && w.count >= MAX_STACK && w.rank < MAX_RANK; }

  // card tap / warrior click: summon → reinforce (×5) → ASCEND (rank up) → reinforce again…
  cardTap(i) {
    if (this.over) return 'over';
    const w = this.warriors[i];
    // full stack + can rank up → this action ascends instead of reinforcing
    if (this.canAscend(w)) return this.ascend(w);
    if (w.deployed && w.count >= MAX_STACK) { this.toast(w.def.name + ' is fully ascended!', '#ffd24a'); return 'max'; }
    const cost = this.upCost(w);
    if (this.elixir < cost) { this.toast('Need ' + cost + ' elixir!', '#7ec8ff'); return 'poor'; }
    this.elixir -= cost;
    if (!w.deployed) {
      w.deployed = true; w.count = 1;
      if (!this.plate) { w.img.setVisible(true); w.img.setDepth(w.y); w.plat.setAlpha(0.55); }
      this.summonFx(w);
      this.toast(w.def.name + ' takes the field!', '#ffd24a');
    } else {
      w.count++;
      this.addFlanker(w);
      this.updateBadge(w);
      this.summonFx(w);
      this.toast(w.def.name + ' ×' + w.count + '  reinforced!', '#8be06a');
    }
    this.hudSync(true);
    return 'ok';
  }

  // ASCENSION — fuse the five stacked warriors into one stronger elite (rank up),
  // unlocking / strengthening the hero's signature ability. The merge payoff.
  ascend(w) {
    const cost = this.ascendCost(w);
    if (this.elixir < cost) { this.toast('Ascend needs ' + cost + ' elixir!', '#c8a24a'); return 'poor'; }
    this.elixir -= cost;
    w.rank++; w.count = 1;
    // the five figures collapse into a single, larger elite
    w.flankers.forEach(f => f.img.destroy()); w.flankers = [];
    w.baseH = Math.round(w.slotH * (1 + 0.14 * (w.rank - 1)));
    if (!this.plate) { w.img.setDisplaySize(w.img.width * (w.baseH / w.img.height), w.baseH); w.img.setTint(this.rankTint(w.rank)); }
    this.ascendFx(w);
    this.updateBadge(w);
    const ab = ABILITY_NAME[w.def.ab];
    this.toast('⭐ ' + w.def.name + ' ASCENDED — ' + RANK_STARS[w.rank - 1] + (ab ? '  ' + ab + '!' : ''), '#ffd24a');
    this.hudSync(true);
    return 'ok';
  }

  rankTint(rank) { return rank >= 3 ? 0xffe0a0 : rank === 2 ? 0xd8f0ff : 0xffffff; }

  updateBadge(w) {
    const stars = RANK_STARS[w.rank - 1];
    const txt = (stars ? stars + ' ' : '') + '×' + w.count;
    w.badge.setVisible(!this.plate && (w.rank > 1 || w.count > 1)).setText(txt)
      .setBackgroundColor(w.rank >= 3 ? '#8a5a10' : w.rank === 2 ? '#2a4a7a' : '#7a3a10');
  }

  ascendFx(w) {
    this.cameras.main.flash(160, 255, 230, 160, false);
    const ring = this.add.ellipse(w.x, w.y, 90, 34).setStrokeStyle(4, 0xffe9a0, 1)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(88);
    this.tweens.add({ targets: ring, scaleX: 2.6, scaleY: 2.6, alpha: 0, duration: 560, onComplete: () => ring.destroy() });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.28, c = this.add.circle(w.x, w.y - w.baseH * 0.4, 3, 0xffe9a0)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(89);
      this.tweens.add({ targets: c, x: w.x + Math.cos(a) * 48, y: w.y - w.baseH * 0.4 + Math.sin(a) * 30,
        alpha: 0, duration: 620, onComplete: () => c.destroy() });
    }
  }

  // add a small flanking warrior figure so the squad visibly grows
  addFlanker(w) {
    if (this.plate) return;                         // painted plate can't add figures
    const slot = w.count - 2;                        // 0..3 for units 2..5
    const k = w.baseH / 132;                          // scale offsets to this platform's size
    const off = [[-24, 3], [24, 3], [-13, -4], [13, -4]][slot] || [0, 0];
    const ox = off[0] * k, oy = off[1] * k, fh = w.baseH * 0.72;
    const f = this.add.image(w.x + ox, w.y + oy, w.texKey).setOrigin(0.5, 1);
    f.setDisplaySize(f.width * (fh / f.height), fh).setDepth(w.y - 1);
    this.warriorLayer.add(f);
    w.flankers.push({ img: f, ox, oy, fh });
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

    // Inspire aura (Joan, ascended): all heroes fire faster
    this.fireBoost = 1;
    for (const o of this.warriors)
      if (o.deployed && o.def.ab === 'inspire' && o.rank >= 2)
        this.fireBoost = Math.min(this.fireBoost, 1 - 0.16 * (o.rank - 1));

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
        w.img.scaleY = (w.baseH / w.img.height) * sy;
        // flankers breathe with a phase offset so the squad feels alive
        w.flankers.forEach((f, k) => { f.img.y = w.y + f.oy + Math.sin(time / 620 + w.phase + k) * 1.0; });
      }
      w.cd -= dt;
      if (w.cd <= 0) {
        let best = null, bt = -1;
        for (const m of this.enemies) {        // focus the FURTHEST-advanced target in reach
          if (1 - m.t > w.range) continue;
          if (m.t > bt) { bt = m.t; best = m; }
        }
        if (best) {
          w.cd = w.spd * this.fireBoost; w.atkAt = time;
          // Twin Arrows (Robin, ascended): +1 extra shot per rank above 1
          const twinBonus = (w.def.ab === 'twin' && w.rank >= 2) ? (w.rank - 1) : 0;
          const shots = w.count + twinBonus;
          // ONE volley per stacked warrior — more warriors = more shots (staggered)
          for (let u = 0; u < shots; u++) {
            const ox = (u - (shots - 1) / 2) * 11;   // px spread across the squad
            this.time.delayedCall(u * 55, () => { if (!this.over) this.fire(w, best, ox); });
          }
        }
      }
    }

    // enemy poison ticks (Cleopatra's Venom)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const m = this.enemies[i];
      if (m.poison > 0) { m.hp -= m.poison * dt / 1000; m.poisonLeft -= dt; if (m.poisonLeft <= 0) m.poison = 0; }
    }

    // projectiles — screen-space homing from the hero's platform to the target
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i];
      const tgt = this.enemies.find(m => m.id === pr.tid);
      if (!tgt) { pr.img.destroy(); this.projs.splice(i, 1); continue; }
      const tp = project(tgt.t, tgt.laneX);
      const tx = tp.x, ty = tp.y - tgt.baseH * tp.scale * 0.5;
      const dx = tx - pr.x, dy = ty - pr.y, d = Math.hypot(dx, dy) || 1;
      if (d < 14) { tgt.hp -= pr.dmg; this.onHit(pr, tgt, tx, ty); pr.img.destroy(); this.projs.splice(i, 1); continue; }
      const step = pr.spd * dt / 1000;
      pr.x += dx / d * step; pr.y += dy / d * step;
      pr.img.setPosition(pr.x, pr.y);
    }

    if (time - (this._hud || 0) > 200) { this._hud = time; this.hudSync(); }
  }

  fire(w, target, ox) {
    if (!this.enemies.includes(target)) return;   // target may have died during the stagger
    const col = Phaser.Display.Color.HexStringToColor(w.def.pc || '#ffffff').color;
    const sx = w.x + (ox || 0), sy = w.y - w.baseH * 0.55;
    const r = (w.rank >= 2 && w.def.ab === 'chain') ? 4.4 : 3.6;
    const img = this.add.circle(sx, sy, r, col).setBlendMode(Phaser.BlendModes.ADD).setDepth(56);
    this.fxLayer.add(img);
    // ability rides on the projectile; only active once ascended (rank ≥ 2)
    const ab = w.rank >= 2 ? w.def.ab : null;
    this.projs.push({ x: sx, y: sy, spd: 560, tid: target.id, dmg: this.heroAtk(w), img, tint: col, ab, rank: w.rank });
  }

  // Signature on-hit effects (rank ≥ 2)
  onHit(pr, tgt, hx, hy) {
    this.burst(tgt, true, pr.tint);
    if (pr.ab === 'chain') {                 // Merlin: arc to nearby enemies
      const jumps = pr.rank;                 // 2 at rank2, 3 at rank3
      let from = tgt, hit = new Set([tgt.id]);
      for (let j = 0; j < jumps; j++) {
        let nx = null, nd = 1e9; const fp = project(from.t, from.laneX);
        for (const m of this.enemies) {
          if (hit.has(m.id) || m.hp <= 0) continue;
          const mp = project(m.t, m.laneX), dd = Math.hypot(mp.x - fp.x, mp.y - fp.y);
          if (dd < 90 && dd < nd) { nd = dd; nx = m; }
        }
        if (!nx) break;
        hit.add(nx.id); nx.hp -= Math.round(pr.dmg * 0.5); this.burst(nx, true, 0x8fd8ff);
        const a = project(from.t, from.laneX), b = project(nx.t, nx.laneX);
        this.bolt(a.x, a.y - 12, b.x, b.y - 12);
        from = nx;
      }
    } else if (pr.ab === 'cleave') {         // Viking: splash around the target
      const rad = 34 + pr.rank * 10;
      for (const m of this.enemies) {
        if (m.id === tgt.id || m.hp <= 0) continue;
        const mp = project(m.t, m.laneX);
        if (Math.hypot(mp.x - hx, mp.y - hy) < rad) { m.hp -= Math.round(pr.dmg * 0.5); this.burst(m, true, pr.tint); }
      }
      const ring = this.add.circle(hx, hy, 6, pr.tint, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(82);
      this.tweens.add({ targets: ring, scale: rad / 6, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
    } else if (pr.ab === 'venom') {          // Cleopatra: poison over time
      tgt.poison = Math.round(pr.dmg * (0.2 + 0.1 * pr.rank)); tgt.poisonLeft = 2200;
    }
  }

  bolt(x1, y1, x2, y2) {
    const g = this.add.graphics().setDepth(83).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(2, 0x8fd8ff, 1); g.beginPath(); g.moveTo(x1, y1);
    g.lineTo((x1 + x2) / 2 + (Math.random() * 8 - 4), (y1 + y2) / 2 + (Math.random() * 8 - 4));
    g.lineTo(x2, y2); g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
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
      const stars = RANK_STARS[w.rank - 1];
      let label, cost, maxed = false, ascend = false;
      if (!w.deployed) { label = 'SUMMON'; cost = w.cost; }
      else if (this.canAscend(w)) { label = '⭐ ASCEND'; cost = this.ascendCost(w); ascend = true; }
      else if (w.count >= MAX_STACK) { label = 'MAX ' + stars; cost = '—'; maxed = true; }
      else { label = (stars ? stars + ' ' : '') + '×' + w.count + ' · +1'; cost = this.upCost(w); }
      set('clvl-' + i, label); set('cost-' + i, cost);
      const card = document.getElementById('card-' + i);
      if (card) { card.classList.toggle('maxed', maxed); card.classList.toggle('ascend', ascend); }
    });
    set('lane-fps', Math.round(this.game.loop.actualFps) + ' FPS');
    set('lane-count', this.enemies.length + ' enemies');
  }
}
