import { useCallback, useRef, type ComponentProps } from 'react';
import { PetRenderer } from '../shared/PetRenderer';
import type { PetScreenBounds } from '../shared/Pet3D';
import { bubblePlacement } from '../desktop/layout.mjs';

// The renderer reports the visible pet, so speech follows zoom, shape and motion.
export function PetPreview({ message = '', ...props }: Omit<ComponentProps<typeof PetRenderer>, 'onBounds'> & { message?: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const speech = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const placeSpeech = useCallback((bounds: PetScreenBounds) => {
    if (!stage.current || !speech.current || !art.current) return;
    const viewport = { x: 0, y: 0, width: stage.current.clientWidth, height: stage.current.clientHeight };
    const element = speech.current;
    element.style.width = `${bubblePlacement(bounds, viewport).width}px`;
    // Every Web stage reserves headroom outside the renderer, including at maximum zoom.
    const placement = bubblePlacement({ ...bounds, y: bounds.y + art.current.offsetTop }, viewport, element.offsetHeight, false);
    element.style.left = `${placement.x}px`;
    element.style.top = `${placement.y}px`;
    element.style.setProperty('--tail-x', `${placement.tail}px`);
    element.classList.toggle('below', placement.below);
    element.dataset.positioned = 'true';
  }, []);
  return <div ref={stage} className="pet-preview">
    <div ref={art} className="pet-preview-art"><PetRenderer {...props} onBounds={message ? placeSpeech : undefined} /></div>
    {message && <div ref={speech} key={`${message}:${props.reaction?.instanceId ?? ''}`} className="pet-speech" role="status">{message}</div>}
  </div>;
}
