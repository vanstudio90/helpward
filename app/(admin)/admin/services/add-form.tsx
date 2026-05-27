"use client";

import { useActionState, useState } from "react";
import { Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { createServiceAction } from "./actions";

export function AddServiceForm({ categories }: { categories: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createServiceAction, undefined);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
      >
        <Plus className="w-4 h-4" /> Add new service
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold">Add new service</h2>
        <button onClick={() => setOpen(false)} className="text-xs font-semibold text-slate-500">Cancel</button>
      </div>

      {state?.error && (
        <div className="mb-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5" /> {state.error}
        </div>
      )}
      {state?.success && (
        <div className="mb-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" /> {state.success}
        </div>
      )}

      <form action={formAction} className="grid sm:grid-cols-2 gap-3">
        <label className="block sm:col-span-2">
          <span className="text-xs font-semibold text-slate-700">Title</span>
          <input name="title" required placeholder="e.g. Window Cleaning" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">ID (slug, kebab-case)</span>
          <input name="id" required placeholder="window-cleaning" pattern="[a-z0-9-]+" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Category</span>
          <select name="category_id" required defaultValue="" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
            <option value="" disabled>Pick…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-semibold text-slate-700">Description</span>
          <textarea name="blurb" required rows={2} placeholder="What this service does, who it's for…" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Base price ($)</span>
          <input name="base_price" type="number" step="0.01" required min="0.01" placeholder="29.00" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">ETA label</span>
          <input name="eta_label" placeholder="20 min" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-semibold text-slate-700">Image URL</span>
          <input name="image_url" type="url" placeholder="https://images.unsplash.com/photo-…" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </label>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" name="popular" className="w-4 h-4" />
          <span className="text-sm">Mark as popular</span>
        </label>
        <button type="submit" disabled={pending} className="sm:col-span-2 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
          {pending ? "Saving…" : "Create service"}
        </button>
      </form>
    </div>
  );
}
