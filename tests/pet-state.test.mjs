import test from 'node:test';
import assert from 'node:assert/strict';
import { createPetStateMachine, PET_STATE_TIMING as timing } from '../shared/pet-state.mjs';

test('idle → sleep → welcome → active; click wakes; locked/suspended wins', () => {
  const machine = createPetStateMachine({ random: () => 0 });
  const tick = (now, idleSeconds, extra = {}) => machine.step({ now, idleSeconds, ...extra });
  assert.equal(tick(1000, 0).state, 'active');
  assert.equal(tick(120000, 120).state, 'short-idle');
  assert.equal(tick(600000, 600).state, 'sleep');
  assert.equal(tick(601000, 601).cue, null);
  let state = tick(602000, 0);
  assert.equal(state.state, 'welcome-back');
  assert.equal(state.cue.motion, 'hop');
  const serial = state.cue.instanceId;
  assert.equal(tick(603000, 1).cue.instanceId, serial, 'wake plays once');
  assert.equal(tick(606000, 0).state, 'active');
  assert.equal(tick(607000, 0, { blocked: true }).state, 'sleep');
  assert.equal(tick(608000, 0, { blocked: true, click: true }).state, 'sleep');
  assert.equal(tick(609000, 500, { click: true }).state, 'welcome-back');
  assert.equal(tick(610000, 0, { blocked: true }).state, 'sleep');
  assert.equal(tick(611000, 700).state, 'sleep', 'resume alone is not user activity');
  assert.equal(tick(612000, 0).state, 'welcome-back');
  const previous = machine.getSnapshot();
  assert.equal(tick(613000, NaN), previous);
  assert.equal(tick(613000, -1), previous);
  assert.equal(tick(0, 0), previous);
});

test('quiet gestures are sparse; work reminders respect breaks and never repeat each poll', () => {
  const machine = createPetStateMachine({ random: () => 0 });
  const tick = (now, idleSeconds = 0) => machine.step({ now, idleSeconds });
  assert.equal(tick(1000).cue, null);
  let state = tick(timing.gestureMin);
  assert.equal(state.cue.message, '', 'spontaneous gesture does not talk');
  assert.equal(tick(timing.gestureMin + 2000).cue, null);
  let reminders = 0, serial;
  for (let now = 48000; now <= timing.longWork + timing.reminder + 50000; now += 1000) {
    state = tick(now);
    if (state.cue?.message && state.cue.instanceId !== serial) { reminders++; serial = state.cue.instanceId; }
  }
  assert.equal(reminders, 2);
  assert.equal(state.state, 'long-work');
  let now = timing.longWork + timing.reminder + 51000;
  assert.equal(tick(now, 300).state, 'short-idle');
  assert.equal(tick(now + 1000).state, 'welcome-back');
  assert.equal(tick(now + 5000).state, 'active', 'five-minute break resets work budget');
  assert.equal(tick(now + timing.break + 10000).state, 'active', 'timer gaps never accrue work');
});
