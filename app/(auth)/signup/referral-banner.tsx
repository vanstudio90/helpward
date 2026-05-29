"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";

// Reads the hw_ref cookie (set by proxy.ts when the visitor landed via
// ?ref=CODE) and shows a "$10 credit applied" banner if present. Cookie is
// not HttpOnly precisely so we can render this banner.

export function ReferralBanner({ rewardLabel }: { rewardLabel: string }) {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)hw_ref=([A-Z0-9]+)/);
    if (match) setCode(match[1]);
  }, []);

  if (!code) return null;

  return (
    <div className="mt-5 rounded-2xl bg-gradient-to-r from-emerald-50 to-brand-50 border border-emerald-200 p-3 flex items-center gap-3">
      <span className="w-9 h-9 rounded-xl bg-white inline-flex items-center justify-center shrink-0 shadow-sm">
        <Gift className="w-4 h-4 text-emerald-600" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-slate-900">{rewardLabel} credit will apply</div>
        <div className="text-[11px] text-slate-600">
          Code <span className="font-mono font-bold">{code}</span> kicks in on your first booking.
        </div>
      </div>
    </div>
  );
}
