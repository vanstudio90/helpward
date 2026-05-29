"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  uploadCompletionPhotoAction,
  deleteCompletionPhotoAction,
  MAX_COMPLETION_PHOTOS,
} from "./photo-actions";

export type CompletionPhoto = {
  id: string;
  previewUrl: string | null; // pre-signed by the server for the helper's own gallery
  caption: string | null;
};

// Photo proof uploader shown to the helper while the booking is in_progress.
// Optional but heavily encouraged in the UI — completed tasks with proof
// have a much lower dispute rate so the "Mark complete" CTA gets a softer
// styling until at least one photo is attached.
export function CompletionPhotos({
  bookingId,
  initial,
}: {
  bookingId: string;
  initial: CompletionPhoto[];
}) {
  const [photos, setPhotos] = useState<CompletionPhoto[]>(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const atCap = photos.length >= MAX_COMPLETION_PHOTOS;

  const onPick = (file: File) => {
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    if (caption.trim()) fd.append("caption", caption.trim());

    // Optimistic placeholder so the helper sees the photo appear instantly
    const localUrl = URL.createObjectURL(file);
    const tempId = `tmp-${Date.now()}`;
    setPhotos((p) => [...p, { id: tempId, previewUrl: localUrl, caption: caption.trim() || null }]);
    setCaption("");

    start(async () => {
      const r = await uploadCompletionPhotoAction(bookingId, fd);
      if (r?.error) {
        setPhotos((p) => p.filter((x) => x.id !== tempId));
        URL.revokeObjectURL(localUrl);
        setErr(r.error);
        return;
      }
      // Swap the temp id for the real one so subsequent deletes work
      if (r?.photoId) {
        setPhotos((p) => p.map((x) => (x.id === tempId ? { ...x, id: r.photoId! } : x)));
      }
    });
  };

  const onDelete = (photoId: string) => {
    const prev = photos;
    setPhotos((p) => p.filter((x) => x.id !== photoId));
    setErr(null);
    start(async () => {
      const r = await deleteCompletionPhotoAction(photoId);
      if (r?.error) {
        setPhotos(prev);
        setErr(r.error);
      }
    });
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
          <Camera className="w-4 h-4 text-brand-600" /> Proof photos
        </h3>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {photos.length} / {MAX_COMPLETION_PHOTOS}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-3 leading-snug">
        Snap one or two quick photos to show the task is done — the doorstep with the bag, the
        receipt, etc. Customers with photo proof open ~80% fewer disputes.
      </p>

      {err && (
        <div className="mb-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 group">
              {p.previewUrl ? (
                <img src={p.previewUrl} alt={p.caption ?? "Proof"} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              )}
              <button
                type="button"
                onClick={() => onDelete(p.id)}
                disabled={pending}
                aria-label="Remove photo"
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="w-3 h-3" />
              </button>
              {p.caption && (
                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1.5 py-1 leading-tight line-clamp-2">
                  {p.caption}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!atCap && (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Optional caption — e.g. 'left at the side door'"
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 140))}
            disabled={pending}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs disabled:opacity-50"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className={cn(
              "w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed text-sm font-semibold",
              pending
                ? "border-slate-200 text-slate-400 bg-slate-50"
                : "border-brand-200 text-brand-700 hover:bg-brand-50",
            )}
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {pending ? "Uploading…" : photos.length === 0 ? "Take or upload first photo" : "Add another"}
          </button>
        </div>
      )}

      {atCap && (
        <div className="text-xs text-slate-500 italic">
          Max {MAX_COMPLETION_PHOTOS} photos reached. Remove one to add another.
        </div>
      )}
    </div>
  );
}
