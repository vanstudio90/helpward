import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
  THE MAP IMAGE, FETCHED BY US RATHER THAN BY THE BROWSER.

  Mapbox's static endpoint wants the token in the URL. Putting it in an
  <img src> would publish it in the page source of every admin screen —
  and screenshots of this console get pasted into chats. So the browser
  asks us, and we ask Mapbox.

  It also means the console degrades honestly: no token configured gives
  a 503 with a reason, and the map component draws a plain grid and says
  the imagery is unavailable rather than showing an empty box.
*/

export const dynamic = "force-dynamic";

const STYLE = "mapbox/light-v11";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "MAPBOX_TOKEN is not set, so map imagery is unavailable." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const lng = Number(url.searchParams.get("lng"));
  const lat = Number(url.searchParams.get("lat"));
  const zoom = Number(url.searchParams.get("zoom"));
  const width = Math.min(1280, Math.max(120, Number(url.searchParams.get("w")) || 640));
  const height = Math.min(1280, Math.max(120, Number(url.searchParams.get("h")) || 360));

  // Bounds checked rather than trusted: these go into a URL we sign with
  // our own token, and Mapbox bills per request.
  if (!Number.isFinite(lng) || Math.abs(lng) > 180
    || !Number.isFinite(lat) || Math.abs(lat) > 85
    || !Number.isFinite(zoom) || zoom < 1 || zoom > 20) {
    return NextResponse.json({ error: "Bad map coordinates." }, { status: 400 });
  }

  const target = `https://api.mapbox.com/styles/v1/${STYLE}/static/`
    + `${lng.toFixed(5)},${lat.toFixed(5)},${zoom.toFixed(2)},0/`
    + `${width}x${height}@2x?access_token=${token}&logo=false&attribution=false`;

  const upstream = await fetch(target, { cache: "no-store" });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Mapbox returned ${upstream.status}.` },
      { status: 502 },
    );
  }

  return new NextResponse(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "image/png",
      // The imagery for a fixed view does not change minute to minute;
      // the PINS are what move, and they are drawn over it.
      "cache-control": "private, max-age=600",
    },
  });
}
