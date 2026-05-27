import { createBrowserClient } from "@supabase/ssr";

/* Browser-side Supabase client. Use in 'use client' components and
   Realtime subscriptions. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
