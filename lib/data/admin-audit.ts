import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { actionLabel } from "@/lib/admin-audit-states";
import type { EventOutcome, ActorKind } from "@/lib/admin-audit-states";

/*
  THE AUDIT LOG — TYPES FIRST, DATA LATER.

  WIRED. This reads audit_log, which since 0110 records the outcome,
  the actor's role at the time, a correlation id and the fields that
  moved. Five rules are encoded in the shape, each because a log that
  gets one of them wrong is worse than no log:

  1. READ-ONLY IS A PROPERTY OF THE DATABASE, NOT THE PAGE.
     `append_only_enforced` is a fact the view must establish — from
     the grants and policies — before the screen may say so. Until
     0109 this product's log was editable by any admin session through
     PostgREST, so the claim was false while the console was ready to
     print it. The flag exists so a future wiring cannot assume.

  2. THE ROLE IS THE ROLE AT THE TIME. `actor.role_at_event` is stored
     with the event, not looked up from the profile today. The admin
     claim in this product lives in the JWT rather than in
     profiles.role, so reading the profile mislabels anybody whose two
     disagree — which has already happened in this database.

  3. AN ATTEMPT IS NOT AN OUTCOME. `outcome` has four values and
     `submitted` means the result is still with somebody else.

  4. ONLY CHANGED FIELDS ARE A CHANGE. The `changes` array carries
     exactly the fields that moved — not every field with its current
     value beside itself.

  5. ORDERING IS DETERMINISTIC. Events share a second routinely; three
     in this database share a microsecond. `sequence` is the stable
     tie-breaker, and the list sorts by (occurred_at, sequence).
*/

export type AuditActor = {
  id: string | null;
  name: string;
  kind: ActorKind;
  /** What they were WHEN THEY ACTED. Not their role today. */
  role_at_event: string;
  source: string;
};

export type AuditChange = {
  field: string;
  before: string | null;
  after: string | null;
};

export type AuditRow = {
  id: string;                     // EV-0821
  /** Monotonic tie-breaker for events inside the same instant. */
  sequence: number;
  occurred_at: string;
  occurred_exact: string;
  actor: AuditActor;
  action_code: string;
  action: string;
  record: { label: string; href: string | null; missing: boolean } | null;
  outcome: EventOutcome;
  correlation_id: string | null;
  is_review_activity: boolean;
  /*
    A LATER EVENT SAYS THIS ONE IS WRONG, and the list says so where
    the mistake is — beside the actor it misnames. Putting it only in
    the detail panel means the wrong name is what anybody skimming
    takes away.
  */
  correction: { id: string; label: string } | null;
};

export type AuditDetail = {
  id: string;
  sequence: number;
  action_code: string;
  action: string;
  outcome: EventOutcome;
  actor: AuditActor;
  occurred_at: string;
  occurred_exact: string;
  timezone: string;
  record: { label: string; href: string | null; missing: boolean } | null;
  reason: string | null;
  /** Only the fields that actually moved. */
  changes: AuditChange[];
  related_records: { label: string; href: string | null }[];
  correlation: {
    id: string | null;
    related_count: number;
    trail: { label: string; at: string; id: string }[];
  };
  technical: { label: string; value: string }[];
  redaction_note: string;
  /** A correction appended later, where one exists. */
  correction: { id: string; note: string; at: string; label: string } | null;
};

export type AuditView = {
  sample: boolean;
  /*
    SEPARATE FROM `sample`, and it has to be. When this view stopped
    being sample data every control keyed to `disabled={view.sample}`
    switched itself on — including Export, which nothing has built.
    `writable` is what the buttons read.
  */
  writable: boolean;
  timezone: string;
  /** Established from the database, never assumed by the screen. */
  append_only_enforced: boolean;
  append_only_detail: string;
  /** Set when events are known to be missing. Silence is not success. */
  logging_gap: string | null;
  load_error: string | null;
  counts: { events_in_view: number; staff_actions: number; system_events: number };
  rows: AuditRow[];
  total_rows: number;
  selected: AuditDetail | null;
};

/* ------------------------------------------------------------------ */
/* THE REAL TRAIL                                                       */
/* ------------------------------------------------------------------ */

const TZ = "America/Vancouver";

