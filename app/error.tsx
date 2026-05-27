"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertOctagon, RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold">H</div>
            <span className="text-lg font-bold tracking-tight">Helpward</span>
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <span className="inline-flex w-16 h-16 rounded-2xl bg-rose-50 items-center justify-center mb-4">
            <AlertOctagon className="w-8 h-8 text-rose-600" />
          </span>
          <h1 className="text-2xl font-bold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            We hit an unexpected error. You can try again, or head home.
          </p>
          {error.digest && (
            <p className="mt-2 text-[10px] text-slate-400 font-mono">Error ID: {error.digest}</p>
          )}
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
            >
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold"
            >
              <Home className="w-4 h-4" /> Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
