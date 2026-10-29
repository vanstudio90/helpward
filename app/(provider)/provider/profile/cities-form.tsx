"use client";

import { useState, useActionState } from "react";
import { MapPin, AlertCircle, CheckCircle2, Globe2 } from "lucide-react";
import { SERVICE_AREAS } from "@/lib/service-areas";
import { setWorkingCitiesAction } from "./actions";

/* Cities a helper accepts work in — changeable at any time.
 *
 * Matching used to be a radius and nothing else, so a helper in Burnaby was
 * offered jobs across five municipalities a 20 km circle happens to touch.
 * This is the control for that, and the server enforces it in
 * find_nearby_providers rather than merely hiding offers here.
 *
 * The empty state is spelled out rather than implied. A helper with no
 * selection is matched exactly as before — anywhere in the area — and that
 * is a real, reachable state for the accounts that predate this, so it says
 * so in words instead of showing an innocuous row of empty checkboxes.
 */
export function CitiesForm({
  areaId,
  selected,
}: { areaId: string | null; selected: string[] }) {
  const [state, formAction, pending] = useActionState(setWorkingCitiesAction, undefined);
  const [area, setArea] = useState(areaId ?? SERVICE_AREAS[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>(selected);

  const current = SERVICE_AREAS.find((a) => a.id === area);
  const municipalities = current?.municipalities ?? [];
  const all = picked.length > 0 && picked.length === municipalities.length;
  const unrestricted = selected.length === 0;

  const toggle = (m: string) =>
    setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 sm:p-5">
      <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
        <MapPin className="w-4 h-4 text-brand-600" aria-hidden="true" />
        Cities you work in
      </h2>
      <p className="text-xs text-slate-500 mt-1">
        You&rsquo;ll only be offered work in the cities you tick. Change this whenever you like —
        it takes effect on the next request.
      </p>

      {unrestricted && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
          <Globe2 className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            You haven&rsquo;t picked any cities yet, so you&rsquo;re currently offered work{" "}
            <strong>anywhere in your service area</strong> that falls inside your radius. Tick the
            ones you actually want and the rest will stop reaching you.
          </span>
        </div>
      )}

      <form action={formAction} className="mt-4 space-y-4">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Region</span>
          <select
            name="area_id"
            value={area}
            onChange={(e) => { setArea(e.target.value); setPicked([]); }}
            className="mt-1 w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {SERVICE_AREAS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>

        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-xs font-semibold text-slate-700">
              Cities {picked.length > 0 && (
                <span className="font-normal text-slate-500">
                  · {picked.length} of {municipalities.length}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setPicked(all ? [] : [...municipalities])}
              className="text-xs font-semibold text-brand-700 hover:text-brand-800 shrink-0"
            >
              {all ? "Clear all" : "Select all"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {municipalities.map((m) => {
              const on = picked.includes(m);
              return (
                <label
                  key={m}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                    on
                      ? "border-brand-300 bg-brand-50/70 text-slate-900"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="city"
                    value={m}
                    checked={on}
                    onChange={() => toggle(m)}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-200 shrink-0"
                  />
                  <span className="min-w-0 truncate">{m}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || picked.length === 0}
            className="px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save cities"}
          </button>
          {picked.length === 0 && (
            <span className="text-xs text-slate-500">Tick at least one city.</span>
          )}
        </div>

        {/* Beside the button, where the person is looking when they press it. */}
        {(state?.error || state?.success) && (
          <p role="status" aria-live="polite"
            className={`flex items-start gap-1.5 text-xs rounded-lg px-2.5 py-2 border ${
              state.error
                ? "text-rose-700 bg-rose-50 border-rose-100"
                : "text-emerald-800 bg-emerald-50 border-emerald-100"
            }`}>
            {state.error
              ? <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
              : <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />}
            <span className="min-w-0">{state.error ?? state.success}</span>
          </p>
        )}
      </form>
    </div>
  );
}
