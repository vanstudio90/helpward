import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClientDateTime } from "@/components/ClientDateTime";
import { SupportReplyBox } from "../reply-box";

/*
  ONE SUPPORT THREAD, AS THE CUSTOMER SEES IT.

  Read straight through RLS rather than a function: support_cases is
  readable where customer_id = auth.uid(), and support_messages where
  the case is theirs AND the message is not an internal note. So the
  worst this page can do, if it asks for too much, is get nothing.
*/

export const dynamic = "force-dynamic";

export default async function SupportThreadPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("support_cases")
    .select("id, subject, status, channel, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!row) notFound();

  const { data: messages } = await supabase
    .from("support_messages")
    .select("id, kind, body, created_at")
    .eq("case_id", id)
    .order("created_at", { ascending: true });

  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-[calc(100vh-160px)]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-white">
        <Link href="/support" aria-label="Back" className="p-1.5 -ml-1 rounded-field hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-slate-900 truncate">{row.subject}</p>
          <p className="text-[13px] text-slate-500">
            Helpward Support · started <ClientDateTime iso={row.created_at} mode="date" />
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {(messages ?? []).map((m) => {
          const fromUs = m.kind === "outbound";
          return (
            <div key={m.id} className={fromUs ? "flex" : "flex justify-end"}>
              <div className={`max-w-[85%] rounded-card px-3.5 py-2.5 ${
                fromUs ? "bg-white border border-slate-100" : "bg-brand-600 text-white"
              }`}>
                <p className={`text-[12px] font-semibold ${fromUs ? "text-slate-500" : "text-white/80"}`}>
                  {fromUs ? "Helpward Support" : "You"}
                </p>
                <p className="text-[15px] whitespace-pre-wrap mt-0.5">{m.body}</p>
                <p className={`text-[11px] mt-1 ${fromUs ? "text-slate-400" : "text-white/70"}`}>
                  <ClientDateTime iso={m.created_at} mode="datetime" />
                </p>
              </div>
            </div>
          );
        })}
        {(messages ?? []).length === 0 && (
          <p className="text-[14px] text-slate-500 text-center py-8">Nothing here yet.</p>
        )}
      </div>

      {row.status === "resolved" ? (
        <div className="border-t border-slate-100 p-3 bg-white">
          <p className="text-[14px] text-slate-600">
            This conversation was marked resolved. Replying reopens it.
          </p>
          <div className="mt-2"><SupportReplyBox caseId={row.id} /></div>
        </div>
      ) : (
        <SupportReplyBox caseId={row.id} />
      )}
    </div>
  );
}
