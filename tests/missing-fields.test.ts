import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { tidyLabel } from "@/lib/form-labels";

// These strings are scraped from the live markup, so they arrive carrying
// the decoration the page puts around a label: the red asterisk that marks
// a field required, the "(optional)" suffix, and the hint that follows the
// question in the same element. A reminder that says
// "How long do you need? * Pick the closest — you can extend later"
// is worse than no reminder.

describe("labels shown in the reminder", () => {
  test("the required asterisk is decoration, not part of the name", () => {
    assert.equal(tidyLabel("How long do you need? *"), "How long do you need?");
  });

  test("an optional field does not announce itself as optional", () => {
    assert.equal(tidyLabel("Notes (optional)"), "Notes");
  });

  test("a hint running on after the question is dropped", () => {
    assert.equal(
      tidyLabel("How does your helper get in? Buzzer, lockbox, gate code, where to park."),
      "How does your helper get in?",
    );
  });

  test("a label that is not a question survives whole", () => {
    assert.equal(tidyLabel("Dress code"), "Dress code");
    assert.equal(tidyLabel("Bedrooms *"), "Bedrooms");
  });

  test("collapsed whitespace from nested spans", () => {
    assert.equal(tidyLabel("What size is your dog?\n   *  "), "What size is your dog?");
  });

  test("a question mark mid-label does not truncate it", () => {
    // No space after "?" here, so there is nothing to split on.
    assert.equal(tidyLabel("Who? Me"), "Who?");
    assert.equal(tidyLabel("Pickup/drop-off"), "Pickup/drop-off");
  });
});
