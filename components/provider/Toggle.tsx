"use client";

import { cn } from "@/lib/cn";

/* The switch, one definition.
 *
 * Deliberately larger than a default checkbox: it is the control a helper
 * reaches for one-handed, often in a van, sometimes in gloves. 52x31 with
 * a 25px knob clears the 44px touch target once the row padding around it
 * is counted.
 */
export function Toggle({ on, onChange, label, busy }: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={cn(
        "relative w-[52px] h-[31px] rounded-full shrink-0 transition-colors disabled:opacity-50",
        on ? "bg-brand-600" : "bg-slate-200",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] w-[25px] h-[25px] rounded-full bg-white shadow-sm transition-all",
          on ? "left-[24px]" : "left-[3px]",
        )}
      />
    </button>
  );
}
