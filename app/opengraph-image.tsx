import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Helpward — Real humans. Real help. Right now.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background:
            "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #2563eb 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "white",
              color: "#4f46e5",
              fontSize: 44,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            H
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>
            Helpward
          </div>
        </div>
        <div
          style={{
            fontSize: 76,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: 1000,
          }}
        >
          Real humans. Real help. Right now.
        </div>
        <div
          style={{
            fontSize: 32,
            marginTop: 30,
            opacity: 0.9,
            maxWidth: 900,
            lineHeight: 1.3,
          }}
        >
          On-demand verified humans for driving, errands, home help, deliveries
          — anything you need in the real world.
        </div>
        <div
          style={{
            marginTop: 50,
            display: "flex",
            gap: 24,
            fontSize: 22,
            opacity: 0.9,
          }}
        >
          <div>★ Background-checked</div>
          <div>· Fully insured</div>
          <div>· Pay after completion</div>
        </div>
      </div>
    ),
    size
  );
}
