// Which service the New Request form starts on.
//
// This lives in its own module because the two halves of the decision used
// to be split across a server page and a client view, and the view quietly
// undid the page's answer: the page returned null for an unmatched search,
// and the view's initialiser read
//
//   services.find((s) => s.id === initialServiceId) ?? services[0]
//
// so "plumber" still selected Designated Driver — the first row of the
// catalog — complete with its hidden service_id and its price in the
// summary. The matcher had unit tests, but they tested a COPY of the
// matcher and never the handoff, so they passed while the real path did
// the opposite.
//
// Both the page and the view now call these, and the tests import this
// module rather than reproducing it.

export type SelectableService = { id: string; title: string; blurb: string };

/**
 * Resolve free text to one service id.
 *
 * Returns null unless the match is unambiguous. Selecting a driver for
 * someone who typed "plumber" is worse than selecting nothing.
 */
export function matchServiceToQuery(
  services: SelectableService[],
  q: string | null,
): string | null {
  const needle = (q ?? "").trim().toLowerCase();
  if (needle.length < 3) return null;

  const exact = services.filter((s) => s.title.toLowerCase() === needle);
  if (exact.length === 1) return exact[0].id;

  const bySlug = services.filter((s) => s.id === needle.replace(/\s+/g, "-"));
  if (bySlug.length === 1) return bySlug[0].id;

  const byTitle = services.filter(
    (s) => s.title.toLowerCase().includes(needle) || needle.includes(s.title.toLowerCase()),
  );
  if (byTitle.length === 1) return byTitle[0].id;

  return null;
}

export type InitialSelection = {
  /** Service to preselect, or null to start with nothing selected. */
  serviceId: string | null;
  /**
   * True when the customer arrived with a search that matched nothing or
   * matched ambiguously. Distinct from arriving with no search at all:
   * a blank request page may sensibly default to a popular service, but an
   * unresolved search must not silently answer a different question.
   */
  unresolvedQuery: boolean;
};

export function resolveInitialSelection(
  services: SelectableService[],
  explicitServiceId: string | null | undefined,
  query: string | null | undefined,
): InitialSelection {
  // ?service=<slug> is the exact handoff the public service pages use.
  const explicit = services.find((s) => s.id === explicitServiceId)?.id ?? null;
  if (explicit) return { serviceId: explicit, unresolvedQuery: false };

  const hasQuery = typeof query === "string" && query.trim().length > 0;
  if (!hasQuery) return { serviceId: null, unresolvedQuery: false };

  const matched = matchServiceToQuery(services, query ?? null);
  return matched
    ? { serviceId: matched, unresolvedQuery: false }
    : { serviceId: null, unresolvedQuery: true };
}

/**
 * The view's initial state. THIS is the function that previously defaulted
 * to services[0] unconditionally.
 *
 * A blank arrival still gets a sensible default. An unresolved search gets
 * nothing, so the customer picks for themselves and the form cannot submit
 * a service they never chose.
 */
export function pickInitialSelected<T extends SelectableService>(
  services: T[],
  initialServiceId: string | null | undefined,
  unresolvedQuery: boolean,
): T | null {
  const explicit = services.find((s) => s.id === initialServiceId);
  if (explicit) return explicit;

  // Nothing is selected unless the customer selected it.
  //
  // This used to fall back to services[0], so every visitor arrived with
  // Designated Driver already chosen, a price already quoted and a form
  // already asking about their car. Someone who wanted a dog walk had to
  // notice they were booking a driver and undo it — and anyone who did
  // not notice submitted the wrong service.
  //
  // `unresolvedQuery` is now redundant here and kept only so the
  // signature does not change under its callers.
  void unresolvedQuery;
  return null;
}
