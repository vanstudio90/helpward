"use client";

import { useTransition, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { setReviewVisibilityAction } from "./actions";

export function ReviewVisibilityButton({
  reviewId, currentlyVisible,
}: { reviewId: string; currentlyVisible: boolean }) {
  const [pending, start] = useTransition();
  const [visible, setVisible] = useState(currentlyVisible);
  const [err, setErr] = useState<string | null>(null);

  const toggle = () => {
    const next = !visible;
    setErr(null);
    setVisible(next);
    start(async () => {
      const r = await setReviewVisibilityAction(reviewId, next);
      if (r?.error) {
        setVisible(!next);
        setErr(r.error);
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title={visible ? "Hide this review from the public provider page" : "Restore this review to the public page"}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${
          visible
            ? "border border-rose-200 text-rose-700 hover:bg-rose-50"
            : "bg-emerald-600 text-white hover:bg-emerald-700"
        }`}
      >
        {visible ? (
          <><EyeOff className="w-3.5 h-3.5" /> Hide</>
        ) : (
          <><Eye className="w-3.5 h-3.5" /> Restore</>
        )}
      </button>
      {err && <span className="text-[10px] text-rose-700">{err}</span>}
    </div>
  );
}
