import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/* Handles the Supabase email-confirm OAuth-style callback.
   Supabase appends ?code=... — we exchange it for a session, then redirect. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Route by role
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
