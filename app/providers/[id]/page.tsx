import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Star, MapPin, Clock, ArrowRight, GalleryHorizontal } from "lucide-react";
import { ClientDateTime } from "@/components/ClientDateTime";
import { AvailabilityBadge, AvailabilityTable } from "./availability";
import { getProviderAvailability, computeAvailabilityStatus } from "@/lib/data/availability";
import { FavoriteHelperButton } from "@/components/FavoriteHelperButton";
import { isUuid } from "@/lib/slug";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PublicProviderProfile({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const supabase = await createSupabaseServerClient();

  // Resolve the URL param as either a UUID (legacy) or a slug (new). UUID
  // form gets a permanent redirect to the slug URL so search engines + saved
  // links converge on the human-readable canonical.
  const isUuidParam = isUuid(raw);
  const lookupColumn = isUuidParam ? "user_id" : "slug";

  const { data: pp } = await supabase
    .from("provider_profiles")
    .select(`
      *,
      profile:profiles!provider_profiles_user_id_fkey(full_name, avatar_url, country)
    `)
    .eq(lookupColumn, raw)
    .single();

  if (!pp || pp.status !== "approved") notFound();

  // UUID requested but a slug exists — bounce to the canonical slug URL.
  // Keeps inbound links from /favorites + /bookings + bookmarks alive while
  // teaching crawlers about the canonical form.
  if (isUuidParam && pp.slug && pp.slug !== raw) {
    redirect(`/providers/${pp.slug}`);
  }

  // Once we've resolved the row, everything downstream queries by user_id —
  // services, reviews, portfolio, etc. all reference provider_id which is
  // always the user_id, never the slug.
  const id = pp.user_id;

  const { data: svcs } = await supabase
    .from("provider_services")
    .select("services(id, title, base_price_cents, eta_label)")
    .eq("provider_id", id);

  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at, customer:profiles!reviews_customer_id_fkey(full_name)")
    .eq("provider_id", id)
    .eq("customer_visible", true)
    .order("created_at", { ascending: false })
    .limit(5);

  // Availability: one fetch, used by both the badge (header) and the
  // weekly-schedule table (below "Services offered").
  const availability = await getProviderAvailability(id);
  const availabilityStatus = computeAvailabilityStatus(
    availability.rules, availability.overrides, availability.vacation,
  );

  const prof = (pp as { profile: { full_name: string; avatar_url: string | null; country: string } | null }).profile;
  const services = (svcs ?? []).map((row) => (row as { services: { id: string; title: string; base_price_cents: number; eta_label: string | null } | null }).services).filter(Boolean);

  // Has the viewer (if any) already favourited this helper? Lets the heart
  // button render in its filled state on first paint instead of flickering.
  const { data: { user } } = await supabase.auth.getUser();
  let initialSaved = false;
  if (user) {
    const { data: fav } = await supabase
      .from("favorites")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("kind", "provider")
      .eq("target_id", id)
      .maybeSingle();
    initialSaved = !!fav;
  }

  // Portfolio — featured completion photos from past completed bookings.
  // RLS lets anon read these rows when is_portfolio=true + helper.status=approved.
  // Signed URLs minted with service role since the bucket is private.
  const { data: portfolioRows } = await supabase
    .from("booking_completion_photos")
    .select("id, storage_path, portfolio_caption, caption, created_at")
    .eq("uploaded_by_user_id", id)
    .eq("is_portfolio", true)
    .order("created_at", { ascending: false })
    .limit(12);
  type PortfolioRow = { id: string; storage_path: string; portfolio_caption: string | null; caption: string | null; created_at: string };
  const portfolio = (portfolioRows as PortfolioRow[] | null) ?? [];
  let portfolioSigned: { id: string; url: string; caption: string | null }[] = [];
  if (portfolio.length > 0) {
    const svc = createSupabaseServiceClient();
    const { data: signed } = await svc.storage
      .from("booking-photos")
      .createSignedUrls(portfolio.map((r) => r.storage_path), 60 * 60);
    const urlByPath = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl ?? ""] as const));
    portfolioSigned = portfolio
      .map((r) => ({
        id: r.id,
        url: urlByPath.get(r.storage_path) ?? "",
        caption: r.portfolio_caption ?? r.caption,
      }))
      .filter((p) => p.url);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-brand-600 text-white flex items-center justify-center font-bold text-sm">H</div>
            <span className="text-base font-bold">Helpward</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="rounded-2xl bg-white border border-slate-100 p-6 text-center">
          {prof?.avatar_url ? (
            <img src={prof.avatar_url} className="w-24 h-24 rounded-full mx-auto" alt="" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-slate-100 mx-auto flex items-center justify-center text-3xl font-bold text-slate-400">
              {prof?.full_name?.[0] ?? "?"}
            </div>
          )}
          <h1 className="mt-4 text-2xl font-bold text-slate-900 inline-flex items-center gap-2">
            {prof?.full_name}
            <ShieldCheck className="w-5 h-5 text-brand-600" />
          </h1>
          <div className="mt-3 flex justify-center">
            <FavoriteHelperButton
              helperId={id}
              initialSaved={initialSaved}
              isAuthed={!!user}
              signupNext={`/providers/${id}`}
              variant="pill"
            />
          </div>
          <div className="mt-1 text-sm text-slate-500">{prof?.country === "CA" ? "Canada" : "United States"}</div>
          {pp.rating_avg && (
            <div className="mt-2 inline-flex items-center gap-1 text-sm">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="font-bold text-slate-900">{pp.rating_avg}</span>
              <span className="text-slate-500">({pp.rating_count} reviews)</span>
            </div>
          )}
          {/* Availability badge — live, computed server-side per request */}
          <div className="mt-3 flex justify-center">
            <AvailabilityBadge status={availabilityStatus} />
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">✓ ID Verified</span>
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">✓ Background Checked</span>
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">✓ Insured</span>
          </div>
          {pp.bio && <p className="mt-4 text-sm text-slate-600 leading-relaxed max-w-md mx-auto">{pp.bio}</p>}
          <div className="mt-6 grid grid-cols-3 gap-2 text-xs max-w-md mx-auto">
            <Stat icon={<Clock className="w-4 h-4" />} value={pp.response_time_sec ? `${Math.round(pp.response_time_sec / 60)} min` : "—"} label="Response" />
            <Stat value={String(pp.tasks_completed)} label="Tasks done" />
            <Stat value={(pp.languages ?? []).join(", ") || "—"} label="Languages" />
          </div>
        </div>

        <AvailabilityTable rules={availability.rules} overrides={availability.overrides} />

        {services.length > 0 && (
          <section className="mt-6 rounded-2xl bg-white border border-slate-100 p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Services offered</h2>
            <ul className="grid grid-cols-2 gap-2 text-xs">
              {services.map((s) => (
                <li key={s!.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="text-sm font-semibold text-slate-900">{s!.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">From ${(s!.base_price_cents / 100).toFixed(0)} · {s!.eta_label}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {portfolioSigned.length > 0 && (
          <section className="mt-6 rounded-2xl bg-white border border-slate-100 p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3 inline-flex items-center gap-2">
              <GalleryHorizontal className="w-4 h-4 text-amber-600" /> Recent work
            </h2>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {portfolioSigned.map((p) => (
                <li key={p.id} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group">
                  <img
                    src={p.url}
                    alt={p.caption ?? "Helper's past work"}
                    loading="lazy"
                    className="w-full h-full object-cover transition group-hover:scale-105"
                  />
                  {p.caption && (
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-2 py-1.5 leading-tight line-clamp-2">
                      {p.caption}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(reviews?.length ?? 0) > 0 && (
          <section className="mt-6 rounded-2xl bg-white border border-slate-100 p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Recent reviews</h2>
            <ul className="space-y-4">
              {(reviews ?? []).map((r) => (
                <li key={r.id} className="border-b border-slate-100 last:border-b-0 pb-3 last:pb-0">
                  <div className="flex items-center gap-2 text-amber-500 text-sm">
                    {Array.from({ length: r.rating }).map((_, j) => <Star key={j} className="w-3.5 h-3.5 fill-amber-400" />)}
                    <span className="text-xs text-slate-500 ml-1">
                      {(r as { customer: { full_name: string } | null }).customer?.full_name ?? "Anonymous"} · <ClientDateTime iso={r.created_at} mode="date" />
                    </span>
                  </div>
                  {r.comment && <p className="text-sm text-slate-700 mt-1">{r.comment}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link
          href="/new-request"
          className="mt-6 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white text-sm font-semibold"
        >
          Book a task <ArrowRight className="w-4 h-4" />
        </Link>
      </main>
    </div>
  );
}

function Stat({ icon, value, label }: { icon?: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 text-center">
      <div className="font-bold text-slate-900 inline-flex items-center justify-center gap-1">{icon}{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
