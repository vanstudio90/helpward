"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  X, Info, Save, Eye, UploadCloud, AlertTriangle, CheckCircle2, Lock,
  ListChecks, Globe, History, FileText, Coins,
} from "lucide-react";
import type { ServiceDraft, Market } from "@/lib/data/admin-services";
import {
  MODEL_LABEL, MODEL_MEANING, STATUS_LABEL, STATUS_TONE,
  CHECK_LABEL, CHECK_TONE, PUBLICATION_SURFACES,
} from "@/lib/admin-service-states";
import { money } from "@/lib/admin-format";
import {
  saveServiceDraftAction, publishServiceDraftAction, discardServiceDraftAction,
  type ServiceResult,
} from "@/app/(admin)/admin/services/actions";

/*
  EDITING ONE SERVICE.

  THE MARKET SELECTOR OPENS A DIFFERENT SET OF PRICES, not a converted
  one. CA$90 is a price somebody chose for Canada; it is not US$80 at
  today's rate, and a console that implies otherwise invites somebody
  to "fix" a deliberate difference.

  INHERITED AND OVERRIDDEN LOOK DIFFERENT. A field with no override
  shows the inherited figure as a placeholder and says where it comes
  from; an override of zero shows a nought and says it was chosen. In a
  plain text box those two are indistinguishable, and they are
  opposites.

  BILLABLE TIME IS NOT THE ARRIVAL ESTIMATE. "Usually arrives within
  the hour" lives in Content with the rest of the copy. Included
  minutes lives here, and the help text on it says which one the engine
  charges from.

  AND PUBLISHING IS A REVIEW, NOT A SAVE. Published prices apply to new
  quotes; everything already quoted keeps what it was told.
*/

type Tab = "content" | "pricing" | "intake" | "availability" | "history";

