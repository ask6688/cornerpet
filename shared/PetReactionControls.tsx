import type { usePetInteraction } from './usePetInteraction';
import './pet-reaction-controls.css';

export function PetReactionControls({ play, disabled = false }: {
  play: ReturnType<typeof usePetInteraction>['play']; disabled?: boolean;
}) {
  return <div className="pet-reaction-controls" aria-label="和小伙伴玩一下">
    <div role="group" aria-label="试试小心情">
      <button disabled={disabled} onClick={() => play('happy')}>开心</button>
      <button disabled={disabled} onClick={() => play('sleepy')}>困困</button>
      <button disabled={disabled} onClick={() => play('blank')}>发呆</button>
      <button disabled={disabled} onClick={() => play('shy')}>害羞</button>
      <button disabled={disabled} onClick={() => play('surprised')}>惊讶</button>
    </div>
  </div>;
}
