# Ancient Warriors — Phaser 3 Prototype (Unity-portable architecture)

Run: serve the repo root with any static server and open `/phaser/`
(e.g. `npx http-server -p 8123` → http://localhost:8123/phaser/).

## Architecture

```
phaser/
├── index.html                 Phaser CDN + module entry
└── src/
    ├── main.js                Phaser bootstrap only (scene registry)
    ├── data/                  ALL tuning as engine-independent JSON
    │   ├── warriors.json      20 warrior defs: stats, abilities, pixel-art recipe
    │   ├── enemies.json       enemy types + spawn weights
    │   ├── rarity.json        rarity names/rates/bonuses/variance ranges
    │   ├── progression.json   XP, role growth, potency, sacrifice coefficients
    │   └── balance.json       arena geometry, spawner, boss, economy, ability numbers
    ├── systems/               PURE LOGIC — no Phaser, no DOM
    │   ├── rng.js             seedable xorshift RNG (reproducible in C#)
    │   ├── stats.js           rarity/variance rolls, warriorStats formula
    │   ├── progression.js     xpNeed / grantXp / sacrificeXp / applyMatchResult
    │   ├── collection.js      inventory, team, gacha mint, sacrifice (uses storage port)
    │   ├── storage.js         persistence port (localStorage / in-memory backends)
    │   ├── heroPixels.js      pixel-art sprites as data (rect ops + color grid)
    │   └── battle.js          authoritative match simulation + event queue
    └── scenes/                PHASER-ONLY presentation
        ├── BootScene.js       loads JSON, bakes textures from pixel grids, wires systems
        ├── MenuScene.js
        ├── CollectionScene.js My Warriors: team select + enhance/sacrifice
        ├── MarketScene.js     gacha
        └── BattleScene.js     renders battle state, forwards input commands
```

## Rules that keep it portable

1. **`systems/` never imports Phaser** — plain data in, plain data out.
2. **Scenes never compute gameplay.** They render `battle.state`, drain
   `battle.drainEvents()` for one-shot FX, and forward input as commands
   (`summonFromTray`, `tryMerge`, `skipWave`, `collection.sacrifice`, …).
3. **Every number lives in `data/*.json`** — formulas in systems read
   coefficients, they don't hardcode them.
4. **Persistence is a port** (`storage.js`); systems don't know localStorage exists.
5. **The battle sim is headless-runnable** (see `sim.test.mjs`) — the same
   property you want for Unity edit-mode tests.

## Unity porting map

| Prototype file            | Unity counterpart                                        |
|---------------------------|----------------------------------------------------------|
| `data/*.json`             | same JSON via `JsonUtility`/Newtonsoft or ScriptableObjects |
| `systems/rng.js`          | `Rng` class (same xorshift32 → identical rolls)          |
| `systems/stats.js`        | `static class StatsSystem`                               |
| `systems/progression.js`  | `static class ProgressionSystem`                         |
| `systems/collection.js`   | `CollectionService` + `ISaveStore`                       |
| `systems/storage.js`      | `ISaveStore` → PlayerPrefs / file adapter                |
| `systems/heroPixels.js`   | sprite baker → `Texture2D.SetPixels` (or replace with real art) |
| `systems/battle.js`       | `BattleSimulation` class; event queue → C# events/structs |
| `scenes/BattleScene.js`   | `BattleView : MonoBehaviour` reading sim state           |
| other scenes              | uGUI/UIToolkit screens calling the same services         |

The battle loop contract to preserve in C#:
`sim.Update(dtMs)` → mutate state; view reads entity lists (id-keyed pooling);
`sim.DrainEvents()` → FX/audio; player input → command methods returning bool.
