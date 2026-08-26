/** Ids for locally-created entities. Was duplicated in four services. */
export function createId(): string {
  return crypto.randomUUID();
}
