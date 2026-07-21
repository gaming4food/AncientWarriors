// MarketScene — gacha. Minting/rolling logic lives in collection/stats systems.

import { warriorStats } from '../systems/stats.js';

export default class MarketScene extends Phaser.Scene {
  constructor() { super('Market'); }

  create() {
    this.ctx = this.registry.get('ctx');
    const W = this.scale.width;

    const back = this.add.text(14, 20, '‹', { fontSize: 26, color: '#ffd700', fontStyle: 'bold' }).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start('Menu'));
    this.add.text(38, 24, 'Warriors Market', { fontSize: 19, fontStyle: 'bold', color: '#ffd700' });
    this.goldText = this.add.text(W - 14, 26, '', { fontSize: 12, color: '#d4a017' }).setOrigin(1, 0);

    this.add.rectangle(W / 2, 250, 260, 220, 0x1d1812).setStrokeStyle(2, 0x3a2a0a);
    this.add.text(W / 2, 175, '❓', { fontSize: 52 }).setOrigin(0.5);
    this.add.text(W / 2, 225, 'Recruit a Warrior', { fontSize: 18, fontStyle: 'bold', color: '#ffd700' }).setOrigin(0.5);
    this.add.text(W / 2, 270, 'Every recruit is a Level 1 copy with\nindividually rolled stats and rarity.\nHunt the Legendary!',
      { fontSize: 11, color: '#a07830', align: 'center' }).setOrigin(0.5);

    const cost = this.ctx.data.balance.economy.gachaCost;
    const btn = this.add.rectangle(W / 2, 330, 180, 40, 0xd4a017).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, 330, `🪙 ${cost.toLocaleString()} — RECRUIT`, { fontSize: 14, fontStyle: 'bold', color: '#241a04' }).setOrigin(0.5);
    btn.on('pointerdown', () => this.buy());

    this.reveal = this.add.container(0, 0).setVisible(false);
    this.refresh();
  }

  refresh() { this.goldText.setText(`🪙 ${this.ctx.collection.gold.toLocaleString()}`); }

  buy() {
    const inst = this.ctx.collection.buyRecruit();
    this.refresh();
    if (!inst) return;
    const { data, collection } = this.ctx;
    const def = collection.defById(inst.id);
    const st = warriorStats(def, inst, data.progression, data.rarity);

    this.reveal.removeAll(true);
    const W = this.scale.width;
    const dim = this.add.rectangle(W / 2, 350, W, 700, 0x000000, 0.85).setInteractive();
    dim.on('pointerdown', () => this.reveal.setVisible(false));
    this.reveal.add(dim);
    this.reveal.add(this.add.rectangle(W / 2, 330, 240, 240, 0x1d1812).setStrokeStyle(2, 0xd4a017));
    this.reveal.add(this.add.image(W / 2, 280, 'hero_' + inst.id).setScale(1.2));
    this.reveal.add(this.add.text(W / 2, 340, inst.rarity, { fontSize: 12, fontStyle: 'bold', color: data.rarity.colors[inst.ri] }).setOrigin(0.5));
    this.reveal.add(this.add.text(W / 2, 362, inst.name, { fontSize: 18, fontStyle: 'bold', color: '#ffd700' }).setOrigin(0.5));
    this.reveal.add(this.add.text(W / 2, 386, `⚔${st.atk}  ⚡${(1000 / st.spd).toFixed(1)}/s  🎯${st.range}`, { fontSize: 12, color: '#fff' }).setOrigin(0.5));
    this.reveal.add(this.add.text(W / 2, 408, def.abd, { fontSize: 9, color: '#7ec8ff', wordWrap: { width: 220 }, align: 'center' }).setOrigin(0.5));
    this.reveal.add(this.add.text(W / 2, 470, 'tap anywhere to continue', { fontSize: 10, color: '#a07830' }).setOrigin(0.5));
    this.reveal.setVisible(true);
  }
}
