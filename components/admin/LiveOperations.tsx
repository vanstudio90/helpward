"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, AlertTriangle, MapPin, Wifi, WifiOff } from "lucide-react";
import type { LiveOperations as Live, LiveHelper } from "@/lib/data/admin-overview";

/*
  WHERE EVERY HELPER IS, AND WHAT THEY ARE DOING.

  The old "live map" in this estate was a hand-drawn SVG of imaginary
  streets with one marker pinned to the middle of it, and a comment
  admitting it could not decode the coordinate it was given. It looked
  like a map and knew nothing. This one puts real pins on real
  geography, and every pin is a row from the database with a timestamp.

  THE PROJECTION IS THE WHOLE TRICK. The backdrop is a Mapbox static
  image for a known centre and zoom; Web Mercator is a closed-form
  formula, so the same centre and zoom turn a lat/lng into a pixel
  offset exactly. No map library, no tiles to manage, and the pins
  cannot drift away from the streets under them.

  A STALE PIN IS NOT A LIE IF IT SAYS SO. Helpers stop reporting — dead
  battery, basement, permission revoked — and their last known point is
  still the most useful thing to show, so it stays on the map greyed out
  with its age. What must never happen is a stale point drawn as though
  it were current.
*/

const TILE = 512;

function project(lat: number, lng: number, zoom: number) {
  const scale = TILE * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * scale;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

type Pin =
  | { kind: "helper"; lat: number; lng: number; helper: LiveHelper }
  | { kind: "job"; lat: number; lng: number; label: string; detail: string; href: string }
  | { kind: "waiting"; lat: number; lng: number; label: string; detail: string; href: string };

const STATE_STYLE: Record<LiveHelper["state"], { ring: string; dot: string; label: string }> = {
  on_job:   { ring: "ring-brand-200", dot: "bg-brand-600",   label: "On a job" },
  assigned: { ring: "ring-sky-200",   dot: "bg-sky-500",     label: "Assigned" },
  waiting:  { ring: "ring-emerald-200", dot: "bg-emerald-500", label: "Waiting for work" },
  stale:    { ring: "ring-slate-200", dot: "bg-slate-400",   label: "Not reporting" },
};

export function LiveOperations({
  initial,
  includeReview,
  error,
}: {
  initial: Live | null;
  includeReview: boolean;
  error?: string;
}) {
  const [live, setLive] = useState<Live | null>(initial);
  const [failed, setFailed] = useState<string | null>(error ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 360 });
  const [measured, setMeasured] = useState(false);

  /* Poll. The snapshot around it refreshes far more slowly, so this is
     the only thing on the page that moves by itself. */
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/live-operations${includeReview ? "?review=1" : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setFailed((await res.json().catch(() => ({}))).error ?? `Refresh failed (${res.status}).`);
        return;
      }
      setLive(await res.json());
      setFailed(null);
    } catch {
      // Keep whatever is on screen; say it is not moving.
      setFailed("Lost contact with the server — the map below is the last known state.");
    }
  }, [includeReview]);

  useEffect(() => {
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, [poll]);

  /*
    MEASURE BEFORE ASKING FOR A MAP.

    `size` started at 640×360, so the image rendered at that guess, the
    observer then measured the real container, and a SECOND basemap was
    fetched through the proxy for every load of this page. `measured`
    holds the <img> back for one frame — the guessed map was discarded
    anyway — and the observer is debounced so dragging the window
    resizes once at the end rather than ordering a map per pixel.
  */
  useEffect(() => {
    if (!box.current) return;
    const el = box.current;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const measure = () => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      setMeasured(true);
    };
    measure();

    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(measure, 150);
    });
    observer.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  const pins: Pin[] = useMemo(() => {
    if (!live) return [];
    const out: Pin[] = [];
    for (const h of live.helpers) {
      if (typeof h.lat === "number" && typeof h.lng === "number") {
        out.push({ kind: "helper", lat: h.lat, lng: h.lng, helper: h });
      }
    }
    for (const j of live.jobs) {
      if (typeof j.lat === "number" && typeof j.lng === "number") {
        out.push({
          kind: "job", lat: j.lat, lng: j.lng,
          label: j.service_title ?? "Job",
          detail: `${j.status === "in_progress" ? "In progress" : "Scheduled"}${j.helper_name ? ` · ${j.helper_name}` : ""}`,
          href: "/admin/bookings",
        });
      }
    }
    for (const w of live.waiting) {
      if (typeof w.lat === "number" && typeof w.lng === "number") {
        out.push({
          kind: "waiting", lat: w.lat, lng: w.lng,
          label: w.service_title ?? "Request",
          detail: `Waiting · ${w.offers_sent} offer${w.offers_sent === 1 ? "" : "s"} sent`,
          href: "/admin/bookings",
        });
      }
    }
    return out;
  }, [live]);

  /* Centre and zoom that contain everything, with a floor so a single
     pin does not zoom to a rooftop and a ceiling so two cities still
     fit. Vancouver when there is nothing to show — this marketplace's
     only launched region, rather than a point in the Atlantic. */
  const view = useMemo(() => {
    if (pins.length === 0) return { lng: -123.1207, lat: 49.2827, zoom: 11.5 };
    const lats = pins.map((p) => p.lat);
    const lngs = pins.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const lat = (minLat + maxLat) / 2;
    const lng = (minLng + maxLng) / 2;
    const spanLng = Math.max(maxLng - minLng, 0.004);
    const spanLat = Math.max(maxLat - minLat, 0.004);
    const zoomX = Math.log2((360 * (size.w / TILE)) / spanLng);
    const zoomY = Math.log2((180 * (size.h / TILE)) / spanLat);
    const zoom = Math.max(9, Math.min(14.5, Math.min(zoomX, zoomY) - 0.35));
    return { lat, lng, zoom };
  }, [pins, size.w, size.h]);

  const place = useCallback(
    (lat: number, lng: number) => {
      const centre = project(view.lat, view.lng, view.zoom);
      const point = project(lat, lng, view.zoom);
      return { left: size.w / 2 + (point.x - centre.x), top: size.h / 2 + (point.y - centre.y) };
    },
    [view, size.w, size.h],
  );

  const waitingOverFive = live?.waiting.filter((w) => w.age_seconds > 300).length ?? 0;
  const onJob = live?.helpers.filter((h) => h.state === "on_job").length ?? 0;
  const waitingHelpers = live?.helpers.filter((h) => h.state === "waiting").length ?? 0;
  const notReporting = live?.helpers.filter((h) => h.state === "stale").length ?? 0;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
        <h2 className="text-[15px] font-bold text-slate-900">Live operations</h2>
        <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
          {failed ? <WifiOff className="w-3.5 h-3.5 text-amber-500" /> : <Wifi className="w-3.5 h-3.5 text-emerald-500" />}
          {live ? `updated ${new Date(live.as_of).toLocaleTimeString()}` : "no data"}
        </span>
      </header>

      <div ref={box} className="relative h-[300px] bg-slate-100">
        {measured && size.w > 0 && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/admin/map?lng=${view.lng.toFixed(5)}&lat=${view.lat.toFixed(5)}&zoom=${view.zoom.toFixed(2)}&w=${Math.round(size.w)}&h=${Math.round(size.h)}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
          />
        )}

        {pins.map((pin, i) => {
          const { left, top } = place(pin.lat, pin.lng);
          if (left < -40 || top < -40 || left > size.w + 40 || top > size.h + 40) return null;
          const key = `${pin.kind}-${i}`;
          if (pin.kind === "helper") {
            const style = STATE_STYLE[pin.helper.state];
            const active = selected === key;
            return (
              <button
                key={key}
                onClick={() => setSelected(active ? null : key)}
                style={{ left, top }}
                className="absolute -translate-x-1/2 -translate-y-1/2 group"
                aria-label={`${pin.helper.name} — ${style.label}`}
              >
                <span className={`block w-3.5 h-3.5 rounded-full ${style.dot} ring-4 ${style.ring} shadow`} />
                {(active || false) && (
                  <span className="absolute left-1/2 -translate-x-1/2 top-5 z-10 w-52 text-left bg-white rounded-xl border border-slate-200 shadow-lg p-2.5">
                    <span className="block text-[13px] font-semibold text-slate-900">{pin.helper.name}</span>
                    <span className="block text-[11px] text-slate-500">{style.label}</span>
                    {pin.helper.service_title && (
                      <span className="block text-[11px] text-slate-600 mt-1">{pin.helper.service_title}</span>
                    )}
                    <span className="block text-[11px] text-slate-400 mt-1">
                      {pin.helper.location_age_seconds == null
                        ? "never reported a location"
                        : `location ${Math.round(pin.helper.location_age_seconds / 60)} min old`}
                    </span>
                  </span>
                )}
              </button>
            );
          }
          const tone = pin.kind === "job" ? "bg-brand-600" : "bg-amber-500";
          return (
            <Link key={key} href={pin.href} style={{ left, top }}
              className="absolute -translate-x-1/2 -translate-y-full" title={`${pin.label} — ${pin.detail}`}>
              <span className={`flex items-center justify-center w-6 h-6 rounded-full ${tone} text-white shadow ring-2 ring-white`}>
                <MapPin className="w-3.5 h-3.5" />
              </span>
            </Link>
          );
        })}

        {!live && !failed && (
          <div className="absolute inset-0 grid place-items-center text-[13px] text-slate-500">Loading…</div>
        )}
      </div>

      <div className="px-4 py-2.5 flex items-center gap-4 text-[11px] text-slate-600 border-t border-slate-100">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-600" /> {onJob} on a job
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> {waitingHelpers} waiting
        </span>
        {notReporting > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-400" /> {notReporting} not reporting
          </span>
        )}
        <Link href="/admin/bookings" className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800">
          Open dispatch <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {(failed || waitingOverFive > 0) && (
        <div className={`px-4 py-2.5 text-[12px] flex items-start gap-2 border-t ${
          failed ? "bg-slate-50 border-slate-100 text-slate-600" : "bg-amber-50 border-amber-100 text-amber-900"
        }`}>
          <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${failed ? "text-slate-400" : "text-amber-500"}`} />
          <span>
            {failed
              ? failed
              : `${waitingOverFive} request${waitingOverFive === 1 ? "" : "s"} waiting over 5 minutes.`}
          </span>
        </div>
      )}
    </section>
  );
}
