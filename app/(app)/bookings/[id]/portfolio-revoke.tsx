"use client";

import { useState, useTransition } from "react";
import { EyeOff, Star, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { revokePortfolioConsentAction } from "@/app/(provider)/provider/portfolio/actions";

// Customer-side affordance shown under a proof photo that the helper has
// flagged is_portfolio=true. Tapping it calls revokePortfolioConsentAction
// which forces the row back to is_portfolio=false via the RLS update
// policy in 0020. Helper can re-flag, customer can re-revoke — but the
// asymmetric WITH CHECK means the customer can never re-FLAG, only un-flag.
export function PortfolioRevokeButton({ photoId }: { photoId: string }) {
  const [revoked, setRevoked] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (revoked) {
    return (
      <div className="text-[10px] text-emerald-700 inline-flex items-center gap-1">
        <CheckCircle2 className="w-2.5 h-2.5" /> Removed from portfolio
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setErr(null);
          start(async () => {
            const r = await revokePortfolioConsentAction(photoId);
            if (r?.error) setErr(r.error);
            else setRevoked(true);
          });
        }}
        disabled={pending}
        className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 hover:text-amber-900 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <EyeOff className="w-2.5 h-2.5" />}
        Featured on helper&apos;s profile — remove
      </button>
      {err && (
        <div className="mt-1 flex items-start gap-1 text-[10px] text-rose-700">
          <AlertCircle className="w-2.5 h-2.5 mt-0.5 shrink-0" /> {err}
        </div>
      )}
    </div>
  );
}

// Tiny status badge — shown on the photo tile itself so the customer can
// see at a glance which photos are public.
export function PortfolioBadge() {
  return (
    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded-full">
      <Star className="w-2 h-2 fill-current" /> Public
    </span>
  );
}
