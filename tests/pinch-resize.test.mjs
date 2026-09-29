import test from 'node:test';
import assert from 'node:assert/strict';
import { PINCH, pinchStep, pinchDisplay, settleScale, desktopScaleLimits } from '../desktop/layout.mjs';

const limits = { min: .5, max: 2.5 };
const pinch = (start, deltas, range = limits) => deltas.reduce((raw, deltaY) => pinchStep(raw, deltaY, range), start);
// One focused two-finger pinch recorded on macOS 15.6 / Electron 44 during the design spike.
const recorded = [-2.239, -3.707, -5.912, -7.036, -7.794, -7.826, -7.729, -7.024, -6.384, -5.953, -5.576, -4.863, -4.385, -3.650, -2.904, -1.889, -0.200];

test('pinching out grows, pinching in shrinks, anything else leaves the size alone', () => {
  assert.ok(pinchStep(1, -6, limits) > 1);
  assert.ok(pinchStep(1, 6, limits) < 1);
  for (const deltaY of [0, NaN, Infinity, -Infinity, undefined]) assert.equal(pinchStep(1.3, deltaY, limits), 1.3);
});

test('a recorded focused pinch follows the fingers exactly', () => {
  assert.ok(recorded.every(deltaY => Math.abs(deltaY) <= PINCH.stepLimit));
  const sum = recorded.reduce((total, deltaY) => total + deltaY, 0);
  assert.ok(Math.abs(pinch(1, recorded) - Math.exp(-sum / PINCH.sensitivity)) < 1e-9);
  assert.equal(Math.round(pinch(1, recorded) * 100), 234);
});

test('huge unfocused steps are bounded so the pet never jumps to a limit', () => {
  // Recorded while the pet window had no focus: few events, enormous deltas.
  const burst = [-4, -59.786, -287.393, -398.399];
  const grown = pinch(1, burst);
  assert.ok(Math.abs(grown - Math.exp((4 + 12 * 3) / PINCH.sensitivity)) < 1e-9);
  assert.ok(grown < 1.5);
});

test('the size stops at the display limits and turns back at once', () => {
  const top = pinch(1, Array(80).fill(-12));
  assert.equal(top, limits.max);
  assert.ok(pinchStep(top, 3, limits) < limits.max);
  assert.deepEqual(pinchDisplay(top, limits), { scale: limits.max, snapped: false, edge: 'max' });
  const bottom = pinch(1, Array(80).fill(12));
  assert.equal(bottom, limits.min);
  assert.ok(pinchStep(bottom, -3, limits) > limits.min);
  assert.deepEqual(pinchDisplay(bottom, limits), { scale: limits.min, snapped: false, edge: 'min' });
});

test('sizes near 100% snap to exactly 100% and let go once past it', () => {
  for (const raw of [.97, .99, 1, 1.01, 1.03]) assert.deepEqual(pinchDisplay(raw, limits), { scale: 1, snapped: true, edge: null });
  for (const raw of [.95, 1.05, 1.3]) assert.deepEqual(pinchDisplay(raw, limits), { scale: raw, snapped: false, edge: null });
});

test('a display without room for 100% never snaps above its maximum', () => {
  const small = desktopScaleLimits({ width: 275, height: 400 });
  assert.equal(small.max, .98);
  assert.deepEqual(pinchDisplay(.97, small), { scale: .97, snapped: false, edge: null });
  assert.equal(settleScale(.97, small), .97);
  assert.equal(pinch(small.max, [-12], small), small.max);
  assert.ok(settleScale(pinch(.9, Array(10).fill(-12), small), small) <= small.max);
});

test('the saved size is snapped, rounded to whole percents and inside the limits', () => {
  assert.equal(settleScale(1.2345, limits), 1.23);
  assert.equal(settleScale(1.03, limits), 1);
  assert.equal(settleScale(2.5, limits), 2.5);
  assert.equal(settleScale(.5, limits), .5);
});
