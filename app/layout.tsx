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
  icons: { icon: "/favicon.svg" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
