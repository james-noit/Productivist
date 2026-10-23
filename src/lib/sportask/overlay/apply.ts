import { CATALOG } from '../catalog';
import { CADENCES } from '../cadences';
import { GOALS } from '../goals';
import { BUILTIN_TEMPLATES } from '../templates';
import { contentFor } from './merge';
import type { CatalogOverlay } from './types';
import { setAppliedOverlayVersion } from './version';

const listeners = new Set<() => void>();

/** Calls back after every `applyOverlay`; returns the unsubscribe. */
export function onOverlayApplied(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Makes the live registries (the ones the whole of Sportask reads) the built-ins with `overlay` layered over them; `null` restores
 * the built-ins. Generation reads the registries at call time, so the next block uses the new content at once; a screen already on
 * display shows it the next time it computes. The overlay must already be sanitised (and, from outside the editor, validated).
 */
export function applyOverlay(overlay: CatalogOverlay | null, version = 0): void {
  const content = contentFor(overlay);
  CATALOG.exercises.replace(content.catalog.exercises.all);
  CATALOG.ladders.replace(content.catalog.ladders.all);
  CATALOG.assessments.replace(content.catalog.assessments.all);
  CATALOG.equipment.replace(content.catalog.equipment.all); // the same registry as EQUIPMENT
  GOALS.replace(content.goals.all);
  BUILTIN_TEMPLATES.replace(content.templates.all);
  CADENCES.replace(content.cadences.all);
  setAppliedOverlayVersion(overlay ? version : 0);
  listeners.forEach((listener) => listener());
}
