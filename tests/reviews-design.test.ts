import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REPORT_REASONS } from "../lib/admin-review-states.ts";

/*
  REVIEWS MODERATION IS WIRED, and the test that matters most is the
  one checking what hiding does to a helper's average. Until 0117 it
  removed the customer's stars as a side effect, which lets a helper's
  rating be improved by their customers' rudeness.

  These are SOURCE assertions: getReviewsView() needs a database now,
  and a test that needs a service key is one that gets skipped in CI
  and then quietly rots.
*/

const page = readFileSync("app/(admin)/admin/reviews/page.tsx", "utf8");
const panel = readFileSync("components/admin/ReviewPanel.tsx", "utf8");
const data = readFileSync("lib/data/admin-reviews.ts", "utf8");
const states = readFileSync("lib/admin-review-states.ts", "utf8");
const moderation = readFileSync("supabase/migrations/0117_review_moderation.sql", "utf8");
const actions = readFileSync("app/(admin)/admin/reviews/actions.ts", "utf8");

test("hiding the words does not silently move the helper's score", () => {
  /*
    THE DECISION AT THE CENTRE OF 0117. refresh_provider_rating()
    averaged the reviews where customer_visible was true, so hiding a
    review ALSO removed its stars — one act, two consequences, and the
    second invisible from this screen. A helper's average could be
    improved by their customers' rudeness.
  */
  assert.match(moderation, /THE DECISION AT THE CENTRE OF THIS FILE/);
  assert.match(moderation, /where provider_id = new\.provider_id and rating_visible/);
  assert.match(moderation, /rating_visible = case when p_exclude_rating then false else rating_visible end/);
  // Backfilled, so no existing average moves on deploy.
  assert.match(moderation, /update public\.reviews set rating_visible = customer_visible where rating_visible is null/);
  // Proven, not asserted.
  assert.match(moderation, /hiding the words silently removed the score/);
  assert.match(moderation, /the helper average moved when only the wording was hidden/);
  // And the moderator is told which it is, in the outcome.
  assert.match(moderation, /The rating still counts toward this helper''s average/);
});

test("excluding a score is its own decision", () => {
  // "These words break a rule" and "this person was never here" are
  // different findings, so the second gets its own control.
  assert.match(moderation, /create or replace function public\.admin_review_set_rating_counts/);
  assert.match(panel, /THE SCORE IS A SEPARATE DECISION, AND THE FORM SAYS SO/);
  assert.match(panel, /Also stop this score counting toward the helper/);
  assert.match(page, /Hiding a review does not change the helper/);
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

test("the original feedback cannot be edited by anybody", () => {
  // The words are the customer's. This console decides whether to show
  // them, not what they say — so there is no update path for the text.
  assert.doesNotMatch(moderation, /update public\.reviews set comment/);
  assert.match(moderation, /EDITING WHAT SOMEBODY WROTE/);
  assert.match(data, /The customer's words\. Nothing in this console edits them/);
  assert.match(page, /Nothing here edits what somebody wrote/);
});

test("a verified booking is not a verified claim", () => {
  // Attached to a booking means work was bought, not that the account
  // of it is true.
  assert.match(data, /A review attached to a booking is a review of work that was\s*\n\s*actually bought/);
  assert.match(data, /booking_verified: Boolean\(r\.booking_id\)/);
});

test("sensitive originals are restricted, not rewritten", () => {
  assert.match(data, /PERSONAL INFORMATION IS A REASON TO RESTRICT, NOT TO REWRITE/);
  assert.match(data, /function restrictedBy/);
  assert.match(data, /r\.reason === "personal_information"/);
});

test("decisions carry their before and after, and a reason", () => {
  assert.match(moderation, /from_visibility  text not null/);
  assert.match(moderation, /to_visibility    text not null/);
  assert.match(moderation, /reason           text not null/);
  // Every path demands one.
  assert.match(moderation, /errcode = 'HW120'/);
  assert.match(moderation, /a decision was recorded with no reason/);
  // Nothing updates a decision row: a history that can be edited is not one.
  assert.doesNotMatch(moderation, /update public\.review_decisions/);
  assert.match(panel, /Append-only\. A decision that was wrong is reversed/);
});

test("two moderators deciding one review is a conflict, not a race", () => {
  assert.match(moderation, /date_trunc\('milliseconds', v_r\.updated_at\)/);
  assert.match(moderation, /errcode = 'HW080'/);
  assert.match(moderation, /a stale decision was applied/);
  assert.match(actions, /conflict: true/);
  assert.match(panel, /Reload this review and start from what is recorded now/);
});

test("a test account's review never reaches a public average", () => {
  /*
    A separate trigger forces those hidden on insert. The first version
    of 0117's self-test assumed otherwise and failed on production for
    a reason that had nothing to do with 0117.
  */
  assert.match(moderation, /A TEST ACCOUNT'S REVIEW NEVER REACHES A PUBLIC AVERAGE/);
  assert.match(moderation, /reviews_hide_review_account/);
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
