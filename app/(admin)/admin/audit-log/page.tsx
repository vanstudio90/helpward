import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { ClientDateTime } from "@/components/ClientDateTime";

export default async function AdminAuditLogPage({
  searchParams,
}: { searchParams: Promise<{ action?: string }> }) {
  // Defense-in-depth: proxy gates the route, but we double-check here so a
  // direct render path can't leak service-role data.
  const userClient = await createSupabaseServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if ((user?.app_metadata?.role as string | undefined) !== "admin") redirect("/login");

  const params = await searchParams;
  const supabase = createSupabaseServiceClient();
  let q = supabase
    .from("audit_log")
    .select(`
      id, action, target_table, target_id, payload, ip, user_agent, created_at,
      actor:profiles!audit_log_actor_id_fkey(full_name, role, avatar_url)
    `)
    .order("created_at", { ascending: false })
    .limit(200);
  if (params.action) q = q.eq("action", params.action);
  const { data: rows } = await q;

  // Collect distinct actions for filter chips
  const { data: distinct } = await supabase
    .from("audit_log")
    .select("action")
    .limit(500);
  const actions = Array.from(new Set((distinct ?? []).map((r) => r.action))).sort();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 inline-flex items-center gap-2">
        <FileText className="w-6 h-6 text-slate-600" /> Audit log
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">{rows?.length ?? 0} most recent privileged actions</p>

      <form action="" className="flex flex-wrap gap-2 mb-4">
        <button
          type="submit"
          name="action"
          value=""
          className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
            !params.action ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700"
          }`}
        >
          All
        </button>
        {actions.map((a) => (
          <button
            key={a}
            type="submit"
            name="action"
            value={a}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              params.action === a ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700"
            }`}
          >
            {a}
          </button>
        ))}
      </form>

      {(rows?.length ?? 0) === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-100 p-12 text-center">
          <p className="text-sm text-slate-500">No audit log entries yet.</p>
        </div>
      ) : (
        <ul className="rounded-2xl bg-white border border-slate-100 overflow-hidden divide-y divide-slate-100">
          {(rows ?? []).map((r) => {
            const actor = (r as { actor: { full_name: string; role: string; avatar_url: string | null } | null }).actor;
            return (
              <li key={r.id} className="p-4 flex items-start gap-3">
                {actor?.avatar_url ? (
                  <img src={actor.avatar_url} className="w-8 h-8 rounded-full" alt="" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs">
                    {actor?.full_name?.[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{actor?.full_name ?? "?"}</span>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{actor?.role ?? "?"}</span>
                    <span className="text-xs text-slate-500">→</span>
                    <span className="font-mono text-xs text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">{r.action}</span>
                    {r.target_table && (
                      <span className="text-xs text-slate-500">on <span className="font-mono">{r.target_table}#{(r.target_id ?? "").slice(0, 8)}</span></span>
                    )}
                  </div>
                  {r.payload && Object.keys(r.payload).length > 0 && (
                    <pre className="mt-1 text-[10px] text-slate-600 bg-slate-50 rounded px-2 py-1 overflow-x-auto">
                      {JSON.stringify(r.payload, null, 2)}
                    </pre>
                  )}
                  <div className="text-[10px] text-slate-400 mt-1"><ClientDateTime iso={r.created_at} />{r.ip ? ` · ${r.ip}` : ""}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
