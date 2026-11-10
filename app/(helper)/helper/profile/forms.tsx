"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Edit3, Camera } from "lucide-react";
import { updateProviderProfileAction, setProviderServicesAction, uploadProviderAvatarAction } from "./actions";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { SERVICE_FEE_CENTS } from "@/lib/pricing";
import { AvatarEditor } from "./avatar-editor";

export function HelperAvatarUpload({ avatarUrl, fullName }: { avatarUrl: string | null; fullName: string }) {
  const [state, formAction, pending] = useActionState(uploadProviderAvatarAction, undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Picking a file used to upload it immediately, and CSS object-cover
  // cropped it to the centre — which takes the top off a portrait photo of
  // a face, with nothing the person could do about it. The file is now held
  // here until they have positioned it.
  const [picked, setPicked] = useState<File | null>(null);

  // The cropped result is submitted through the same form and the same
  // server action, so every validation it already performs still applies.
  const submitCropped = (cropped: File) => {
    const input = fileInputRef.current;
    const form = formRef.current;
    if (!input || !form) return;
    const dt = new DataTransfer();
    dt.items.add(cropped);
    input.files = dt.files;
    setPicked(null);
    form.requestSubmit();
  };

  return (
    <div className="bg-white rounded-card border border-slate-100 shadow-soft p-4 sm:p-5">
      <h2 className="text-[18px] font-extrabold text-slate-900 mb-3">Profile photo</h2>
      {state?.error && (
        <div className="mb-3 flex items-start gap-2 text-[13px] text-rose-700 bg-rose-50 border border-rose-100 rounded-field p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5" /> {state.error}
        </div>
      )}
      {state?.success && (
        <div className="mb-3 flex items-start gap-2 text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-field p-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" /> {state.success}
        </div>
      )}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} className="w-20 h-20 rounded-full object-cover" alt="" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xl font-bold">
              {fullName[0] ?? "?"}
            </div>
          )}
          <form ref={formRef} action={formAction}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Change photo"
              disabled={pending}
              className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-brand-600 text-white shadow-md hover:bg-brand-700 disabled:opacity-50"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              name="avatar"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                // A GIF may be animated, and flattening one to a still
                // frame without saying so would be worse than uploading it
                // as it is. Everything else goes through the editor.
                if (!f) return;
                if (f.type === "image/gif") { formRef.current?.requestSubmit(); return; }
                setPicked(f);
              }}
            />
          </form>
        </div>
        <div className="text-[15px] text-slate-600">
          A clear headshot helps customers trust you.<br />
          <span className="text-[13px] text-slate-400">JPEG/PNG/WEBP/GIF, up to 5 MB.</span>
        </div>
      </div>

      {picked && (
        <div className="mt-4">
          <AvatarEditor
            file={picked}
            onCancel={() => {
              setPicked(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            onConfirm={submitCropped}
          />
        </div>
      )}
    </div>
  );
}


/* Confirmation where the person is actually looking.
 *
 * Every card on this page put its result banner at the TOP and its save
 * button at the BOTTOM. On a phone that means tapping Save scrolls the
 * confirmation off screen: you press the button and nothing visibly
 * happens, which reads as the press not registering.
 *
 * `role="status"` so a screen reader announces it without stealing focus.
 */
function SaveResult({ state }: { state?: { error?: string; success?: string } }) {
  if (!state?.error && !state?.success) return null;
  const bad = !!state.error;
  return (
    <p
      role="status"
      aria-live="polite"
      className={`mt-3 flex items-start gap-1.5 text-[13px] rounded-field px-2.5 py-2 border ${
        bad
          ? "text-rose-700 bg-rose-50 border-rose-100"
          : "text-emerald-800 bg-emerald-50 border-emerald-100"
      }`}
    >
      {bad
        ? <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
        : <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />}
      <span className="min-w-0">{state.error ?? state.success}</span>
    </p>
  );
}

export function ProfileForm({
  initial,
}: { initial: { full_name: string; phone: string; base_address: string;
                bio: string; service_radius_km: number; languages: string } }) {
  const [state, formAction, pending] = useActionState(updateProviderProfileAction, undefined);

  return (
    <div className="bg-white rounded-card border border-slate-100 shadow-soft p-4 sm:p-5">
      <h2 className="text-[18px] font-extrabold text-slate-900 mb-3">Public profile</h2>

      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="text-[13px] font-semibold text-slate-700">Your name</span>
          <input
            name="full_name"
            defaultValue={initial.full_name}
            maxLength={80}
            required
            placeholder="The name customers will see"
            className="mt-1 w-full px-3 py-2.5 rounded-field bg-white border border-slate-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[13px] font-semibold text-slate-700">Phone number</span>
            <input
              name="phone"
              type="tel"
              defaultValue={initial.phone}
              maxLength={30}
              placeholder="+1 604 555 0123"
              className="mt-1 w-full px-3 py-2.5 rounded-field bg-white border border-slate-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <p className="text-[13px] text-slate-500 mt-1">So we can reach you about a booking.</p>
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-slate-700">Where you&rsquo;re based</span>
            <input
              name="base_address"
              defaultValue={initial.base_address}
              maxLength={200}
              placeholder="Street and city"
              className="mt-1 w-full px-3 py-2.5 rounded-field bg-white border border-slate-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <p className="text-[13px] text-slate-500 mt-1">
              For our records. Jobs reach you from your live location, not this.
            </p>
          </label>
        </div>
        <label className="block">
          <span className="text-[13px] font-semibold text-slate-700">About you</span>
          <textarea
            name="bio"
            defaultValue={initial.bio}
            rows={4}
            placeholder="Brief introduction that shows on your public profile (specialties, years of experience, what makes you reliable)..."
            className="mt-1 w-full px-3 py-2.5 rounded-field bg-white border border-slate-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[13px] font-semibold text-slate-700">Service radius (km)</span>
            <input
              name="service_radius_km"
              type="number"
              min={1}
              max={200}
              defaultValue={initial.service_radius_km}
              required
              className="mt-1 w-full px-3 py-2.5 rounded-field bg-white border border-slate-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <p className="text-[13px] text-slate-500 mt-1">How far you&apos;ll travel from your base location.</p>
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-slate-700">Languages</span>
            <input
              name="languages"
              defaultValue={initial.languages}
              placeholder="English, Spanish, French"
              className="mt-1 w-full px-3 py-2.5 rounded-field bg-white border border-slate-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <p className="text-[13px] text-slate-500 mt-1">Comma-separated.</p>
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-field bg-brand-600 text-white text-[15px] font-semibold disabled:opacity-50"
        >
          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" /> {pending ? "Saving…" : "Save profile"}
        </button>
        <SaveResult state={state} />
      </form>
    </div>
  );
}

/* What a helper actually earns, per service.
 *
 * This card used to show "Base $15" and a "Your price (optional)" box.
 * Both were wrong in a way that mattered:
 *
 *   "Base $15" was services.base_price_cents — the legacy single number.
 *   A Vancouver helper reading it was looking at neither what the customer
 *   pays nor what they themselves receive, in a currency nobody named.
 *
 *   "Your price" wrote provider_services.custom_price_cents, which NOTHING
 *   reads. price_service_cents prices from the catalogue, the pricing rule
 *   and the country override; accept_request uses the same function. So a
 *   helper could set a rate, watch it save, and be paid the platform rate
 *   regardless. A control that silently does nothing is worse than no
 *   control, and quietly switching to it later would replace a customer's
 *   sealed quote with a number they never agreed to.
 *
 * Replaced with the three figures that are true: what the customer pays,
 * what this helper receives, and the unit both refer to.
 */
export function ServicesForm({
  allServices, initialSelected, country,
}: {
  allServices: {
    id: string; title: string; category: string; blurb: string;
    /** Commissionable service subtotal in this helper's market. */
    subtotalCents: number;
    /** 80% of the subtotal. Tips are extra and are never commissioned. */
    helperEarnsCents: number;
    /** Subtotal + the flat service fee, before tax and any tip. */
    customerPaysCents: number;
    /** "/ first hour", "/ first 30 minutes" — what the figures buy. */
    unit: string;
  }[];
  initialSelected: string[];
  country: "US" | "CA";
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; err?: string } | null>(null);
  const currency = country === "CA" ? "CAD" : "USD";

  const grouped = allServices.reduce<Record<string, typeof allServices>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  // The count has to agree with the boxes underneath it.
  //
  // `selected` holds every provider_services row, but this list only
  // renders the services that are currently active — migration 0087
  // paused nineteen of them while the app is in review. A helper who had
  // picked some of those saw "7 selected" above three ticked boxes, with
  // nothing on the page explaining the other four.
  //
  // So: count what is on screen, and account for the rest out loud. The
  // paused selections are NOT dropped — `save()` still sends the whole
  // set, so they come back untouched when the services do.
  const visibleIds = new Set(allServices.map((s) => s.id));
  const visibleSelected = Array.from(selected).filter((id) => visibleIds.has(id));
  const pausedCount = selected.size - visibleSelected.length;

  const save = () => {
    setMsg(null);
    // No custom_price_cents. Nothing reads it, so sending one would only
    // store a number that misleads whoever finds it next.
    const payload = Array.from(selected).map((id) => ({ id }));
    start(async () => {
      const r = await setProviderServicesAction(payload);
      if (r?.error) setMsg({ err: r.error });
      else setMsg({ ok: r?.success ?? "Saved." });
    });
  };

  return (
    <div className="bg-white rounded-card border border-slate-100 shadow-soft p-4 sm:p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[18px] font-extrabold text-slate-900">Services you offer</h2>
        <span className="text-[13px] text-slate-500">
          {visibleSelected.length} selected
          {pausedCount > 0 && ` · ${pausedCount} paused`}
        </span>
      </div>
      <p className="text-[13px] text-slate-500 mb-3">
        You&apos;ll only get task offers for services you check here.
        {pausedCount > 0 && (
          <>
            {" "}
            {pausedCount === 1 ? "One service you" : `${pausedCount} services you`}
            {pausedCount === 1 ? " picked is" : " picked are"} paused for everyone at the
            moment and {pausedCount === 1 ? "is" : "are"} not shown. Your choice is kept
            and comes back with {pausedCount === 1 ? "it" : "them"}.
          </>
        )}
      </p>

      {/* Said once, rather than repeated beside 27 figures. The honesty
          that matters: these are gross receipts for the booked work, not
          an hourly wage across travel and waiting. */}
      <p className="text-[13px] text-slate-500 bg-slate-50 border border-slate-100 rounded-field px-2.5 py-2 mb-4 leading-snug">
        Amounts are in {currency === "CAD" ? "Canadian dollars" : "US dollars"} for the area you work
        in, before tax. <strong className="text-slate-700">You earn 80% of the service price, and
        all of any tip.</strong> Helpward keeps the rest plus a flat {formatMoney(SERVICE_FEE_CENTS, currency)} fee
        the customer pays. These are what a booking pays you — not an hourly rate across travel or
        waiting between jobs.
      </p>

      <div className="space-y-4">
        {Object.entries(grouped).map(([cat, list]) => (
          <div key={cat}>
            <div className="text-[13px] font-bold uppercase tracking-wide text-slate-400 mb-2">{cat}</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {list.map((s) => {
                const isOn = selected.has(s.id);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "flex flex-col gap-2 p-3 rounded-field border transition",
                      isOn ? "border-brand-300 bg-brand-50/40" : "border-slate-100 hover:border-slate-300"
                    )}
                  >
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(s.id);
                          else next.delete(s.id);
                          setSelected(next);
                        }}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-slate-900">{s.title}</div>
                        <div className="text-[13px] text-slate-500 line-clamp-2">{s.blurb}</div>
                        <div className="text-[13px] mt-1 leading-snug">
                          <span className="font-semibold text-emerald-700">
                            You earn {formatMoney(s.helperEarnsCents, currency)}
                          </span>
                          {s.unit && <span className="text-slate-400"> {s.unit.replace("/ first", "·")}</span>}
                          <span className="block text-slate-400">
                            Customer pays {formatMoney(s.customerPaysCents, currency)}
                          </span>
                        </div>
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="mt-5 inline-flex items-center gap-2 text-[15px] font-semibold text-white bg-brand-600 px-4 py-2.5 rounded-field disabled:opacity-50"
      >
        {pending
          ? "Saving…"
          : `Save ${visibleSelected.length} service${visibleSelected.length === 1 ? "" : "s"}`}
      </button>

      {/* Below the button like every other card here. This one is the
          longest on the page — a banner above a list of 26 services is
          not merely off screen, it is several screens away. */}
      <SaveResult state={{ error: msg?.err, success: msg?.ok }} />
    </div>
  );
}
