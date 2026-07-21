// systems/battle.js — the authoritative match simulation.
// Pure logic: consumes JSON data + plain state, exposes update(dt) + command
// methods + an event queue. Contains NO Phaser/DOM references, so it can be
// rewritten as a C# BattleSimulation class for Unity with the same shape.
//
// Presentation contract:
//  - read `state` every frame (positions are precomputed in canvas space)
//  - call drainEvents() for one-shot FX/audio/UI notifications
//  - forward player input via summonFromTray / tryMerge / skipWave

import { warriorStats } from './stats.js';

export function createBattle({ data, teamInstances, rng }) {
  const { warriors, enemies, progression, rarity, balance } = data;
  const A = balance.arena, M = balance.match, SP = balance.spawn;
  const AB = balance.abilities, CB = balance.combat, EC = balance.economy;

  const W = A.width, AH = A.arenaHeight, WL = A.wall;
  const IW = W - WL * 2, IH = AH - WL * 2;
  const PC = WL - A.pathInset;                    // path centerline offset

  let eid = 0, uid = 0;
  const events = [];
  const emit = e => events.push(e);

  const state = {
    W, H: AH * 2, AH, WL, IW, IH,
    p1: { hp: M.baseHp, gold: 0, free: EC.freeSummons, nextCost: EC.summonBaseCost, score: 0, kills: 0, units: [], mobs: [], flip: true },
    p2: { hp: M.baseHp, units: [], mobs: [], flip: false },
    projs: [],
    timer: M.timerSec, surv: 0, boss: false, bossTier: 0, bossAcc: 0,
    wave: 1, wkills: 0, wtgt: balance.waves.killTargetBase + balance.waves.killTargetPerWave,
    spawnAcc: 0, aiAcc: 0, over: false, victory: null,
  };

  // ── geometry ────────────────────────────────────────────────────────────────
  function slotPos(slot) {
    const c = slot % A.cols, r = Math.floor(slot / A.cols);
    const tw = IW / A.cols, th = IH / A.rows;
    return { x: WL + c * tw + tw / 2, y: WL + r * th + th / 2 };
  }

  // 3-segment U path. p2 (top): down-left → bottom → up-right; p1 mirrored.
  function mobPos(m, side) {
    const ay = side === state.p1 ? AH : 0;
    const x0 = PC, x1 = W - PC;
    const y0 = ay + PC, y1 = ay + AH - PC;
    const segs = side.flip
      ? [[x0, y1, x0, y0], [x0, y0, x1, y0], [x1, y0, x1, y1]]
      : [[x0, y0, x0, y1], [x0, y1, x1, y1], [x1, y1, x1, y0]];
    const s = segs[m.seg % 3];
    return { x: s[0] + (s[2] - s[0]) * m.sp, y: s[1] + (s[3] - s[1]) * m.sp };
  }

  function advanceMob(m, dt) {
    const lens = [IH, IW, IH];
    m.sp += m.spd * dt / (1000 * lens[m.seg % 3]);
    while (m.sp >= 1) { m.sp -= 1; m.seg++; if (m.seg >= 3) { m.seg = 0; m.laps++; } }
  }

  // ── spawning ────────────────────────────────────────────────────────────────
  const mobTypes = enemies.types;
  const weights = mobTypes.filter(t => !t.boss).map(t => enemies.spawnWeights[t.key] || 0);

  function spawnMob(side, spOff = 0) {
    const t = mobTypes[rng.weighted(weights)];
    const hp = Math.round((t.hp + state.wave * SP.hpPerWave) * (1 + state.surv / SP.endlessHpRampSec));
    side.mobs.push({ id: ++eid, ...t, hp, mhp: hp, seg: 0, sp: spOff, laps: 0, curse: 0, root: 0, dot: null, x: 0, y: 0 });
  }

  function spawnBoss(side) {
    const t = mobTypes.find(t => t.boss);
    const hp = Math.round((t.hp + state.wave * balance.boss.hpPerWave) * (1 + state.bossTier * balance.boss.tierHpMult));
    side.mobs.push({ id: ++eid, ...t, hp, mhp: hp, seg: 0, sp: 0, laps: 0, curse: 0, root: 0, dot: null, x: 0, y: 0 });
  }

  // ── units ───────────────────────────────────────────────────────────────────
  function makeUnit(def, inst, slot) {
    const st = warriorStats(def, inst, progression, rarity);
    const { x, y } = slotPos(slot);
    return {
      uid: ++uid, iid: inst.iid ?? -1, defId: def.id, name: def.name, role: def.role,
      col: def.col, pc: def.pc, ab: def.ab, ps: def.ps,
      slot, x, y, atk: st.atk, spd: st.spd, range: st.range, pf: st.pf, ms: st.ms,
      cd: 0, stars: 1, shots: 0, hits: 0, combo: 0, lastT: -1, kb: 0, mk: 0,
    };
  }

  function openSlots(side) {
    const used = side.units.map(u => u.slot);
    return Array.from({ length: A.cols * A.rows }, (_, i) => i).filter(s => !used.includes(s));
  }

  // ── abilities: aura + self passives at fire time ────────────────────────────
  function buffedStats(side, u) {
    let atkM = 1, spdM = 1, range = u.range;
    for (const o of side.units) {
      if (o === u) continue;
      if (Math.hypot(o.x - u.x, o.y - u.y) > AB.auraRadius) continue;
      if (o.ab === 'banner') atkM += AB.banner.atk * o.pf;
      else if (o.ab === 'inspire') spdM *= Math.max(AB.inspire.cap, 1 - (1 - AB.inspire.speedMult) * o.pf);
      else if (o.ab === 'tactics') range += Math.round(AB.tactics.range * o.pf);
    }
    if (u.ab === 'rage') {
      let n = 0;
      for (const m of side.mobs) if (m.hp > 0 && Math.hypot(m.x - u.x, m.y - unitY(side, u)) < range + CB.rangeSlack) n++;
      atkM += AB.rage.atkPerEnemy * u.pf * n;
    }
    if (u.ab === 'bushido') spdM *= Math.max(AB.bushido.cap, 1 - AB.bushido.speedPerKill * u.pf * u.kb);
    return { atk: Math.round(u.atk * atkM), spd: Math.max(90, Math.round(u.spd * spdM)), range };
  }

  const unitY = (side, u) => u.y + (side === state.p1 ? AH : 0);

  function fireAt(side, u, target, st) {
    const uy = unitY(side, u);
    const dx = target.x - u.x, dy = target.y - uy, dist = Math.hypot(dx, dy) || 1;
    let dmg = st.atk, crit = false;
    if (u.ab === 'assassin') {
      u.hits++;
      if (u.hits % Math.max(AB.assassin.minEvery, AB.assassin.every - u.ms) === 0) { dmg *= AB.assassin.mult; crit = true; }
    }
    if (u.ab === 'flurry') {
      if (u.lastT === target.id) u.combo = Math.min(AB.flurry.maxStacks, u.combo + 1);
      else { u.combo = 0; u.lastT = target.id; }
      dmg = Math.round(dmg * (1 + AB.flurry.step * u.pf * u.combo));
    }
    state.projs.push({
      x: u.x, y: uy, vx: dx / dist * CB.projectileSpeed, vy: dy / dist * CB.projectileSpeed,
      tid: target.id, pl: side === state.p1 ? 1 : 2, col: u.col, type: u.ps,
      dmg, ab: u.ab, suid: u.uid, crit, pf: u.pf, ms: u.ms, life: CB.projectileLifeMs, rot: 0,
    });
    if (state.projs.length > CB.projectileCap) state.projs.splice(0, state.projs.length - CB.projectileCap);
  }

  // ── kill & damage resolution ────────────────────────────────────────────────
  function killMob(side, m, pl, suid) {
    if (m.dead) return;
    m.dead = true;
    side.mobs = side.mobs.filter(x => x.id !== m.id);
    emit({ t: 'kill', x: m.x, y: m.y, boss: !!m.boss });
    if (m.boss && pl === 1) emit({ t: 'msg', text: 'BOSS SLAIN! +' + m.reward + ' gold — the horde rages on!', col: '#ffd700' });
    if (pl === 1) {
      state.p1.gold += m.reward; state.p1.score += m.score; state.p1.kills++; state.wkills++;
      if (state.wkills >= state.wtgt) {
        state.wave++; state.wkills = 0;
        state.wtgt = balance.waves.killTargetBase + state.wave * balance.waves.killTargetPerWave;
        state.p1.gold += balance.waves.clearBonusGold;
      }
    }
    if (suid != null) {
      const shooter = side.units.find(x => x.uid === suid);
      if (shooter) { shooter.mk++; if (shooter.ab === 'bushido') shooter.kb++; }
    }
  }

  function applyHit(side, pj, tgt) {
    const pf = pj.pf, ms = pj.ms;
    let dmg = pj.dmg;
    if (pj.ab === 'wrath') dmg = Math.round(dmg * (1 + (1 - tgt.hp / tgt.mhp) * AB.wrath.maxBonus * pf));
    if (pj.ab === 'moonfire' && tgt.hp / tgt.mhp > AB.moonfire.threshold) dmg = Math.round(dmg * (1 + AB.moonfire.bonus * pf));
    if (pj.ab === 'siege' && (tgt.elite || tgt.boss)) dmg = Math.round(dmg * (1 + AB.siege.bonus * pf));
    if (tgt.curse > 0) dmg = Math.round(dmg * (1 + AB.curse.amp));
    tgt.hp -= dmg;
    emit({ t: 'hit', x: pj.x, y: pj.y, col: pj.col, crit: pj.crit });

    if (pj.ab === 'curse') tgt.curse = AB.curse.durationMs;
    else if (pj.ab === 'venom') addDot(tgt, dmg * AB.venom.fraction, AB.venom.durationMs, '#3ddc3d', pj.pl);
    else if (pj.ab === 'ignite') addDot(tgt, dmg * AB.ignite.fraction, AB.ignite.durationMs, '#ff8830', pj.pl);
    else if (pj.ab === 'root') { tgt.root = AB.root.durationMs * pf; emit({ t: 'fx-ring', x: tgt.x, y: tgt.y, r: 12, col: '#3ddc3d' }); }
    else if (pj.ab === 'bash' && !tgt.boss) { const lens = [IH, IW, IH]; tgt.sp = Math.max(0, tgt.sp - AB.bash.pushPx * pf / lens[tgt.seg % 3]); }
    else if (pj.ab === 'cleave' || pj.ab === 'acid') {
      const cfg = AB[pj.ab];
      const rad = cfg.radius + AB.milestoneSplashRadius * ms;
      const frac = Math.min(1, cfg.fraction * pf);
      emit({ t: 'fx-ring', x: tgt.x, y: tgt.y, r: rad, col: pj.col });
      for (const m of [...side.mobs]) {
        if (m === tgt || m.hp <= 0) continue;
        if (Math.hypot(m.x - tgt.x, m.y - tgt.y) < rad) {
          m.hp -= Math.round(dmg * frac);
          if (m.hp <= 0) killMob(side, m, pj.pl, pj.suid);
        }
      }
    } else if (pj.ab === 'chain') {
      let from = { x: tgt.x, y: tgt.y };
      const hitSet = new Set([tgt.id]);
      const jumps = AB.chain.jumps + ms;
      const frac = Math.min(AB.chain.maxFraction, AB.chain.fraction * pf);
      for (let j = 0; j < jumps; j++) {
        let nx = null, nd = Infinity;
        for (const m of [...side.mobs]) {
          if (m.hp <= 0 || hitSet.has(m.id)) continue;
          const d = Math.hypot(m.x - from.x, m.y - from.y);
          if (d < AB.chain.radius && d < nd) { nd = d; nx = m; }
        }
        if (!nx) break;
        hitSet.add(nx.id);
        emit({ t: 'fx-bolt', x1: from.x, y1: from.y, x2: nx.x, y2: nx.y, col: pj.col });
        nx.hp -= Math.round(dmg * frac);
        if (nx.hp <= 0) killMob(side, nx, pj.pl, pj.suid);
        from = { x: nx.x, y: nx.y };
      }
    }
    if (tgt.hp <= 0) killMob(side, tgt, pj.pl, pj.suid);
  }

  function addDot(m, total, ms, col, pl) { m.dot = { rate: total / (ms / 1000), left: ms, col }; m.dotPl = pl; }

  // ── AI opponent ─────────────────────────────────────────────────────────────
  function aiSummon() {
    const open = openSlots(state.p2);
    if (!open.length) return;
    const def = rng.pick(warriors);
    const inst = { iid: -1, ri: 0, vA: 1, vS: 1, vR: 0, lvl: 1 };
    state.p2.units.push(makeUnit(def, inst, rng.pick(open)));
  }

  function aiAct() {
    const us = state.p2.units;
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      if (us[i].col === us[j].col && us[i].stars === us[j].stars && us[i].stars < balance.merge.maxStars) {
        mergeUnits(state.p2, i, j);
        return;
      }
    }
    if (us.length < balance.ai.maxUnits) aiSummon();
  }

  function mergeUnits(side, ai, bi) {
    const a = side.units[ai], b = side.units[bi];
    const hi = Math.max(ai, bi), lo = Math.min(ai, bi);
    const src = lo === ai ? a : b, tgt = lo === ai ? b : a;
    side.units.splice(hi, 1); side.units.splice(lo, 1);
    const MG = balance.merge;
    side.units.push({
      ...src, slot: tgt.slot, x: tgt.x, y: tgt.y, stars: src.stars + 1, mk: src.mk + tgt.mk,
      atk: Math.round(src.atk * MG.atkMult), spd: Math.max(MG.minSpdMs, src.spd * MG.spdMult), range: src.range + MG.rangeAdd,
    });
    emit({ t: 'merge', x: tgt.x, y: unitY(side, tgt) });
  }

  // ── main tick ───────────────────────────────────────────────────────────────
  function update(rawDt) {
    if (state.over) return;
    const dt = Math.max(0, Math.min(rawDt, M.maxDtMs));

    state.timer -= dt / 1000;
    if (state.timer <= 0) {
      state.timer = 0;
      if (!state.boss) { state.boss = true; spawnBoss(state.p1); spawnBoss(state.p2); emit({ t: 'boss' }); }
      state.surv += dt / 1000;
      state.bossAcc += dt;
      if (state.bossAcc >= balance.boss.endlessRespawnMs) {
        state.bossAcc = 0; state.bossTier++;
        spawnBoss(state.p1); spawnBoss(state.p2);
        emit({ t: 'boss' }); emit({ t: 'msg', text: 'A stronger demon lord approaches!', col: '#ff9dff' });
      }
    }

    state.aiAcc += dt;
    if (state.aiAcc >= balance.ai.actIntervalMs) { state.aiAcc = 0; aiAct(); }

    // column spawner with endless escalation
    const tier = Math.floor(state.surv / SP.endlessTierSec);
    const tRatio = Math.max(0, state.timer / M.timerSec);
    const minInt = state.boss ? SP.endlessMinIntervalMs : SP.minIntervalMs;
    const interval = Math.max(minInt, SP.baseIntervalMs - (state.wave - 1) * SP.waveIntervalStepMs - (1 - tRatio) * SP.timeIntervalStepMs - tier * SP.endlessTierStepMs);
    state.spawnAcc += dt;
    if (state.spawnAcc >= interval) {
      state.spawnAcc = 0;
      const group = Math.min(SP.groupMax, SP.groupBase + Math.floor(state.wave / 2) * SP.groupPerTwoWaves + tier);
      for (let k = 0; k < group; k++) {
        if (state.p1.mobs.length < SP.mobCap) spawnMob(state.p1, k * 0.05);
        if (state.p2.mobs.length < SP.mobCap) spawnMob(state.p2, k * 0.05);
      }
    }

    // mobs: statuses, movement, breach
    for (const side of [state.p1, state.p2]) {
      const sancs = side.units.filter(u => u.ab === 'sanctuary');
      const rem = [], dotDead = [];
      for (const m of side.mobs) {
        if (m.curse > 0) m.curse -= dt;
        if (m.dot) { m.hp -= m.dot.rate * dt / 1000; m.dot.left -= dt; if (m.dot.left <= 0) m.dot = null; }
        if (m.hp <= 0) { dotDead.push(m); continue; }
        let mv = 1;
        if (m.root > 0) { m.root -= dt; mv = 0; }
        else if (sancs.length) {
          for (const s of sancs) {
            if (Math.hypot(m.x - s.x, m.y - unitY(side, s)) < s.range) { mv = Math.max(AB.sanctuary.maxSlow, 1 - AB.sanctuary.slow * s.pf); break; }
          }
        }
        if (mv > 0) advanceMob(m, dt * mv);
        const p = mobPos(m, side); m.x = p.x; m.y = p.y;
        if (m.laps >= 1) {
          side.hp = Math.max(0, side.hp - m.dmg); rem.push(m.id);
          emit({ t: 'breach', mine: side === state.p1, dmg: m.dmg });
          if (side.hp <= 0) { endGame(side !== state.p1); return; }
        }
      }
      side.mobs = side.mobs.filter(m => !rem.includes(m.id));
      dotDead.forEach(m => killMob(side, m, m.dotPl || 1, null));
    }

    // units: fire
    for (const side of [state.p1, state.p2]) {
      for (const u of side.units) {
        u.cd = Math.max(0, u.cd - dt);
        if (u.cd > 0) continue;
        const st = buffedStats(side, u);
        const uy = unitY(side, u);
        let best = null, bestP = Infinity;
        for (const m of side.mobs) {
          if (m.hp <= 0) continue;
          const d = Math.hypot(m.x - u.x, m.y - uy);
          if (d < st.range + CB.rangeSlack) {
            const prio = m.boss ? d - balance.boss.focusFireBias : d;
            if (prio < bestP) { bestP = prio; best = m; }
          }
        }
        if (best) {
          u.cd = st.spd;
          fireAt(side, u, best, st);
          if (u.ab === 'twin') {
            u.shots++;
            if (u.shots % Math.max(AB.twin.minEvery, AB.twin.every - u.ms) === 0) {
              let alt = null, altD = Infinity;
              for (const m of side.mobs) {
                if (m.hp <= 0 || m === best) continue;
                const d = Math.hypot(m.x - u.x, m.y - uy);
                if (d < st.range + CB.rangeSlack && d < altD) { altD = d; alt = m; }
              }
              fireAt(side, u, alt || best, st);
            }
          }
        }
      }
    }

    // projectiles: homing + impact
    const dead = [];
    for (let i = 0; i < state.projs.length; i++) {
      const pj = state.projs[i];
      pj.life -= dt;
      if (pj.life <= 0) { dead.push(i); continue; }
      const side = pj.pl === 1 ? state.p1 : state.p2;
      const tgt = side.mobs.find(m => m.id === pj.tid && m.hp > 0);
      if (!tgt) { dead.push(i); continue; }
      const dx = tgt.x - pj.x, dy = tgt.y - pj.y, dist = Math.hypot(dx, dy);
      if (dist < CB.hitRadius) { dead.push(i); applyHit(side, pj, tgt); continue; }
      const sp = Math.hypot(pj.vx, pj.vy);
      const k = CB.homingInertia;
      pj.vx = pj.vx * k + (dx / dist * sp) * (1 - k);
      pj.vy = pj.vy * k + (dy / dist * sp) * (1 - k);
      pj.x += pj.vx * dt / 1000; pj.y += pj.vy * dt / 1000; pj.rot += dt * 0.005;
    }
    for (let i = dead.length - 1; i >= 0; i--) state.projs.splice(dead[i], 1);
  }

  function endGame(victory) {
    if (state.over) return;
    state.over = true; state.victory = victory;
    emit({ t: 'end', victory });
  }

  // ── player commands ─────────────────────────────────────────────────────────
  const trayDefs = teamInstances.map(inst => ({ inst, def: warriors.find(w => w.id === inst.id) }));

  function summonCost() { return state.p1.free > 0 ? 0 : state.p1.nextCost; }

  function summonFromTray(idx) {
    if (state.over) return false;
    const entry = trayDefs[idx];
    if (!entry) return false;
    const open = openSlots(state.p1);
    if (!open.length) return false;
    if (state.p1.free > 0) state.p1.free--;
    else {
      if (state.p1.gold < state.p1.nextCost) return false;
      state.p1.gold -= state.p1.nextCost;
      state.p1.nextCost += EC.summonCostStep;
    }
    const u = makeUnit(entry.def, entry.inst, rng.pick(open));
    state.p1.units.push(u);
    emit({ t: 'summon', uid: u.uid });
    return true;
  }

  function tryMerge(uidA, uidB) {
    const us = state.p1.units;
    const ai = us.findIndex(u => u.uid === uidA), bi = us.findIndex(u => u.uid === uidB);
    if (ai < 0 || bi < 0 || ai === bi) return false;
    const a = us[ai], b = us[bi];
    if (a.col !== b.col || a.stars !== b.stars || a.stars >= balance.merge.maxStars) return false;
    mergeUnits(state.p1, ai, bi);
    return true;
  }

  function skipWave() {
    if (state.over) return;
    state.wave++; state.wkills = 0;
    state.wtgt = balance.waves.killTargetBase + state.wave * balance.waves.killTargetPerWave;
    state.p1.gold += EC.skipWaveGold;
    for (let i = 0; i < EC.skipWaveSpawns; i++) spawnMob(state.p1, i * 0.12);
  }

  // ── initial deployment from balance config ──────────────────────────────────
  for (let i = 0; i < balance.ai.startUnits; i++) aiSummon();
  for (let i = 0; i < SP.initialP1; i++) spawnMob(state.p1, i * 0.14);
  for (let i = 0; i < SP.initialP2; i++) spawnMob(state.p2, i * 0.14);
  for (const side of [state.p1, state.p2]) for (const m of side.mobs) { const p = mobPos(m, side); m.x = p.x; m.y = p.y; }

  // Per-instance kill attribution for post-match XP (progression system input).
  function killsByIid() {
    const map = {};
    for (const u of state.p1.units) if (u.iid >= 0 && u.mk) map[u.iid] = (map[u.iid] || 0) + u.mk;
    return map;
  }

  return {
    state, update, summonFromTray, tryMerge, skipWave, summonCost, trayDefs, killsByIid,
    drainEvents() { return events.splice(0, events.length); },
    result() {
      return { victory: state.victory, kills: state.p1.kills, score: state.p1.score, wave: state.wave, hp: state.p1.hp, surv: Math.floor(state.surv), killsByIid: killsByIid() };
    },
  };
}
