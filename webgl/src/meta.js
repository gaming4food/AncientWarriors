// meta.js — the collection / economy layer for the WebGL build, ported from the
// classic index.html. Owns the persistent player save: gold, the roster of
// individually-rolled warrior instances (rarity + variance + level/xp + ascension),
// the fielded squad, and the castle (Golden Gate + Elixir Well) levels.
//
// Saves live under an "awl_" localStorage namespace, kept separate from the classic
// build's keys so the two progress independently.

// ── RARITY ────────────────────────────────────────────────────────────────────
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Unique', 'Epic', 'Legendary', 'Mythic'];
// Mythic never rolls from a recruit — Mythic Legends are 1-of-1, claimed elsewhere.
const RARITY_RATES = [0.40, 0.28, 0.17, 0.09, 0.045, 0.015, 0];
export const RARITY_BONUS = [0, 0.10, 0.25, 0.45, 0.70, 1.10, 1.60];
export const RARITY_CLASSES = ['rc', 'ru', 'rr', 'rq', 're', 'rl2', 'rm'];
export const RARITY_VALUE = [10, 25, 60, 140, 320, 750, 6000];
export const RARITY_STARS = [1, 2, 3, 4, 4, 5, 0];
// [border, background tint] per rarity — the frame colour language from the classic build
export const RARITY_FRAME = [
  ['#4b463c', '#1b1813'], ['#3a6f9e', '#111a24'], ['#b0761f', '#231a0b'],
  ['#8a45c8', '#1c1230'], ['#a63ad0', '#210f2e'], ['#c8a017', '#231c06'], ['#ff2d95', '#2a1220'],
];
const GRADE_COL = { S: '#ff2d95', A: '#ffd700', B: '#c47aff', C: '#7ec8ff', D: '#9aa0a6' };
export const gradeColor = g => GRADE_COL[g] || '#fff';

// Role-based per-level growth: atk %, attack-speed %, range px
const GROWTH = {
  warrior: { atk: 0.14, spd: 0.02, rng: 2 },
  archer:  { atk: 0.08, spd: 0.05, rng: 4 },
  mage:    { atk: 0.18, spd: 0.00, rng: 3 },
  tank:    { atk: 0.10, spd: 0.02, rng: 3 },
};
// Exponential leveling curve — each level costs 50% more XP than the last.
export const xpNeed = lvl => Math.round(250 * Math.pow(1.5, lvl - 1));
export const ELIXIR_COST = [2, 3, 3, 4, 5, 6, 7];

// The Bastion — persistent base upgrades.
const ELIXIR_REGEN_MS = 1400;
export const BASTION_MAX = 10;

// Ultimate names (for card flavour)
export const ULTS = {
  banner: { n: 'War Cry', d: 'Allies +50% attack for 5s, cooldowns reset' },
  wrath: { n: 'Heroic Strike', d: '8× damage to the strongest foe in range' },
  twin: { n: 'Arrow Storm', d: 'Fires at every enemy in range' },
  moonfire: { n: 'Lunar Volley', d: '2× arrows at every enemy in range' },
  chain: { n: 'Thunderstorm', d: 'Lightning arcs through up to 8 enemies' },
  curse: { n: 'Mass Hex', d: 'Curses every enemy on the field for 6s' },
  siege: { n: 'Siege Barrage', d: '5× damage to all elites & bosses' },
  bash: { n: 'Phalanx Slam', d: 'Hurls every enemy in range backward' },
  venom: { n: 'Plague', d: 'Heavy poison on every enemy in range' },
  flurry: { n: 'Blade Dance', d: 'Strikes the nearest enemy 6 times' },
  cleave: { n: 'Whirlwind', d: '3× splash to everything in range' },
  bushido: { n: 'Iaido Slash', d: '4× strike on every enemy in range' },
  assassin: { n: 'Death Mark', d: 'Next 5 shots are guaranteed crits' },
  root: { n: 'Overgrowth', d: 'Roots every enemy on the field for 2.5s' },
  ignite: { n: 'Firestorm', d: 'Heavy burn on every enemy in range' },
  inspire: { n: 'Rally', d: 'Allies attack twice as fast for 5s' },
  rage: { n: 'Blood Frenzy', d: 'Doubled speed and rage for 6s' },
  sanctuary: { n: 'Divine Field', d: 'All enemies slowed hard for 4s' },
  acid: { n: 'Acid Rain', d: '2.5× splash on every enemy in range' },
  tactics: { n: 'Master Plan', d: 'Allies +60 range for 6s, cooldowns reset' },
};

