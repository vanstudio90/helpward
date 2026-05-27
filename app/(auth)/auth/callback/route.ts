import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/* Handles the Supabase email-confirm OAuth-style callback.
   Supabase appends ?code=... — we exchange it for a session, then redirect. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  // Only allow same-origin internal paths to prevent ?next=//evil.com open-redirect.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Route by role; if the profile row didn't seed (rare), fall through to next.
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .single();
      const target =
        profile?.role === "provider" ? "/provider/dashboard"
        : profile?.role === "admin"   ? "/admin"
        : next;
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
