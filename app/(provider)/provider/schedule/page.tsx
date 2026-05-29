import Link from "next/link";
import { Calendar, Info } from "lucide-react";
import { getMyAvailability } from "@/lib/data/availability";
import { ScheduleEditor } from "./editor";

export const metadata = {
  title: "Schedule — Helpward",
  description: "Set your weekly availability and one-off dates.",
};

export default async function ProviderSchedulePage() {
  const data = await getMyAvailability();
  if (!data) return null;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto pb-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
        <Calendar className="w-6 h-6 text-brand-600" /> Schedule
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">
        Tell customers when you&apos;re typically available. You can still go online or offline manually any time —
        the schedule shapes the &ldquo;Available now&rdquo; badge on your public profile.
      </p>

      <ScheduleEditor
        initialRules={data.rules}
        initialOverrides={data.overrides}
        vacation={data.vacation}
      />

      <div className="mt-6 rounded-2xl bg-brand-50 border border-brand-100 p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
        <div className="text-xs text-slate-700 leading-relaxed">
          <strong>Heads up:</strong> the schedule is currently informational. It doesn&apos;t auto-decline incoming
          tasks outside your hours yet — that lands in a future round once the matching engine reads availability.
          For now, customers see your schedule on your public profile and the &ldquo;Available now&rdquo; badge updates
          live.{" "}
          <Link href="/help/setting-your-availability" className="text-brand-700 font-semibold hover:underline">
            Read the guide
          </Link>.
        </div>
      </div>
    </div>
  );
}
