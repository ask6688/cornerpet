// Calibrated against the public 1254 × 1254 demo PNGs; never guessed from uploads.
const anchor = (x, y, rx, ry, patchX, patchY) => Object.fromEntries(
  Object.entries({ x, y, rx, ry, patchX, patchY }).map(([key, value]) => [key, value / 1254]),
);
export const DEMO_FACE_RIGS = Object.freeze({
  mochi: {
    eyes: [anchor(516, 646, 28, 30, 420, 640), anchor(738, 646, 28, 30, 835, 640)],
    mouth: anchor(629, 678, 42, 28, 628, 752),
  },
  plush: {
    eyes: [anchor(499, 678, 31, 33, 400, 672), anchor(750, 678, 31, 33, 850, 672)],
    mouth: anchor(624, 704, 39, 26, 624, 765),
  },
});
