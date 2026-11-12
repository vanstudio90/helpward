import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
  THE SHAPE OF A FAST ADMIN PAGE.

  Measured on this database: a round trip to Postgres is ~31ms, a round
  trip to the auth service is ~57ms, and the heaviest RPC on the
  console adds only ~16ms of actual compute on top of its round trip.
  So what makes these pages slow is not the queries — it is asking for
  things one after another when they do not depend on each other.

  These guard the chains that were removed, because they are the sort
  of thing that creeps back in one innocent `await` at a time.
*/

const layout = readFileSync("app/(admin)/layout.tsx", "utf8");

test("the layout verifies the user once and reads the header in parallel", () => {
  // One memoised auth call, not a fresh one per caller.
  assert.match(layout, /getCurrentUser/);
  assert.doesNotMatch(layout, /auth\.getUser\(\)/);
  // The name and the bell do not queue behind each other.
  assert.match(layout, /const \[\{ data: profile \}, \{ count: unread \}\] = await Promise\.all\(/);
});

test("no admin page asks the auth service for a user the layout already verified", () => {
  for (const path of [
    "app/(admin)/admin/inbox/page.tsx",
    "app/(admin)/admin/disputes/page.tsx",
    "app/(admin)/admin/audit-log/classic/page.tsx",
    "app/(admin)/admin/data-requests/classic/page.tsx",
  ]) {
    const src = readFileSync(path, "utf8");
    assert.doesNotMatch(src, /auth\.getUser\(\)/, `${path} calls the auth service again`);
    assert.match(src, /getCurrentUser/, `${path} does not reuse the verified user`);
  }
});

test("a detail panel does not wait for the list beside it", () => {
  /*
    Both reads are keyed off the URL, not off each other. Awaiting the
    list first cost a whole round trip every time a panel was open —
    which is every time somebody is actually working.
  */
  for (const [path, fn] of [
    ["app/(admin)/admin/helpers/page.tsx", "getHelperDetail"],
    ["app/(admin)/admin/users/page.tsx", "getCustomerDetail"],
    ["app/(admin)/admin/disputes/page.tsx", "getCaseDetail"],
    ["app/(admin)/admin/inbox/page.tsx", "getCaseDetail"],
    ["app/(admin)/admin/bookings/page.tsx", "getActivityDetail"],
  ] as const) {
    const src = readFileSync(path, "utf8");
    assert.doesNotMatch(src, new RegExp(`=\\s*await ${fn}\\(`),
      `${path} still awaits its detail after the list`);
    assert.match(src, new RegExp(`${fn}\\(`), `${path} lost its detail read`);
  }
});

test("the request-scoped user is memoised, and still verified", () => {
  const src = readFileSync("lib/auth/current-user.ts", "utf8");
  assert.match(src, /cache\(/);
  // The verification itself is unchanged: getUser, not a local decode.
  assert.match(src, /supabase\.auth\.getUser\(\)/);
  assert.doesNotMatch(src, /getSession\(\)|jwtDecode|decodeJwt/);
  // requireAdmin still refuses anybody without the claim.
  const admin = readFileSync("lib/auth/admin.ts", "utf8");
  assert.match(admin, /!== "admin"/);
  assert.match(admin, /throw new Error\("Forbidden"\)/);
});

test("the map is measured before one is ordered", () => {
  const src = readFileSync("components/admin/LiveOperations.tsx", "utf8");
  // No image until the container has been measured, so the guessed
  // 640×360 basemap is never fetched and thrown away.
  assert.match(src, /\{measured && size\.w > 0 && \(/);
  assert.match(src, /setMeasured\(true\)/);
  // And a window drag orders one map, not one per pixel.
  assert.match(src, /setTimeout\(measure, 150\)/);
});

test("a hidden tab stops re-rendering but misses nothing", () => {
  const src = readFileSync("app/(admin)/admin/inbox/realtime-refresh.tsx", "utf8");
  assert.match(src, /document\.visibilityState === "hidden"/);
  assert.match(src, /missedWhileHidden = true/);
  // The catch-up is the point: silence while hidden must not become a
  // stale list when somebody looks back.
  assert.match(src, /visibilitychange/);
  assert.match(src, /missedWhileHidden = false;\s*\n\s*run\(\);/);
});

test("every admin section has something to show while it loads", () => {
  const loading = readFileSync("app/(admin)/admin/loading.tsx", "utf8");
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /animate-pulse/);
  // A skeleton that changes the layout is worse than none.
  assert.match(loading, /max-w-\[1700px\]/);
});

/* ---- wiring: reading is live, writing is not -------------------------- */

test("a page that reads live data does not get live buttons", () => {
  /*
    When Services, Venues and Data requests were wired, every control on
    them was disabled on `view.sample` — which had just become false. A
    one-line change to the data layer would have armed a dozen buttons
    that are connected to nothing. Reading and writing are now separate
    flags, and the controls follow the one about writing.
  */
  for (const [page, reader] of [
    ["app/(admin)/admin/services/page.tsx", "lib/data/admin-services.ts"],
    ["app/(admin)/admin/venues/page.tsx", "lib/data/admin-venues.ts"],
    ["app/(admin)/admin/data-requests/page.tsx", "lib/data/admin-data-requests.ts"],
  ] as const) {
    const pageSrc = readFileSync(page, "utf8");
    const readerSrc = readFileSync(reader, "utf8");

    assert.doesNotMatch(pageSrc, /disabled=\{view\.sample\}/,
      `${page} still disables controls on the sample flag`);
    assert.match(pageSrc, /disabled=\{!view\.writable\}/,
      `${page} has no control gated on whether it can write`);

    // The reader says both things explicitly.
    assert.match(readerSrc, /sample: false,\s*\n\s*writable: false,/,
      `${reader} does not declare that it reads live and writes nothing`);
    assert.match(readerSrc, /READING IS WIRED; WRITING IS NOT/);
  }
});

test("the wired readers carry a failed read rather than an empty page", () => {
  const services = readFileSync("lib/data/admin-services.ts", "utf8");
  const venues = readFileSync("lib/data/admin-venues.ts", "utf8");
  const requests = readFileSync("lib/data/admin-data-requests.ts", "utf8");
  // Each one either throws with the reason or carries load_error.
  assert.match(services, /The catalogue could not be read/);
  assert.match(venues, /const loadError = venuesRes\.error\?\.message \?\? null/);
  assert.match(requests, /const loadError = exportsRes\.error\?\.message/);
});
