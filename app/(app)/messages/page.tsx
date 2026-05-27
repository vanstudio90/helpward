import { listConversationsWithLatest } from "@/lib/data/customer";
import Link from "next/link";
import { MessageSquare, Plus } from "lucide-react";

export default async function MessagesPage() {
  const conversations = await listConversationsWithLatest();

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Messages</h1>
        <p className="text-sm text-slate-500 mt-1">Stay in touch with your providers and get real-time updates.</p>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-100 p-8 sm:p-12 text-center">
          <span className="inline-flex w-14 h-14 rounded-2xl bg-white items-center justify-center mb-3">
            <MessageSquare className="w-7 h-7 text-brand-600" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">No messages yet</h2>
          <p className="mt-1 text-sm text-slate-600 max-w-sm mx-auto">
            When you book a service, you'll be able to chat with your provider in real time right here.
          </p>
          <Link href="/new-request" className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold">
            <Plus className="w-4 h-4" /> Create a request
          </Link>
        </div>
      ) : (
        <ul className="rounded-2xl bg-white border border-slate-100 divide-y divide-slate-100 overflow-hidden">
          {conversations.map((c) => {
            const p = (c as { provider: { profile: { full_name: string; avatar_url: string | null } } | null }).provider;
            return (
              <li key={c.id} className="p-4 flex items-center gap-3 hover:bg-slate-50">
                {p?.profile?.avatar_url ? (
                  <img src={p.profile.avatar_url} className="w-11 h-11 rounded-full" alt="" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                    {p?.profile?.full_name?.[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900 truncate">{p?.profile?.full_name ?? "Provider"}</div>
                  <div className="text-xs text-slate-500 truncate">
                    Last message {new Date(c.last_message_at).toLocaleString()}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
