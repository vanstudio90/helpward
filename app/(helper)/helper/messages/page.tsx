import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ChevronRight, MessageSquare } from "lucide-react";
import { ClientDateTime } from "@/components/ClientDateTime";
import { PageHeader, EmptyState, Action } from "@/components/helper/ui";

export default async function HelperMessagesPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("conversations")
    .select(`
      id, last_message_at,
      booking:bookings(service:services(title)),
      customer:profiles!conversations_customer_id_fkey(full_name, avatar_url)
    `)
    .order("last_message_at", { ascending: false });

  const conversations = (data ?? []) as unknown as Array<{
    id: string;
    last_message_at: string;
    booking: { service: { title: string } | null } | null;
    customer: { full_name: string; avatar_url: string | null } | null;
  }>;

  return (
    <div className="space-y-5">
      <PageHeader title="Messages" subtitle="Your customer conversations." />

      {conversations.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          body="Accept a task offer and you'll be able to message the customer here."
        >
          <Action href="/helper/inbox">View offers</Action>
        </EmptyState>
      ) : (
        <ul className="bg-white rounded-card border border-slate-100 shadow-soft divide-y divide-slate-100 overflow-hidden">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link href={`/helper/messages/${c.id}`} className="p-4 min-h-[68px] flex items-center gap-3.5">
                {c.customer?.avatar_url ? (
                  <img src={c.customer.avatar_url} className="w-11 h-11 rounded-full object-cover shrink-0" alt="" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-brand-50 flex items-center justify-center text-brand-700 font-extrabold shrink-0">
                    {c.customer?.full_name?.[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-bold text-slate-900 truncate">{c.customer?.full_name ?? "Customer"}</div>
                  <div className="text-[14px] text-slate-500 truncate mt-0.5">
                    {c.booking?.service?.title ?? "Helpward"} · <ClientDateTime iso={c.last_message_at} />
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
