import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
  THE DROPDOWN THAT FETCHED AN OPERATIONS SNAPSHOT.

  /admin/helpers and /admin/bookings each pulled the whole twelve-key
  overview document to fill a region filter. The interesting part of
  this change is not the saving — measured on production it is about
  4.7ms of server work per page load — but that two attempts at it were
  SLOWER than what they replaced, and only measuring caught that.
*/

const reader = readFileSync("lib/data/admin-filter-options.ts", "utf8");
const sql = readFileSync("supabase/migrations/0114_filter_regions.sql", "utf8");
const helpers = readFileSync("app/(admin)/admin/helpers/page.tsx", "utf8");
const bookings = readFileSync("app/(admin)/admin/bookings/page.tsx", "utf8");

test("neither page fetches the operations snapshot for a dropdown", () => {
  assert.doesNotMatch(helpers, /getOverviewSnapshot/);
  assert.doesNotMatch(bookings, /getOverviewSnapshot/);
  assert.match(helpers, /getFilterOptions\(\{ includeReview/);
  assert.match(bookings, /getFilterOptions\(\{ includeReview/);
});

test("the counting happens where the rows are", () => {
  /*
    Doing it in TypeScript meant dragging request rows and review
    profiles over the wire — 59ms against roughly 41ms for the whole
    snapshot it was meant to beat.
  */
  assert.match(reader, /THE FIRST ATTEMPT WAS SLOWER|ONE TRIP, AND THE COUNTING STAYS WHERE THE ROWS ARE/);
  assert.match(reader, /rpc\("admin_filter_regions"/);
  assert.doesNotMatch(reader, /from\("requests"\)/);
  assert.match(sql, /group by pickup_city/);
});

test("one dropdown asks one question", () => {
  // The list and the reason it might be empty come back together.
  assert.match(sql, /ONE CALL, NOT TWO/);
  assert.match(sql, /'hidden_as_review'/);
  assert.doesNotMatch(reader, /admin_filter_regions_hidden/);
});

test("an empty filter says why it is empty", () => {
  // Two different causes, two different sentences, neither invented.
  assert.match(reader, /belong\$\{hidden === 1 \? "s" : ""\} to review or test accounts/);
  assert.match(reader, /no request has recorded a city yet/);
  assert.match(helpers, /AN EMPTY FILTER EXPLAINS ITSELF/);
  assert.match(bookings, /AN EMPTY FILTER EXPLAINS ITSELF/);
});

test("a failed read is not an empty filter", () => {
  assert.match(reader, /The region list could not be read/);
});

test("the list is names, and the self-test proves it", () => {
  assert.match(sql, /the region list contains something that is not a name/);
  // Including test activity can only widen the list, never narrow it.
  assert.match(sql, /excluding review activity returned MORE regions than including it/);
  // It reads two tables to answer about neither.
  assert.match(sql, /returns city names and nothing\s*\n\s*else, never a row, an id or a person/);
});

test("the request-scoped read is deduped", () => {
  // A page that needs the list twice pays for it once.
  assert.match(reader, /import \{ cache \} from "react"/);
  assert.match(reader, /export const getFilterOptions = cache\(/);
});
