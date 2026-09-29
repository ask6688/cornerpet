// Calibrated against the public 1254 × 1254 demo PNGs; never guessed from uploads.
const anchor = (x, y, rx, ry, patchX, patchY) => ({
  x: x / 1254, y: y / 1254, rx: rx / 1254, ry: ry / 1254, patchX: patchX / 1254, patchY: patchY / 1254,
});
export const DEMO_FACE_RIGS = Object.freeze({
  mochi: {
    eyes: [anchor(517, 644, 39, 43, 420, 625), anchor(733, 644, 39, 43, 835, 625)],
    mouth: anchor(625, 675, 50, 38, 625, 752),
  },
  plush: {
    eyes: [anchor(510, 671, 42, 46, 400, 665), anchor(751, 671, 42, 46, 850, 665)],
    mouth: anchor(632, 705, 50, 40, 624, 765),
  },
});
