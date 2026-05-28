import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpward.com";

const PRIVATE_PATHS = [
  "/api/",
  "/admin/",
  "/auth/",
  "/dashboard",
  "/messages",
  "/bookings",
  "/saved-providers",
  "/favorites",
  "/payments",
  "/analytics",
  "/settings",
  "/business",
  "/new-request",
  "/provider/",
];

// AI/generative-engine crawlers we explicitly invite. Same allowlist applies
// — they can read public marketing/legal/services pages, not auth-gated app
// routes. Naming them individually beats relying on the * fallback because
// some operators only honour their own UA rule.
const AI_AGENTS = [
  "GPTBot",            // OpenAI ChatGPT browsing
  "OAI-SearchBot",     // OpenAI SearchGPT
  "ChatGPT-User",      // OpenAI user-triggered browsing
  "ClaudeBot",         // Anthropic Claude
  "Claude-Web",        // Anthropic Claude (legacy)
  "PerplexityBot",     // Perplexity.ai
  "Perplexity-User",   // Perplexity user-triggered
  "Google-Extended",   // Google Gemini / AI Overviews opt-in
  "GoogleOther",       // Google product crawlers
  "Bingbot",           // Microsoft Bing + Copilot
  "Applebot-Extended", // Apple Intelligence
  "CCBot",             // Common Crawl (training data many LLMs use)
  "Amazonbot",         // Amazon AI
  "Meta-ExternalAgent", // Meta AI
  "Bytespider",        // ByteDance Doubao
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
      ...AI_AGENTS.map((ua) => ({ userAgent: ua, allow: "/", disallow: PRIVATE_PATHS })),
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
