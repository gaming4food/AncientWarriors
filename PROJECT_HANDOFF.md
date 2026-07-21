# Ancient Warriors — Project Handoff

Paste this whole file into a new conversation to continue without losing context.

---

## What this is
A mobile-first (375×700) PVP tower-defense game called **Ancient Warriors: Legends of Battle**.
Historical hero-warriors auto-attack a horde marching around a perimeter path; you summon,
merge, cast ultimates, and defend your base. Beat the AI rival, then survive endlessly for records.

## Files (all under `C:\Users\codeg\Desktop\claudegame\`)
- **`index.html`** — THE MAIN GAME. Single self-contained file (~2600+ lines: HTML + CSS + vanilla JS,
  Canvas 2D, no frameworks, no build step). This is what we actively work on. Open it directly in a browser.
- **`phaser/`** — a separate, DONE-FOR-NOW Phaser 3 modular rebuild (engine-agnostic systems in
  `phaser/src/systems/`, JSON data in `phaser/src/data/`, thin scenes in `phaser/src/scenes/`,
  headless test `phaser/sim.test.mjs`). Built for future Unity porting. **Leave it alone unless asked** —
  the user explicitly parked it to work on the original `index.html`.
- **`mockups.html`** — 3 playing-field art-style mockups (Grim Emberfall, Storybook Meadow,
  Arcane Voidgate). User chose **Arcane Voidgate**, now live in the game.
- **`.claude/launch.json`** — preview server config (http-server on port 8123).
- **`PROJECT_HANDOFF.md`** — this file.

## How to run / verify
- Preview server serves the folder on **port 8123**. The main game is at `/` (index.html);
  the Phaser build is at `/phaser/`.
- Verification pattern used throughout: drive the game via `preview_eval` by calling functions
  directly (`go('gm')`, `initGame()`, `summonWarrior(i)`, `step(t)` in a loop with RAF stubbed),
  then screenshot. Always check `preview_console_logs` for errors and confirm zero.
- **IMPORTANT quirk:** testing runs in the SAME tab the user plays in. Calling `initGame()`,
  forcing `endGame()`, or navigating resets/disrupts their session. When done testing, reset to a
  clean state (`endToMenu()`), and if a test wrote fake data (records, gold, bastion levels),
  RESTORE it. A page reload clears any in-tab diagnostic logging.
- Syntax check before preview: extract the `<script>` block and `node --check` it.

---

## Core architecture of index.html

**Data (top of script):**
- `WARRIORS[]` — 20 heroes. Each: `{id,name,cls,role,col,cost,atk,aspd,proj/ps,pc,ab,abd,pix}`.
  `role` ∈ warrior/archer/mage/tank. `ab` = ability id. `pix` = pixel-art recipe (unused by the
  current REALISTIC renderer but kept). `ps` = projectile style.
- `ENEMY_TYPES[]` — Goblin, Skeleton, Orc, Boss, Shieldbearer(armored: ½ dmg unless crit),
  Gargoyle(flying: immune to root/slow/knockback), Shaman(healer: heals nearby mobs),
  Slime(splitter: splits on death). `pickEnemyType(wave)` phases new types in as waves rise.
- `MINI_NAMES` — champion minibosses (Gorefang/Skullmaw/Ashbringer/Dreadhorn) every 5th wave.
- `RARITIES/RARITY_RATES/RARITY_BONUS` — Common→Legendary; Legendary 1.5% odds, +110% atk.
- `GROWTH` — per-role per-level stat growth (warrior/archer/mage/tank each get different atk/spd/rng).
- `ULTS{}` — per-ability ultimate definitions (name + description).
- `TALENT_CAT/TALENTS/talMods()` — Lv5 talent choice (aura/strike/aoe/cc categories), deepens each milestone.
- `ELIXIR_COST[]` (by rarity), `ELIXIR_MAX=10`, regen constants.
- Bastion: `baseLvl/wellLvl`, `baseMaxHp()`, `baseUpCost()`, `wellUpCost()`, `wellRegenMs()`,
  `startElixir()`, `BASTION_MAX=10`.

**Persistence (localStorage):** `aw_roster` (owned warrior COPIES — instance model, each with
iid/ri/vA/vS/vR/lvl/xp/asc/talent), `aw_team` (5 iids), `aw_rank` (glory), `aw_gold` (shopGold),
`aw_bastion` ({base,well}), `aw_best` ({w:bestWave,s:bestSurv}), `aw_daily` (date string).
`loadStorage()` migrates legacy saves and backfills new fields.

**Key runtime globals:** `G` (match state or null), `roster/team/glory/shopGold`,
`baseLvl/wellLvl`, `bestWave/bestSurv`, `wuid/eid` (uid counters).

**Screens** (`go(id)` toggles `.sc.on`): `mn` menu, `tm` My Warriors, `pv` lobby, `sh` market,
`bs` Castle Upgrades, `rl` codex, `cd` countdown, `gm` game.

**Battle loop:** `tick()` wraps `step(dt)` in try/catch (errors show on-screen, never freeze).
`step()` handles: timer→boss/endless, elixir regen, ability buff timers, AI, spawner (column
groups), mob status/movement/breach, unit firing (`buffedStats`→`fireAt`), projectile homing+
`applyHit`, effects. `draw()` blits cached background (`buildArenaBG` builds it once) + `drawArcaneFX`
(live stars/shards/energy pulses) + entities.

---

## FEATURES BUILT (in order added, all working & verified)

1. **Full game** — dual arena, summon/merge, gold, waves, boss, all screens.
2. **Arcane Voidgate visuals** — floating obsidian platforms in a starfield with aurora, rune-etched
   cyan energy path channels, crystal-tile battlefield with magenta grid, summoning glyph circles,
   plasma stream + light bridge, torn green spawn rifts, golden stargate. Live animated layer:
   twinkling stars, drifting crystal shards, energy pulses flowing along paths.
