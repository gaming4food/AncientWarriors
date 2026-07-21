// MenuScene — pure presentation; reads collection summary from systems.

export default class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const { collection, data } = this.registry.get('ctx');
    const W = this.scale.width;

    this.add.text(W / 2, 90, 'ANCIENT WARRIORS', { fontFamily: 'Arial Black', fontSize: 24, color: '#ffd700' }).setOrigin(0.5);
    this.add.text(W / 2, 118, 'LEGENDS OF BATTLE · PHASER PROTOTYPE', { fontSize: 9, color: '#a07830', letterSpacing: 4 }).setOrigin(0.5);

    // sample heroes
    [0, 4, 15].forEach((id, i) => {
      this.add.image(W / 2 + (i - 1) * 90, 200, 'hero_' + id).setScale(1);
    });

    this.add.text(W / 2, 265, `🪙 ${collection.gold.toLocaleString()}   ⭐ ${collection.glory}   👥 ${collection.roster.length} warriors`,
      { fontSize: 12, color: '#d4a017' }).setOrigin(0.5);

    this.menuButton(330, '⚔ ENTER BATTLE', '#ffd700', '#241a04', () => this.scene.start('Battle'));
    this.menuButton(395, '🛡 My Warriors', '#d4a017', null, () => this.scene.start('Collection'));
    this.menuButton(450, '🏺 Warriors Market', '#d4a017', null, () => this.scene.start('Market'));
  }

  menuButton(y, label, color, bg, cb) {
    const W = this.scale.width;
    const r = this.add.rectangle(W / 2, y, 250, bg ? 50 : 42, bg ? 0xd4a017 : 0x1a0e04)
      .setStrokeStyle(2, 0x8a6a10).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, y, label, { fontFamily: 'Arial', fontSize: bg ? 17 : 14, fontStyle: 'bold', color: bg ? bg : color }).setOrigin(0.5);
    r.on('pointerdown', cb);
  }
}
