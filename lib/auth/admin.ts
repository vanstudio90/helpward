import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAdmin(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (user.app_metadata?.role as string | undefined) !== "admin") {
    throw new Error("Forbidden");
  }
  return user.id;
}