const K = k => 'awl_' + k;           // localStorage namespace for the WebGL build
const RECRUIT_COST = 1000;
const STARTER_GOLD = 3000;
const STARTER_GEMS = 50;

let WARRIORS = [], MYTHICS = [], iidC = 0;

const state = {
  gold: STARTER_GOLD,
  gems: STARTER_GEMS,
  glory: 0,             // total Glory points earned across all battles
  firstWin: false,      // one-time "first victory" bonus flag
  roster: [],           // array of warrior instances
  team: [],             // iids of the fielded squad (max 5)
  baseLvl: 1,           // Golden Gate
  wellLvl: 1,           // Elixir Well
};

// Glory levels: each level costs 25% more Glory than the last (starts at 100).
export function gloryLevel() {
  let lvl = 1, need = 100, g = state.glory;
  while (g >= need) { g -= need; lvl++; need = Math.round(need * 1.25); }
  return lvl;
}
export function gloryProgress() {
  let lvl = 1, need = 100, g = state.glory;
  while (g >= need) { g -= need; lvl++; need = Math.round(need * 1.25); }
  return { lvl, cur: g, need };
}

// ── instance minting ──────────────────────────────────────────────────────────
function rollRarity() {
  const r = Math.random(); let a = 0;
  for (let i = 0; i < RARITY_RATES.length; i++) { a += RARITY_RATES[i]; if (r < a) return i; }
  return 0;
}
function rollVariance() {
  return { vA: +(0.92 + Math.random() * 0.20).toFixed(3),
           vS: +(0.92 + Math.random() * 0.16).toFixed(3),
           vR: Math.round(Math.random() * 25 - 10) };
}
// Named historical elites pull half as often as rank-and-file warriors.
function pickWarriorBase() {
  const wt = w => (w.elite ? 0.5 : 1);
  let r = Math.random() * WARRIORS.reduce((a, w) => a + wt(w), 0);
  for (const w of WARRIORS) { r -= wt(w); if (r <= 0) return w; }
  return WARRIORS[0];
}
function makeInstance(base, ri) {
  base = base || pickWarriorBase();
  ri = (ri === undefined) ? rollRarity() : ri;
  return { ...base, iid: ++iidC, ri, rarity: RARITIES[ri], ...rollVariance(),
           lvl: 1, xp: 0, asc: 0, owned: true };
}

// ── derived stats ─────────────────────────────────────────────────────────────
export function warriorStats(t) {
  const lvl = t.lvl || 1, g = GROWTH[t.role] || GROWTH.warrior, ri = t.ri || 0;
  const vA = t.vA || 1, vS = t.vS || 1, vR = t.vR || 0, asc = t.asc || 0;
  return {
    atk: Math.round(t.atk * 3 * (1 + RARITY_BONUS[ri]) * vA * (1 + g.atk * (lvl - 1)) * (1 + 0.15 * asc)),
    spd: Math.max(90, Math.round(t.aspd * 0.4 / vS * Math.pow(1 - g.spd, lvl - 1) / (1 + 0.08 * asc))),
    range: Math.round(180 + vR + g.rng * (lvl - 1) + 4 * asc),
    pf: 1 + 0.06 * (lvl - 1) + 0.10 * asc,
    ms: Math.floor(lvl / 5),
  };
}
export function warriorValue(w) {
  const ri = w.ri || 0;
  return Math.round(RARITY_VALUE[ri] * (1 + 0.35 * ((w.lvl || 1) - 1)) * (1 + 0.6 * (w.asc || 0)));
}
export function rollGrade(w) {
  const q = ((w.vA || 1) - 0.92) / 0.20 + ((w.vS || 1) - 0.92) / 0.16 + ((w.vR || 0) + 10) / 35;
  const avg = q / 3;
  return avg > 0.8 ? 'S' : avg > 0.6 ? 'A' : avg > 0.4 ? 'B' : avg > 0.2 ? 'C' : 'D';
}
export function sacXpFor(r) {
  const lvl = r.lvl || 1;
  return Math.round(100 * lvl * (1 + 0.6 * (lvl - 1)) * (1 + 0.4 * (r.ri || 0)));
}

