"use client";

import { useMemo, useState } from "react";
import { MapPin, Sparkles, Check } from "lucide-react";
import { SERVICE_AREAS } from "@/lib/service-areas";
import { joinWaitlistAction } from "./waitlist-action";

/* Where a helper actually works: country -> province/state -> city.
 *
 * A customer's address is checked at booking — outside a service area the
 * dispatch guard refuses and says so before they submit. A helper had no
 * equivalent, so anyone anywhere could sign up, finish onboarding, connect a
 * Stripe payout account and wait for an approval that leads nowhere.
 *
 * Every option is read from SERVICE_AREAS, the same source the dispatch
 * guard enforces, so this cannot offer a place that is not bookable. There
 * is one province and one state today; the cascade still exists because it
 * matches how people describe where they live, and because the second one
 * opening should be a data change, not a UI rewrite.
 *
 * Cities are listed by NAME, not by the 17 boundary jurisdictions: "North
 * Vancouver" and "Langley" each cover two (City + District, City +
 * Township). A helper picks the name they would say out loud; the polygons
 * keep the pairs separate underneath.
 */

const NOT_LISTED = "__other__";

export function WhereYouWork({ country, email }: { country: string; email: string }) {
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [typed, setTyped] = useState("");
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // regions[0] is the full name ("British Columbia"); regions[1] the code.
  const regions = useMemo(
    () => SERVICE_AREAS.filter((a) => a.country === country)
      .map((a) => ({ id: a.id, name: a.regions[0], code: a.regions[1] ?? a.regions[0] })),
    [country],
  );
  const area = SERVICE_AREAS.find((a) => a.id === region);
  const regionWord = country === "CA" ? "Province" : "State";

  const reset = () => { setJoined(false); setErr(null); };
  const missing = region === NOT_LISTED || city === NOT_LISTED;
  const place = region === NOT_LISTED ? typed : typed || city;

  const join = async () => {
    setErr(null);
    if (!typed.trim()) return setErr(`Tell us the city and we'll write it down.`);
    if (!email.trim()) return setErr("Add your email above first — that's where the one email goes.");
    setBusy(true);
    const r = await joinWaitlistAction(email, typed, country);
    setBusy(false);
    if (r?.error) setErr(r.error); else setJoined(true);
  };

  const selectClass =
    "w-full pl-10 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm " +
    "focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400 appearance-none " +
    "disabled:bg-slate-50 disabled:text-slate-400";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
      <div className="text-xs font-semibold text-slate-700">Where will you work?</div>

      <label className="block">
        <span className="sr-only">{regionWord}</span>
        <div className="relative">
          <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            name="work_region"
            value={region}
            onChange={(e) => { setRegion(e.target.value); setCity(""); reset(); }}
            className={selectClass}
          >
            <option value="">Choose your {regionWord.toLowerCase()}…</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
            <option value={NOT_LISTED}>My {regionWord.toLowerCase()} isn&rsquo;t listed</option>
          </select>
        </div>
      </label>

      {area && (
        <label className="block">
          <span className="sr-only">City</span>
          <div className="relative">
            <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              name="work_city"
              value={city}
              onChange={(e) => { setCity(e.target.value); reset(); }}
              className={selectClass}
            >
              <option value="">Choose your city…</option>
              {area.municipalities.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              <option value={NOT_LISTED}>My city isn&rsquo;t listed</option>
            </select>
          </div>
        </label>
      )}

      {area && city && city !== NOT_LISTED && (
        <p className="text-[12px] text-emerald-700 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Helpward is live in {city}. Requests there can reach you.
        </p>
      )}

      {missing && !joined && (
        <div>
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="text-[13px] leading-relaxed text-slate-700">
              <strong className="text-slate-900">Not your corner yet.</strong> Helpward
              opens somewhere new when there&rsquo;s enough work waiting to be worth
              your evening — never before. Today that&rsquo;s two places, and we&rsquo;d
              rather say so than take your application and let it sit.
              <br /><br />
              Tell us where you are and you get <strong>one email</strong>: the day we
              open there. Not a newsletter. Not a drip campaign. One email.
              <br /><br />
              It&rsquo;s also how we choose where to go next — thirty people naming the
              same city beats any guess we could make off a map.
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={country === "CA" ? "e.g. Victoria, Calgary" : "e.g. Los Angeles, Austin"}
              className="flex-1 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100"
            />
            <button
              type="button"
              onClick={join}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold disabled:opacity-50 shrink-0"
            >
              {busy ? "Saving…" : "Tell us"}
            </button>
          </div>
          {err && <p className="mt-2 text-[12px] text-rose-700">{err}</p>}
        </div>
      )}

      {missing && joined && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
          <div className="text-[13px] font-semibold text-emerald-900 flex items-center gap-1.5">
            <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
            {place} is on the list.
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-emerald-800/90">
            You can still create your account — you just won&rsquo;t see requests until
            Helpward reaches you. We&rsquo;ll email the day it does.
          </p>
        </div>
      )}
    </div>
  );
}