3. **Realistic warrior figures** — painterly renderer (`drawFigure/drawWeapon/drawHelmet`), real
   human proportions, gradient shading, metallic speculars, capes/robes/hoods, sculpted cuirasses,
   detailed weapons. Rendered at 2× supersample → smooth downscale (NOT pixelated). Cached per warrior
   (`figSprite`), so detail is free at runtime. `drawMini` for UI.
4. **Monsters** — cartoon demon/monster renderer with marching bob, per-type features
   (goblin ears, skeleton sockets, orc horns, boss bat wings, gargoyle stone wings, shaman staff,
   slime goo, champion crown).
5. **20 unique abilities** — auras (banner/inspire/tactics), splash (cleave/acid), chain, poison
   (venom/ignite), curse, root, knockback (bash), crits (assassin), ramping (flurry/bushido/rage),
   conditional dmg (wrath/moonfire/siege), twin arrows. Scale with level (`pf` potency) + milestones.
6. **Progression/collection** — instance-based (every recruit a unique copy with rolled rarity +
   rolled atk/spd/range variance). XP ONLY from kills (per-warrior attribution). Role-based growth.
   Enhance screen: feed different-hero duplicates for XP, OR feed SAME-hero duplicates for **Star
   Ascension** (permanent +15% stats/+10% ability power per star, max 5★). Lv5 **talent** choice.
7. **Elixir economy** — regenerating elixir bar replaces gold summon costs (cost by rarity). Sell a
   warrior by dragging to the bottom strip for half refund. Kill gold → meta market only.
8. **Ultimates + targeting** — attacks/kills charge an ultimate meter; tap a glowing warrior to cast
   its unique ultimate. Tap an uncharged warrior to cycle target priority (Nearest→Strongest→First).
9. **Main menu redesign** — player header (leader portrait/level/XP bar), big metallic 2-line title,
   dusk key-art panel (serpent/castle/skull-king horde + hero lineup), icon menu buttons with
   subtitles, bottom nav (DAILY REWARDS working +500g/day, ACHIEVEMENTS/MAIL toasts, RANKINGS shows
   glory+best, BATTLE CODEX).
10. **My Warriors sort chips** — All / Level / Attack / Hits/s / Range (sort the whole collection,
    not role filters).
11. **Castle Upgrades (Bastion)** — permanent Golden Gate (base HP +2/lvl) & Elixir Well (faster
    regen, +1 start elixir/3 lvls), max Lv10. The base VISIBLY GROWS on the battlefield as it levels
    (`drawBastionGate` tiers: arch→posts→towers+banner→roofs+flags→curtain wall; `drawElixirWell`
    tiers). Menu button "CASTLE UPGRADES" (4th slot); Battle Codex moved to bottom nav.
12. **Survival mode + records** — beating the AI rival no longer ends the match; it triggers SURVIVAL
    MODE (rival arena dims with trophy banner, horde comes for you alone, endless). Run ends when YOUR
    base falls, still counts as VICTORY. Tracks `bestWave`/`bestSurv` (persisted, shown live + on
    results + Rankings). `enterSurvival()` handles the transition.
13. **Enemy toughness pass (latest)** — HP +~30% across all types, brutes slightly faster, wave HP
    scaling +60→+85/wave, champions 3000+400/wave → 4000+550/wave.

## Current balance snapshot (index.html)
- Elixir: max 10, regen ~1.4s (faster via Well + endless phase), cost by rarity [2,3,3,4,5,6].
- Enemy HP: Goblin 650, Skeleton 1150, Orc 2900, Boss 22000, Shieldbearer 1850, Gargoyle 900,
  Shaman 1050, Slime 1150. Wave scaling `+85/wave`, endless `×(1+surv/45)`. Champion `4000+550/wave`.
- Warrior battle atk = base×3×(1+rarityBonus)×variance×(1+roleAtkGrowth×(lvl-1))×(1+0.15×asc).
- Spawner: column groups 3→12 as waves rise; mob cap 34/side.
- Boss at 90s timer, then endless: stronger boss every 45s, difficulty ramps with survival seconds.

---

## Brainstormed ideas NOT yet built (user is picking from these)
Storyline: campaign map with themed acts (Greek→Roman→Norse→Egypt→Japan), champion villains with
portraits/taunts, Demon King final arc (his reanimation explains endless mode), hero bios + **era
bonds** (field same-era heroes for a team buff), name the AI rival (Shadow Warlord).
Mechanics: relic/equipment drops + Forge, roguelite wave drafts (pick 1 of 3 boons every 5 waves),
more base buildings (Barracks/War Academy — user said "not yet"), commander spells, boss phases,
elemental affinities.
Wire up existing menu buttons: Achievements (goals+rewards), Rankings (Glory ladder/tiers), Mail
(story delivery), Guild (shared boss).
User's stated priority order earlier: bonds → wave drafts → campaign acts → relics → base building.
**Most recent completed request path:** they wanted long-term base upgrading (DONE: Castle Upgrades),
then survival records (DONE), then enemy toughness (DONE).

## Working style / preferences observed
- User approves broad direction then lets me implement fully, verify live, and report.
- Wants things verified in the actual preview with screenshots + zero console errors before I claim done.
- Keep the parked Phaser build untouched unless asked.
- When I test in their tab, restore their real save data afterward.
- Concise, confident reporting of what changed + proof it works.

## Immediate next step
Nothing pending. Awaiting the next feature request (likely one of the brainstormed ideas — era bonds
or wave drafts were the top picks, or continuing storyline/campaign).
