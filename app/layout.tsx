import "./globals.css";
import type { Metadata } from "next";

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
  icons: { icon: "/favicon.svg" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
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
    url: "https://helpward.com/favicon.svg",
    width: 512,
    height: 512,
  },
  description:
    "Helpward is the Human Infrastructure Network — an on-demand marketplace of verified, background-checked humans for rides, errands, home help, deliveries, and almost any real-world task in the U.S. and Canada.",
  areaServed: ["US", "CA"],
  knowsAbout: [
    "On-demand local help",
    "Errand running",
    "Designated driver services",
    "Furniture assembly",
    "Grocery delivery",
    "Senior check-ins",
    "Background-checked helpers",
  ],
  sameAs: [
    "https://helpward.com/about",
    "https://helpward.com/safety",
  ],
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_LD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_LD) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
