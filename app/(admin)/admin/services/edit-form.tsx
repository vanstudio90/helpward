"use client";

import { useActionState, useState } from "react";
import { Pencil, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { updateServiceAction } from "./actions";

type ServiceRow = {
  id: string;
  title: string;
  blurb: string;
  base_price_cents: number;
  eta_label: string | null;
  image_url: string | null;
  popular?: boolean;
  category_id: string;
};

export function EditServiceTrigger({ service }: { service: ServiceRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Edit service"
        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      {open && <EditServiceModal service={service} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditServiceModal({ service, onClose }: { service: ServiceRow; onClose: () => void }) {
  const update = updateServiceAction.bind(null, service.id);
  const [state, formAction, pending] = useActionState(update, undefined);
  // Close on success after a beat so the user sees the success flash.
  if (state?.success) {
    setTimeout(onClose, 800);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between">
          <div>
            <div className="text-base font-bold text-slate-900">Edit service</div>
            <div className="text-[11px] text-slate-500 font-mono">{service.id}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form action={formAction} className="p-5 space-y-3">
          {state?.error && (
            <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {state.error}
            </div>
          )}
          {state?.success && (
            <div className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {state.success}
            </div>
          )}

          <Field label="Title">
            <input
              name="title"
              required
              maxLength={80}
              defaultValue={service.title}
              className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
            />
          </Field>

          <Field label="Blurb" hint="Up to 400 characters.">
            <textarea
              name="blurb"
              required
              maxLength={400}
              rows={3}
              defaultValue={service.blurb}
              className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Base price" hint="In USD dollars.">
              <input
                name="base_price"
                type="number"
                step="0.01"
                min="0.01"
                required
                defaultValue={(service.base_price_cents / 100).toFixed(2)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
              />
            </Field>
            <Field label="ETA label" hint='e.g. "20-40 min".'>
              <input
                name="eta_label"
                maxLength={40}
                defaultValue={service.eta_label ?? ""}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
              />
            </Field>
          </div>

          <Field label="Image URL" hint="Must be https://. Used everywhere this service is rendered.">
            <input
              name="image_url"
              type="url"
              maxLength={500}
              defaultValue={service.image_url ?? ""}
              placeholder="https://images.unsplash.com/..."
              className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="popular" defaultChecked={service.popular ?? false} className="rounded text-brand-600" />
            Flag as Popular (shows the Popular badge on cards)
          </label>

          <div className="pt-3 flex items-center gap-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>

          <p className="text-[11px] text-slate-400 pt-1">
            Slug and category are immutable — changing them would break SEO URLs at /services/{service.id} and the 10 /cities/&lt;city&gt;/{service.id} pages.
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      {hint && <span className="ml-1.5 text-[10px] text-slate-400">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
