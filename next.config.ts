import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type errors FAIL the build.
  //
  // This was `ignoreBuildErrors: true`, which is why 36 diagnostics could
  // sit in the tree indefinitely while every build passed — and why an
  // independent retest kept having to point out that a green build said
  // nothing about them. They are all fixed; this keeps them fixed, and
  // makes `npm run build` mean what everyone reasonably assumes it means.
  typescript: { ignoreBuildErrors: false },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.pravatar.cc" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "source.unsplash.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(self), payment=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