function at(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: TZ, day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

/* Where a record lives in this console, so an event can be opened. */
const ROUTE: Record<string, (id: string) => string | null> = {
  disputes: (id) => `/admin/disputes?open=${id}`,
  support_cases: (id) => `/admin/inbox?open=${id}`,
  bookings: (id) => `/admin/bookings?open=booking:${id}`,
  profiles: (id) => `/admin/users?open=${id}`,
  provider_profiles: (id) => `/admin/helpers?open=${id}`,
  reviews: () => "/admin/reviews",
  refunds: () => "/admin/refunds",
  data_export_requests: () => "/admin/data-requests",
  account_deletion_requests: () => "/admin/data-requests",
  dispute_evidence: () => "/admin/disputes",
  venues: () => "/admin/venues",
  operational_settings: () => null,
  audit_log: () => null,
};

const PREFIX: Record<string, string> = {
  disputes: "SF-", support_cases: "CS-", bookings: "BK-", profiles: "CU-",
  provider_profiles: "HP-", reviews: "RV-", refunds: "RF-",
  data_export_requests: "DR-", account_deletion_requests: "DR-",
};

function recordOf(table: string | null, id: string | null) {
  if (!table || !id) return null;
  const short = /^[0-9a-f-]{8,}$/i.test(id) ? id.slice(0, 4).toUpperCase() : id;
  return {
    label: `${PREFIX[table] ?? ""}${short}`,
    href: (ROUTE[table] ?? (() => null))(id),
    missing: false,
  };
}

/*
  WHAT A CORRECTION SAYS IN FOUR WORDS.

  The log is append-only, which is the point — and which means event
  18 cannot grow a "summary" field now that we want one. So the short
  label is derived from what the correction already records, and a
  correction written from here on should carry `summary` so nothing
  has to be inferred.
*/
function correctionLabel(payload: Record<string, unknown> | null): string {
  const summary = typeof payload?.summary === "string" ? payload.summary : null;
  if (summary) return summary;
  const cause = String(payload?.actual_cause ?? "");
  if (/self-test/i.test(cause)) return "Self-test event — incorrect actor attribution";
  if (/migration/i.test(cause)) return "Written by a migration — incorrect actor attribution";
  return "Corrected by a later event";
}

type CorrectionDb = {
  id: number; target_id: string | null;
  payload: Record<string, unknown> | null; created_at: string;
};

type AuditRowDb = {
  id: number; actor_id: string | null; action: string;
  target_table: string | null; target_id: string | null;
  payload: Record<string, unknown> | null; ip: string | null; user_agent: string | null;
  created_at: string; outcome: string | null; role_at_event: string | null;
  correlation_id: string | null; changes: { field: string; before: string | null; after: string | null }[] | null;
};

/*
  THE ACTOR'S KIND, from what they WERE. role_at_event is what the
  trigger captured from the verified claim; the profile's role today is
  only a fallback for events written before 0110, and it is labelled as
  unrecorded rather than guessed at.
*/
function actorKind(roleAtEvent: string | null, actorId: string | null, name: string | null): ActorKind {
  if (!actorId) return "system";
  if (!name) return "removed";
  switch (roleAtEvent) {
    case "admin": case "moderator": case "staff": return "staff";
    case "helper": return "helper";
    case "customer": return "customer";
    case "system": return "system";
    default: return "customer";
  }
}

/**
 * IS THE LOG ACTUALLY APPEND-ONLY?
 *
 * The page may only make that claim if the database refuses to change
 * the table. This asks the catalogue rather than trusting a migration
 * to have run — which is exactly the check that was missing when the
 * console was ready to print "read-only history" over a table any
 * admin could edit.
 */
async function appendOnlyEnforced(db: ReturnType<typeof createSupabaseServiceClient>) {
  const { data, error } = await db.rpc("audit_log_is_append_only");
  if (error || typeof data !== "boolean") {
    return {
      enforced: false,
      detail: "The console could not establish whether the database refuses changes to this table, so it will not claim that it does.",
    };
  }
  return data
    ? {
        enforced: true,
        detail: "UPDATE and DELETE are revoked for every browser token, and the policy allows select and insert only.",
      }
    : {
        enforced: false,
        detail: "An admin session can still change or remove rows here through the API. Migration 0109 closes that.",
      };
}

export async function getAuditView(opts: {
  window?: string; actor?: string | null; action?: string | null;
  outcome?: string | null; search?: string | null; timezone?: string | null;
  includeReview?: boolean; open?: string | null; correlation?: string | null;
} = {}): Promise<AuditView> {
  const db = createSupabaseServiceClient();

  const since = (() => {
    const days = opts.window === "Last 24 hours" ? 1
      : opts.window === "Last 30 days" ? 30
      : opts.window === "Everything" ? null : 7;
    return days === null ? null : new Date(Date.now() - days * 86400_000).toISOString();
  })();

  let query = db
    .from("audit_log")
    .select("id, actor_id, action, target_table, target_id, payload, ip, user_agent, created_at, outcome, role_at_event, correlation_id, changes")
    /* DETERMINISTIC: events share a second routinely, so the id breaks
       the tie. Without it the same page can come back in two orders. */
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (since) query = query.gte("created_at", since);
  if (opts.correlation) query = query.eq("correlation_id", opts.correlation);

  /*
    CORRECTIONS ARE FETCHED SEPARATELY, not picked out of the page.
    A correction is usually written long after the event it corrects,
    so "Last 7 days" would hide it and the mislabelled row would read
    as fact again.
  */
  const [{ data, error }, lock, { data: correctionRows }] = await Promise.all([
    query,
    appendOnlyEnforced(db),
    db.from("audit_log")
      .select("id, target_id, payload, created_at")
      .eq("action", "audit.correction")
      .order("id", { ascending: false })
      .limit(200),
  ]);

  /* corrected event id -> the event that corrects it */
  const corrections = new Map<number, { id: string; label: string; note: string; at: string }>();
  for (const c of (correctionRows ?? []) as CorrectionDb[]) {
    const targets = Array.isArray(c.payload?.corrects)
      ? (c.payload!.corrects as unknown[]).map(Number)
      : String(c.target_id ?? "").split(",").map((x) => Number(x.trim()));
    for (const t of targets) {
      if (!Number.isFinite(t) || corrections.has(t)) continue;
      corrections.set(t, {
        id: `EV-${String(c.id).padStart(4, "0")}`,
        label: correctionLabel(c.payload),
        note: String(c.payload?.reason ?? "A later event corrects this one."),
        at: at(c.created_at),
      });
    }
  }

  if (error) {
    return {
      sample: false,
      writable: false,
      timezone: `${TZ} (local time)`,
      append_only_enforced: lock.enforced,
      append_only_detail: lock.detail,
      logging_gap: null,
      load_error: error.message,
      counts: { events_in_view: 0, staff_actions: 0, system_events: 0 },
      rows: [],
      total_rows: 0,
      selected: null,
    };
  }

  const events = (data ?? []) as AuditRowDb[];
  const actorIds = Array.from(new Set(events.map((e) => e.actor_id).filter(Boolean) as string[]));
  const people = new Map<string, { full_name: string | null; is_review: boolean }>();
  if (actorIds.length) {
    const { data: profiles } = await db
      .from("profiles").select("id, full_name, is_review_account").in("id", actorIds);
    for (const p of (profiles ?? []) as { id: string; full_name: string | null; is_review_account: boolean | null }[]) {
      people.set(p.id, { full_name: p.full_name, is_review: Boolean(p.is_review_account) });
    }
  }

  const toRow = (e: AuditRowDb): AuditRow => {
    const person = e.actor_id ? people.get(e.actor_id) : undefined;
    const name = e.actor_id
      ? person?.full_name ?? "Removed account"
      : "System";
    return {
      id: `EV-${String(e.id).padStart(4, "0")}`,
      sequence: e.id,
      occurred_at: at(e.created_at),
      occurred_exact: e.created_at,
      actor: {
        id: e.actor_id,
        name,
        kind: actorKind(e.role_at_event, e.actor_id, person?.full_name ?? null),
        /*
          AN UNATTRIBUTED EVENT IS THE SYSTEM, and saying so is not a
          guess: nothing signed it, so nobody did it by hand. A row
          that a correction attributes to a migration says THAT,
          because "customer" beside a migration's work is the exact
          mistake events 13–15 made on this database. Everything else
          written before 0110 simply does not know, and says so.
        */
        role_at_event: e.role_at_event
          ?? (e.actor_id === null ? "System"
            : /migration|self-test/i.test(String(corrections.get(e.id)?.note ?? "")) ? "Migration"
            : "Not recorded"),
        source: e.user_agent?.includes("Helpward") ? "Helpward app"
          : e.user_agent ? "Admin console" : "Server",
      },
      action_code: e.action,
      action: actionLabel(e.action),
      record: recordOf(e.target_table, e.target_id),
      outcome: (e.outcome ?? "succeeded") as EventOutcome,
      correlation_id: e.correlation_id,
      is_review_activity: Boolean(person?.is_review),
      correction: corrections.get(e.id) ?? null,
    };
  };

  let rows = events.map(toRow);
  if (!opts.includeReview) rows = rows.filter((r) => !r.is_review_activity);
  if (opts.outcome && !opts.outcome.startsWith("Outcome")) {
    rows = rows.filter((r) => r.outcome === opts.outcome!.toLowerCase());
  }
  if (opts.actor && !opts.actor.startsWith("Actor")) {
    const want = opts.actor.toLowerCase();
    rows = rows.filter((r) =>
      want.startsWith("staff") ? r.actor.kind === "staff"
      : want.startsWith("customer") ? r.actor.kind === "customer"
      : want.startsWith("helper") ? r.actor.kind === "helper"
      : want.startsWith("system") ? r.actor.kind === "system" : true);
  }
  const search = (opts.search ?? "").trim().toLowerCase();
  if (search) {
    rows = rows.filter((r) =>
      `${r.id} ${r.actor.name} ${r.action} ${r.action_code} ${r.record?.label ?? ""} ${r.correlation_id ?? ""}`
        .toLowerCase().includes(search));
  }

  const openId = opts.open ?? null;
  const selected = openId ? await buildDetail(openId) : null;

  async function buildDetail(ref: string): Promise<AuditDetail | null> {
    const id = Number(ref.replace(/^EV-/i, ""));
    const e = events.find((x) => x.id === id);
    if (!e) return null;
    const row = toRow(e);

    /* A record that has since been deleted is said to be gone, rather
       than linked to a page that will 404. */
    let missing = false;
    if (e.target_table && e.target_id && /^[0-9a-f-]{20,}$/i.test(e.target_id)) {
      const { count } = await db
        .from(e.target_table).select("*", { count: "exact", head: true }).eq("id", e.target_id);
      missing = (count ?? 0) === 0;
    }

    const trail = e.correlation_id
      ? events.filter((x) => x.correlation_id === e.correlation_id)
          .sort((a, b) => a.id - b.id)
          .map((x) => ({
            label: actionLabel(x.action),
            at: at(x.created_at).split(", ").pop() ?? "",
            id: `EV-${String(x.id).padStart(4, "0")}`,
          }))
      : [];

    const found = corrections.get(e.id);
    const correction = found
      ? { id: found.id, note: found.note, at: found.at, label: found.label }
      : null;

    return {
      id: row.id,
      sequence: e.id,
      action_code: e.action,
      action: row.action,
      outcome: row.outcome,
      actor: row.actor,
      occurred_at: row.occurred_at,
      occurred_exact: e.created_at,
      timezone: `${TZ} (local time)`,
      record: row.record ? { ...row.record, missing } : null,
      reason: (e.payload?.reason as string | undefined) ?? null,
      /* Saved with the event. Never a comparison against today's row. */
      changes: (e.changes ?? []).map((c) => ({
        field: c.field, before: c.before ?? null, after: c.after ?? null,
      })),
      related_records: Object.entries(e.payload ?? {})
        .filter(([k, v]) => /_id$/.test(k) && typeof v === "string")
        .map(([k, v]) => {
          const table = k.replace(/_id$/, "") + "s";
          return {
            label: `${PREFIX[table] ?? ""}${String(v).slice(0, 4).toUpperCase()}`,
            href: (ROUTE[table] ?? (() => null))(String(v)),
          };
        }),
      correlation: {
        id: e.correlation_id,
        related_count: trail.length,
        trail,
      },
      technical: [
        ...(e.correlation_id ? [{ label: "Correlation id", value: e.correlation_id }] : []),
        ...(e.ip ? [{ label: "Client IP", value: e.ip }] : []),
        ...(e.user_agent ? [{ label: "User agent", value: e.user_agent }] : []),
        { label: "Event id", value: String(e.id) },
        ...(e.payload && Object.keys(e.payload).length
          ? [{ label: "Payload keys", value: Object.keys(e.payload).join(", ") }] : []),
      ],
      redaction_note:
        "Sensitive values are redacted before an event is written: no passwords, tokens, card numbers or entry codes reach this table.",
      correction,
    };
  }

  /*
    EVENTS WRITTEN BEFORE 0110 DO NOT CARRY A ROLE. That is a gap in
    what the trail can tell you, and saying so is better than letting
    "Not recorded" look like a quiet bug.
  */
  const unrecorded = rows.filter((r) => r.actor.role_at_event === "Not recorded").length;

  return {
    sample: false,
    writable: false,
    timezone: `${TZ} (local time)`,
    append_only_enforced: lock.enforced,
    append_only_detail: lock.detail,
    logging_gap: unrecorded > 0
      ? `${unrecorded} event${unrecorded === 1 ? "" : "s"} in this view predate the change that records an actor's role, so ${unrecorded === 1 ? "it shows" : "they show"} "Not recorded" rather than a guess.`
      : null,
    load_error: null,
    counts: {
      events_in_view: rows.length,
      staff_actions: rows.filter((r) => r.actor.kind === "staff").length,
      system_events: rows.filter((r) => r.actor.kind === "system").length,
    },
    rows: rows.slice(0, 25),
    total_rows: rows.length,
    selected,
  };
}
