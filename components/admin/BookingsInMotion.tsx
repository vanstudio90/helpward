"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingCart, Truck, Wrench, Sparkles, Boxes, Clock, PackageCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { QueueRow } from "@/lib/data/admin-overview";

/*
  THE THREE QUEUES A JOB PASSES THROUGH.

  Matching rows are REQUESTS — nobody has accepted them, so they have no
  helper and no booking reference. Scheduled and in-progress rows are
  bookings. The tab labels carry the counts so the shape of the day is
  readable without clicking, and an empty tab says which queue is empty
  rather than showing a blank table.
*/

const ICON: Record<string, LucideIcon> = {
  "grocery-pickup": ShoppingCart,
  "package-delivery": Truck,
  "package-return": PackageCheck,
  "errand-runner": ShoppingCart,
  "furniture-assembly": Wrench,
  "maid-service": Sparkles,
  "moving-help": Boxes,
  "wait-in-line": Clock,
};

const TABS = [
  { key: "matching", label: "Matching" },
  { key: "scheduled", label: "Scheduled" },
  { key: "in_progress", label: "In progress" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STATUS_STYLE: Record<string, string> = {
  matching: "bg-brand-50 text-brand-700",
  scheduled: "bg-sky-50 text-sky-700",
  in_progress: "bg-emerald-50 text-emerald-700",
};

export function BookingsInMotion({
  queues,
}: {
  queues: { matching: QueueRow[]; scheduled: QueueRow[]; in_progress: QueueRow[] };
}) {
  const [tab, setTab] = useState<TabKey>(
    queues.matching.length ? "matching" : queues.in_progress.length ? "in_progress" : "scheduled",
  );
  const rows = queues[tab];

  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-[15px] font-bold text-slate-900">Bookings in motion</h2>
      </header>

      <div className="px-4 py-3 flex items-center gap-2">
        {TABS.map((t) => {
          const count = queues[t.key].length;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-full border transition ${
                active
                  ? "bg-brand-50 border-brand-200 text-brand-700"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {t.label}
              <span className={`text-[11px] font-bold ${active ? "text-brand-700" : "text-slate-400"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 pb-6 text-[13px] text-slate-500">
          {tab === "matching"
            ? "No request is waiting for a helper."
            : tab === "scheduled"
              ? "Nothing is booked and waiting to start."
              : "No job is in progress."}
        </p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
              <th className="text-left font-semibold px-4 py-2">Service</th>
              <th className="text-left font-semibold px-2 py-2">Reference</th>
              <th className="text-left font-semibold px-2 py-2">Customer</th>
              <th className="text-left font-semibold px-2 py-2">Helper</th>
              <th className="text-left font-semibold px-2 py-2">Status</th>
              <th className="text-right font-semibold px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row) => {
              const Icon = ICON[row.service_title?.toLowerCase().replace(/\s+/g, "-") ?? ""] ?? Users;
              return (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 text-slate-800">
                      <Icon className="w-4 h-4 text-slate-400" />
                      {row.service_title}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-slate-500 tabular-nums">{row.ref}</td>
                  <td className="px-2 py-2.5 text-slate-700">{row.customer_name ?? "—"}</td>
                  <td className="px-2 py-2.5">
                    {row.helper_name ?? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        Not assigned
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      STATUS_STYLE[row.status] ?? "bg-slate-100 text-slate-600"
                    }`}>
                      {row.status === "in_progress" ? "In progress"
                        : row.status === "scheduled" ? "Scheduled" : "Matching"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={row.href}
                      className="inline-block text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:border-brand-300 hover:text-brand-700"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
