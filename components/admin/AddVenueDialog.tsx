"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Info } from "lucide-react";
import { createVenueAction, type VenueResult } from "@/app/(admin)/admin/venues/actions";

/*
  RECORDING THAT A PLACE EXISTS.

  This creates a venue with every answer UNKNOWN, and says so where the
  person can see it before they press the button. Creating a venue is
  not a claim that anybody has rung them up — and an "allowed" nobody
  earned is the one thing this register exists to prevent, because
  checkVenue() will let a booking through on it and tell the customer
  the venue is fine.

  The duplicate check is the database's: lookup_venue() matches on the
  normalised name and takes the most recently confirmed row, so a
  second "Service Canada" in the same country would silently shadow the
  first. The refusal names the row that already exists.
*/
export function AddVenueDialog({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VenueResult | null>(null);
  const [form, setForm] = useState({
    name: "", address: "", city: "", region: "", country: "CA" as "CA" | "US",
  });

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const outcome = await createVenueAction({
        name: form.name,
        address: form.address || null,
        city: form.city || null,
        region: form.region || null,
        country: form.country,
      });
      setResult(outcome);
      if (outcome.ok) {
        setForm({ name: "", address: "", city: "", region: "", country: form.country });
        router.refresh();
      }
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" disabled={disabled} onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed">
        <Plus className="w-4 h-4" /> Add venue
      </button>
    );
  }

  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 mt-2">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-[14px] font-bold text-slate-900">Add a venue</h2>
        <button type="button" onClick={() => { setOpen(false); setResult(null); }}
          className="ml-auto text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <label className="sm:col-span-2">
          <span className="block text-[12px] font-semibold text-slate-700">
            Name — exactly what a customer would type
          </span>
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Service Canada — Robson Street"
            className="mt-0.5 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px]" />
        </label>
        <label>
          <span className="block text-[12px] font-semibold text-slate-700">Address</span>
          <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            className="mt-0.5 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px]" />
        </label>
        <label>
          <span className="block text-[12px] font-semibold text-slate-700">City</span>
          <input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
            className="mt-0.5 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px]" />
        </label>
        <label>
          <span className="block text-[12px] font-semibold text-slate-700">Region</span>
          <input value={form.region} onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))}
            placeholder="BC"
            className="mt-0.5 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px]" />
        </label>
        <label>
          <span className="block text-[12px] font-semibold text-slate-700">Country</span>
          <select value={form.country}
            onChange={(e) => setForm((p) => ({ ...p, country: e.target.value as "CA" | "US" }))}
            className="mt-0.5 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] bg-white">
            <option value="CA">Canada</option>
            <option value="US">United States</option>
          </select>
        </label>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-slate-600 mt-2">
        <Info className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
        It is recorded with every answer unknown. Requests at this venue still go ahead — the
        customer is told it is unverified and the helper checks with staff on arrival. Record what
        the venue says once somebody has actually asked them.
      </p>

      {result && (
        <p className={`mt-2 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border ${
          result.ok ? "bg-emerald-50 border-emerald-200 text-emerald-900"
            : "bg-rose-50 border-rose-200 text-rose-900"
        }`}>
          {result.ok ? `${result.message} ${result.detail ?? ""}` : result.error}
        </p>
      )}

      <div className="flex items-center gap-2 mt-2">
        <button type="button" onClick={() => { setOpen(false); setResult(null); }}
          className="text-[13px] font-semibold text-slate-600 px-3 py-2">
          Cancel
        </button>
        <button type="button" onClick={() => void submit()}
          disabled={busy || form.name.trim() === ""}
          className="ml-auto inline-flex items-center gap-1.5 bg-brand-600 text-white text-[13px] font-semibold px-3.5 py-2 rounded-xl disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed">
          {busy ? "Recording…" : "Add venue"}
        </button>
      </div>
    </div>
  );
}
