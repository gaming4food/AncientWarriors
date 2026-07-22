# Perspective Lane — Production Art Spec

The lane prototype (`webgl/lane.html`) auto-detects these files and switches from
placeholders the moment they exist. **Exact filenames matter.**

## THE SHOT LIST — 6 images total for the full mockup look

| # | File (exact path) | What it is | Size |
|---|---|---|---|
| 1 | `assets/lane/corridor.png` | Painted corridor battlefield background | **1024×2048** portrait, opaque (no transparency) |
| 2 | `assets/warriors/back/b15.png` | **Joan** — back view | 768×960, transparent PNG |
| 3 | `assets/warriors/back/b2.png` | **Robin Hood** — back view | 768×960, transparent PNG |
| 4 | `assets/warriors/back/b4.png` | **Merlin** — back view | 768×960, transparent PNG |
| 5 | `assets/warriors/back/b10.png` | **Viking** — back view | 768×960, transparent PNG |
| 6 | `assets/warriors/back/b8.png` | **Cleopatra** — back view | 768×960, transparent PNG |

Enemies need **no remakes** — they march toward the camera, so the existing
front-facing enemy art is already correct. Card-tray portraits keep using the
existing front-view warrior art. (Back views for the other 50 warriors + 6
mythics come later in batches, using the same master prompt below.)

---

## 1 — The Corridor Background (`assets/lane/corridor.png`)

```
A breathtaking vertical battlefield environment for a AAA mobile fantasy strategy
game, ultra-detailed realistic digital painting.

CAMERA: low third-person view from behind the player's front line, looking straight
down a long processional avenue toward a distant enemy fortress. Strong one-point
perspective, vanishing point at roughly 30% from the top of the frame.

THE AVENUE: a wide paved stone causeway of huge weathered sandstone flagstones runs
from the bottom edge of the frame to the fortress gate. The paving shows ancient wear,
cracks, scattered sand, and faint golden inlaid glyphs. KEEP THE CENTRAL CAUSEWAY
COMPLETELY CLEAR — no props, debris, or figures on the road itself (game units render
on top of it).

FLANKS: towering ancient Egyptian architecture lines both sides in perspective —
obelisks with hieroglyphs, colossal pharaoh statues with golden headdresses, ruined
colonnades, tattered ROYAL BLUE banners with gold trim. Torches and braziers with
warm flame glow mounted on the stonework.

BACKGROUND: at the vanishing point, a massive fortified gate-city — golden domes,
crenellated walls, RED war banners, and a glowing amber portal archway at the gate's
center. Hazy desert mountains and a dramatic dusty amber sky behind it, god-rays
breaking through.

BOTTOM OF FRAME: the nearest 15% is an open stone plaza (the player's ground) — keep
it clear and slightly darker/vignetted; five glowing summon platforms are rendered by
the game engine, do not paint them.

LIGHTING: golden-hour desert light from the upper right, long soft shadows, warm
bounce light, atmospheric dust haze increasing with distance.

Style: photorealistic painterly, cinematic, rich texture detail, high dynamic range.
No characters, no creatures, no UI, no text, no watermark.
Output: 1024x2048 portrait (or larger at 1:2 ratio), sharp.
```

---

## 2–6 — Back-View Heroes (MASTER PROMPT)

Use this block for every hero; swap only the CHARACTER line.

```
CHARACTER: <paste the character line for the file you are generating>

FULL-BODY HERO SEEN DIRECTLY FROM BEHIND (back view) — we see the back of the head,
shoulders, cape/back details and heels; face NOT visible (a sliver of profile at most).
Standing in a poised ready-for-battle stance on flat ground, weapon in hand, slight
heroic contrapposto. The BACK of the costume is the star: cape drape, back armor
plates, quiver/slung gear, hair from behind.

Art style: AAA-quality realistic fantasy digital painting, cinematic detail —
weathered metal, embossed gold trim, layered fabric, leather straps — with warm
golden-hour rim light tracing the silhouette from the upper right and cool ambient
fill from the left.

Composition: SINGLE character, centered, entire body visible head to feet, feet at
the very bottom edge, small even margin, consistent scale between heroes, nothing
cropped, no props floating.

Background: FULLY TRANSPARENT (alpha PNG). No scenery, no ground, no shadow.

Output: 768x960 portrait, sharp, no blur.

Avoid: front view, visible face, background, scenery, ground plane, text, watermark,
borders, multiple characters, cropped limbs, motion blur.
```

### Character lines

**b15.png — Joan (Holy Knight)**
```
CHARACTER: Joan, the Holy Knight — armored holy knight in gleaming gold-and-steel
full plate seen from behind: ornate engraved backplate with a radiant sun emblem,
royal-blue cape with gold trim falling to the calves, winged gold round shield slung
on her back-left arm, flanged holy mace held at her right side, braided auburn hair
over the backplate, dominant colors royal blue (#1d4ed8) and gold.
```

**b2.png — Robin Hood (Forest Archer)**
```
CHARACTER: Robin Hood, the Forest Archer — lithe hooded archer seen from behind:
deep red-and-crimson hooded cloak (hood UP) draping over green leather armor, a
full quiver of arrows and an unstrung spare bowstave crossed on the back, longbow
drawn in the left hand at his side, worn leather bracers and boots, dominant colors
forest green (#22c55e) and crimson.
```

**b4.png — Merlin (Court Wizard)**
```
CHARACTER: Merlin, the Court Wizard — ancient archmage seen from behind: flowing
royal-blue robe with gold arcane sigils down the spine, long silver-white hair and
the sides of a great white beard visible past the shoulders, ornate crystal-topped
staff glowing pale blue held in the right hand, slight magical shimmer around the
staff head, dominant colors deep blue and violet (#a855f7).
```

**b10.png — Viking (Norse Raider)**
```
CHARACTER: Viking, the Norse Raider — hulking berserker seen from behind: massive
bare shoulders and back muscles under a wolf-pelt mantle, horned iron helm, long
braided red-blond hair, twin-headed war axe gripped low in the right hand, round
painted shield slung on the back, fur-wrapped boots, battle scars, dominant color
blood red (#dc2626).
```

**b8.png — Cleopatra (Pharaoh Queen)**
```
CHARACTER: Cleopatra, the Pharaoh Queen — regal sorceress-queen seen from behind:
white-and-gold pleated gown with an open back panel of gold scale, wide gold usekh
collar visible at the shoulders, black braided hair with gold beads beneath a
serpent-crowned headdress, golden was-scepter with glowing blue gem held at her
side, gold armbands, dominant colors white and gold (#d4a017).
```

---

## Consistency checklist (before saving each PNG)
- [ ] Back view — no face visible
- [ ] Transparent background, no painted shadow
- [ ] Feet at the very bottom edge
- [ ] Same lighting: warm rim from upper-right
- [ ] Filename + folder exactly as the shot list (create `assets/lane/` and `assets/warriors/back/`)
