/** Lower-cases and strips accents, so "reunion" finds "Reunión". */
export function normalizeQuery(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}
