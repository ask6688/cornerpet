import { useCallback, useEffect, useRef, useState } from 'react';
import { PET_ACTIONS, nextPetReaction } from './pet-interaction.mjs';

export type PetAction = keyof typeof PET_ACTIONS;
export type PetReaction = (typeof PET_ACTIONS)[PetAction] & { instanceId: number };

export function usePetInteraction(initialAction?: PetAction) {
  const [reaction, setReaction] = useState<PetReaction | null>(() => initialAction ? { ...PET_ACTIONS[initialAction], instanceId: 0 } : null);
  const previous = useRef(initialAction ?? '');
  const instance = useRef(0);
  useEffect(() => {
    if (!reaction) return;
    const timer = setTimeout(() => setReaction(current => current === reaction ? null : current), reaction.duration);
    return () => clearTimeout(timer);
  }, [reaction]);
  const trigger = useCallback((action?: PetAction) => {
    const next = action ? PET_ACTIONS[action] : nextPetReaction(previous.current);
    previous.current = next.id;
    setReaction({ ...next, instanceId: ++instance.current });
  }, []);
  // Keep DOM events out of the action API: onClick={greet} always means random.
  const greet = useCallback(() => trigger(), [trigger]);
  const play = useCallback((action: PetAction) => trigger(action), [trigger]);
  const stop = useCallback(() => setReaction(null), []);
  return { reaction, reacting: reaction !== null, message: reaction?.message ?? '', greet, play, stop };
}
