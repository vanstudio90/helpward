"use client";

import { useState, useTransition } from "react";
import { Star, EyeOff, Loader2, AlertCircle, CheckCircle2, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { setPortfolioPhotoAction } from "./actions";

export type PortfolioPhoto = {
  id: string;
  signedUrl: string;
  caption: string | null;
  portfolioCaption: string | null;
  isPortfolio: boolean;
  bookingId: string;
  serviceTitle: string;
  completedAt: string;
};

// Helper-facing portfolio admin grid. Each completed-booking photo is a tile
// with a "Show on profile" toggle; tiles already public have the toggle in
// rose-amber and surface an inline caption editor so the helper can polish
// the customer-facing copy ("left at side door") into portfolio copy
// ("front-yard mulch refresh, 2 hrs"). Optimistic UX on the toggle.
export function PortfolioGrid({ initial }: { initial: PortfolioPhoto[] }) {
  const [photos, setPhotos] = useState(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftCaption, setDraftCaption] = useState("");

  const featuredCount = photos.filter((p) => p.isPortfolio).length;

  const toggle = (p: PortfolioPhoto) => {
    setErr(null);
    const prev = photos;
    const next = !p.isPortfolio;
    setPhotos((arr) => arr.map((x) => x.id === p.id ? { ...x, isPortfolio: next } : x));
    start(async () => {
      const r = await setPortfolioPhotoAction(p.id, { isPortfolio: next });
      if (r?.error) { setPhotos(prev); setErr(r.error); }
    });
  };

  const saveCaption = (id: string) => {
    setErr(null);
    const prev = photos;
    const cleaned = draftCaption.trim().slice(0, 200);
    setPhotos((arr) => arr.map((x) => x.id === id ? { ...x, portfolioCaption: cleaned || null } : x));
    setEditingId(null);
    start(async () => {
      const r = await setPortfolioPhotoAction(id, { caption: cleaned });
      if (r?.error) { setPhotos(prev); setErr(r.error); }
    });
  };

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 p-8 text-center">
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          No completed-task photos yet. After you wrap a booking and snap a proof photo, it shows up here ready
          to feature on your public profile.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 text-xs">
        <div className="text-slate-500">
          <span className="font-bold text-slate-900 tabular-nums">{featuredCount}</span> of {photos.length} photos featured
        </div>
        {err && (
          <div className="text-rose-700 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {err}
          </div>
        )}
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {photos.map((p) => {
          const editing = editingId === p.id;
          return (
            <li
              key={p.id}
              className={cn(
                "rounded-2xl overflow-hidden border bg-white",
                p.isPortfolio ? "border-amber-200 ring-2 ring-amber-100" : "border-slate-100",
              )}
            >
              <div className="relative aspect-square bg-slate-100">
                <img src={p.signedUrl} alt={p.portfolioCaption ?? p.caption ?? "Completed task"} className="w-full h-full object-cover" />
                {p.isPortfolio && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-900 bg-amber-100 px-2 py-1 rounded-full">
                    <Star className="w-2.5 h-2.5 fill-current" /> Featured
                  </span>
                )}
              </div>
              <div className="p-3 space-y-2">
                <div>
                  <div className="text-xs font-bold text-slate-900 truncate" title={p.serviceTitle}>{p.serviceTitle}</div>
                  <div className="text-[10px] text-slate-500">
                    {new Date(p.completedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                  </div>
                </div>

                {!editing ? (
                  <div className="flex items-start gap-1.5">
                    <p className={cn(
                      "text-[11px] flex-1 min-w-0 leading-snug",
                      p.portfolioCaption ? "text-slate-700" : "text-slate-400 italic",
                    )}>
                      {p.portfolioCaption ?? "No portfolio caption yet"}
                    </p>
                    <button
                      type="button"
                      onClick={() => { setEditingId(p.id); setDraftCaption(p.portfolioCaption ?? ""); }}
                      className="p-1 text-slate-400 hover:text-brand-700 shrink-0"
                      aria-label="Edit caption"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <textarea
                      value={draftCaption}
                      onChange={(e) => setDraftCaption(e.target.value.slice(0, 200))}
                      autoFocus
                      rows={2}
                      placeholder="Short portfolio caption — what you did, e.g. 'mulched and edged 200 sqft'"
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-[11px]"
                    />
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>{draftCaption.length}/200</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1 text-slate-500 hover:bg-slate-100 rounded"
                          aria-label="Cancel"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => saveCaption(p.id)}
                          disabled={pending}
                          className="p-1 text-emerald-700 hover:bg-emerald-50 rounded disabled:opacity-50"
                          aria-label="Save caption"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => toggle(p)}
                  disabled={pending}
                  className={cn(
                    "w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-bold border transition disabled:opacity-50",
                    p.isPortfolio
                      ? "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100",
                  )}
                >
                  {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : p.isPortfolio ? <EyeOff className="w-3 h-3" /> : <Star className="w-3 h-3" />}
                  {p.isPortfolio ? "Hide from profile" : "Feature on profile"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-slate-500 mt-4 leading-snug inline-flex items-start gap-1.5">
        <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-emerald-600" />
        Customers can remove individual photos from your portfolio at any time from their booking page.
        We auto-hide your portfolio if your account is paused or removed.
      </p>
    </div>
  );
}
