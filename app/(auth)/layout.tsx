import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-sky-50 flex flex-col">
      <header className="px-4 sm:px-6 lg:px-8 h-16 flex items-center max-w-6xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={32} />
          <span className="text-lg font-bold tracking-tight">Helpward</span>
        </Link>
      </header>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-6 sm:py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="text-center text-xs text-slate-500 py-6">
        © {new Date().getFullYear()} Helpward · <Link href="/" className="hover:text-slate-700">Home</Link>
      </footer>
    </div>
  );
}
