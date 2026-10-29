import Link from "next/link";
import { Mail } from "lucide-react";

/* A footer for the pages that had none.
 *
 * The service pages and both kinds of city page ended without one, so 78
 * public pages offered no way to contact anyone, no way back to the
 * directories, and no legal links. A visitor who reached a service page
 * from search had to guess the rest of the site existed.
 *
 * Deliberately compact: these pages already carry their own calls to
 * action, and a second full navigation block competes with them.
 */
export function SiteFooter() {
  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand-600 text-white flex items-center justify-center text-sm font-bold">H</div>
              <span className="font-bold text-white">Helpward</span>
            </Link>
            <a
              href="mailto:support@helpward.com"
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition"
            >
              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
              support@helpward.com
            </a>
            <p className="mt-2 text-[11px] text-slate-500 max-w-xs leading-relaxed">
              Questions about a booking, becoming a helper, or whether we cover your
              address — that address reaches a person.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-10 gap-y-1.5 text-xs">
            {[
              ["All services", "/our-services"],
              ["Where we work", "/cities"],
              ["Become a helper", "/signup?role=helper"],
              ["Safety", "/safety"],
              ["Help centre", "/help"],
              ["About", "/about"],
              ["Terms", "/terms"],
              ["Privacy", "/privacy"],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="text-slate-400 hover:text-white transition">
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 pt-5 border-t border-slate-800 text-[11px] text-slate-500">
          © {new Date().getFullYear()} Helpward · Operating in the City of San Diego and
          Vancouver&rsquo;s Lower Mainland.
        </div>
      </div>
    </footer>
  );
}
