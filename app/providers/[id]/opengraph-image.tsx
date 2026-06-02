import { ImageResponse } from "next/og";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/slug";

export const runtime = "edge";
export const alt = "Verified helper on Helpward";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Per-helper share preview rendered at the edge via Satori. Only the Satori
// display subset is allowed (display: flex|block|contents|none|-webkit-box);
// see [[feedback_nextjs_og_satori_display]] — anything else throws at edge
// time and the image silently 500s without showing up in tsc/build.
export default async function HelperOgImage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;

  // Service-role client because this route is unauthenticated (it's hit by
  // social-media crawlers like Twitterbot/Slackbot without cookies). RLS
  // would 0-row a public read; service-role just reads the public-facing
  // approved profile.
  const supabase = createSupabaseServiceClient();
  const { data: pp } = await supabase
    .from("provider_profiles")
    .select(`
      user_id, status, rating_avg, rating_count, tasks_completed,
      profile:profiles!provider_profiles_user_id_fkey(full_name, avatar_url, country)
    `)
    .eq(isUuid(raw) ? "user_id" : "slug", raw)
    .maybeSingle();

  const prof = pp && pp.status === "approved"
    ? (pp as { profile: { full_name: string; avatar_url: string | null; country: string } | null }).profile
    : null;
  const name = prof?.full_name ?? "Verified helper";
  const rating = (pp as { rating_avg?: number | null } | null)?.rating_avg ?? null;
  const ratingCount = (pp as { rating_count?: number | null } | null)?.rating_count ?? 0;
  const tasksDone = (pp as { tasks_completed?: number | null } | null)?.tasks_completed ?? 0;
  const country = prof?.country === "CA" ? "Canada" : "United States";
  const initial = name[0]?.toUpperCase() ?? "?";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 80,
          background:
            "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #2563eb 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 48 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 13,
              background: "white",
              color: "#4f46e5",
              fontSize: 32,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            H
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>
            Helpward
          </div>
        </div>

        {/* Helper card */}
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          {prof?.avatar_url ? (
            <img
              src={prof.avatar_url}
              width={180}
              height={180}
              style={{
                width: 180,
                height: 180,
                borderRadius: 90,
                objectFit: "cover",
                border: "6px solid white",
              }}
            />
          ) : (
            <div
              style={{
                width: 180,
                height: 180,
                borderRadius: 90,
                background: "rgba(255,255,255,0.15)",
                color: "white",
                fontSize: 88,
                fontWeight: 900,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "6px solid white",
              }}
            >
              {initial}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
            <div
              style={{
                fontSize: 72,
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: -2,
              }}
            >
              {name}
            </div>
            {rating != null && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginTop: 18,
                  fontSize: 32,
                  opacity: 0.95,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#fbbf24", fontSize: 36 }}>★</span>
                  <span style={{ fontWeight: 800 }}>{rating.toFixed(1)}</span>
                  <span style={{ opacity: 0.8 }}>({ratingCount} reviews)</span>
                </div>
                {tasksDone > 0 && (
                  <div style={{ display: "flex", alignItems: "center", opacity: 0.8 }}>
                    · {tasksDone} task{tasksDone === 1 ? "" : "s"} completed
                  </div>
                )}
              </div>
            )}
            <div
              style={{
                marginTop: 14,
                fontSize: 28,
                opacity: 0.85,
              }}
            >
              Verified helper in {country}
            </div>
          </div>
        </div>

        {/* Trust badges */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            gap: 22,
            fontSize: 22,
            opacity: 0.9,
          }}
        >
          <div style={{ display: "flex" }}>✓ ID verified</div>
          <div style={{ display: "flex" }}>·</div>
          <div style={{ display: "flex" }}>✓ Background checked</div>
          <div style={{ display: "flex" }}>·</div>
          <div style={{ display: "flex" }}>✓ Fully insured</div>
        </div>
      </div>
    ),
    size,
  );
}
