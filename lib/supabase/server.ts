import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/* Server-side Supabase client. Use in Server Components, Route Handlers,
   and Server Actions. Reads & writes the Supabase auth cookies. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Setting cookies from a Server Component is a no-op; that's fine
            // because the middleware refreshes the session in the response.
          }
        },
      },
    }
  );
}

/* Server-side privileged client. Bypasses RLS. Only use in:
   - Route Handlers we've verified are admin-gated
   - Webhook handlers (Stripe, Checkr, etc.)
   - Background jobs (Inngest)
   NEVER expose to the browser. */
export function createSupabaseServiceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  );
}
