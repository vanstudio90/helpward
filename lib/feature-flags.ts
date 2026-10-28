// Features that are built but switched off, and why.
//
// A flag here is a claim about the product: it is OFF because shipping it
// would mislead or shortchange someone, not because the code is missing.
// Each one carries what has to be true before it can be turned back on,
// so the decision does not have to be re-derived from scratch later.

/**
 * Multi-stop bundling — one helper, several tasks, one flat trip fee.
 *
 * OFF for launch. The creation path bypasses per-service intake entirely:
 *
 *   - the parent request is inserted with NO intake, so the per-service
 *     questions that every standalone booking must answer are skipped;
 *   - child stops carry a free-text note and nothing else, so a bundled
 *     Package Delivery has no delivery address and a bundled Dog Walking
 *     has no dog count — the helper accepts a priced job with no brief;
 *   - each stop is priced at base_price_cents instead of through
 *     price_service_cents, so duration and quantity are ignored. A
 *     three-dog walk in a bundle costs the same as a one-dog walk, and
 *     the helper does the extra work unpaid.
 *
 * A real observed example: request 046b46f4 priced at CA$44.50 with a
 * null parent intake.
 *
 * TO TURN BACK ON, all three must hold:
 *   1. each stop collects its own service's intake, validated server-side
 *      the way validateIntake does for a one-shot;
 *   2. each stop is priced through price_service_cents against that
 *      intake, and the parent total is the sum plus the single trip fee;
 *   3. the helper's view of a bundle shows each stop's brief, not a note.
 *
 * Nothing is deleted: the schema, the picker and the helper's bundle
 * checklist all remain, so this is a flag flip plus the work above.
 * Bundles that ALREADY exist still render everywhere — switching off
 * creation must not strand a booking somebody already has.
 */
export const BUNDLING_ENABLED = false;
