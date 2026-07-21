// BattleScene — pure view/controller over systems/battle.js. It renders the
// simulation state each frame, plays FX from the battle's event queue, and
// forwards taps/drags as commands. No gameplay math lives here.

import { createBattle } from '../systems/battle.js';
import { applyMatchResult } from '../systems/progression.js';

const ARENA_Y = 40;

export default class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  create() {
    this.ctx = this.registry.get('ctx');
    const { data, collection, rng } = this.ctx;

    this.battle = createBattle({ data, teamInstances: collection.teamInstances(), rng });
    const S = this.battle.state;

    this.arena = this.add.container(0, ARENA_Y);
    this.drawArenaBackground(S);

    this.mobSprites = new Map();
    this.unitSprites = new Map();
    this.overlay = this.add.graphics();
    this.arena.add(this.overlay);
    this.msgTexts = [];
    this.ended = false;

    this.buildHud(S);
    this.buildTray();
    this.setupMergeDrag();
  }

  update(_t, delta) {
    if (this.ended) return;
    this.battle.update(delta);
    this.syncSprites();
    this.drawOverlay();
    this.refreshHud();
    for (const e of this.battle.drainEvents()) this.onEvent(e);
  }

  // ── event handling (FX only — logic already happened in the system) ────────
  onEvent(e) {
    switch (e.t) {
      case 'hit': this.flash(e.x, e.y, e.crit ? 10 : 4, e.crit ? '#ffffff' : e.col); break;
      case 'kill': this.flash(e.x, e.y, e.boss ? 22 : 8, '#ff6644'); break;
      case 'fx-ring': this.ring(e.x, e.y, e.r, e.col); break;
      case 'fx-bolt': this.bolt(e); break;
      case 'merge': this.flash(e.x, e.y, 14, '#ffd700'); break;
      case 'breach': this.message(e.mine ? `Enemy reached your base! -${e.dmg} HP` : `Enemy reached opponent base! -${e.dmg} HP`, e.mine ? '#ff9494' : '#7ec8ff'); break;
      case 'boss': this.message('⚠ BOSS INCOMING ⚠', '#ff5544'); break;
      case 'msg': this.message(e.text, e.col); break;
      case 'end': this.showEnd(e.victory); break;
    }
  }

  // ── sprite sync (pooled by entity id) ───────────────────────────────────────
  syncSprites() {
    const S = this.battle.state;
    const seenMobs = new Set(), seenUnits = new Set();
    const now = this.time.now;
    for (const side of [S.p1, S.p2]) {
      for (const m of side.mobs) {
        seenMobs.add(m.id);
        let sp = this.mobSprites.get(m.id);
        if (!sp) { sp = this.add.image(0, 0, 'mob_' + m.key).setScale(0.55); this.arena.add(sp); this.mobSprites.set(m.id, sp); }
        sp.setPosition(m.x, m.y + Math.sin(now / 130 + m.id * 1.7) * 1.5);
      }
      const ay = side === S.p1 ? S.AH : 0;
      for (const u of side.units) {
        seenUnits.add(u.uid);
        let sp = this.unitSprites.get(u.uid);
        if (!sp) { sp = this.add.image(0, 0, 'hero_' + u.defId).setScale(0.62); this.arena.add(sp); this.unitSprites.set(u.uid, sp); sp.setData('uid', u.uid); sp.setInteractive({ draggable: true, useHandCursor: true }); }
        if (!sp.getData('dragging')) sp.setPosition(u.x, u.y + ay - 8);
      }
    }
    for (const [id, sp] of this.mobSprites) if (!seenMobs.has(id)) { sp.destroy(); this.mobSprites.delete(id); }
    for (const [id, sp] of this.unitSprites) if (!seenUnits.has(id)) { sp.destroy(); this.unitSprites.delete(id); }
  }

  // ── overlay: pedestals, hp bars, unit plates, projectiles ───────────────────
  drawOverlay() {
    const g = this.overlay, S = this.battle.state;
    g.clear();
    for (const side of [S.p1, S.p2]) {
      const ay = side === S.p1 ? S.AH : 0;
      for (const u of side.units) {
        g.fillStyle(0x221b12, 1); g.fillEllipse(u.x, u.y + ay + 16, 30, 9);
        g.lineStyle(2, Phaser.Display.Color.HexStringToColor(u.col).color, 1);
        g.strokeEllipse(u.x, u.y + ay + 16, 30, 9);
        // team bar + star chip
        const friendly = side === S.p1;
        g.fillStyle(0x000000, 0.5); g.fillRect(u.x - 13, u.y + ay - 34, 26, 6);
        g.fillStyle(friendly ? 0x3b9dff : 0xff4d4d, 1); g.fillRect(u.x - 12, u.y + ay - 33, 24, 4);
        g.fillStyle(friendly ? 0x1e63c8 : 0xb3272d, 1); g.fillCircle(u.x - 16, u.y + ay - 31, 5);
      }
      for (const m of side.mobs) {
        const bw = m.radius * 2.6;
        g.fillStyle(0x000000, 0.6); g.fillRect(m.x - bw / 2, m.y - m.radius - 10, bw, 4);
        const frac = Math.max(0, m.hp / m.mhp);
        g.fillStyle(frac > 0.6 ? 0x22c55e : frac > 0.3 ? 0xfbbf24 : 0xef4444, 1);
        g.fillRect(m.x - bw / 2, m.y - m.radius - 10, bw * frac, 4);
        if (m.dot) { g.fillStyle(0x3ddc3d, 1); g.fillCircle(m.x - bw / 2 - 4, m.y - m.radius - 8, 2.5); }
        if (m.curse > 0) { g.fillStyle(0xb06aff, 1); g.fillCircle(m.x + bw / 2 + 4, m.y - m.radius - 8, 2.5); }
      }
    }
    for (const pj of S.projs) {
      const col = Phaser.Display.Color.HexStringToColor(pj.col).color;
      g.fillStyle(col, 0.25); g.fillCircle(pj.x, pj.y, 8);
      g.fillStyle(col, 1); g.fillCircle(pj.x, pj.y, 3.5);
    }
  }

  // ── one-shot FX ─────────────────────────────────────────────────────────────
  flash(x, y, r, colStr) {
    const col = Phaser.Display.Color.HexStringToColor(colStr).color;
    const c = this.add.circle(x, y + ARENA_Y, r, col, 0.8);
    this.tweens.add({ targets: c, alpha: 0, scale: 1.8, duration: 260, onComplete: () => c.destroy() });
  }

  ring(x, y, r, colStr) {
    const col = Phaser.Display.Color.HexStringToColor(colStr).color;
    const c = this.add.circle(x, y + ARENA_Y, r, col, 0).setStrokeStyle(2, col, 0.9);
    this.tweens.add({ targets: c, alpha: 0, scale: 1.4, duration: 300, onComplete: () => c.destroy() });
  }

  bolt(e) {
    const col = Phaser.Display.Color.HexStringToColor(e.col).color;
    const g = this.add.graphics().setY(ARENA_Y);
    g.lineStyle(2, col, 1);
    const mx = (e.x1 + e.x2) / 2 + 4, my = (e.y1 + e.y2) / 2 - 4;
    g.beginPath(); g.moveTo(e.x1, e.y1); g.lineTo(mx, my); g.lineTo(e.x2, e.y2); g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  message(text, colStr) {
    const S = this.battle.state;
    const t = this.add.text(S.W / 2, ARENA_Y + S.AH, text, {
      fontSize: 11, fontStyle: 'bold', color: colStr, backgroundColor: '#161310', padding: { x: 10, y: 4 },
    }).setOrigin(0.5).setDepth(50);
    this.msgTexts.push(t);
    this.msgTexts.forEach((m, i) => m.setY(ARENA_Y + S.AH - (this.msgTexts.length - 1 - i) * 20));
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 500, onComplete: () => { t.destroy(); this.msgTexts = this.msgTexts.filter(x => x !== t); } });
  }

  // ── HUD + tray ──────────────────────────────────────────────────────────────
  buildHud(S) {
    this.add.rectangle(S.W / 2, 20, S.W, 40, 0x130b02);
    this.hudText = this.add.text(10, 12, '', { fontSize: 11, fontStyle: 'bold', color: '#d4a017' });
  }

  refreshHud() {
    const S = this.battle.state;
    const timer = S.boss ? `+${Math.floor(S.surv)}s` : Math.ceil(S.timer);
    this.hudText.setText(`🌊 ${S.wave}${S.boss ? '/∞' : ''}   💀 ${S.p1.kills}   ⏱ ${timer}   ❤️ ${S.p1.hp}   🔵 ${S.p2.hp}   🪙 ${S.p1.gold}`);
    this.trayEntries.forEach((t, i) => t.cost.setText(this.battle.summonCost() === 0 ? 'FREE' : '🪙' + this.battle.summonCost()));
  }

  buildTray(){
    const S = this.battle.state;
    const y = ARENA_Y + S.H + 60;
    this.add.rectangle(S.W / 2, y + 10, S.W, 160, 0x130b02);
    this.trayEntries = [];
    this.battle.trayDefs.forEach((entry, i) => {
      const x = 40 + i * 62;
      const r = this.add.rectangle(x, y, 54, 62, 0x22364f).setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(entry.def.col).color).setInteractive({ useHandCursor: true });
      this.add.image(x, y - 8, 'hero_' + entry.def.id).setScale(0.5);
      const cost = this.add.text(x, y + 22, '', { fontSize: 9, fontStyle: 'bold', color: '#ffd700' }).setOrigin(0.5);
      r.on('pointerdown', () => this.battle.summonFromTray(i));
      this.trayEntries.push({ cost });
    });
    const skip = this.add.rectangle(S.W - 60, y + 46, 100, 26, 0xd4a017).setInteractive({ useHandCursor: true });
    this.add.text(S.W - 60, y + 46, 'Next Wave ›', { fontSize: 11, fontStyle: 'bold', color: '#241a04' }).setOrigin(0.5);
    skip.on('pointerdown', () => this.battle.skipWave());
    this.add.text(14, y + 40, 'drag a warrior onto a same-color\nwarrior of equal ★ to merge', { fontSize: 8, color: '#a07830' });
  }

  // drag one of your units onto another to merge (command → system decides)
  setupMergeDrag() {
    this.input.on('dragstart', (_p, obj) => obj.setData('dragging', true));
    this.input.on('drag', (_p, obj, x, y) => obj.setPosition(x, y));
    this.input.on('dragend', (p, obj) => {
      obj.setData('dragging', false);
      const S = this.battle.state;
      const lx = p.x, ly = p.y - ARENA_Y;
      for (const u of S.p1.units) {
        if (u.uid === obj.getData('uid')) continue;
        if (Math.hypot(u.x - lx, u.y + S.AH - ly) < 26) { this.battle.tryMerge(obj.getData('uid'), u.uid); break; }
      }
    });
  }

  // ── arena background (drawn once) ───────────────────────────────────────────
  drawArenaBackground(S) {
    const g = this.add.graphics();
    this.arena.add(g);
    const M = 8, PC = S.WL - this.ctx.data.balance.arena.pathInset;
    for (const flip of [false, true]) {
      const oy = flip ? S.AH : 0;
      g.fillStyle(0x79b94c, 1); g.fillRect(0, oy, S.W, S.AH);
      g.fillStyle(0xffffff, 0.07);
      for (let sy = 0; sy < S.AH; sy += 26) g.fillRect(0, oy + sy, S.W, 13);
      g.fillStyle(0xe3cc93, 1); g.fillRect(M, oy + M, S.W - M * 2, S.AH - M * 2);
      // checker field
      const tw = S.IW / 4, th = S.IH / 4;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        g.fillStyle((c + r) % 2 ? 0x94d264 : 0x7ec24e, 1);
        g.fillRect(S.WL + c * tw, oy + S.WL + r * th, tw, th);
      }
      g.lineStyle(3, 0x000000, 0.25); g.strokeRect(S.WL, oy + S.WL, S.IW, S.IH);
      // portals
      const gy = flip ? oy + S.AH - PC : oy + PC;
      g.fillStyle(0x55e055, 0.5); g.fillCircle(PC, gy, 12);
      g.fillStyle(0x0c2a06, 1); g.fillEllipse(PC, gy, 9, 6);
      g.fillStyle(0xffd84a, 0.9); g.fillCircle(S.W - PC, gy, 10);
    }
    // river + bridge
    g.fillStyle(0x3fa9f5, 1); g.fillRect(0, S.AH - 8, S.W, 16);
    g.fillStyle(0xb5763b, 1); g.fillRect(S.W / 2 - 24, S.AH - 10, 48, 20);
    g.lineStyle(2, 0x6e421c, 1); g.strokeRect(S.W / 2 - 24, S.AH - 10, 48, 20);
  }

  // ── end panel: hand results to the progression system, show summary ─────────
  showEnd(victory) {
    this.ended = true;
    const summary = applyMatchResult(this.ctx.data.progression, this.ctx.collection, this.battle.result());
    const S = this.battle.state, W = S.W;
    const dim = this.add.rectangle(W / 2, 350, W, 700, 0x000000, 0.85).setDepth(100).setInteractive();
    dim.on('pointerup', () => this.scene.start('Menu'));   // tap anywhere to continue
    this.add.text(W / 2, 250, victory ? '🏆 VICTORY!' : '💀 DEFEATED', { fontSize: 30, fontStyle: 'bold', color: victory ? '#ffd700' : '#ff5544' }).setOrigin(0.5).setDepth(101);
    const r = this.battle.result();
    const ups = summary.levelUps.map(u => `${u.name} → Lv${u.lvl}`).join(', ');
    this.add.text(W / 2, 330,
      `Kills ${r.kills} · Wave ${r.wave} · Survived +${r.surv}s\n\n+${summary.xpTotal} XP from kills\n+${summary.goldEarn} 🪙 for the market${ups ? '\n⬆ ' + ups : ''}`,
      { fontSize: 13, color: '#d4a017', align: 'center' }).setOrigin(0.5).setDepth(101);
    const btn = this.add.rectangle(W / 2, 450, 200, 44, 0xd4a017).setDepth(101).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, 450, 'Continue →', { fontSize: 15, fontStyle: 'bold', color: '#241a04' }).setOrigin(0.5).setDepth(102);
    btn.on('pointerdown', () => this.scene.start('Menu'));
  }
}
