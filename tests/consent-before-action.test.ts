import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Two defects with the same shape: the interface took an action on
// someone's behalf that only they should take. Money left a card on one
// tap, and a microphone opened without anyone agreeing. Both are easy to
// reintroduce by "simplifying" a flow, so both are pinned here.

test("a tip preset selects an amount and does not charge it", () => {
  const card = read("app/(app)/bookings/[id]/tip-card.tsx");
  // The preset buttons must not call the server action.
  const presetBlock = card.slice(card.indexOf("aria-label=\"Choose a tip amount\""));
  const firstButtonEnd = presetBlock.indexOf("</button>");
  const presetButton = presetBlock.slice(0, firstButtonEnd);
  assert.ok(
    !/setTipAction|submit\(/.test(presetButton),
    "a preset button must not charge; it may only set the chosen amount",
  );
  assert.match(presetButton, /setChosenCents/);
});

test("charging a tip requires a second control that names the amount", () => {
  const card = read("app/(app)/bookings/[id]/tip-card.tsx");
  assert.match(card, /Send \$\{formatMoney\(chosenCents, currency\)\} to \$\{helperName\}/);
  // And it cannot fire without a chosen amount.
  assert.match(card, /chosenCents === null \|\| chosenCents <= 0/);
});

test("an incoming call is never answered automatically", () => {
  const panel = read("components/CallPanel.tsx");
  assert.ok(
    !/useEffect\([^)]*answerCall/s.test(panel),
    "answerCall must not run from an effect — that is answering without being asked",
  );
  // It runs from a click, and declining is offered beside it.
  assert.match(panel, /onClick=\{\(\) => void answerCall\(/);
  assert.match(panel, /declineCall\(/);
});

test("declining an incoming call never opens the microphone", () => {
  const hook = read("lib/call/use-call.ts");
  const i = hook.indexOf("const declineCall =");
  assert.ok(i > 0, "declineCall must exist");
  const body = hook.slice(i, hook.indexOf("}, []);", i));
  assert.ok(!/acquireMic|getUserMedia|enter\(/.test(body),
    "decline must not acquire media");
  assert.match(body, /abandon_call/);
});
