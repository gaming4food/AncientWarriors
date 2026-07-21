// CollectionScene — My Warriors. The scene only renders collection state and
// forwards commands (team select, enhance target, sacrifice) to the
// collection system; every formula shown comes from the systems layer.

import { warriorStats, highRolls } from '../systems/stats.js';
import { xpNeed, sacrificeXp } from '../systems/progression.js';

export default class CollectionScene extends Phaser.Scene {
  constructor() { super('Collection'); }

  create() {
    this.ctx = this.registry.get('ctx');
    this.selected = new Set(this.ctx.collection.team);
    this.enhanceTarget = null;
    this.scrollY = 0;
    this.buildUI();

    this.input.on('wheel', (_p, _o, _dx, dy) => this.scroll(dy * 0.5));
    let dragY = null;
    this.input.on('pointerdown', p => { dragY = p.y; });
    this.input.on('pointermove', p => {
      if (dragY !== null && p.isDown) { this.scroll(dragY - p.y); dragY = p.y; }
    });
    this.input.on('pointerup', () => { dragY = null; });
  }

  scroll(dy) {
    this.scrollY = Phaser.Math.Clamp(this.scrollY + dy, 0, Math.max(0, this.contentH - 560));
    this.cardLayer.y = 88 - this.scrollY;
  }

  buildUI() {
    if (this.cardLayer) this.cardLayer.destroy(true);
    if (this.hud) this.hud.destroy(true);
    const { collection } = this.ctx;
    const W = this.scale.width;

    this.hud = this.add.container(0, 0);
    const back = this.add.text(14, 20, '‹', { fontSize: 26, color: '#ffd700', fontStyle: 'bold' }).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start('Menu'));
    this.hud.add(back);
    this.hud.add(this.add.text(38, 24, 'My Warriors', { fontSize: 19, fontStyle: 'bold', color: '#ffd700' }));
    this.hud.add(this.add.text(W - 14, 26, `🪙 ${collection.gold.toLocaleString()}  👥 ${this.selected.size}/5`, { fontSize: 12, color: '#d4a017' }).setOrigin(1, 0));
    this.hud.add(this.add.rectangle(W / 2, 60, W, 1, 0x2e2618));
    if (this.enhanceTarget) {
      const tgt = collection.find(this.enhanceTarget);
      this.hud.add(this.add.text(W / 2, 72, `Feeding into ${tgt ? tgt.name : '?'} — tap a Feed button (tap target again to cancel)`,
        { fontSize: 9, color: '#7ee06a' }).setOrigin(0.5, 0));
    }

    this.cardLayer = this.add.container(0, 88 - this.scrollY);
    const sorted = [...collection.roster].sort((a, b) => (b.ri - a.ri) || (b.lvl - a.lvl));
    const CW = 172, CH = 210;
    sorted.forEach((inst, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      this.cardLayer.add(this.buildCard(inst, 8 + col * (CW + 8), row * (CH + 8), CW, CH));
    });
    this.contentH = Math.ceil(sorted.length / 2) * (CH + 8) + 100;
  }

  buildCard(inst, x, y, CW, CH) {
    const { collection, data } = this.ctx;
    const def = collection.defById(inst.id);
    const st = warriorStats(def, inst, data.progression, data.rarity);
    const need = xpNeed(data.progression, inst.lvl);
    const inTeam = this.selected.has(inst.iid);
    const isTarget = this.enhanceTarget === inst.iid;

    const c = this.add.container(x, y);
    const bgCol = isTarget ? 0x1b2a14 : inTeam ? 0x211a0e : 0x1d1812;
    const border = isTarget ? 0x7ee06a : inTeam ? 0xd4a017 : 0x2e2618;
    const bg = this.add.rectangle(CW / 2, CH / 2, CW, CH, bgCol).setStrokeStyle(2, border).setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.toggleTeam(inst.iid));
    c.add(bg);

    c.add(this.add.text(CW - 8, 8, inst.rarity, { fontSize: 9, fontStyle: 'bold', color: data.rarity.colors[inst.ri] }).setOrigin(1, 0));
    c.add(this.add.image(CW / 2, 46, 'hero_' + inst.id).setScale(0.9));
    c.add(this.add.text(CW / 2, 90, inst.name, { fontSize: 14, fontStyle: 'bold', color: '#ffd700' }).setOrigin(0.5, 0));
    c.add(this.add.text(8, 108, `Lv. ${inst.lvl}`, { fontSize: 9, fontStyle: 'bold', color: '#d4a017' }));
    c.add(this.add.text(CW - 8, 108, `${inst.xp} / ${need} XP`, { fontSize: 9, color: '#a07830' }).setOrigin(1, 0));
    // xp bar
    c.add(this.add.rectangle(CW / 2, 124, CW - 16, 5, 0x0d0a06).setStrokeStyle(1, 0x2e2618));
    const pct = Math.min(1, inst.xp / need);
    if (pct > 0) c.add(this.add.rectangle(8, 124, (CW - 16) * pct, 3, 0xffd700).setOrigin(0, 0.5));
    // stats
    c.add(this.add.text(CW / 2, 134, `⚔${st.atk.toLocaleString()}  ⚡${(1000 / st.spd).toFixed(1)}/s  🎯${st.range}`,
      { fontSize: 10, fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5, 0));
    c.add(this.add.text(CW / 2, 149, `${def.role} · ${def.cls}`, { fontSize: 8, color: '#c8a24a' }).setOrigin(0.5, 0));
    c.add(this.add.text(CW / 2, 160, def.abd, { fontSize: 8, color: '#7ec8ff', wordWrap: { width: CW - 14 }, align: 'center' }).setOrigin(0.5, 0));
    const rolls = highRolls(inst);
    if (rolls.length) c.add(this.add.text(CW / 2, 178, '💎 high roll: ' + rolls.join(' '), { fontSize: 8, color: '#9ee060' }).setOrigin(0.5, 0));

    // enhance / feed button
    let label, cb;
    if (isTarget) { label = '✕ Cancel'; cb = () => { this.enhanceTarget = null; this.buildUI(); }; }
    else if (this.enhanceTarget) {
      label = `⚗ Feed +${sacrificeXp(data.progression, inst)} XP`;
      cb = () => this.doSacrifice(inst.iid);
    } else { label = '⬆ Enhance'; cb = () => { this.enhanceTarget = inst.iid; this.buildUI(); }; }
    const btn = this.add.rectangle(CW / 2, CH - 14, CW - 16, 20, 0x152a10).setStrokeStyle(1, 0x3f7a2e).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', e => { e.event?.stopPropagation?.(); cb(); });
    c.add(btn);
    c.add(this.add.text(CW / 2, CH - 14, label, { fontSize: 10, fontStyle: 'bold', color: '#7ee06a' }).setOrigin(0.5));
    return c;
  }

  toggleTeam(iid) {
    if (this.enhanceTarget) return;                 // taps select feed targets in enhance mode
    if (this.selected.has(iid)) this.selected.delete(iid);
    else if (this.selected.size < 5) this.selected.add(iid);
    if (this.selected.size === 5) this.ctx.collection.setTeam([...this.selected]);
    this.buildUI();
  }

  doSacrifice(sacIid) {
    if (sacIid === this.enhanceTarget) return;
    const res = this.ctx.collection.sacrifice(this.enhanceTarget, sacIid);
    if (res) {
      this.selected.delete(sacIid);
      if (this.selected.size === 5) this.ctx.collection.setTeam([...this.selected]);
    }
    this.buildUI();
  }
}
