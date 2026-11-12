import { getCurrentUser } from "@/lib/auth/current-user";

/*
  The same check as before, reading the request's single verified user
  instead of asking the auth service again. The claim still comes from
  app_metadata on a token the auth server validated, and every database
  function this guards checks is_admin() for itself.
*/
export async function requireAdmin(): Promise<string> {
  const user = await getCurrentUser();
  if (!user || (user.app_metadata?.role as string | undefined) !== "admin") {
    throw new Error("Forbidden");
  }
  return user.id;
}
