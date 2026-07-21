// systems/stats.js — stat & rarity formulas. Pure functions, no engine types.
// Unity port: static StatsSystem class; JSON coefficients load via ScriptableObject or JsonUtility.

export function rollRarity(rarity, rng) {
  return rng.weighted(rarity.rates);
}

export function rollVariance(rarity, rng) {
  const v = rarity.variance;
  return {
    vA: +rng.range(v.atk.min, v.atk.max).toFixed(3),
    vS: +rng.range(v.speed.min, v.speed.max).toFixed(3),
    vR: Math.round(rng.range(v.range.min, v.range.max)),
  };
}

// Full battle stats for one warrior instance.
// def = static warrior definition, inst = owned copy {ri,vA,vS,vR,lvl}
export function warriorStats(def, inst, progression, rarity) {
  const lvl = inst.lvl || 1;
  const g = progression.roleGrowth[def.role] || progression.roleGrowth.warrior;
  const ri = inst.ri || 0;
  const vA = inst.vA || 1, vS = inst.vS || 1, vR = inst.vR || 0;
  const sc = progression.battleStatScale;
  return {
    atk: Math.round(def.atk * sc.atkMult * (1 + rarity.atkBonus[ri]) * vA * (1 + g.atk * (lvl - 1))),
    spd: Math.max(sc.minAttackMs, Math.round(def.aspd * sc.speedMult / vS * Math.pow(1 - g.spd, lvl - 1))),
    range: Math.round(sc.baseRange + vR + g.rng * (lvl - 1)),
    pf: 1 + progression.abilityPotencyPerLevel * (lvl - 1),   // ability potency factor
    ms: Math.floor(lvl / progression.milestoneEveryLevels),   // milestone tier
  };
}

// Lucky-roll flags for UI display
export function highRolls(inst) {
  const rolls = [];
  if ((inst.vA || 1) >= 1.08) rolls.push('atk');
  if ((inst.vS || 1) >= 1.05) rolls.push('speed');
  if ((inst.vR || 0) >= 10) rolls.push('range');
  return rolls;
}
