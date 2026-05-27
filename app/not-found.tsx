import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
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
          <span className="inline-flex w-16 h-16 rounded-2xl bg-brand-50 items-center justify-center mb-4">
            <Compass className="w-8 h-8 text-brand-600" />
          </span>
          <div className="text-6xl font-bold text-slate-900 leading-none">404</div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">Page not found</h1>
          <p className="mt-2 text-sm text-slate-600">
            The page you&apos;re looking for moved, or never existed.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
          >
            <Home className="w-4 h-4" /> Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
