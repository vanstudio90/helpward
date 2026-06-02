import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Profile, CustomerProfile, ProviderProfile, Booking, Conversation,
  Message, BookingStatus,
} from "@/lib/supabase/types";

/* All queries scoped via RLS — only the caller's own rows come back. */

export async function getMe(): Promise<{ profile: Profile; customer: CustomerProfile | null } | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: customer }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("customer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!profile) return null;
  return { profile, customer: customer ?? null };
}

export type DashboardStats = {
  upcoming: number;
  in_progress: number;
  completed_month: number;
  total_spent_month_cents: number;
  total_spent_all_cents: number;
  total_bookings: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createSupabaseServerClient();
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [
    { count: upcoming },
    { count: in_progress },
    { count: total_bookings },
    { data: monthRows },
    { data: allRows },
  ] = await Promise.all([
    supabase.from("bookings").select("*", { count: "exact", head: true }).eq("status", "scheduled"),
    supabase.from("bookings").select("*", { count: "exact", head: true }).eq("status", "in_progress"),
    supabase.from("bookings").select("*", { count: "exact", head: true }),
    supabase.from("bookings").select("total_cents,status,completed_at")
      .eq("status", "completed")
      .gte("completed_at", startOfMonth.toISOString()),
    supabase.from("bookings").select("total_cents,status").eq("status", "completed").limit(1000),
  ]);

  const completed_month = monthRows?.length ?? 0;
  const total_spent_month_cents = monthRows?.reduce((s, r) => s + (r.total_cents || 0), 0) ?? 0;
  const total_spent_all_cents = allRows?.reduce((s, r) => s + (r.total_cents || 0), 0) ?? 0;

  return {
    upcoming: upcoming ?? 0,
    in_progress: in_progress ?? 0,
    completed_month,
    total_spent_month_cents,
    total_spent_all_cents,
    total_bookings: total_bookings ?? 0,
  };
}

export type BookingWithProvider = Booking & {
  service: { id: string; title: string; image_url: string | null };
  provider: {
    user_id: string;
    profile: { full_name: string; avatar_url: string | null };
    rating_avg: number | null;
  } | null;
};

export async function listMyBookings(opts?: { status?: BookingStatus; limit?: number }) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("bookings")
    .select(`
      *,
      service:services(id, title, image_url),
      provider:provider_profiles!bookings_provider_id_fkey(
        user_id, rating_avg,
        profile:profiles!provider_profiles_user_id_fkey(full_name, avatar_url)
      )
    `)
    .order("created_at", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  q = q.limit(opts?.limit ?? 200);

  const { data, error } = await q;
  if (error) {
    console.error("listMyBookings:", error.message);
    return [];
  }
  return (data ?? []) as unknown as BookingWithProvider[];
}

export async function getActiveBooking(): Promise<BookingWithProvider | null> {
  const list = await listMyBookings({ status: "in_progress", limit: 1 });
  return list[0] ?? null;
}

export async function listConversationsWithLatest() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .select(`
      *,
      booking:bookings(id, service:services(id, title)),
      provider:provider_profiles!conversations_provider_id_fkey(
        user_id, rating_avg,
        profile:profiles!provider_profiles_user_id_fkey(full_name, avatar_url)
      )
    `)
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("listConversationsWithLatest:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createSupabaseServerClient();
  // Pull the most recent 200 messages, then return chronological order.
  // Avoids OOM/load-storm on threads that have thousands of messages.
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("getConversationMessages:", error.message);
    return [];
  }
  return (data ?? []).reverse();
}

export async function listFavoritesByKind(kind?: "provider" | "service" | "address") {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("favorites").select("*").order("created_at", { ascending: false }).limit(200);
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) {
    console.error("listFavoritesByKind:", error.message);
    return [];
  }
  return data ?? [];
}

export async function listSavedProviderIds(): Promise<string[]> {
  const favs = await listFavoritesByKind("provider");
  return favs.map((f) => f.target_id);
}

export type SavedProvider = {
  user_id: string;
  slug: string | null;
  profile: { full_name: string; avatar_url: string | null };
  status: string;
  rating_avg: number | null;
  rating_count: number;
  tasks_completed: number;
};

export async function listSavedProviders(): Promise<SavedProvider[]> {
  const ids = await listSavedProviderIds();
  if (ids.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("provider_profiles")
    .select(`
      user_id, slug, status, rating_avg, rating_count, tasks_completed,
      profile:profiles!provider_profiles_user_id_fkey(full_name, avatar_url)
    `)
    .in("user_id", ids);
  if (error) {
    console.error("listSavedProviders:", error.message);
    return [];
  }
  return (data ?? []) as unknown as SavedProvider[];
}

export async function listMyAddresses() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("listMyAddresses:", error.message);
    return [];
  }
  return data ?? [];
}

export async function listMyPaymentMethods() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("listMyPaymentMethods:", error.message);
    return [];
  }
  return data ?? [];
}

export async function listMyNotifications(opts?: { unreadOnly?: boolean }) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  if (opts?.unreadOnly) q = q.is("read_at", null);
  const { data } = await q;
  return data ?? [];
}

export async function getUnreadCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}
