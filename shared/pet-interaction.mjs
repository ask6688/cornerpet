export const PET_ACTIONS = Object.freeze({
  happy: Object.freeze({ id: 'happy', mood: 'happy', motion: 'hop', duration: 1800, message: '嘿嘿，接住你的喜欢了' }),
  shy: Object.freeze({ id: 'shy', mood: 'shy', motion: 'tilt', duration: 1800, message: '再摸一下……也可以' }),
  sleepy: Object.freeze({ id: 'sleepy', mood: 'sleepy', motion: 'nod', duration: 1800, message: '唔，陪你眯一小会儿' }),
  blank: Object.freeze({ id: 'blank', mood: 'blank', motion: 'wobble', duration: 1800, message: '刚刚在发呆，现在在陪你' }),
  surprised: Object.freeze({ id: 'surprised', mood: 'spotted', motion: 'startle', duration: 1800, message: '咦，是你呀！' }),
  showcase: Object.freeze({ id: 'showcase', mood: 'happy', motion: 'showcase', duration: 2600, message: '' }),
});

export const PET_REACTIONS = Object.freeze(Object.values(PET_ACTIONS).filter(item => item.id !== 'showcase'));

/** Pick a temporary response without touching the saved pet or repeating the last one. */
export function nextPetReaction(previousId = '') {
  const choices = PET_REACTIONS.filter(item => item.id !== previousId);
  return choices[Math.floor(Math.random() * choices.length)];
}

/** Temporary model transform; the asset and its saved pose remain unchanged. */
export function petMotionAt(motion, elapsedMs, duration = 1800) {
  const pose = { y: 0, rx: 0, ry: 0, rz: 0 };
  if (elapsedMs <= 0 || elapsedMs >= duration) return pose;
  const t = elapsedMs / 1000;
  const gesture = Math.sin(Math.min(t / 1.15, 1) * Math.PI);
  if (motion === 'hop') pose.y = gesture * .12;
  if (motion === 'tilt') pose.rz = gesture * .09;
  if (motion === 'nod') pose.rx = gesture * .08;
  if (motion === 'wobble') pose.rz = Math.sin(t * 7) * gesture * .045;
  if (motion === 'startle') pose.y = Math.sin(Math.min(t / .5, 1) * Math.PI) * .17;
  if (motion === 'showcase') {
    const progress = elapsedMs / duration;
    pose.y = progress < .28 ? Math.sin(progress / .28 * Math.PI) * .19 : 0;
    const turn = Math.max(0, Math.min((progress - .28) / .54, 1));
    pose.ry = turn < 1 ? turn * turn * (3 - 2 * turn) * Math.PI * 2 : 0;
  }
  return pose;
}
