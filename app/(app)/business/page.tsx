import { Briefcase, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function BusinessToolsPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-12 max-w-3xl mx-auto">
      <div className="rounded-3xl bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-100 p-8 sm:p-12 text-center">
        <span className="inline-flex w-14 h-14 rounded-2xl bg-brand-600 text-white items-center justify-center mb-5">
          <Briefcase className="w-6 h-6" />
        </span>
        <h1 className="text-3xl font-bold text-slate-900">Business Tools</h1>
        <p className="mt-3 text-slate-600 max-w-md mx-auto">
          Multi-location management, employee booking access, scheduled inspections,
          recurring services, reporting exports, invoices and team permissions.
        </p>
        <span className="inline-flex mt-4 text-xs font-bold uppercase tracking-wide text-brand-700 bg-brand-100 px-3 py-1 rounded-full">
          Coming Soon
        </span>
        <div className="mt-6">
          <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold">
            Back to Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
