"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionState = { error?: string; success?: string } | undefined;

export async function loginAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  // Determine role to send them to the right home
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .single();

  revalidatePath("/", "layout");

  if (profile?.role === "provider") {
    redirect("/provider/dashboard");
  } else if (profile?.role === "admin") {
    redirect("/admin");
  }
  redirect("/dashboard");
}

export async function signupAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const country = String(formData.get("country") ?? "US");
  const role = String(formData.get("role") ?? "customer");

  if (!email || !password || !fullName) {
    return { error: "All fields are required." };
  }
  if (email.length > 254) return { error: "Email is too long." };
  if (fullName.length > 80) return { error: "Name is too long (max 80 chars)." };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password.length > 128) {
    return { error: "Password is too long (max 128 chars)." };
  }
  if (!["customer", "provider"].includes(role)) {
    return { error: "Invalid role." };
  }
  if (!["US", "CA"].includes(country)) {
    return { error: "Country must be US or CA." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role,
        country,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpward.com"}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/verify-email?email=" + encodeURIComponent(email));
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Email is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpward.com"}/auth/reset-password`,
  });
  if (error) return { error: error.message };
  return { success: "Check your inbox — if that email is registered we just sent a reset link." };
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password.length > 128) return { error: "Password is too long (max 128 chars)." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { success: "Password updated. You can now log in." };
}
