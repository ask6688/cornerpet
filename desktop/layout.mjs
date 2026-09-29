import { DESKTOP_SCALE_LIMITS } from '../shared/pet-config.mjs';

export const DESKTOP_SIZE = Object.freeze({ width: 280, height: 320 });
export const PET_STAGE = Object.freeze({ x: 0, y: 50, width: 280, height: 266 });
export const DEFAULT_FOOTPRINT = Object.freeze({ x: 48, y: 105, width: 184, height: 180 });
const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));

export function desktopScaleLimits(area) {
  const { min, max } = DESKTOP_SCALE_LIMITS;
  return { min, max: Math.max(min, Math.floor(Math.min(max, area.width / DESKTOP_SIZE.width, area.height / DESKTOP_SIZE.height) * 100) / 100) };
}

export function validFootprint(rect) {
  return rect && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])) &&
    rect.x >= 0 && rect.y >= 0 && rect.width >= 8 && rect.height >= 8 &&
    rect.x + rect.width <= DESKTOP_SIZE.width + .01 && rect.y + rect.height <= DESKTOP_SIZE.height + .01;
}

export function imageFootprint(width, height, alpha) {
  const ratio = Math.min(PET_STAGE.width / width, PET_STAGE.height / height);
  return { x: PET_STAGE.x + (PET_STAGE.width - width * ratio) / 2 + alpha.x * ratio,
    y: PET_STAGE.y + (PET_STAGE.height - height * ratio) / 2 + alpha.y * ratio,
    width: alpha.width * ratio, height: alpha.height * ratio };
}

// Transparent padding may cross a display edge; the visible companion stays reachable.
export function containPet(position, area, footprint, scale) {
  return { x: Math.round(clamp(position.x, area.x - footprint.x * scale, area.x + area.width - (footprint.x + footprint.width) * scale)),
    y: Math.round(clamp(position.y, area.y - footprint.y * scale, area.y + area.height - (footprint.y + footprint.height) * scale)) };
}

export function desktopDragPosition(start, cursor, area, footprint, scale) {
  const dx = cursor.x - start.cursor.x, dy = cursor.y - start.cursor.y;
  return { ...containPet({ x: start.x + dx, y: start.y + dy }, area, footprint, scale), moved: Math.hypot(dx, dy) >= 5 };
}

export function resizedPetBounds(bounds, previousScale, nextScale, footprint, area) {
  const center = footprint.x + footprint.width / 2, feet = footprint.y + footprint.height;
  return { ...containPet({ x: bounds.x + center * (previousScale - nextScale), y: bounds.y + feet * (previousScale - nextScale) }, area, footprint, nextScale),
    width: Math.round(DESKTOP_SIZE.width * nextScale), height: Math.round(DESKTOP_SIZE.height * nextScale) };
}

export function visibleViewport(bounds, scale, area) {
  const x = Math.max(0, (area.x - bounds.x) / scale), y = Math.max(0, (area.y - bounds.y) / scale);
  return { x, y, width: Math.max(0, Math.min(DESKTOP_SIZE.width, (area.x + area.width - bounds.x) / scale) - x),
    height: Math.max(0, Math.min(DESKTOP_SIZE.height, (area.y + area.height - bounds.y) / scale) - y) };
}

export function bubblePlacement(footprint, viewport, height = 60, preferredBelow) {
  const width = Math.min(190, Math.max(80, viewport.width - 12));
  const center = footprint.x + footprint.width / 2;
  const below = preferredBelow ?? (footprint.y - height - 8 < viewport.y + 4);
  const x = clamp(center - width / 2, viewport.x + 6, viewport.x + viewport.width - width - 6);
  const y = clamp(below ? footprint.y + footprint.height + 8 : footprint.y - height - 8, viewport.y + 4, viewport.y + viewport.height - height - 4);
  return { x, y, width, below, tail: clamp(center - x, 16, width - 16) };
}
