// systems/collection.js — the player's warrior inventory, team and currencies.
// No engine or DOM types; persistence goes through an injected storage port.
// Unity port: CollectionService with an ISaveStore interface.

import { rollRarity, rollVariance } from './stats.js';
import { sacrificeXp, grantXp } from './progression.js';

export function createCollection({ warriors, rarity, progression, balance, storage, rng }) {
  let roster = [];
  let team = [];
  let gold = balance.economy.startGold;
  let glory = 0;
  let iidC = 0;

  const defById = id => warriors.find(w => w.id === id);

  // Every purchase mints a brand-new Level 1 copy with its own rolls.
  function mint() {
    const def = rng.pick(warriors);
    const ri = rollRarity(rarity, rng);
    const inst = {
      iid: ++iidC, id: def.id, name: def.name, role: def.role,
      ri, rarity: rarity.names[ri],
      ...rollVariance(rarity, rng),
      lvl: 1, xp: 0,
    };
    roster.push(inst);
    return inst;
  }

  function load() {
    const s = storage.get('collection');
    if (s) {
      roster = s.roster || []; team = s.team || [];
      gold = s.gold ?? balance.economy.startGold; glory = s.glory || 0;
      iidC = roster.reduce((a, r) => Math.max(a, r.iid || 0), 0);
    }
    while (roster.length < 5) mint();
    team = team.filter(t => roster.some(r => r.iid === t));
    while (team.length < 5) {
      const next = roster.find(r => !team.includes(r.iid));
      if (!next) break;
      team.push(next.iid);
    }
    save();
  }

  function save() {
    storage.set('collection', { roster, team, gold, glory });
  }

  return {
    load, save, mint,
    get roster() { return roster; },
    get team() { return team; },
    get gold() { return gold; },
    get glory() { return glory; },
    defById,
    find: iid => roster.find(r => r.iid === iid),
    teamInstances: () => team.map(iid => roster.find(r => r.iid === iid)).filter(Boolean),

    addGold(n) { gold += n; },
    addGlory(n) { glory += n; },

    buyRecruit() {
      const cost = balance.economy.gachaCost;
      if (gold < cost) return null;
      gold -= cost;
      const inst = mint();
      save();
      return inst;
    },

    setTeam(iids) {
      if (iids.length !== 5) return false;
      if (!iids.every(iid => roster.some(r => r.iid === iid))) return false;
      team = [...iids];
      save();
      return true;
    },

    // Feed `sacIid` into `targetIid`; returns {xp, levelsGained} or null.
    sacrifice(targetIid, sacIid) {
      const tgt = roster.find(r => r.iid === targetIid);
      const sac = roster.find(r => r.iid === sacIid);
      if (!tgt || !sac || tgt.iid === sac.iid) return null;
      const xp = sacrificeXp(progression, sac);
      roster = roster.filter(r => r.iid !== sac.iid);
      team = team.filter(t => t !== sac.iid);
      const levelsGained = grantXp(progression, tgt, xp);
      save();
      return { xp, levelsGained };
    },
  };
}
