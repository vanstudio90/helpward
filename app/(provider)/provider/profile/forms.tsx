"use client";

import { useActionState, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Edit3 } from "lucide-react";
import { updateProviderProfileAction, setProviderServicesAction } from "./actions";
import { cn } from "@/lib/cn";

export function ProfileForm({
  initial,
}: { initial: { bio: string; service_radius_km: number; languages: string } }) {
  const [state, formAction, pending] = useActionState(updateProviderProfileAction, undefined);

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <h2 className="text-base font-bold text-slate-900 mb-3">Public profile</h2>

      {state?.error && (
        <div className="mb-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {state.error}
        </div>
      )}
      {state?.success && (
        <div className="mb-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {state.success}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">About you</span>
          <textarea
            name="bio"
            defaultValue={initial.bio}
            rows={4}
            placeholder="Brief introduction that shows on your public profile (specialties, years of experience, what makes you reliable)..."
            className="mt-1 w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Service radius (km)</span>
            <input
              name="service_radius_km"
              type="number"
              min={1}
              max={200}
              defaultValue={initial.service_radius_km}
              required
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <p className="text-[11px] text-slate-500 mt-1">How far you&apos;ll travel from your base location.</p>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Languages</span>
            <input
              name="languages"
              defaultValue={initial.languages}
              placeholder="English, Spanish, French"
              className="mt-1 w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <p className="text-[11px] text-slate-500 mt-1">Comma-separated.</p>
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 text-xs font-semibold text-brand-700 border border-brand-200 px-3 py-2 rounded-lg disabled:opacity-50"
        >
          <Edit3 className="w-3 h-3" /> {pending ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}

export function ServicesForm({
  allServices, initialSelected,
}: {
  allServices: { id: string; title: string; category: string; blurb: string }[];
  initialSelected: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; err?: string } | null>(null);

  const grouped = allServices.reduce<Record<string, typeof allServices>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  const save = () => {
    setMsg(null);
    start(async () => {
      const r = await setProviderServicesAction(Array.from(selected));
      if (r?.error) setMsg({ err: r.error });
      else setMsg({ ok: r?.success ?? "Saved." });
    });
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-bold text-slate-900">Services you offer</h2>
        <span className="text-[11px] text-slate-500">{selected.size} selected</span>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        You&apos;ll only get task offers for services you check here.
      </p>

      {msg?.err && <div className="mb-3 text-xs text-rose-700 bg-rose-50 rounded-lg p-2.5">{msg.err}</div>}
      {msg?.ok && <div className="mb-3 text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2.5">{msg.ok}</div>}

      <div className="space-y-4">
        {Object.entries(grouped).map(([cat, list]) => (
          <div key={cat}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">{cat}</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {list.map((s) => {
                const isOn = selected.has(s.id);
                return (
                  <label
                    key={s.id}
                    className={cn(
                      "flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition",
                      isOn ? "border-brand-300 bg-brand-50/40" : "border-slate-100 hover:border-slate-300"
                    )}
                  >
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
                      <div className="text-sm font-semibold text-slate-900">{s.title}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-2">{s.blurb}</div>
                    </div>
                  </label>
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
        className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white bg-brand-600 px-4 py-2.5 rounded-xl disabled:opacity-50"
      >
        {pending ? "Saving…" : `Save ${selected.size} service${selected.size === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
