// systems/progression.js — XP, leveling, sacrifice and match rewards.
// Pure logic over plain objects; all coefficients come from progression.json.
// Unity port: ProgressionSystem static class operating on serializable DTOs.

export function xpNeed(progression, lvl) {
  return lvl * progression.xpNeedPerLevel;
}

// Grants xp to an instance, consuming thresholds. Returns levels gained.
export function grantXp(progression, inst, xp) {
  inst.xp = (inst.xp || 0) + xp;
  inst.lvl = inst.lvl || 1;
  let ups = 0;
  while (inst.xp >= xpNeed(progression, inst.lvl)) {
    inst.xp -= xpNeed(progression, inst.lvl);
    inst.lvl++; ups++;
  }
  return ups;
}

// XP value of sacrificing an instance — rises steeply with level & rarity.
export function sacrificeXp(progression, inst) {
  const s = progression.sacrifice;
  const lvl = inst.lvl || 1;
  return Math.round(s.base * lvl * (1 + s.levelRamp * (lvl - 1)) * (1 + s.rarityFactor * (inst.ri || 0)));
}

// Applies a finished match to the collection. XP comes ONLY from kills,
// credited per instance (killsByIid built by the battle system).
// Returns a summary DTO for the results screen.
export function applyMatchResult(progression, collection, result) {
  const ups = [];
  let xpTotal = 0;
  for (const [iidStr, kills] of Object.entries(result.killsByIid || {})) {
    const inst = collection.find(+iidStr);
    if (!inst || !kills) continue;
    const gain = kills * progression.xpPerKill;
    xpTotal += gain;
    const before = inst.lvl || 1;
    grantXp(progression, inst, gain);
    if (inst.lvl > before) ups.push({ name: inst.name, lvl: inst.lvl });
  }
  const goldEarn = Math.round(result.kills * progression.goldPerKill + result.score / progression.goldScoreDivisor);
  collection.addGold(goldEarn);
  if (result.victory) collection.addGlory(result.score);
  collection.save();
  return { xpTotal, goldEarn, levelUps: ups };
}
