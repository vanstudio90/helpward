"use client";

import { useState, useTransition } from "react";
import { MapPin, Star, Trash2, Plus, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  createSavedAddressAction,
  deleteSavedAddressAction,
  setDefaultSavedAddressAction,
} from "./actions";
import { LABEL_SUGGESTIONS, MAX_LABEL_LEN, MAX_FORMATTED_LEN } from "@/lib/saved-addresses-pure";

export type SavedAddress = {
  id: string;
  label: string;
  formatted: string;
  is_default: boolean;
};

export function SavedAddressesManager({ initial }: { initial: SavedAddress[] }) {
  const [addresses, setAddresses] = useState(initial);
  const [adding, setAdding] = useState(initial.length === 0);
  const [label, setLabel] = useState("");
  const [formatted, setFormatted] = useState("");
  const [makeDefault, setMakeDefault] = useState(initial.length === 0);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetForm = () => {
    setLabel("");
    setFormatted("");
    setMakeDefault(false);
    setErr(null);
  };

  const onAdd = () => {
    setErr(null);
    setSuccess(null);
    const fd = new FormData();
    fd.append("label", label);
    fd.append("formatted", formatted);
    if (makeDefault) fd.append("make_default", "1");
    start(async () => {
      const r = await createSavedAddressAction(fd);
      if (r?.error) { setErr(r.error); return; }
      // Optimistic prepend with a temp id; the next router-revalidation
      // round-trip will replace it with the real list, but for now the
      // user sees their address immediately.
      setAddresses((prev) => {
        const next = makeDefault ? prev.map((a) => ({ ...a, is_default: false })) : prev;
        return [
          { id: `tmp-${Date.now()}`, label: label.trim(), formatted: formatted.trim(), is_default: makeDefault },
          ...next,
        ];
      });
      resetForm();
      setAdding(false);
      setSuccess(r?.success ?? "Saved.");
    });
  };

  const onDelete = (id: string) => {
    setErr(null); setSuccess(null);
    const prev = addresses;
    setAddresses((p) => p.filter((a) => a.id !== id));
    start(async () => {
      const r = await deleteSavedAddressAction(id);
      if (r?.error) { setAddresses(prev); setErr(r.error); }
      else setSuccess("Removed.");
    });
  };

  const onSetDefault = (id: string) => {
    setErr(null); setSuccess(null);
    const prev = addresses;
    setAddresses((p) => p.map((a) => ({ ...a, is_default: a.id === id })));
    start(async () => {
      const r = await setDefaultSavedAddressAction(id);
      if (r?.error) { setAddresses(prev); setErr(r.error); }
      else setSuccess("Default updated.");
    });
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
          <MapPin className="w-4 h-4 text-brand-600" /> Saved addresses
        </h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-200 px-2.5 py-1.5 rounded-lg"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-3 leading-snug">
        Stash the places you book to often — they appear as one-tap chips on every new request.
      </p>

      {err && (
        <div className="mb-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {err}
        </div>
      )}
      {success && !err && (
        <div className="mb-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {success}
        </div>
      )}

      {addresses.length > 0 && (
        <ul className="space-y-2 mb-3">
          {addresses.map((a) => (
            <li
              key={a.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border",
                a.is_default ? "border-brand-200 bg-brand-50/40" : "border-slate-100 bg-white",
              )}
            >
              <span className={cn(
                "w-9 h-9 rounded-lg inline-flex items-center justify-center shrink-0",
                a.is_default ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500",
              )}>
                <MapPin className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
                  {a.label}
                  {a.is_default && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-brand-700 bg-brand-100 px-1.5 py-0.5 rounded">
                      <Star className="w-2.5 h-2.5 fill-current" /> Default
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 truncate">{a.formatted}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!a.is_default && (
                  <button
                    type="button"
                    onClick={() => onSetDefault(a.id)}
                    disabled={pending}
                    title="Set as default"
                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-amber-600 disabled:opacity-50"
                  >
                    <Star className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(a.id)}
                  disabled={pending}
                  title="Remove"
                  className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="rounded-xl bg-slate-50 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-slate-700">Add a new address</div>
            {addresses.length > 0 && (
              <button
                type="button"
                onClick={() => { setAdding(false); resetForm(); }}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close add form"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600">Label</span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value.slice(0, MAX_LABEL_LEN))}
                placeholder="Home, Work, Mom's…"
                disabled={pending}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white disabled:opacity-50"
              />
            </label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {LABEL_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setLabel(s)}
                  disabled={pending}
                  className="text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 px-2 py-1 rounded-full hover:bg-slate-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">Address</span>
            <input
              type="text"
              value={formatted}
              onChange={(e) => setFormatted(e.target.value.slice(0, MAX_FORMATTED_LEN))}
              placeholder="123 Main St, Vancouver, BC"
              disabled={pending}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white disabled:opacity-50"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(e) => setMakeDefault(e.target.checked)}
              disabled={pending}
              className="rounded"
            />
            Use as the default for new requests
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onAdd}
              disabled={pending || !label.trim() || !formatted.trim()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {pending ? "Saving…" : "Save address"}
            </button>
            {addresses.length > 0 && (
              <button
                type="button"
                onClick={() => { setAdding(false); resetForm(); }}
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {!adding && addresses.length === 0 && (
        <div className="rounded-xl bg-slate-50 p-4 text-center">
          <p className="text-xs text-slate-500">No saved addresses yet. Add one to speed up future bookings.</p>
        </div>
      )}
    </div>
  );
}
