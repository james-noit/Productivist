import { CATALOG_VERSION } from '../catalog';

/** The version of the published overlay that is applied to the registries (0 = none: the built-ins only). Module state, set by `apply.ts`. */
let applied = 0;

export function setAppliedOverlayVersion(version: number): void {
  applied = Math.max(0, Math.trunc(version) || 0);
}

export function appliedOverlayVersion(): number {
  return applied;
}

/**
 * What a new block stores as `catalogVersion`: the built-in catalog version plus the overlay version in force. Monotonic (either part
 * only grows, and a rollback publishes a new, higher overlay version), so a row says which content produced it.
 */
export function effectiveCatalogVersion(): number {
  return CATALOG_VERSION + applied;
}
