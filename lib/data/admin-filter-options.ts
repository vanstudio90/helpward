import "server-only";
import { cache } from "react";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/*
  THE LISTS BEHIND TWO DROPDOWNS.

  /admin/helpers and /admin/bookings were each fetching the entire
  operations snapshot — twelve keys, every counter, the money, the
  coverage, the attention queue — to populate a region filter. On this
  data that costs about ten milliseconds of server work plus a round
  trip, so it was never the emergency it looked like; what makes it
  worth replacing is that the snapshot's region list ignores the
  window and counts EVERY request ever made, which is the one part of
  that document that does not get cheaper as the window narrows.

  So the dropdown asks its own question. It is wrapped in cache() so a
  page that needs it twice in one request pays for it once, and so a
  page that needs both lists makes one trip rather than two.

  WHAT IT DOES NOT DO: invent entries. A region appears because
  somebody has booked in it. If that leaves the list empty — which it
  is on this database, every request with a city belonging to a test
  account — the filter is empty, and the page says the filter is empty
  rather than offering places nobody has ever been.
*/

export type FilterOptions = {
  regions: string[];
  currencies: string[];
  /* Why the list is short, when it is. Printed rather than guessed at. */
  note: string | null;
};

export const getFilterOptions = cache(async (
  { includeReview = false }: { includeReview?: boolean } = {},
): Promise<FilterOptions> => {
  const db = createSupabaseServiceClient();

  /*
    ONE TRIP, AND THE COUNTING STAYS WHERE THE ROWS ARE.

    The first version of this did the grouping here, which meant
    pulling request rows and review profiles across the wire: 59ms,
    against roughly 41ms for the whole snapshot it was meant to beat.
    The second asked a second question for the "why is it empty" note,
    which is two queries behind one dropdown. Measuring each time is
    what caught both. 0114 does the aggregation in the database and
    returns the list and the reason together.
  */
  const regionsRes = await db.rpc("admin_filter_regions", {
    p_include_review: includeReview,
  });

  /* A failed read is not an empty marketplace, and it is not an empty
     filter either — the page is told the list could not be built. */
  if (regionsRes.error) {
    return {
      regions: [],
      currencies: ["CAD", "USD"],
      note: `The region list could not be read: ${regionsRes.error.message}`,
    };
  }

  const payload = (regionsRes.data ?? {}) as { regions?: string[]; hidden_as_review?: number };
  const regions = payload.regions ?? [];
  const hidden = payload.hidden_as_review ?? 0;

  return {
    regions,
    /* The two the product prices in. Never summed, only chosen between. */
    currencies: ["CAD", "USD"],
    note: regions.length > 0
      ? null
      : hidden > 0
        ? `No region to filter by. ${hidden} request${hidden === 1 ? "" : "s"} with a city belong${hidden === 1 ? "s" : ""} to review or test accounts, which this view excludes.`
        : "No region to filter by — no request has recorded a city yet.",
  };
});
