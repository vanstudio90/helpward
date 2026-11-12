import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare, ChevronRight, LifeBuoy } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClientDateTime } from "@/components/ClientDateTime";

/*
  THE CUSTOMER'S SUPPORT THREADS.

  This page is what makes the in-app channel a channel. Support can
  write to somebody from the console; without somewhere to read and
  answer it, that is a notification with no conversation behind it.
*/

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("support_customer_cases");
  const cases = (data ?? []) as {
    id: string; ref: string; subject: string; status: string;
    channel: string; last_message_at: string; awaiting_us: boolean;
  }[];

  return (
    <div className="px-4 sm:px-6 py-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <LifeBuoy className="w-6 h-6 text-brand-600" /> Support
      </h1>
      <p className="text-[15px] text-slate-500 mt-1 mb-5">
        Conversations with the Helpward team.
      </p>

      {error && (
        <p className="text-[14px] text-rose-700 bg-rose-50 border border-rose-100 rounded-field px-3 py-2 mb-4">
          {error.message}
        </p>
      )}

      {cases.length === 0 ? (
        <div className="bg-white rounded-card border border-slate-100 px-5 py-10 text-center">
          <MessageSquare className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="text-[15px] font-semibold text-slate-700 mt-3">No conversations yet</p>
          <p className="text-[14px] text-slate-500 mt-1">
            Conversations the Helpward team starts with you in the app appear here. If you
            email support@helpward.com instead, we answer by email.
          </p>
        </div>
      ) : (
        <ul className="bg-white rounded-card border border-slate-100 divide-y divide-slate-100 overflow-hidden">
          {cases.map((c) => (
            <li key={c.id}>
              <Link href={`/support/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-slate-900 truncate">{c.subject}</p>
                  <p className="text-[13px] text-slate-500">
                    {c.ref} · <ClientDateTime iso={c.last_message_at} mode="date" />
                  </p>
                </div>
                {c.status === "resolved" ? (
                  <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    Resolved
                  </span>
                ) : c.awaiting_us ? (
                  <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
                    We're on it
                  </span>
                ) : (
                  <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                    Your turn
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
