import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

export default async function ProviderMessagesPage() {
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
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Messages</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">Customers you&apos;re talking to.</p>

      {conversations.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-100 p-8 sm:p-12 text-center">
          <span className="inline-flex w-14 h-14 rounded-2xl bg-slate-50 items-center justify-center mb-3">
            <MessageSquare className="w-7 h-7 text-slate-400" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">No conversations yet</h2>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            Accept a task offer and you&apos;ll be able to chat with the customer here.
          </p>
        </div>
      ) : (
        <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-100 overflow-hidden">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link href={`/provider/messages/${c.id}`} className="p-4 flex items-center gap-3 hover:bg-slate-50">
                {c.customer?.avatar_url ? (
                  <img src={c.customer.avatar_url} className="w-11 h-11 rounded-full" alt="" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                    {c.customer?.full_name?.[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900 truncate">{c.customer?.full_name ?? "Customer"}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {c.booking?.service?.title ?? "Helpward"} · {new Date(c.last_message_at).toLocaleString()}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
