import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = new Set([
  "/", "/login", "/signup", "/forgot-password", "/verify-email",
  "/terms", "/privacy", "/about", "/safety", "/providers",
]);

const PUBLIC_PREFIXES = ["/auth/", "/_next/", "/api/public/"];

const CUSTOMER_PREFIXES = [
  "/dashboard", "/services", "/new-request", "/messages",
  "/bookings", "/saved-providers", "/favorites", "/payments",
  "/analytics", "/settings", "/business",
];

const PROVIDER_PREFIXES = ["/provider"];
const ADMIN_PREFIXES = ["/admin"];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSupabaseSession(request);
  const { pathname } = request.nextUrl;

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
