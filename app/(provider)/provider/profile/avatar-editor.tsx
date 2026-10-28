"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, X } from "lucide-react";
import {
  initialTransform, centered, containScale, coverScale, clampOffset,
  zoomAbout, zoomRange, outputRect, hasEmptySpace,
  type Transform, type Size,
} from "@/lib/avatar-crop";

const VIEWPORT = 288;   // CSS px the editor square is drawn at
const OUTPUT = 512;     // px of the square we upload

/* Position a photo inside the avatar circle before it is uploaded.
 *
 * Drag to move, pinch or use the slider to zoom. "Fit whole photo" zooms
 * out far enough that nothing is cropped at all — the specific thing that
 * was impossible before, when a portrait photo lost the top of the head to
 * a centre crop nobody could adjust.
 */
export function AvatarEditor({
  file, onCancel, onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState<Size>({ width: 0, height: 0 });
  const [t, setT] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Load the picked file into an <img> so we know its real dimensions.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const size = { width: image.naturalWidth, height: image.naturalHeight };
      setImg(image);
      setNatural(size);
      setT(initialTransform(size, VIEWPORT));
    };
    image.onerror = () => setError("That file could not be opened as an image.");
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /* ---- dragging, with pointer events so mouse and touch share one path -- */
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 1) drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pinch.current.has(e.pointerId)) return;
    const prev = pinch.current.get(e.pointerId)!;
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two fingers: pinch to zoom about the midpoint between them.
    if (pinch.current.size >= 2) {
      const pts = [...pinch.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const prevPts = [...pinch.current.values()];
      void prevPts;
      const before = Math.hypot(prev.x - pts.find((p) => p !== prev)!.x,
                                prev.y - pts.find((p) => p !== prev)!.y) || dist;
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect || before === 0) return;
      const mid = {
        x: (pts[0].x + pts[1].x) / 2 - rect.left,
        y: (pts[0].y + pts[1].y) / 2 - rect.top,
      };
      setT((cur) => zoomAbout(cur, cur.scale * (dist / before), mid, natural, VIEWPORT));
      drag.current = null;
      return;
    }

    if (!drag.current || drag.current.id !== e.pointerId) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setT((cur) => clampOffset({ ...cur, x: cur.x + dx, y: cur.y + dy }, natural, VIEWPORT));
  };

  const endPointer = (e: React.PointerEvent) => {
    pinch.current.delete(e.pointerId);
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  /* ---- zoom controls --------------------------------------------------- */
  const centre = { x: VIEWPORT / 2, y: VIEWPORT / 2 };
  const nudgeZoom = useCallback((factor: number) => {
    setT((cur) => zoomAbout(cur, cur.scale * factor, centre, natural, VIEWPORT));
  }, [natural]);

  const range = natural.width ? zoomRange(natural, VIEWPORT) : { min: 1, max: 4 };
  const showingWholePhoto = natural.width ? hasEmptySpace(t, natural, VIEWPORT) : false;

  /* ---- export ---------------------------------------------------------- */
  const confirm = async () => {
    if (!img) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Your browser could not prepare the image.");

      // Paint a ground first. Zooming out to show a whole photo leaves bare
      // canvas around it, and bare canvas exports transparent — which turns
      // black on most dark backgrounds.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      ctx.imageSmoothingQuality = "high";

      const r = outputRect(t, natural, VIEWPORT, OUTPUT);
      ctx.drawImage(img, r.x, r.y, r.width, r.height);

      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.92));
      if (!blob) throw new Error("Could not prepare the image.");

      onConfirm(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare the image.");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900">Position your photo</h3>
        <button type="button" onClick={onCancel} aria-label="Cancel"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-rose-700">{error}</p>}

      <div className="flex justify-center">
        <div
          ref={surfaceRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          style={{ width: VIEWPORT, height: VIEWPORT, touchAction: "none" }}
          className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 cursor-grab active:cursor-grabbing select-none"
        >
          {img && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                left: 0, top: 0,
                width: natural.width * t.scale,
                height: natural.height * t.scale,
                transform: `translate(${t.x}px, ${t.y}px)`,
                maxWidth: "none",
              }}
            />
          )}
          {/* The circle the avatar will actually be. Everything outside it
              is dimmed rather than hidden, so you can see what you are
              about to lose instead of discovering it afterwards. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "rgba(15,23,42,0.45)",
              WebkitMaskImage: `radial-gradient(circle at center, transparent ${VIEWPORT / 2 - 1}px, #000 ${VIEWPORT / 2}px)`,
              maskImage: `radial-gradient(circle at center, transparent ${VIEWPORT / 2 - 1}px, #000 ${VIEWPORT / 2}px)`,
            }}
          />
          <div aria-hidden="true"
            className="absolute inset-0 pointer-events-none rounded-full border-2 border-white/80" />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={() => nudgeZoom(1 / 1.25)} aria-label="Zoom out"
          className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600">
          <ZoomOut className="w-4 h-4" aria-hidden="true" />
        </button>
        <input
          type="range"
          aria-label="Zoom"
          min={range.min} max={range.max} step={(range.max - range.min) / 200 || 0.01}
          value={t.scale}
          onChange={(e) => setT((cur) => zoomAbout(cur, Number(e.target.value), centre, natural, VIEWPORT))}
          className="flex-1 accent-brand-600"
        />
        <button type="button" onClick={() => nudgeZoom(1.25)} aria-label="Zoom in"
          className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600">
          <ZoomIn className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button"
          onClick={() => setT(centered(natural, VIEWPORT, containScale(natural, VIEWPORT)))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700">
          <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" /> Fit whole photo
        </button>
        <button type="button"
          onClick={() => setT(centered(natural, VIEWPORT, coverScale(natural, VIEWPORT)))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700">
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Fill the circle
        </button>
      </div>

      <p className="mt-2 text-[11px] text-slate-500 leading-snug">
        {showingWholePhoto
          ? "Your whole photo is inside the circle. The space around it will be white."
          : "Drag to move, pinch or use the slider to zoom. Anything dimmed is outside the circle."}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={confirm} disabled={busy || !img}
          className="px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50">
          {busy ? "Saving…" : "Use this photo"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm font-semibold text-slate-600">
          Cancel
        </button>
      </div>
    </div>
  );
}
