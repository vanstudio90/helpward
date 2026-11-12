"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Search, AlertTriangle, Shield, Wrench } from "lucide-react";
import { createCaseAction, findDuplicatesAction } from "@/app/(admin)/admin/disputes/actions";

/*
  RECORDING A REPORT THAT CAME IN FROM OUTSIDE THE APP.

  Somebody rings, or emails, or tells a helper who tells us. The point
  of this form is that the resulting case says so: the SOURCE is kept,
  the person's name is kept separately from an account, and the staff
  member who wrote it down is the one on the record as having done so —
  not as the person who complained.

  THE DUPLICATE WARNING IS NOT A BLOCK. Two reports about the same job
  are often two different people with two different complaints. It
  shows what is already open and lets the reviewer decide.
*/
export function NewCaseDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"safety" | "service">("safety");
  const [category, setCategory] = useState("safety");
  const [source, setSource] = useState("phone");
  const [priority, setPriority] = useState("high");
  const [description, setDescription] = useState("");
  const [reportedBy, setReportedBy] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<{ id: string; name: string | null; ref: string }[]>([]);
  const [person, setPerson] = useState<{ id: string; name: string | null; ref: string } | null>(null);
  const [duplicates, setDuplicates] = useState<{ id: string; ref: string; title: string; status: string }[]>([]);
  const [stripeId, setStripeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (query.trim().length < 2) { setRows([]); return; }
    const id = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/customers/lookup?q=${encodeURIComponent(query)}`);
        const json = await response.json();
        setRows(json.rows ?? []);
      } catch { setRows([]); }
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  /* As soon as we know who it is about, show what is already open. */
  useEffect(() => {
    if (!person) { setDuplicates([]); return; }
    void findDuplicatesAction({ customerId: person.id }).then(setDuplicates);
  }, [person]);

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await createCaseAction({
        kind, category, description, source, priority,
        customerId: person?.id ?? null,
        reportedByName: reportedBy.trim() || null,
        stripeDisputeId: stripeId.trim() || null,
      });
      if (!result.ok) { setError(result.error); return; }
      setOpen(false);
      setDescription(""); setReportedBy(""); setPerson(null); setQuery(""); setStripeId("");
      router.replace(`/admin/disputes?open=${result.id}`);
      router.refresh();
    });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl">
        <Plus className="w-4 h-4" /> New case
      </button>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl">
        <Plus className="w-4 h-4" /> New case
      </button>

      <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[1px] grid place-items-center p-4 overflow-y-auto"
        onClick={() => setOpen(false)}>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg my-8"
          onClick={(e) => e.stopPropagation()}>
          <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <h2 className="text-[16px] font-bold text-slate-900 flex-1">Record a report</h2>
            <button onClick={() => setOpen(false)} aria-label="Close"
              className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center gap-1.5">
              {([
                { key: "safety", label: "Safety report", icon: Shield, cat: "safety" },
                { key: "service", label: "Service dispute", icon: Wrench, cat: "quality" },
              ] as const).map((k) => (
                <button key={k.key}
                  onClick={() => { setKind(k.key); setCategory(k.cat); setPriority(k.key === "safety" ? "high" : "normal"); }}
                  className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border ${
                    kind === k.key ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-200 text-slate-600"
                  }`}>
                  <k.icon className="w-3.5 h-3.5" /> {k.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="text-[12px] font-semibold text-slate-600">
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] font-normal">
                  {["safety", "damage", "no_show", "quality", "billing", "other"].map((c) => (
                    <option key={c} value={c}>{c.replace("_", " ")}</option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] font-semibold text-slate-600">
                Source
                <select value={source} onChange={(e) => setSource(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] font-normal">
                  <option value="phone">Telephone</option>
                  <option value="email">Email</option>
                  <option value="staff">Staff observed</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="text-[12px] font-semibold text-slate-600">
                Priority
                <select value={priority} onChange={(e) => setPriority(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] font-normal">
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </label>
            </div>

            <div>
              <label className="text-[12px] font-semibold text-slate-600">Who is it about?</label>
              {person ? (
                <div className="mt-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <span className="text-[13px] text-slate-900 flex-1 truncate">
                    {person.name ?? "Unnamed"} <span className="text-slate-400 tabular-nums">{person.ref}</span>
                  </span>
                  <button onClick={() => setPerson(null)} className="text-slate-400 hover:text-slate-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search a customer by name, email or reference"
                    className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200" />
                  {rows.length > 0 && (
                    <ul className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                      {rows.map((r) => (
                        <li key={r.id}>
                          <button onClick={() => { setPerson(r); setQuery(""); setRows([]); }}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50">
                            <span className="block text-[13px] font-semibold text-slate-800">{r.name ?? "Unnamed"}</span>
                            <span className="block text-[11px] text-slate-500 tabular-nums">{r.ref}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {duplicates.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <p className="text-[12px] font-semibold text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  They already have {duplicates.length} open case{duplicates.length === 1 ? "" : "s"}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {duplicates.map((d) => (
                    <li key={d.id} className="text-[12px] text-amber-800">
                      {d.ref} · {d.title} · {d.status.replace("_", " ")}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-amber-700/80 mt-1">
                  Two reports about one job are often two different complaints. Carry on if this is one of them.
                </p>
              </div>
            )}

            <div>
              <label className="text-[12px] font-semibold text-slate-600">
                What was reported — in their words where you can
              </label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200" />
              <p className="text-[11px] text-slate-400 mt-1">
                {description.trim().length < 20
                  ? `${20 - description.trim().length} more characters.`
                  : "This is kept exactly as written. Corrections go on the timeline as notes."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-[12px] font-semibold text-slate-600">
                Reporter&apos;s name (if not an account)
                <input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)}
                  placeholder="e.g. a neighbour who called"
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] font-normal" />
              </label>
              <label className="text-[12px] font-semibold text-slate-600">
                Stripe chargeback id (optional)
                <input value={stripeId} onChange={(e) => setStripeId(e.target.value)}
                  placeholder="dp_..."
                  className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] font-normal" />
              </label>
            </div>

            {error && <p className="text-[12px] text-rose-700 bg-rose-50 rounded-lg px-2.5 py-1.5">{error}</p>}
          </div>

          <footer className="px-4 py-3 border-t border-slate-100 flex items-center gap-2">
            <p className="text-[11px] text-slate-500 flex-1">
              You are recorded as having taken the report; the case opens assigned to you.
            </p>
            <button onClick={() => setOpen(false)} className="text-[13px] font-semibold text-slate-500 px-2">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={pending || description.trim().length < 20 || !person}
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-[13px] font-semibold px-3.5 py-2 rounded-xl"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create case
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}
