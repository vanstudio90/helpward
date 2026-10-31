import "./globals.css";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ScrollReset } from "@/components/scroll-reset";
import { NavProgress } from "@/components/nav-progress";

export const metadata: Metadata = {
  title: "Helpward — Real humans. Real help. Right now.",
  description:
    "The Human Infrastructure Network. On-demand verified humans for driving, errands, home help, deliveries, and anything you need in the real world.",
  metadataBase: new URL("https://helpward.com"),
  openGraph: {
    title: "Helpward — Real humans. Real help. Right now.",
    description:
      "On-demand verified humans for anything you need in the real world.",
    url: "https://helpward.com",
    siteName: "Helpward",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Helpward — Real humans. Real help. Right now.",
    description:
      "On-demand verified humans for anything you need in the real world.",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4f46e5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  colorScheme: "light dark",
};

// Sitewide JSON-LD: Organization + WebSite. Helps Google's Knowledge Graph
// associate the brand with its name/logo/social profiles and gives AI engines
// a single canonical entity definition.
const ORG_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://helpward.com/#organization",
  name: "Helpward",
  alternateName: "Helpward — The Human Infrastructure Network",
  url: "https://helpward.com",
  logo: {
    "@type": "ImageObject",
    url: "https://helpward.com/logo-512.png",
    width: 512,
    height: 512,
  },
  description:
    "Helpward is an on-demand marketplace of approved local helpers for cleaning, moving help, errands, deliveries and returns in San Diego and Vancouver's Lower Mainland.",
  areaServed: ["US", "CA"],
  /*
    These must name services we actually sell. Two of them — designated
    driver and senior check-ins — stayed here after the catalogue was cut
    to the app's launch set, which told search engines we offer things
    that 404. Keep this list in step with the active catalogue.
  */
  knowsAbout: [
    "On-demand local help",
    "House cleaning",
    "Moving help",
    "Errand running",
    "Furniture assembly",
    "Grocery collection",
    "Local parcel delivery and returns",
    "Approved local helpers",
  ],
  // No sameAs. It is for a genuine identity profile on another service,
  // and pointing it at our own /about and /safety asserted nothing while
  // looking like it did.
};

const WEBSITE_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://helpward.com/#website",
  name: "Helpward",
  url: "https://helpward.com",
  publisher: { "@id": "https://helpward.com/#organization" },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://helpward.com/services?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
};

/* Typography.
 *
 * The brief asked for a specific competitor's typeface. That one is
 * proprietary and licensed to them, so this is an openly-licensed
 * geometric sans chosen for the same qualities: generous round counters, a
 * tall x-height that stays readable at 13px in a dense UI, and heavy
 * weights that carry a headline without shouting.
 *
 * Loaded through next/font so it is self-hosted, preloaded and carries no
 * layout shift — a webfont that arrives late reflows the whole page, which
 * is the opposite of feeling solid.
 */
const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <head>
        {/* Preconnect to image CDNs we hit on every page — saves ~100-200ms
            of DNS + TLS on the LCP image, hands down the cheapest CWV win. */}
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="" />
        <link rel="preconnect" href="https://i.pravatar.cc" crossOrigin="" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://i.pravatar.cc" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_LD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_LD) }}
        />
      </head>
      <body>
        <ScrollReset />
        <NavProgress />
        {children}
      </body>
    </html>
  );
}
