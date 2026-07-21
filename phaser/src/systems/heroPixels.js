// systems/heroPixels.js — authored pixel-art hero sprites as pure data.
// Produces a list of {x,y,w,h,color} rect ops on a 24×28 cell grid from the
// warrior's `pix` config, plus an outline mask. NO canvas/engine calls here —
// the presentation layer rasterizes the ops (Phaser: canvas texture;
// Unity: Texture2D.SetPixels).

export const HERO_GRID = { w: 24, h: 28 };
const OUTLINE = '#1a120a';

function shade(hex, n) {          // n>0 lighten, n<0 darken
  const p = parseInt(hex.slice(1), 16);
  const c = v => Math.max(0, Math.min(255, v + n));
  return '#' + [(p >> 16) & 255, (p >> 8) & 255, p & 255].map(v => c(v).toString(16).padStart(2, '0')).join('');
}

export function heroPixelOps(pix) {
  const ops = [];
  const px = (color, x, y, w = 1, h = 1) => ops.push({ x, y, w, h, color });
  const { skin, body, legs } = pix;
  const hc = pix.hc || '#888888', hc2 = pix.hc2 || '#d42a2a';

  // shield (behind body)
  if (pix.shield === 'round') {
    const sc = pix.sc;
    px(sc, 1, 13, 6, 6); px(sc, 2, 12, 4, 1); px(sc, 2, 19, 4, 1);
    px(shade(sc, 45), 2, 12, 4, 1); px(shade(sc, 30), 1, 13, 1, 6);
    px(shade(sc, -45), 6, 13, 1, 6);
    px('#e8c860', 3, 15, 2, 2);
    px(shade(sc, -60), 3, 13, 2, 1); px(shade(sc, -60), 3, 18, 2, 1);
  } else if (pix.shield === 'tower') {
    const sc = pix.sc;
    px(sc, 1, 11, 6, 10); px(sc, 2, 21, 4, 1);
    px(shade(sc, 45), 1, 11, 6, 1); px(shade(sc, 25), 1, 11, 1, 10);
    px(shade(sc, -40), 6, 11, 1, 10);
    px('#ffd700', 3, 13, 2, 5); px('#ffd700', 2, 15, 4, 2);
  }

  // legs + boots
  px(legs, 8, 21, 3, 3); px(legs, 13, 21, 3, 3);
  px(shade(legs, -30), 10, 21, 1, 3); px(shade(legs, -30), 15, 21, 1, 3);
  px('#3a2412', 7, 24, 4, 3); px('#3a2412', 13, 24, 4, 3);
  px('#5a3a20', 7, 24, 4, 1); px('#5a3a20', 13, 24, 4, 1);

  // torso
  px(body, 6, 13, 12, 6);
  px(shade(body, 40), 6, 13, 3, 6);
  px(shade(body, -40), 15, 13, 3, 6);
  px(shade(body, 65), 7, 13, 1, 5);
  px(shade(body, -70), 6, 18, 12, 1);
  px('#ffd700', 11, 18, 2, 1);
  px(body, 6, 19, 12, 2);
  px(shade(body, -28), 6, 20, 12, 1);

  // arms + hands
  px(body, 4, 13, 2, 4); px(body, 18, 13, 2, 4);
  px(shade(body, -30), 4, 16, 2, 1); px(shade(body, -30), 18, 16, 2, 1);
  px(skin, 4, 17, 2, 2); px(skin, 18, 17, 2, 2);

  // head + face
  px(skin, 8, 6, 8, 7);
  px(shade(skin, 30), 8, 6, 8, 1);
  px(shade(skin, -22), 15, 7, 1, 6);
  px('#1a120a', 9, 8, 2, 2); px('#1a120a', 13, 8, 2, 2);
  px('#ffffff', 10, 8, 1, 1); px('#ffffff', 14, 8, 1, 1);
  px('#4a2a10', 9, 7, 2, 1); px('#4a2a10', 13, 7, 2, 1);
  px('#8a4a30', 11, 11, 2, 1);

  // beard
  if (pix.beard) {
    const b = pix.beard.col;
    px(b, 8, 10, 8, 3);
    px(shade(b, -25), 8, 12, 8, 1);
    if (pix.beard.long) { px(b, 9, 13, 6, 3); px(b, 10, 16, 4, 2); px(shade(b, -20), 10, 17, 4, 1); }
    else px(b, 9, 13, 6, 1);
    px('#8a4a30', 11, 11, 2, 1);
  }

  // headgear
  switch (pix.helm) {
    case 'plume':
      px(hc, 7, 3, 10, 3); px(hc, 8, 2, 8, 1);
      px(shade(hc, 45), 8, 2, 8, 1); px(shade(hc, 30), 7, 3, 2, 3);
      px(shade(hc, -30), 15, 3, 2, 3);
      px(hc, 7, 6, 1, 5); px(hc, 16, 6, 1, 5);
      px(hc, 11, 6, 2, 2);
      px(hc2, 9, 0, 6, 2); px(hc2, 10, 2, 4, 1);
      px(shade(hc2, 40), 9, 0, 6, 1);
      break;
    case 'horned':
      px(hc, 7, 3, 10, 3); px(hc, 8, 2, 8, 1);
      px(shade(hc, 40), 8, 2, 8, 1);
      px(shade(hc, -40), 7, 5, 10, 1);
      px('#e8e0d0', 4, 2, 2, 3); px('#e8e0d0', 18, 2, 2, 3);
      px('#e8e0d0', 5, 1, 1, 1); px('#e8e0d0', 18, 1, 1, 1);
      px('#c8b8a0', 5, 4, 1, 2); px('#c8b8a0', 18, 4, 1, 2);
      break;
    case 'hood':
      px(hc, 7, 2, 10, 4); px(hc, 8, 1, 8, 1);
      px(hc, 6, 4, 2, 9); px(hc, 16, 4, 2, 9);
      px(shade(hc, 30), 8, 1, 8, 1); px(shade(hc, 22), 6, 4, 1, 8);
      px(shade(hc, -30), 17, 4, 1, 8);
      break;
    case 'nemes': {
      for (let r = 0; r < 4; r++) px(r % 2 ? hc2 : hc, 6, 2 + r, 12, 1);
      px(hc, 6, 1, 12, 1);
      for (let r = 0; r < 8; r++) { px(r % 2 ? hc2 : hc, 5, 6 + r, 2, 1); px(r % 2 ? hc2 : hc, 17, 6 + r, 2, 1); }
      px('#ffd700', 11, 1, 2, 1); px('#2ac82a', 11, 0, 2, 1);
      break; }
    case 'wizard':
      px(shade(hc, -20), 5, 6, 14, 1);
      px(hc, 7, 5, 10, 1); px(hc, 8, 4, 8, 1); px(hc, 9, 3, 6, 1);
      px(hc, 10, 2, 4, 1); px(hc, 11, 1, 3, 1); px(hc, 12, 0, 2, 1);
      px(shade(hc, 30), 8, 4, 2, 1); px(shade(hc, 30), 9, 3, 2, 1);
      px(hc2, 10, 3, 1, 1);
      break;
    case 'great':
      px(hc, 7, 3, 10, 10); px(hc, 8, 2, 8, 1);
      px(shade(hc, 40), 8, 2, 8, 1); px(shade(hc, 25), 7, 3, 2, 9);
      px(shade(hc, -30), 15, 3, 2, 10);
      px('#14100a', 9, 7, 6, 2);
      px(hc2, 10, 7, 4, 1);
      px(shade(hc, -40), 9, 10, 6, 1);
      px(hc2, 11, 0, 2, 2);
      break;
    case 'turban':
      px(hc, 7, 2, 10, 4); px(hc, 8, 1, 8, 1);
      px(shade(hc, -20), 7, 4, 10, 1);
      px(hc2, 11, 3, 2, 2);
      px(hc, 6, 4, 2, 4); px(hc, 16, 4, 2, 4);
      break;
    case 'kabuto':
      px(hc, 7, 3, 10, 3); px(hc, 8, 2, 8, 1);
      px(hc, 5, 5, 3, 2); px(hc, 16, 5, 3, 2);
      px(shade(hc, 35), 8, 2, 8, 1);
      px(hc2, 9, 0, 2, 3); px(hc2, 13, 0, 2, 3);
      px(hc2, 11, 1, 2, 1);
      break;
    case 'mask':
      px(hc, 7, 2, 10, 11); px(hc, 8, 1, 8, 1);
      px(shade(hc, 20), 8, 1, 8, 1);
      px(skin, 9, 7, 6, 2);
      px('#1a120a', 10, 7, 1, 2); px('#1a120a', 13, 7, 1, 2);
      break;
    case 'leaf':
      px(hc, 7, 2, 10, 4); px(hc, 8, 1, 8, 1);
      px(hc, 6, 4, 2, 9); px(hc, 16, 4, 2, 9);
      px(hc2, 7, 1, 2, 2); px(hc2, 11, 0, 2, 2); px(hc2, 15, 1, 2, 2);
      break;
    case 'scholar':
      px(hc, 7, 3, 10, 3); px(hc, 6, 5, 12, 1);
      px(shade(hc, 25), 7, 3, 10, 1);
      px(hc2, 11, 2, 2, 1);
      break;
    case 'cap':
      px(hc, 7, 3, 10, 3); px(hc, 8, 2, 8, 1);
      px(shade(hc, 40), 8, 2, 8, 1);
      px(shade(hc, -30), 7, 5, 10, 1);
      break;
  }

  // weapon (right side)
  const wc = pix.wc || '#88e0ff';
  switch (pix.weapon) {
    case 'sword':
      px('#e8e8f0', 20, 4, 2, 11); px('#ffffff', 20, 4, 1, 11);
      px('#e8e8f0', 20, 3, 2, 1); px('#ffffff', 20, 2, 1, 1);
      px('#c8920f', 18, 15, 6, 1);
      px('#7a4a20', 20, 16, 2, 3);
      px('#c8920f', 20, 19, 2, 1);
      break;
    case 'axe':
      px('#8a5a2a', 20, 6, 2, 13); px('#a8743a', 20, 6, 1, 13);
      px('#d8d8e0', 17, 3, 6, 4); px('#ffffff', 17, 3, 6, 1);
      px('#a8a8b8', 17, 6, 3, 1);
      break;
    case 'bow':
      px('#8a5a2a', 19, 4, 1, 2); px('#8a5a2a', 20, 6, 1, 3);
      px('#a8742f', 21, 9, 1, 4);
      px('#8a5a2a', 20, 13, 1, 3); px('#8a5a2a', 19, 16, 1, 2);
      px('#e8e0c8', 18, 5, 1, 12);
      px('#d8d8e0', 15, 10, 6, 1); px('#ffffff', 20, 10, 1, 1);
      break;
    case 'staff':
      px('#7a4a20', 20, 7, 2, 12); px('#9a6a3a', 20, 7, 1, 12);
      px(wc, 19, 3, 4, 4);
      px(shade(wc, 70), 20, 4, 2, 2);
      px('#ffffff', 20, 4, 1, 1);
      break;
    case 'spear':
      px('#8a5a2a', 20, 4, 2, 15); px('#a8743a', 20, 4, 1, 15);
      px('#d8d8e0', 19, 1, 4, 3);
      px('#ffffff', 20, 0, 2, 1); px('#ffffff', 19, 1, 1, 1);
      break;
  }
  return ops;
}

// Rasterizes ops into a pixel grid (2-D color array) with a 1px dark outline —
// still engine-free; callers turn the grid into a texture.
export function heroPixelGrid(pix) {
  const { w, h } = HERO_GRID;
  const grid = Array.from({ length: h }, () => new Array(w).fill(null));
  for (const op of heroPixelOps(pix)) {
    for (let y = op.y; y < op.y + op.h; y++)
      for (let x = op.x; x < op.x + op.w; x++)
        if (x >= 0 && x < w && y >= 0 && y < h) grid[y][x] = op.color;
  }
  // auto outline
  const solid = (x, y) => x >= 0 && x < w && y >= 0 && y < h && grid[y][x] && grid[y][x] !== OUTLINE;
  const outl = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y][x]) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) outl.push([x, y]);
  }
  outl.forEach(([x, y]) => grid[y][x] = OUTLINE);
  return grid;
}