export function ServiceEditorPanel({
  draft, sample, can,
}: {
  draft: ServiceDraft;
  sample: boolean;
  /* One flag per control, because they were built one at a time. */
  can: { save_draft: boolean; publish: boolean; discard: boolean };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("pricing");
  const [market, setMarket] = useState<Market>(draft.market);

  /*
    WHAT THE OPERATOR HAS TYPED, kept apart from what is live. Nothing
    here reaches the database until Save draft, and nothing reaches a
    customer until Publish — which is the whole point of the screen.
  */
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "save" | "publish" | "discard">(null);
  const [result, setResult] = useState<ServiceResult | null>(null);
  const dirty = Object.keys(edits).length > 0;

  /*
    FROM BOXES TO THE FIELDS THE DATABASE KNOWS. Money is typed in
    dollars and stored in cents; an emptied box means "inherit the
    shared value", which is null and not zero — those are different
    prices and the console has kept them apart all the way to here.
  */
  const toChanges = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(edits)) {
      const text = raw.trim();
      if (key.endsWith("_cents")) {
        out[key] = text === "" ? null : Math.round(Number(text) * 100);
      } else if (key.endsWith("_minutes") || key.endsWith("_units")) {
        out[key] = text === "" ? null : Math.round(Number(text));
      } else {
        out[key] = text;
      }
    }
    return out;
  };

  const invalid = Object.entries(edits).some(([key, raw]) => {
    const text = raw.trim();
    if (text === "") return false;
    if (key.endsWith("_cents") || key.endsWith("_minutes") || key.endsWith("_units")) {
      return !Number.isFinite(Number(text)) || Number(text) < 0;
    }
    return false;
  });

  const run = async (
    which: "save" | "publish" | "discard",
    fn: () => Promise<ServiceResult>,
  ) => {
    setBusy(which);
    setResult(null);
    try {
      const outcome = await fn();
      setResult(outcome);
      if (outcome.ok) {
        if (which !== "save") setEdits({});
        else setEdits({});
        router.refresh();
      }
    } catch (e) {
      /* A thrown action is still a failure the operator has to see. */
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    router.replace(`/admin/services?${next.toString()}`, { scroll: false });
  };

  return (
    <aside className="bg-white rounded-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-7rem)] overflow-hidden">
      <header className="px-4 pt-3.5 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-bold text-slate-900 leading-tight flex flex-wrap items-center gap-2">
              {draft.title}
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_TONE[draft.status]}`}>
                {STATUS_LABEL[draft.status]}
              </span>
            </h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Draft edits do not affect live bookings.
            </p>
          </div>
          <button onClick={close} aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex items-center gap-4 mt-3 -mb-3 overflow-x-auto">
          {(["content", "pricing", "intake", "availability", "history"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[13px] font-semibold pb-2.5 border-b-2 capitalize whitespace-nowrap ${
                tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}>
              {t}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {tab === "pricing" && (
          <>
            {/* MARKET AND CURRENCY */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] font-semibold text-slate-700">Market</span>
              <div className="inline-flex rounded-xl overflow-hidden border border-slate-200">
                {(["US", "CA"] as Market[]).map((m) => (
                  <button key={m} onClick={() => setMarket(m)}
                    className={`text-[13px] font-semibold px-4 py-1.5 ${
                      market === m ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:text-slate-900"
                    }`}>
                    {m === "US" ? "United States" : "Canada"}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-[13px] text-slate-500">Currency</span>
              <span className="text-[13px] font-semibold text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5">
                {market === "CA" ? "CAD" : "USD"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 -mt-1">
              Each market holds its own prices. Switching does not convert anything — a Canadian
              price is a price somebody chose, not an exchange rate applied to the American one.
            </p>

            {/* MONEY FIELDS */}
            <div className="space-y-2">
              {draft.price_fields.map((field) => {
                const inherited = field.override_cents === null;
                const zeroOverride = field.override_cents === 0;
                return (
                  <div key={field.key}>
                    <div className="flex items-center gap-2">
                      <label className="text-[13px] text-slate-700 w-[140px] shrink-0">{field.label}</label>
                      <div className="flex-1 min-w-0">
                        <input
                          value={edits[field.key] ?? (inherited ? "" : (field.override_cents! / 100).toFixed(2))}
                          onChange={(e) => setEdits((p) => ({ ...p, [field.key]: e.target.value }))}
                          inputMode="decimal"
                          placeholder={
                            field.inherited_cents !== null
                              ? `Inherited ${money(field.inherited_cents, draft.currency)}`
                              : "No shared value to inherit"
                          }
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-200"
                        />
                      </div>
                      {/* INHERITED, OVERRIDDEN, OR DELIBERATELY FREE —
                          three different states, never one empty box. */}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                        inherited ? "bg-slate-100 text-slate-600"
                          : zeroOverride ? "bg-amber-100 text-amber-900"
                          : "bg-brand-50 text-brand-700"
                      }`}>
                        {inherited ? "Inherited" : zeroOverride ? "Set to zero" : "Overridden"}
                      </span>
                    </div>
                    {field.help && <p className="text-[11px] text-slate-500 ml-[148px]">{field.help}</p>}
                  </div>
                );
              })}

              {draft.number_fields.map((field) => (
                <div key={field.key}>
                  <div className="flex items-center gap-2">
                    <label className="text-[13px] text-slate-700 w-[140px] shrink-0">
                      {field.label} ({field.unit === "minutes" ? "min" : "count"})
                    </label>
                    <input
                      value={edits[field.key] ?? String(field.value)}
                      onChange={(e) => setEdits((p) => ({ ...p, [field.key]: e.target.value }))}
                      inputMode="numeric"
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-200" />
                    <span className="w-[76px] shrink-0 text-[10px] font-semibold text-slate-500 text-right">
                      Billable
                    </span>
                  </div>
                  {field.help && <p className="text-[11px] text-slate-500 ml-[148px]">{field.help}</p>}
                </div>
              ))}
            </div>

            <p className="text-[12px] text-slate-500">
              Other limits follow the saved pricing rule — this service charges as{" "}
              <span className="font-semibold text-slate-700">{MODEL_LABEL[draft.model]}</span>.{" "}
              {MODEL_MEANING[draft.model]} Editing the name or the description cannot change that.
            </p>

            {/* SERVICE FEE — NOT A PER-SERVICE FIELD */}
            <div className="flex items-center gap-2">
              <label className="text-[13px] text-slate-700 w-[140px] shrink-0">Service fee</label>
              <input readOnly value={money(draft.service_fee_cents, draft.currency)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-500 tabular-nums" />
              {/* There is no global fee screen yet, so this says so
                  rather than pointing at a 404. */}
              <span title="A global fee screen does not exist yet — the fee is set in the pricing rules."
                className="text-[12px] font-semibold text-slate-400 shrink-0 cursor-help">
                Global fee settings
              </span>
            </div>
            <p className="text-[11px] text-slate-500 -mt-1 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-px shrink-0" />
              The fee is global. Changing it affects {draft.service_fee_scope.services} services
              across {draft.service_fee_scope.markets} markets, so it is reviewed on its own screen
              rather than edited here.
            </p>

            {/* QUOTE PREVIEW */}
            <section className="border border-slate-200 rounded-xl px-3 py-3">
              <h3 className="text-[13px] font-semibold text-slate-900 mb-2">Quote preview</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[13px] text-slate-700">
                    <span className="w-[72px] shrink-0">Duration</span>
                    <select defaultValue={draft.quote.duration_minutes}
                      className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-[13px]">
                      {[30, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} min</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-[13px] text-slate-700">
                    <span className="w-[72px] shrink-0">Helpers</span>
                    <select defaultValue={draft.quote.helpers}
                      className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-[13px]">
                      {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                </div>
                <dl className="space-y-1">
                  {draft.quote.lines.map((line) => (
                    <div key={line.label} className="flex items-center gap-2 text-[13px] text-slate-700">
                      <dt>{line.label}</dt>
                      <dd className="ml-auto tabular-nums">{money(line.amount_cents, draft.currency)}</dd>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-brand-800 bg-brand-50 rounded-lg px-2 py-1.5 mt-1">
                    <dt>Estimated total</dt>
                    <dd className="ml-auto tabular-nums">{money(draft.quote.total_cents, draft.currency)}</dd>
                  </div>
                </dl>
              </div>
              {/*
                THE RULE, BESIDE THE FIGURE. Without it a reader
                compares the total against the design's example and
                concludes the quote is wrong, when the real service
                simply includes more time for the base.
              */}
              {draft.quote.rule && (
                <p className="text-[11px] text-slate-600 mt-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <span className="font-semibold text-slate-700">Priced by this service&apos;s rule:</span>{" "}
                  {draft.quote.rule.included_minutes != null
                    ? `the first ${draft.quote.rule.included_minutes} minutes are included in the base`
                    : "no time is included in the base"}
                  {draft.quote.rule.extra_block_minutes != null && draft.quote.rule.extra_block_cents != null
                    ? `, then ${money(draft.quote.rule.extra_block_cents, draft.currency)} for each further ${draft.quote.rule.extra_block_minutes} minutes`
                    : ""}
                  {draft.quote.rule.included_units != null && draft.quote.rule.per_extra_unit_cents != null
                    ? `. ${draft.quote.rule.included_units} included, then ${money(draft.quote.rule.per_extra_unit_cents, draft.currency)} each`
                    : ""}
                  . Blocks are started, not prorated — so a preview inside the included time is the
                  base alone.
                </p>
              )}
              <p className="text-[11px] text-slate-500 mt-2">{draft.quote.source}</p>
            </section>

            {/*
              VALIDATION SAYS WHAT IT KNOWS. In the image this is a green
              tick; a tick means somebody checked both markets, the
              boundary durations, the helper counts and the country
              fallbacks. Until something does, it says so.
            */}
            <div className={`rounded-xl px-3 py-2.5 flex items-start gap-2 ${
              draft.validation.state === "passed" ? "bg-emerald-50 border border-emerald-200"
                : draft.validation.state === "failed" ? "bg-rose-50 border border-rose-200"
                : "bg-slate-50 border border-slate-200"
            }`}>
              {draft.validation.state === "passed"
                ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-px shrink-0" />
                : <Info className="w-4 h-4 text-slate-400 mt-px shrink-0" />}
              <div>
                <p className="text-[13px] font-semibold text-slate-800">
                  {CHECK_LABEL[draft.validation.state]}
                </p>
                <p className="text-[12px] text-slate-600">{draft.validation.detail}</p>
              </div>
            </div>
          </>
        )}

        {tab === "content" && (
          <>
            <Field label="Short description">
              <textarea defaultValue={draft.content.blurb} rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200" />
            </Field>
            <Field label="Arrival estimate">
              <input defaultValue={draft.content.arrival_estimate}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200" />
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1">
                Copy only. This is what a customer reads about waiting — it is never an input to
                the quote. Billable time lives in Pricing.
              </p>
            </Field>
            <Field label="What's included">
              <ul className="space-y-1">
                {draft.content.inclusions.map((item) => (
                  <li key={item} className="text-[13px] text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5">
                    {item}
                  </li>
                ))}
              </ul>
            </Field>
            <Field label="What's not included">
              <ul className="space-y-1">
                {draft.content.exclusions.map((item) => (
                  <li key={item} className="text-[13px] text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5">
                    {item}
                  </li>
                ))}
              </ul>
            </Field>
            <Field label="How to prepare">
              <textarea defaultValue={draft.content.preparation} rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200" />
            </Field>
            <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />
              This copy appears on the website service page, the city pages and in the app. All of
              them update together when the draft is published.
            </p>
          </>
        )}

        {tab === "intake" && (
          <>
            <p className="text-[12px] text-slate-600 flex items-start gap-1.5">
              <ListChecks className="w-4 h-4 text-slate-400 mt-px shrink-0" />
              The questions a customer answers when booking. Each change is a new version of the
              form, and the server validates against the version the booking was made on.
            </p>
            <ul className="space-y-1.5">
              {draft.intake.map((q) => (
                <li key={q.question} className="border border-slate-200 rounded-xl px-3 py-2">
                  <p className="text-[13px] font-semibold text-slate-800">{q.question}</p>
                  <p className="text-[11px] text-slate-500">
                    {q.kind}
                    {q.required ? " · required" : " · optional"}
                    {q.options ? ` · ${q.options.join(", ")}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}

        {tab === "availability" && (
          <>
            <p className="text-[12px] text-slate-600 flex items-start gap-1.5">
              <Globe className="w-4 h-4 text-slate-400 mt-px shrink-0" />
              Bookable and in the app&apos;s launch scope are different things. A service can be
              live on the website while sitting outside the catalogue that shipped with the
              reviewed iOS build.
            </p>
            <ul className="space-y-1.5">
              {draft.availability.map((a) => (
                <li key={a.market} className="border border-slate-200 rounded-xl px-3 py-2.5">
                  <p className="text-[13px] font-semibold text-slate-900">
                    {a.market === "CA" ? "Canada" : "United States"}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      a.bookable ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}>
                      {a.bookable ? "Bookable" : "Not bookable"}
                    </span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      a.in_app_launch_scope ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                    }`}>
                      {a.in_app_launch_scope ? "In app launch scope" : "Outside app launch scope"}
                    </span>
                  </div>
                  {a.note && <p className="text-[11px] text-slate-500 mt-1">{a.note}</p>}
                </li>
              ))}
            </ul>
          </>
        )}

        {tab === "history" && (
          <ol className="space-y-2.5">
            {draft.history.map((h, i) => (
              <li key={i} className="flex gap-2.5">
                <History className="w-3.5 h-3.5 text-slate-300 mt-1 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] text-slate-900">{h.summary}</p>
                  <p className="text-[11px] text-slate-500">
                    {h.actor} · {h.at}{h.reason ? ` · ${h.reason}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50/60">
        {draft.draft_changes.length > 0 && (
          <div className="bg-white border border-amber-200 rounded-xl px-3 py-2">
            <p className="text-[12px] font-semibold text-amber-900">
              {draft.draft_changes.length} unpublished change
              {draft.draft_changes.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-1 space-y-0.5">
              {draft.draft_changes.map((c) => (
                <li key={c.field} className="text-[11px] text-slate-600">
                  {c.field}: <span className="line-through">{c.from}</span> → <span className="font-semibold text-slate-800">{c.to}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/*
          WHAT THE SCREEN SAYS WHEN THE DATABASE REFUSES.

          Each refusal needs a different move from the person reading
          it: a clash means reload, a validation failure means fix a
          number, a permission failure means stop. One "Failed." for
          all three is how somebody retries the same impossible save
          six times, so the clash gets its own colour and its own
          instruction.
        */}
        {result && (
          <div className={`rounded-xl px-3 py-2 border ${
            result.ok ? "bg-emerald-50 border-emerald-200"
              : result.conflict ? "bg-amber-50 border-amber-200"
              : "bg-rose-50 border-rose-200"
          }`}>
            <p className={`text-[12px] font-semibold ${
              result.ok ? "text-emerald-900" : result.conflict ? "text-amber-900" : "text-rose-900"
            }`}>
              {result.ok ? result.message : result.error}
            </p>
            {result.ok && result.detail && (
              <p className="text-[11px] text-slate-600 mt-0.5">{result.detail}</p>
            )}
            {!result.ok && result.conflict && (
              <button type="button" onClick={() => { setResult(null); router.refresh(); }}
                className="mt-1 text-[11px] font-semibold text-amber-900 underline underline-offset-2">
                Reload this service and start from what is live now
              </button>
            )}
          </div>
        )}

        {invalid && (
          <p className="text-[11px] font-semibold text-rose-700">
            One of the numbers is not a number, or is below zero. Saving is held until it is.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button"
            disabled={sample || !can.save_draft || busy !== null || !dirty || invalid}
            onClick={() => run("save", () => saveServiceDraftAction(draft.id, market, toChanges()))}
            title={!dirty ? "Nothing has been changed yet." : undefined}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 px-3 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
            <Save className="w-4 h-4" /> {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          {/* No preview route exists yet, so this stays off rather than
              pointing somewhere that does not load. */}
          <button type="button" disabled
            title="A customer preview of an unpublished draft has not been built."
            className="inline-flex items-center gap-1.5 bg-white border border-brand-200 text-[13px] font-semibold text-brand-700 px-3 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
            <Eye className="w-4 h-4" /> Preview customer view
          </button>
          {draft.draft_id && (
            <button type="button"
              disabled={sample || !can.discard || busy !== null}
              onClick={() => {
                const reason = window.prompt(
                  "Why is this draft being discarded? The reason is kept with it.",
                );
                if (reason === null) return;
                void run("discard", () => discardServiceDraftAction(draft.draft_id!, reason));
              }}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[13px] font-semibold text-slate-600 px-3 py-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
              {busy === "discard" ? "Discarding…" : "Discard draft"}
            </button>
          )}
          <button type="button"
            disabled={sample || !can.publish || busy !== null || !draft.draft_id || dirty}
            onClick={() => void run("publish", () => publishServiceDraftAction(draft.draft_id!))}
            title={
              !draft.draft_id ? "Save a draft first — publishing publishes a draft, not the form."
                : dirty ? "Save the draft first. Publishing would otherwise publish the last saved version, not what is on screen."
                : undefined
            }
            className="inline-flex items-center gap-1.5 bg-brand-600 text-white text-[13px] font-semibold px-3.5 py-2 rounded-xl disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed ml-auto">
            <UploadCloud className="w-4 h-4" /> {busy === "publish" ? "Publishing…" : "Review & publish"}
          </button>
        </div>

        <p className="text-[11px] text-slate-500">
          Published changes apply to new quotes; existing requests and bookings keep the quote they
          were given. Publishing opens a review of what changes and where it lands —{" "}
          {PUBLICATION_SURFACES.slice(0, 3).join(", ").toLowerCase()} and{" "}
          {PUBLICATION_SURFACES.length - 3} more surfaces — rather than writing straight through.
        </p>
        {sample && (
          <p className="text-[11px] text-violet-800 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Saving and publishing are not wired here yet — use the working editor.
          </p>
        )}
      </footer>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-[12px] font-semibold text-slate-600 mb-1">{label}</span>
      {children}
    </div>
  );
}