// ── the Bastion ───────────────────────────────────────────────────────────────
export const baseMaxHp = () => 7 + 2 * (state.baseLvl - 1);
export const baseUpCost = () => 500 * state.baseLvl;
export const wellUpCost = () => 400 * state.wellLvl;
export const wellRegenMs = () => Math.max(600, ELIXIR_REGEN_MS - 60 * (state.wellLvl - 1));
export const startElixir = () => 5 + Math.floor((state.wellLvl - 1) / 3);

// ── persistence ───────────────────────────────────────────────────────────────
function save() {
  try {
    localStorage.setItem(K('gold'), String(state.gold));
    localStorage.setItem(K('gems'), String(state.gems));
    localStorage.setItem(K('glory'), String(state.glory));
    localStorage.setItem(K('firstwin'), state.firstWin ? '1' : '0');
    localStorage.setItem(K('roster'), JSON.stringify(state.roster));
    localStorage.setItem(K('team'), JSON.stringify(state.team));
    localStorage.setItem(K('bastion'), JSON.stringify({ base: state.baseLvl, well: state.wellLvl }));
  } catch (e) { console.error('[meta] save failed', e); }
}
function load() {
  try {
    const r = JSON.parse(localStorage.getItem(K('roster')) || 'null');
    state.roster = (Array.isArray(r) && r.length) ? r : Array.from({ length: 6 }, () => makeInstance());
    state.team = JSON.parse(localStorage.getItem(K('team')) || '[]');
    state.gold = parseInt(localStorage.getItem(K('gold')) || String(STARTER_GOLD), 10);
    state.gems = parseInt(localStorage.getItem(K('gems')) || String(STARTER_GEMS), 10);
    state.glory = parseInt(localStorage.getItem(K('glory')) || '0', 10);
    state.firstWin = localStorage.getItem(K('firstwin')) === '1';
    const b = JSON.parse(localStorage.getItem(K('bastion')) || '{}');
    state.baseLvl = Math.min(BASTION_MAX, b.base || 1);
    state.wellLvl = Math.min(BASTION_MAX, b.well || 1);
  } catch (e) {
    state.roster = Array.from({ length: 6 }, () => makeInstance());
    state.team = []; state.gold = STARTER_GOLD; state.gems = STARTER_GEMS;
    state.glory = 0; state.firstWin = false; state.baseLvl = 1; state.wellLvl = 1;
  }
  // rebase the instance-id counter and backfill any missing fields
  iidC = state.roster.reduce((a, r) => Math.max(a, r.iid || 0), iidC);
  state.roster.forEach(r => {
    if (!r.iid) r.iid = ++iidC;
    if (!r.lvl) r.lvl = 1; if (r.xp === undefined) r.xp = 0; if (r.asc === undefined) r.asc = 0;
    if (r.vA === undefined) Object.assign(r, rollVariance());
    const base = WARRIORS.find(w => w.id === r.id) || MYTHICS.find(w => w.id === r.id);
    if (base) { for (const k of ['name', 'cls', 'wcl', 'col', 'role', 'atk', 'aspd', 'ps', 'pc', 'ab', 'abd', 'proj']) if (r[k] === undefined) r[k] = base[k]; }
  });
  state.team = state.team.filter(t => state.roster.some(r => r.iid === t));
  // brand-new player who somehow has no starter save gets a couple pre-picked heroes fielded
  if (!state.team.length && state.roster.length) {
    state.team = state.roster.slice(0, Math.min(5, state.roster.length)).map(r => r.iid);
  }
}

