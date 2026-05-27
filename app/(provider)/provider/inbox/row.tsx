"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { acceptRequestAction, declineRequestAction } from "./actions";

export function InboxRow({ requestId }: { requestId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 flex items-center gap-2">
      <form action={() => start(() => declineRequestAction(requestId).then(() => {}))} className="flex-1">
        <button
          type="submit"
          disabled={pending}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <X className="w-4 h-4" /> Decline
        </button>
      </form>
      <form action={() => start(() => acceptRequestAction(requestId).then(() => {}))} className="flex-1">
        <button
          type="submit"
          disabled={pending}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
        >
          <Check className="w-4 h-4" /> Accept task
        </button>
      </form>
    </div>
  );
}
