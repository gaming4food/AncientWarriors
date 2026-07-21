// geometry.js — the exact arena maths from the Canvas 2D build, engine-free.
// Ported 1:1 so warriors/enemies land on the same painted tiles and lanes.

export const W = 375, H = 700;
export const AH = Math.floor(H / 2);   // one arena half
export const WL = 28;                  // wall inset
export const IW = W - WL * 2, IH = AH - WL * 2;

let GEO = null;
export function setGeometry(g) { GEO = g; }
export function geo() { return GEO; }

// 4x3 tile grid mapped onto the painted arena background (cover-fit)
export function slotPos(slot, bgW, bgH) {
  const c = slot % 4, r = Math.floor(slot / 4);
  if (bgW && bgH) {
    const s = Math.max(W / bgW, H / bgH), dw = bgW * s, dh = bgH * s;
    const offX = (W - dw) / 2, offY = (H - dh) / 2;
    return { x: GEO.BG_COLF[c] * dw + offX, y: GEO.BG_ROWF[r] * dh + offY };
  }
  const tw = IW / 4, th = IH / 3;
  return { x: WL + c * tw + tw / 2, y: WL + r * th + th / 2 };
}

// Enemy lane: portal (centre) -> down a side -> in to the base. 3 segments.
export function segLens() {
  const halfW = Math.abs(W / 2 - GEO.PATH_SX * W);
  const colH = AH * (1 - GEO.PATH_INSET - GEO.PATH_BASEINSET);
  return [halfW, colH, halfW];
}

export function enemyPos(m, ay, flip) {
  const xm = W / 2;
  const xs = ((m.side || 0) === 0) ? GEO.PATH_SX * W : (1 - GEO.PATH_SX) * W;
  let yp, yb;
  if (!flip) { yp = ay + AH * (1 - GEO.PATH_INSET); yb = ay + AH * GEO.PATH_BASEINSET; }
  else { yp = ay + AH * GEO.PATH_INSET; yb = ay + AH * (1 - GEO.PATH_BASEINSET); }
  const segs = [[xm, yp, xs, yp], [xs, yp, xs, yb], [xs, yb, xm, yb]];
  const s = segs[Math.min(m.seg, 2)];
  return { x: s[0] + (s[2] - s[0]) * m.sp, y: s[1] + (s[3] - s[1]) * m.sp };
}

export function advanceEnemy(m, dt) {
  const L = segLens();
  m.sp += m.spd * dt / (1000 * L[Math.min(m.seg, 2)]);
  while (m.sp >= 1 && m.seg < 3) { m.sp -= 1; m.seg++; }
}
