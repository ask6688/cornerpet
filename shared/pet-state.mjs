import { PET_ACTIONS } from './pet-interaction.mjs';

// Milliseconds. Keep timing separate from assets, animation code and OS polling.
export const PET_STATE_TIMING = Object.freeze({
  shortIdle: 2 * 60_000, sleep: 10 * 60_000, break: 5 * 60_000,
  welcome: 4_000, longWork: 50 * 60_000, reminder: 30 * 60_000,
  gestureMin: 45_000, gestureMax: 90_000,
});

/** @typedef {'active'|'short-idle'|'sleep'|'welcome-back'|'long-work'} PetState */
export const PET_STATE_MOODS = Object.freeze({
  active: undefined, 'short-idle': 'peek', sleep: 'sleepy',
  'welcome-back': 'happy', 'long-work': undefined,
});

/** In-memory behavior only: no pet edits, input contents, or activity history. */
export function createPetStateMachine({ now = 0, timing = PET_STATE_TIMING, random = Math.random } = {}) {
  /** @type {{ state: PetState, since: number, cue: (typeof PET_ACTIONS.happy & { instanceId: number }) | null }} */
  let snapshot = { state: 'active', since: now, cue: null };
  let lastTime = now, work = 0, nextReminder = timing.longWork, cueUntil = 0, serial = 0;
  const nextGesture = () => timing.gestureMin + random() * (timing.gestureMax - timing.gestureMin);
  let gestureAt = now + nextGesture();

  function cue(action, message, duration, time) {
    snapshot = { ...snapshot, cue: { ...action, message, duration, instanceId: --serial } };
    cueUntil = time + duration;
  }

  return {
    getSnapshot: () => snapshot,
    step({ now: time, idleSeconds, blocked = false, click = false }) {
      // A missing OS reading must not become fake activity or an accidental wake.
      if (!Number.isFinite(time) || time < lastTime || !Number.isFinite(idleSeconds) || idleSeconds < 0) return snapshot;
      const elapsed = time - lastTime;
      lastTime = time;
      const idle = click ? 0 : idleSeconds * 1000;
      if (blocked || idle >= timing.break || elapsed >= timing.break) {
        work = 0; nextReminder = timing.longWork;
      } else if (idle < timing.shortIdle && elapsed <= 5_000 && snapshot.state !== 'sleep') work += elapsed;

      const away = snapshot.state === 'sleep' || snapshot.state === 'short-idle';
      /** @type {PetState} */
      let state;
      if (blocked || idle >= timing.sleep) state = 'sleep';
      else if (idle >= timing.shortIdle) state = 'short-idle';
      else if (away || (snapshot.state === 'welcome-back' && time - snapshot.since < timing.welcome)) state = 'welcome-back';
      else state = work >= timing.longWork ? 'long-work' : 'active';

      if (state !== snapshot.state) {
        snapshot = { state, since: time, cue: null };
        gestureAt = time + nextGesture();
        if (state === 'welcome-back') cue(PET_ACTIONS.happy, '你回来啦，我一直在', timing.welcome, time);
      }
      if (snapshot.cue && time >= cueUntil) snapshot = { ...snapshot, cue: null };
      if (click) {
        gestureAt = time + nextGesture();
        if (state !== 'welcome-back' && snapshot.cue) snapshot = { ...snapshot, cue: null };
      }
      if (state === 'long-work' && work >= nextReminder && !click) {
        cue(PET_ACTIONS.shy, '陪你很久啦，伸个懒腰也好', 5_000, time);
        nextReminder = work + timing.reminder;
      } else if ((state === 'active' || state === 'short-idle' || state === 'long-work') && time >= gestureAt && !click && !snapshot.cue) {
        cue(random() < .5 ? PET_ACTIONS.blank : PET_ACTIONS.shy, '', 1800, time);
        gestureAt = time + nextGesture();
      }
      return snapshot;
    },
  };
}
