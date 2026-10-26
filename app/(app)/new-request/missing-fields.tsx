"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { tidyLabel } from "@/lib/form-labels";

// What the browser does on its own when a required field is empty: a grey
// native bubble on ONE field, in the browser's styling, often behind an
// autofill dropdown, and gone the moment you look away. It never tells you
// how many other things are also missing.
//
// So the form runs its own check and this says the whole of it at once,
// with every item a link to the field it is about.

export type MissingField = {
  /** The control's `name`, used to focus it. */
  name: string;
  /** What the customer called it — the field's own label. */
  label: string;
};

export function MissingFieldsNotice({
  missing, onJump,
}: {
  missing: MissingField[];
  onJump: (name: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Scroll it into view: on a long form the button can be far below the
  // field that is actually empty, so a notice rendered off-screen would
  // read as the button doing nothing at all — the original complaint.
  useEffect(() => {
    if (missing.length > 0) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [missing]);

  if (missing.length === 0) return null;

  return (
    <div
      ref={ref}
      role="alert"
      aria-live="assertive"
      className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4.5 h-4.5 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-amber-950">
            {missing.length === 1
              ? "One more thing before you send this"
              : `${missing.length} things left before you send this`}
          </h2>
          <p className="text-xs text-amber-900/80 mt-0.5">
            Tap any of these to jump straight to it.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {missing.map((f) => (
              <li key={f.name}>
                <button
                  type="button"
                  onClick={() => onJump(f.name)}
                  className="group inline-flex items-center gap-1.5 text-left text-sm font-semibold text-amber-950 hover:text-amber-700"
                >
                  <span
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                  />
                  <span className="underline decoration-amber-300 underline-offset-2">
                    {f.label}
                  </span>
                  <ArrowRight
                    className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * The customer-facing name for a form control.
 *
 * Read from the page rather than kept in a parallel list, so a renamed
 * field cannot start reporting itself under an old name. Falls back
 * through the ways this form labels things, and never shows a raw
 * `name` attribute like "intake_dog_count".
 */
export function friendlyLabel(el: HTMLElement & { name?: string }): string {
  const explicit = el.dataset?.friendly;
  if (explicit) return explicit;

  // Checkboxes and radios first. Each option has its OWN <label>, so
  // closest("label") would report the option ("Small") instead of the
  // question ("What size is your dog?"). The group's name is on the
  // fieldset.
  const input = el as HTMLInputElement;
  if (input.type === "checkbox" || input.type === "radio") {
    const group = el.closest("fieldset");
    if (group?.dataset?.friendly) return tidyLabel(group.dataset.friendly);
    const groupLegend = group?.querySelector("legend");
    if (groupLegend?.textContent) return tidyLabel(groupLegend.textContent);
  }

  // Most fields are wrapped in a <label> whose first span is the text.
  const label = el.closest("label");
  const span = label?.querySelector("span");
  if (span?.textContent) return tidyLabel(span.textContent);
  if (label?.textContent) return tidyLabel(label.textContent);

  // Checkbox groups are a <fieldset> with a <legend>.
  const legend = el.closest("fieldset")?.querySelector("legend");
  if (legend?.textContent) return tidyLabel(legend.textContent);

  const aria = el.getAttribute("aria-label");
  if (aria) return tidyLabel(aria);

  return tidyLabel(el.name ?? "A required field");
}

