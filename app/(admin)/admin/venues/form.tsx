"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { SERVICE_AREAS } from "@/lib/service-areas";
import { saveVenueAction, deleteVenueAction } from "./actions";

export type VenueRow = {
  id: string; name: string; address: string | null; city: string | null;
  region: string | null; country: string | null; area_id: string | null;
  substitutes_allowed: string; customer_may_replace: string;
  full_party_required: string; numbers_transferable: string;
  early_turn_policy: string | null; notes: string | null;
  confirmed_at: string | null;
};

const QUESTIONS = [
  { key: "substitutes_allowed", label: "Paid stand-ins accepted?",
    help: "Can someone queue on another person's behalf at all? A 'no' here blocks every booking for this venue." },
  { key: "customer_may_replace", label: "Can the customer replace the helper?",
    help: "A 'no' blocks the swap handover but still allows collecting a number." },
  { key: "full_party_required", label: "Must the whole party be present?",
    help: "Answer 'allowed' if yes, everyone must be there. Shown to the customer as a warning." },
  { key: "numbers_transferable", label: "Are queue numbers transferable?",
    help: "A 'no' means the customer must arrive for the handover in person." },
] as const;

function PermissionSelect({ name, value }: { name: string; value?: string }) {
  return (
    <select
      name={name}
      defaultValue={value ?? "unknown"}
      className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
    >
      <option value="unknown">Not checked</option>
      <option value="allowed">Yes — confirmed</option>
      <option value="refused">No — confirmed</option>
    </select>
  );
}

export function VenueForm({ venue, onDone }: { venue?: VenueRow; onDone?: () => void }) {
  const [state, formAction, pending] = useActionState(saveVenueAction, undefined);

  return (
    <form action={formAction} className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 space-y-4">
      {venue && <input type="hidden" name="id" value={venue.id} />}

      {state?.error && (
        <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" /> {state.error}
        </div>
      )}
      {state?.success && (
        <div className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" /> {state.success}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Venue name</span>
          <input name="name" defaultValue={venue?.name} required maxLength={120}
            placeholder="As it appears on the door"
            className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Service area</span>
          <select name="area_id" defaultValue={venue?.area_id ?? ""}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200">
            <option value="">—</option>
            {SERVICE_AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-semibold text-slate-700">Address</span>
          <input name="address" defaultValue={venue?.address ?? ""} maxLength={200}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">City</span>
          <input name="city" defaultValue={venue?.city ?? ""} maxLength={80}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Region</span>
            <input name="region" defaultValue={venue?.region ?? ""} maxLength={40}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Country</span>
            <select name="country" defaultValue={venue?.country ?? "CA"}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200">
              <option value="CA">Canada</option>
              <option value="US">United States</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-3">
        <p className="text-xs text-slate-600">
          Answer only what you have actually confirmed with the venue. Anything left as
          <strong> Not checked</strong> is shown to customers as unverified — which is honest, and
          better than a guess recorded as a fact.
        </p>
        {QUESTIONS.map((q) => (
          <label key={q.key} className="block">
            <span className="text-xs font-semibold text-slate-700">{q.label}</span>
            <PermissionSelect name={q.key} value={venue?.[q.key]} />
            <span className="block mt-1 text-[11px] text-slate-500 leading-snug">{q.help}</span>
          </label>
        ))}
      </div>

      <label className="block">
        <span className="text-xs font-semibold text-slate-700">What happens if the turn comes early?</span>
        <input name="early_turn_policy" defaultValue={venue?.early_turn_policy ?? ""} maxLength={300}
          placeholder="e.g. they call the name on the booking and hold it for 5 minutes"
          className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
        <span className="block mt-1 text-[11px] text-slate-500">Shown to the customer when they book this venue.</span>
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-slate-700">Internal notes</span>
        <textarea name="notes" defaultValue={venue?.notes ?? ""} rows={2} maxLength={1000}
          placeholder="Who you spoke to, anything worth knowing next time."
          className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending}
          className="px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50">
          {pending ? "Saving…" : venue ? "Save changes" : "Add venue"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm font-semibold text-slate-600">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function AddVenue() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold">
        <Plus className="w-4 h-4" aria-hidden="true" /> Add venue
      </button>
    );
  }
  return <VenueForm onDone={() => setOpen(false)} />;
}

export function DeleteVenue({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} aria-label={`Remove ${name}`}
        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
        <Trash2 className="w-4 h-4" aria-hidden="true" />
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <button onClick={() => deleteVenueAction(id)} className="font-semibold text-rose-700">Remove</button>
      <button onClick={() => setConfirming(false)} className="text-slate-500">Cancel</button>
    </span>
  );
}
