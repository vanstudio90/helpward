import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getReviewsView } from "../lib/data/admin-reviews.ts";
import { REPORT_REASONS } from "../lib/admin-review-states.ts";

/*
  REVIEWS MODERATION IS A DESIGN — but the rating rule it describes is
  the live one, so the test that matters most is the one checking the
  page tells the truth about what hiding does to a helper's average.
*/

const page = readFileSync("app/(admin)/admin/reviews/page.tsx", "utf8");
const panel = readFileSync("components/admin/ReviewPanel.tsx", "utf8");
const data = readFileSync("lib/data/admin-reviews.ts", "utf8");
const states = readFileSync("lib/admin-review-states.ts", "utf8");

test("the rating effect states the implemented result, not a question", async () => {
  const view = await getReviewsView();
  const treatment = view.selected!.rating_treatment;
  // The mockup said "Not shown · Check policy". This says which.
  assert.ok(["included", "excluded"].includes(treatment.public_effect));
  assert.equal(treatment.public_effect, "excluded", "a hidden review is drawn as still counting");
  assert.match(panel, /RATING_EFFECT_LABEL\[detail\.rating_treatment\.public_effect\]/);
  assert.doesNotMatch(panel, /Check policy/);

  /*
    AND IT MATCHES THE CODE. refresh_provider_rating aggregates only
    customer_visible rows and fires on update, so hiding removes the
    rating from the public average. If that migration ever changes,
    this test fails and the copy gets revisited rather than quietly
    becoming a lie.
  */
  const trigger = readFileSync("supabase/migrations/0006_reviews_trigger.sql", "utf8");
  assert.match(trigger, /where provider_id = new\.provider_id and customer_visible/);
  assert.match(trigger, /after insert or update on reviews/);
  assert.equal(treatment.internal_average_exists, false);
  assert.match(page, /there is no\s*\n?\s*separate internal average/);
});

test("a low rating is never grounds for a decision", () => {
  // No reason in the list is about the score.
  for (const reason of REPORT_REASONS) {
    assert.doesNotMatch(reason.label, /star|rating|low/i, `${reason.value} is a rating, not a policy`);
  }
  assert.match(page, /A low rating alone is not a policy violation/);
  assert.match(states, /A LOW RATING IS NOT A POLICY VIOLATION/);
  // The panel warns when nothing but unhappiness has been ticked.
  assert.match(panel, /A low rating or unhappy wording is\s*\n?\s*not grounds on its own/);
});

test("the original feedback cannot be edited by anybody", async () => {
  const view = await getReviewsView();
  assert.ok(view.selected?.original_text);
  // Nothing in the panel writes to it: no input, no textarea bound to it.
  assert.doesNotMatch(panel, /value=\{detail\.original_text\}/);
  assert.doesNotMatch(panel, /setOriginal|editOriginal/);
  assert.match(panel, /THE ORIGINAL IS READ-ONLY AND ALWAYS WILL BE/);
  assert.match(panel, /kept exactly as written/);
});

test("a verified booking is not a verified claim", async () => {
  const view = await getReviewsView();
  assert.equal(view.selected?.booking_verified, true);
  assert.match(panel, /Whether what they wrote about\s*\n?\s*it is accurate has not been checked/);
});

test("sensitive originals are restricted", async () => {
  const view = await getReviewsView();
  assert.equal(view.selected?.original_restricted, true);
  assert.equal(view.selected?.public_text_available, false);
  assert.match(panel, /Restricted original/);
});

test("decisions are append-only and carry their before and after", async () => {
  const view = await getReviewsView();
  const decision = view.selected!.decisions[0];
  assert.ok(decision.actor && decision.at);
  assert.ok("from_visibility" in decision && "to_visibility" in decision);
  assert.match(panel, /Append-only\. A decision that was wrong is reversed with another decision/);
  assert.match(panel, /records the actor, the\s*\n?\s*reason, the policy and the visibility before and after/);
});

test("four kinds of empty stay apart", () => {
  assert.match(page, /const noReviewsAtAll = view\.total_reviews === 0/);
  assert.match(page, /const noneInQueue =/);
  assert.match(page, /const noMatches =/);
  assert.match(page, /The moderation queue could not be loaded/);
  assert.match(page, /No reviews yet/);
  assert.match(page, /No reports awaiting review/);
  assert.match(page, /No matching results/);
  assert.match(page, /a failed query, not an empty queue/);
});

test("the working moderation page survives the redesign", () => {
  assert.match(page, /\/admin\/reviews\/classic/);
  const classic = readFileSync("app/(admin)/admin/reviews/classic/page.tsx", "utf8");
  assert.match(classic, /VisibilityButton/);
  assert.match(classic, /changes a\s*\n?\s*helper's public average the moment it is used/);
});

test("review and test feedback is excluded", () => {
  assert.match(page, /Review &amp; test activity excluded/);
  // A trigger already forces it; the view excludes it again rather than
  // relying on that alone.
  assert.match(data, /REVIEW AND TEST FEEDBACK NEVER COUNTS/);
  const hidden = readFileSync("supabase/migrations/0089_review_activity_hidden.sql", "utf8");
  assert.match(hidden, /hide_review_account_reviews/);
});
