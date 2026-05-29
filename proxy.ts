import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = new Set([
  "/", "/login", "/signup", "/forgot-password", "/verify-email",
  "/terms", "/privacy", "/about", "/safety",
]);

// Trailing slashes are intentional: "/services/" matches /services/anything
// but NOT /services exact (that's the auth-gated customer browse).
const PUBLIC_PREFIXES = [
  "/auth/", "/_next/", "/api/public/", "/api/webhooks/",
  "/providers/", "/services/", "/cities/",
];

const CUSTOMER_PREFIXES = [
  "/dashboard", "/services", "/new-request", "/messages",
  "/bookings", "/saved-providers", "/favorites", "/payments",
  "/analytics", "/settings", "/business", "/referrals",
];

const PROVIDER_PREFIXES = ["/provider"];
const ADMIN_PREFIXES = ["/admin"];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Referral-code capture: any request that carries ?ref=CODE on the URL gets
// the code stored in a cookie (30 days). signupAction reads the cookie when
// the new user submits the form, so a friend can land at the homepage, the
// safety page, anywhere — the attribution still happens at signup time.
const REFERRAL_COOKIE = "hw_ref";
const REFERRAL_MAX_AGE_DAYS = 30;

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSupabaseSession(request);
  const { pathname, searchParams } = request.nextUrl;

  const incomingRef = searchParams.get("ref");
  if (incomingRef) {
    // Light validation up-front so we don't store nonsense. Real existence
    // check happens at signup. Cookie is NOT HttpOnly because the /signup
    // client component reads it to show a "$10 credit applied" banner.
    const cleaned = incomingRef.trim().toUpperCase();
    if (/^[A-Z0-9]{4,16}$/.test(cleaned)) {
      response.cookies.set(REFERRAL_COOKIE, cleaned, {
        path: "/",
        maxAge: 60 * 60 * 24 * REFERRAL_MAX_AGE_DAYS,
        sameSite: "lax",
      });
    }
  }

  // Always allow static assets & API routes that opt-in to public
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return response;
  if (PUBLIC_PATHS.has(pathname)) return response;

  const isCustomerArea = startsWithAny(pathname, CUSTOMER_PREFIXES);
  const isProviderArea = startsWithAny(pathname, PROVIDER_PREFIXES);
  const isAdminArea    = startsWithAny(pathname, ADMIN_PREFIXES);

  const needsAuth = isCustomerArea || isProviderArea || isAdminArea;

  if (!needsAuth) return response;

  // Unauthenticated → /login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Role-based routing — read from JWT app_metadata
  const role = (user.app_metadata?.role as string | undefined) ?? "customer";

  if (isAdminArea && role !== "admin") {
    return NextResponse.redirect(new URL(role === "provider" ? "/provider/dashboard" : "/dashboard", request.url));
  }
  if (isProviderArea && role !== "provider" && role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (isCustomerArea && role === "provider") {
    return NextResponse.redirect(new URL("/provider/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /* Run on everything except static assets & images */
    "/((?!_next/static|_next/image|favicon.svg|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
