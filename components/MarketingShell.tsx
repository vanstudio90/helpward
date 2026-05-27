import Link from "next/link";

export function MarketingShell({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold">H</div>
            <span className="text-lg font-bold tracking-tight">Helpward</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/login" className="px-3 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100">Log in</Link>
            <Link href="/signup" className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold">Sign up</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-slate-600">{subtitle}</p>}
        <div className="mt-8 prose prose-slate prose-sm sm:prose-base max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-a:text-brand-700">
          {children}
        </div>
      </main>

      <footer className="border-t border-slate-100 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Helpward</span>
          <nav className="flex items-center gap-5">
            <Link href="/about" className="hover:text-slate-900">About</Link>
            <Link href="/safety" className="hover:text-slate-900">Safety</Link>
            <Link href="/terms" className="hover:text-slate-900">Terms</Link>
            <Link href="/privacy" className="hover:text-slate-900">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
