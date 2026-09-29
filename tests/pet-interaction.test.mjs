import assert from 'node:assert/strict';
import test from 'node:test';
import { OPTIONS } from '../shared/pet-config.mjs';
import { PET_ACTIONS, PET_REACTIONS, nextPetReaction, petMotionAt } from '../shared/pet-interaction.mjs';

test('tap reactions use supported moods and never repeat the previous response', () => {
  const moods = new Set(OPTIONS.moods.map(item => item.value));
  let previous = '';
  for (let i = 0; i < 200; i++) {
    const next = nextPetReaction(previous);
    assert.ok(PET_REACTIONS.includes(next));
    assert.notEqual(next.id, previous);
    assert.ok(moods.has(next.mood));
    assert.ok(next.message.length > 0);
    assert.equal(next.duration, 1800);
    previous = next.id;
  }
  assert.equal(PET_REACTIONS.length, 5);
  assert.equal(PET_ACTIONS.surprised.mood, 'spotted');
});

test('all gestures settle; the requested showcase hops then spins once and returns', () => {
  const rest = { y: 0, rx: 0, ry: 0, rz: 0 };
  for (const action of Object.values(PET_ACTIONS)) {
    assert.deepEqual(petMotionAt(action.motion, 0, action.duration), rest);
    assert.deepEqual(petMotionAt(action.motion, action.duration, action.duration), rest);
    assert.deepEqual(petMotionAt(action.motion, action.duration + 500, action.duration), rest);
    assert.notDeepEqual(petMotionAt(action.motion, 250, action.duration), rest);
  }
  const { motion, duration } = PET_ACTIONS.showcase;
  assert.equal(PET_ACTIONS.showcase.message, '');
  assert.ok(petMotionAt(motion, duration * .14, duration).y > .18);
  assert.equal(petMotionAt(motion, duration * .14, duration).ry, 0);
  assert.ok(Math.abs(petMotionAt(motion, duration * .55, duration).ry - Math.PI) < 1e-10);
  assert.deepEqual(petMotionAt(motion, duration * .9, duration), rest);
});
