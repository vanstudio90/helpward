/**
 * Normalise a PostgREST embedded relation to a single row or null.
 *
 * PostgREST returns a to-one embed as an object and a to-many embed as an
 * array, and the generated types do not always agree with which one a given
 * query produced. The codebase worked around that with casts, and the casts
 * were wrong in both directions:
 *
 *   `conversation[0]` on a UNIQUE conversation — the embed is an object, so
 *   `[0]` was undefined and the booking detail page silently dropped its
 *   Message link. The chat worked; only the shortcut to it disappeared.
 *
 *   `(x as { service: {...} }).service` where the embed really was an
 *   array — reads a property that is not there and gets undefined.
 *
 * Both are invisible at runtime: undefined renders as nothing. So instead
 * of asserting a shape, ask what actually arrived.
 */
export function one<T>(relation: T | T[] | null | undefined): T | null {
  if (relation == null) return null;
  if (Array.isArray(relation)) return relation.length > 0 ? relation[0] : null;
  return relation;
}

/** The same, for embeds that genuinely are to-many. */
export function many<T>(relation: T | T[] | null | undefined): T[] {
  if (relation == null) return [];
  return Array.isArray(relation) ? relation : [relation];
}

/**
 * An embedded relation as it may actually arrive.
 *
 * Declaring an embed as a bare object is what made the casts below it
 * unsound: the generated row type says `{ title: any }[]`, the cast said
 * `{ title: string } | null`, and TypeScript rejected the conversion
 * because neither shape covers the other. Saying "object, or array of
 * them, or absent" is the truth, and `one()` collapses it.
 */
export type Embed<T> = T | T[] | null;