// ── public API ────────────────────────────────────────────────────────────────
export const Meta = {
  init(gameData) {
    WARRIORS = gameData.warriors || [];
    MYTHICS = gameData.mythics || [];
    load();
    return this;
  },
  get gold() { return state.gold; },
  get gems() { return state.gems; },
  get glory() { return state.glory; },
  gloryLevel, gloryProgress,
  get roster() { return state.roster; },
  get team() { return state.team; },
  get baseLvl() { return state.baseLvl; },
  get wellLvl() { return state.wellLvl; },
  byIid(iid) { return state.roster.find(r => r.iid === iid); },
  save,

  // squad selection (max 5)
  inTeam(iid) { return state.team.includes(iid); },
  toggleTeam(iid) {
    const i = state.team.indexOf(iid);
    if (i >= 0) state.team.splice(i, 1);
    else { if (state.team.length >= 5) return false; state.team.push(iid); }
    save(); return true;
  },
  teamInstances() { return state.team.map(id => state.roster.find(r => r.iid === id)).filter(Boolean); },

  // ── Warriors Market: recruit + sell ──
  recruitCost: RECRUIT_COST,
  canRecruit() { return state.gold >= RECRUIT_COST; },
  recruit() {
    if (state.gold < RECRUIT_COST) return null;
    state.gold -= RECRUIT_COST;
    const inst = makeInstance();
    state.roster.push(inst);
    save();
    return inst;
  },
  sellPrice(w) { return Math.round(warriorValue(w) * 4 + 40); },
  sell(iid) {
    const w = this.byIid(iid); if (!w) return null;
    if (w.mythic) return { err: `${w.name} is a 1-of-1 Mythic Legend and cannot be sold.` };
    if (state.team.includes(iid)) return { err: `Remove ${w.name} from your squad before selling.` };
    const price = this.sellPrice(w);
    state.roster = state.roster.filter(r => r.iid !== iid);
    state.gold += price;
    save();
    return { gold: price, name: w.name };
  },

  // ── My Warriors: feed for XP, fuse duplicates to ascend ──
  canAscend(tgtIid, sacIid) {
    const t = this.byIid(tgtIid), s = this.byIid(sacIid);
    return !!(t && s && t.iid !== s.iid && !s.mythic && s.id === t.id && (t.asc || 0) < 5);
  },
  // feed sac into tgt; auto-detects ascension (same hero) vs XP feed
  enhance(tgtIid, sacIid) {
    const tgt = this.byIid(tgtIid), sac = this.byIid(sacIid);
    if (!tgt || !sac || tgt.iid === sac.iid) return null;
    if (sac.mythic) return { err: `${sac.name} is a 1-of-1 Mythic Legend and cannot be sacrificed.` };
    const ascend = this.canAscend(tgtIid, sacIid);
    state.roster = state.roster.filter(r => r.iid !== sac.iid);
    state.team = state.team.filter(t => t !== sac.iid);
    let result;
    if (ascend) {
      tgt.asc = (tgt.asc || 0) + 1;
      result = { ascend: true, star: tgt.asc, name: tgt.name };
    } else {
      const gain = sacXpFor(sac);
      tgt.xp = (tgt.xp || 0) + gain; tgt.lvl = tgt.lvl || 1;
      const before = tgt.lvl;
      while (tgt.xp >= xpNeed(tgt.lvl)) { tgt.xp -= xpNeed(tgt.lvl); tgt.lvl++; }
      result = { xp: gain, name: tgt.name, levels: tgt.lvl - before };
    }
    save();
    return result;
  },

  // ── Castle Upgrades ──
  upgradeBase() {
    if (state.baseLvl >= BASTION_MAX || state.gold < baseUpCost()) return false;
    state.gold -= baseUpCost(); state.baseLvl++; save(); return true;
  },
  upgradeWell() {
    if (state.wellLvl >= BASTION_MAX || state.gold < wellUpCost()) return false;
    state.gold -= wellUpCost(); state.wellLvl++; save(); return true;
  },

  // ── close the loop: bank a finished battle's spoils into the persistent save ──
  // result = { victory, wave, kills, earnedGold, earnedGems }
  bankBattle(result) {
    const { victory, wave = 0, earnedGold = 0, earnedGems = 0 } = result || {};
    const beforeLvl = gloryLevel();
    // Win: full spoils + a completion bonus that scales with how far you pushed.
    // Loss: a consolation cut so a run is never a total waste (keeps grinding fair).
    const goldMult = victory ? 1 : 0.4;
    const winBonus = victory ? 100 + wave * 20 : 0;
    let gold = Math.round(earnedGold * goldMult) + winBonus;
    let gems = victory ? earnedGems + Math.max(1, Math.round(wave / 4)) : Math.floor(earnedGems * 0.4);
    const glory = victory ? 15 + wave * 2 : Math.floor(wave / 2);
    // one-time bonus the first time a player ever wins
    let firstWin = false, firstBonus = 0;
    if (victory && !state.firstWin) { state.firstWin = true; firstWin = true; firstBonus = 500; gold += firstBonus; }
    state.gold += gold; state.gems += gems; state.glory += glory;
    save();
    const afterLvl = gloryLevel();
    return { gold, gems, glory, firstWin, firstBonus, leveledUp: afterLvl > beforeLvl, level: afterLvl };
  },

  // dev helper mirrored from the classic Top-Up
  addGold(n) { state.gold += n; save(); },
};
