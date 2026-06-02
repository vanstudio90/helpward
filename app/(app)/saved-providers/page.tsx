import { listSavedProviders } from "@/lib/data/customer";
import { getBatchAvailabilityStatus } from "@/lib/data/availability";
import Link from "next/link";
import { Heart, Sparkles, MessageSquare, Phone, ShieldCheck } from "lucide-react";
import { AvailabilityBadge } from "@/app/providers/[id]/availability";

export default async function SavedProvidersPage() {
  const providers = await listSavedProviders();
  const availability = await getBatchAvailabilityStatus(providers.map((p) => p.user_id));

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Saved Providers</h1>
        <p className="text-sm text-slate-500 mt-1">Your trusted providers, saved for faster booking.</p>
      </div>

      {providers.length === 0 ? (
        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-100 p-8 sm:p-12 text-center">
          <span className="inline-flex w-14 h-14 rounded-2xl bg-white items-center justify-center mb-3">
            <Heart className="w-7 h-7 text-rose-500 fill-rose-500" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">No saved providers yet</h2>
          <p className="mt-1 text-sm text-slate-600 max-w-sm mx-auto">
            After your first task, save the provider you liked so you can re-book them instantly next time.
          </p>
          <Link href="/services" className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold">
            <Sparkles className="w-4 h-4" /> Find a provider
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {providers.map((p) => (
            <li key={p.user_id} className="rounded-2xl bg-white border border-slate-100 p-4 flex items-center gap-4">
              <Link href={`/providers/${p.slug ?? p.user_id}`} className="shrink-0">
                {p.profile.avatar_url ? (
                  <img src={p.profile.avatar_url} className="w-12 h-12 rounded-full" alt="" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                    {p.profile.full_name?.[0] ?? "?"}
                  </div>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/providers/${p.slug ?? p.user_id}`} className="text-sm font-bold text-slate-900 truncate flex items-center gap-1 hover:underline">
                  {p.profile.full_name}
                  {p.status === "approved" && <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />}
                </Link>
                <div className="text-xs text-slate-500">
                  {p.rating_avg ? `★ ${p.rating_avg} (${p.rating_count} reviews)` : "New provider"} · {p.tasks_completed} tasks
                </div>
                {availability.get(p.user_id) && (
                  <div className="mt-1.5">
                    <AvailabilityBadge status={availability.get(p.user_id)!} />
                  </div>
                )}
              </div>
              <Link
                href={`/new-request?preferred_helper=${p.user_id}`}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-violet-600 text-white text-xs font-bold shrink-0"
              >
                Book again
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
