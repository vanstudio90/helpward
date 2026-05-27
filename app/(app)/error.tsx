"use client";

import { useEffect } from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";

export default function AppError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="px-4 lg:px-8 py-12 max-w-2xl mx-auto text-center">
      <span className="inline-flex w-14 h-14 rounded-2xl bg-rose-50 items-center justify-center mb-4">
        <AlertOctagon className="w-7 h-7 text-rose-600" />
      </span>
      <h1 className="text-xl font-bold text-slate-900">This page hit a snag</h1>
      <p className="mt-2 text-sm text-slate-600">
        Something went wrong loading this view. Try again — your data is safe.
      </p>
      {error.digest && (
        <p className="mt-2 text-[10px] text-slate-400 font-mono">Error ID: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
      >
        <RefreshCw className="w-4 h-4" /> Try again
      </button>
    </div>
  );
}
