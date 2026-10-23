export interface Registry<T extends { id: string }> {
  readonly all: readonly T[];
  readonly byId: ReadonlyMap<string, T>;
  get(id: string): T | undefined;
  /** The built-in items the registry was created with: the Fitness director's catalog overlay (`overlay/`) layers over them. */
  readonly base: readonly T[];
  /** Bumped by every `replace`, so a cache keyed on a registry can tell that its content changed. */
  readonly revision: number;
  /** Replaces the live items (the layered content). Throws on a duplicate id. `replace(registry.base)` restores the built-ins. */
  replace(items: readonly T[]): void;
}

function index<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const byId = new Map<string, T>();
  for (const item of items) {
    if (byId.has(item.id)) throw new Error(`Duplicate id "${item.id}" in registry`);
    byId.set(item.id, item);
  }
  return byId;
}

/** Builds a lookup over plain data. Throws on a duplicate id at module load, so a bad entry fails the build/self-check. */
export function createRegistry<T extends { id: string }>(items: readonly T[]): Registry<T> {
  const base = items;
  let all: readonly T[] = items;
  let byId = index(items);
  let revision = 0;
  return {
    get all() {
      return all;
    },
    get byId() {
      return byId;
    },
    get: (id) => byId.get(id),
    base,
    get revision() {
      return revision;
    },
    replace(next) {
      byId = index(next);
      all = next;
      revision++;
    },
  };
}
