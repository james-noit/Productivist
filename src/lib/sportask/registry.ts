export interface Registry<T extends { id: string }> {
  all: readonly T[];
  byId: ReadonlyMap<string, T>;
  get(id: string): T | undefined;
}

/** Builds a lookup over plain data. Throws on a duplicate id at module load, so a bad entry fails the build/self-check. */
export function createRegistry<T extends { id: string }>(items: readonly T[]): Registry<T> {
  const byId = new Map<string, T>();
  for (const item of items) {
    if (byId.has(item.id)) throw new Error(`Duplicate id "${item.id}" in registry`);
    byId.set(item.id, item);
  }
  return { all: items, byId, get: (id) => byId.get(id) };
}
