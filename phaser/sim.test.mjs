// Headless test: runs the full game loop with zero Phaser/DOM — the same
// separation Unity edit-mode tests will rely on. `node sim.test.mjs`
import { readFileSync } from 'fs';
import { createRng } from './src/systems/rng.js';
import { createStorage, memoryBackend } from './src/systems/storage.js';
import { createCollection } from './src/systems/collection.js';
import { createBattle } from './src/systems/battle.js';
import { applyMatchResult, sacrificeXp } from './src/systems/progression.js';
import { warriorStats } from './src/systems/stats.js';
import { heroPixelGrid } from './src/systems/heroPixels.js';

const load = f => JSON.parse(readFileSync(new URL('./src/data/' + f, import.meta.url)));
const data = {
  warriors: load('warriors.json').warriors,
  enemies: load('enemies.json'),
  rarity: load('rarity.json'),
  progression: load('progression.json'),
  balance: load('balance.json'),
};

const rng = createRng(1234);
const storage = createStorage(memoryBackend());
const collection = createCollection({ ...data, storage, rng });
collection.load();

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : (fail++, console.error('FAIL:', name)); };

// collection & gacha
check('starter roster >= 5', collection.roster.length >= 5);
check('team of 5', collection.team.length === 5);
collection.addGold(5000);
const bought = collection.buyRecruit();
check('gacha mints lvl1 copy', bought && bought.lvl === 1 && bought.iid > 0);
check('gacha rolled variance', bought.vA !== undefined && bought.vS !== undefined);

// stats formula
const def = collection.defById(bought.id);
const st1 = warriorStats(def, bought, data.progression, data.rarity);
const st6 = warriorStats(def, { ...bought, lvl: 6 }, data.progression, data.rarity);
check('level 6 stronger than level 1', st6.atk > st1.atk && st6.range > st1.range);
check('milestone at lvl 5+', st6.ms === 1 && st1.ms === 0);

// sacrifice scaling
const sac1 = sacrificeXp(data.progression, { lvl: 1, ri: 0 });
const sac6 = sacrificeXp(data.progression, { lvl: 6, ri: 0 });
check('sacrifice xp ramps with level', sac6 > sac1 * 5);

// pixel sprites are pure data
const grid = heroPixelGrid(data.warriors[0].pix);
check('hero pixel grid 24x28', grid.length === 28 && grid[0].length === 24);
check('hero grid has outline+fill', grid.flat().filter(Boolean).length > 100);

// full battle simulation → endless phase → someone gets overwhelmed
const battle = createBattle({ data, teamInstances: collection.teamInstances(), rng });
for (let i = 0; i < 5; i++) battle.summonFromTray(i);
battle.state.timer = 5;                      // jump near the boss phase
let frames = 0, sawBossEvent = false;
while (!battle.state.over && frames < 20000) {  // up to ~11 game-minutes
  battle.update(33);
  frames++;
  for (const e of battle.drainEvents()) if (e.t === 'boss') sawBossEvent = true;
}
check('battle spawned mobs & killed some', battle.state.p1.kills > 5);
check('boss phase reached', sawBossEvent && battle.state.boss);
check('endless match ends by overwhelm', battle.state.over);
check('kill attribution per instance', Object.keys(battle.killsByIid()).length > 0);

// post-match progression from kills only
const before = collection.teamInstances().map(i => i.xp + i.lvl * 1000);
const summary = applyMatchResult(data.progression, collection, battle.result());
check('match granted xp from kills', summary.xpTotal > 0);
check('gold earned banked', summary.goldEarn > 0);
const after = collection.teamInstances().map(i => i.xp + i.lvl * 1000);
check('some instance progressed', after.some((v, i) => v > before[i]));

console.log(`\n${pass} passed, ${fail} failed — simulated ${frames} frames (${Math.round(frames * 33 / 1000)}s game time), result: ${battle.state.victory ? 'VICTORY' : 'DEFEAT'} at wave ${battle.state.wave}, survived +${Math.floor(battle.state.surv)}s`);
process.exit(fail ? 1 : 0);
