import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { ChatThread } from "./thread";
import Link from "next/link";
import { ArrowLeft, Phone, MoreHorizontal, ClipboardList } from "lucide-react";

export default async function ConversationPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: convo } = await supabase
    .from("conversations")
    .select(`
      *,
      provider:provider_profiles!conversations_provider_id_fkey(
        rating_avg,
        profile:profiles!provider_profiles_user_id_fkey(full_name, avatar_url)
      ),
      booking:bookings(id, service:services(title), status)
    `)
    .eq("id", id)
    .single();

  if (!convo) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const otherPerson = (convo as { provider: { profile: { full_name: string; avatar_url: string | null } | null; rating_avg: number | null } }).provider;
  const booking = (convo as { booking: { id: string; service: { title: string } | null; status: string } | null }).booking;

  return (
    <div className="h-[calc(100vh-160px)] lg:h-[calc(100vh-80px)] flex flex-col max-w-3xl mx-auto">
      {/* Sticky header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-white">
        <Link href="/messages" aria-label="Back" className="p-1.5 -ml-1 rounded-lg hover:bg-slate-100 shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        {otherPerson?.profile?.avatar_url ? (
          <img src={otherPerson.profile.avatar_url} className="w-10 h-10 rounded-full shrink-0" alt="" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold shrink-0">
            {otherPerson?.profile?.full_name?.[0] ?? "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
            {otherPerson?.profile?.full_name ?? "Provider"}
            {otherPerson?.rating_avg && (
              <span className="text-brand-700 text-xs font-semibold">★ {otherPerson.rating_avg}</span>
            )}
          </div>
          {booking?.service?.title && (
            <div className="text-[11px] text-slate-500 truncate">
              {booking.service.title} · Booking #{booking.id.slice(0, 8)}
            </div>
          )}
        </div>
        <button aria-label="Call" className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 shrink-0">
          <Phone className="w-4 h-4 text-brand-600" />
        </button>
        <button aria-label="More" className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 shrink-0">
          <MoreHorizontal className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      <ChatThread
        conversationId={id}
        currentUserId={user.id}
        initialMessages={messages ?? []}
        otherAvatar={otherPerson?.profile?.avatar_url ?? null}
        otherInitial={otherPerson?.profile?.full_name?.[0] ?? "?"}
      />
    </div>
  );
}
