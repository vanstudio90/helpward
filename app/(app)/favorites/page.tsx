import { listFavoritesByKind, listSavedProviders, listMyAddresses } from "@/lib/data/customer";
import { listServices } from "@/lib/data/services";
import { getBatchAvailabilityStatus } from "@/lib/data/availability";
import Link from "next/link";
import { Heart, Plus, Sparkles, ArrowRight, ExternalLink } from "lucide-react";
import { FavoriteHelperButton } from "@/components/FavoriteHelperButton";
import { AvailabilityBadge } from "@/app/providers/[id]/availability";

export default async function FavoritesPage() {
  const [providers, addresses, serviceFavs, allServices] = await Promise.all([
    listSavedProviders(),
    listMyAddresses(),
    listFavoritesByKind("service"),
    listServices(),
  ]);
  const favServiceIds = new Set(serviceFavs.map((f) => f.target_id));
  const favServices = allServices.filter((s) => favServiceIds.has(s.id));
  // Batched availability lookup — one fetch for all saved helpers instead
  // of N × 3 queries from per-card render calls.
  const availability = await getBatchAvailabilityStatus(providers.map((p) => p.user_id));

  const total = providers.length + addresses.length + favServices.length;

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 flex items-center gap-2">
          <Heart className="w-5 h-5 lg:w-6 lg:h-6 text-rose-500 fill-rose-500" /> Favorites
        </h1>
        <p className="text-sm text-slate-500 mt-1">Your favorite providers and services for quick access.</p>
      </div>

      {total === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-6">
          {providers.length > 0 && (
            <Section title={`Saved helpers (${providers.length})`}>
              <ul className="grid sm:grid-cols-2 gap-3">
                {providers.map((p) => (
                  <li key={p.user_id} className="rounded-2xl bg-white border border-slate-100 p-4">
                    <div className="flex items-center gap-3">
                      <Link href={`/providers/${p.slug ?? p.user_id}`} className="shrink-0">
                        {p.profile.avatar_url ? (
                          <img src={p.profile.avatar_url} className="w-14 h-14 rounded-full" alt="" />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                            {p.profile.full_name?.[0] ?? "?"}
                          </div>
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/providers/${p.slug ?? p.user_id}`} className="text-sm font-bold text-slate-900 truncate hover:underline block">
                          {p.profile.full_name}
                        </Link>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {p.rating_avg ? `★ ${p.rating_avg} (${p.rating_count} reviews)` : "New helper"}
                        </div>
                        {p.tasks_completed > 0 && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {p.tasks_completed} task{p.tasks_completed === 1 ? "" : "s"} completed
                          </div>
                        )}
                      </div>
                      <FavoriteHelperButton
                        helperId={p.user_id}
                        initialSaved={true}
                        isAuthed={true}
                        signupNext={`/favorites`}
                        size="sm"
                      />
                    </div>
                    {availability.get(p.user_id) && (
                      <div className="mt-3">
                        <AvailabilityBadge status={availability.get(p.user_id)!} />
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Link
                        href={`/new-request?preferred_helper=${p.user_id}`}
                        className="inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white text-xs font-bold"
                      >
                        Book again <ArrowRight className="w-3 h-3" />
                      </Link>
                      <Link
                        href={`/providers/${p.slug ?? p.user_id}`}
                        className="inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                      >
                        View profile <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {favServices.length > 0 && (
            <Section title={`Services (${favServices.length})`}>
              <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {favServices.map((s) => (
                  <li key={s.id} className="rounded-2xl bg-white border border-slate-100 p-4">
                    <div className="text-sm font-bold text-slate-900">{s.title}</div>
                    <div className="text-xs text-slate-500 mt-1 line-clamp-2">{s.blurb}</div>
                    <div className="text-xs font-semibold text-brand-700 mt-3">From ${(s.base_price_cents / 100).toFixed(0)}</div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {addresses.length > 0 && (
            <Section title={`Saved addresses (${addresses.length})`}>
              <ul className="space-y-2">
                {addresses.map((a) => (
                  <li key={a.id} className="rounded-2xl bg-white border border-slate-100 p-4">
                    <div className="text-sm font-bold text-slate-900">{a.label ?? "Saved address"}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{a.formatted}</div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-bold text-slate-900 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-100 p-8 sm:p-12 text-center">
      <span className="inline-flex w-14 h-14 rounded-2xl bg-white items-center justify-center mb-3">
        <Heart className="w-7 h-7 text-rose-500 fill-rose-500" />
      </span>
      <h2 className="text-lg font-bold text-slate-900">No favorites yet</h2>
      <p className="mt-1 text-sm text-slate-600 max-w-sm mx-auto">
        Tap the heart on any provider, service, or address to save it here for quick re-booking later.
      </p>
      <Link href="/services" className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold">
        <Sparkles className="w-4 h-4" /> Browse services
      </Link>
    </div>
  );
}
