import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { RETENTION_CATEGORIES } from "@/lib/admin-data-request-states";
import type {
  RequestKind, ExportState, DeletionState, Evidence,
} from "@/lib/admin-data-request-states";

/*
  DATA REQUESTS — TYPES FIRST, DATA LATER.

  WIRED. These read data_export_requests and account_deletion_requests,
  with every displayed state DERIVED rather than printed from the
  stored column — which is the rule the live page got wrong:

    AVAILABILITY IS COMPUTED, NOT STORED. An export row carried
    status "ready" while its link had already expired, so the console
    said READY beside a date in the past. Here the row carries
    `stored_status` and `expires_at`, and `state` is derived from both
    by exportState() — a screen cannot show the stale one because it
    is not given it.

  And three more the brief insists on:

    A GENERATED FILE IS NOT A DELIVERED ONE. file_generated,
    notice_sent and downloaded are three separate facts, each of which
    can be "not recorded" rather than "no".

    SCHEDULED IS NOT DELETED. A deletion carries its steps, and
    "Deleted" is only true when every one of them succeeded; anything
    less is "Partly completed", which is a different and worse state
    than failed because somebody believes they are gone.

    THE CLIENT IP IS NOT A COLUMN. It lives in `technical`, which the
    list never receives.
*/

export type DataRequestRow = {
  id: string;                     // DR-0108
  kind: RequestKind;
  account: { name: string; ref: string; role: "customer" | "helper" };
  /** What the database says. Never rendered directly. */
  stored_status: string;
  state: ExportState | DeletionState;
  /** The one date that matters for this row, already labelled. */
  key_date_label: string;
  key_date: string | null;
  owner: string | null;
  updated_at: string;
};

export type ExportDetail = {
  kind: "export";
  identity_check: { verified: boolean; method: string };
  source: string;
  requested_at: string;
  completed_at: string | null;
  expires_at: string | null;
  delivery: {
    file_generated: Evidence;
    notice_sent: Evidence;
    downloaded: Evidence;
    access_note: string;
  };
  scope: { label: string; included: boolean; note: string | null }[];
  scope_note: string;
};

export type DeletionDetail = {
  kind: "deletion";
  identity_check: { verified: boolean; method: string };
  source: string;
  requested_at: string;
  grace_until: string | null;
  executed_at: string | null;
  /* EVERY STEP, SEPARATELY. Removing the login row says nothing about
     uploaded files or live sessions. */
  steps: { label: string; state: "done" | "pending" | "failed" | "not_run"; detail: string | null }[];
  retention: { label: string; treatment: string; why: string }[];
};

export type DataRequestDetail = {
  id: string;
  /* The row's real id. The display id is DR-368A, which is for reading. */
  uuid: string;
  kind: RequestKind;
  title: string;
  state: ExportState | DeletionState;
  account: { name: string; ref: string; role: "customer" | "helper"; id: string | null };
  /** Exact times carry their zone, because "14:31" is not a time. */
  timezone: string;
  timeline: { label: string; at: string | null; note: string | null }[];
  export_detail: ExportDetail | null;
  deletion_detail: DeletionDetail | null;
  /** Behind restricted access. Never in the list. */
  technical: { label: string; value: string }[];
  privacy_note: string;
  audit: { at: string; actor: string; action: string; detail: string | null }[];
  actions: {
    review_delivery: boolean;
    reissue_blocked_reason: string | null;
    contact_requester: boolean;
    cancel_deletion: boolean;
    destructive_requires_reason: true;
    /*
      WHAT CAN ACTUALLY BE DONE FROM HERE, and when it cannot, why.

      A control that is on when the act would be refused teaches people
      to click and read an error. These are computed from the row's
      real state, so "rebuild" is off while a build is already queued
      and says so, rather than failing at the database.
    */
    retry_export: boolean;
    retry_blocked_reason: string | null;
    mark_failed: boolean;
    cancel_blocked_reason: string | null;
  };
};

type WorkerRunDb = {
  worker: string;
  outcome: "succeeded" | "failed" | "unauthorized" | "misconfigured";
  finished_at: string;
  items_considered: number;
  items_processed: number;
  items_failed: number;
  detail: string | null;
};

export type WorkerHealth = {
  key: string;
  label: string;
  last_success_at: string | null;
  /*
    FIVE STATES, BECAUSE THERE ARE FIVE SITUATIONS.

      healthy        ran, did work, finished.
      idle           ran, the queue was empty, finished. This is the
                     deletion worker's normal night and it must not
                     read as silence.
      failing        ran and could not finish.
      unauthorized   the schedule is firing and we are refusing it —
                     the failure that looks exactly like never having
                     run, which is why it has its own state.
      never_run      no invocation has ever been recorded. Either the
                     schedule does not exist or it has never fired.
  */
  state: "healthy" | "idle" | "failing" | "unauthorized" | "never_run";
  detail: string;
  /** The run this is describing, where one exists. */
  last_run_at: string | null;
};

export type DataRequestsView = {
  sample: boolean;
  /*
    READING IS WIRED; WRITING IS NOT. Every control that would change
    something is disabled on this flag rather than on `sample`, so the
    page can show real records without its buttons quietly becoming
    live. The working editors are still where changes are made.
  */
  writable: boolean;
  /*
    WRITING IS ENABLED ONE CONTROL AT A TIME. `writable` stays false for
    the rest of this screen — export, preview notification, review
    delivery. These three are true because each has a database function
    that checks the admin claim, demands a reason, refuses the states
    where the act would be a lie, and writes its own audit event.
  */
  can: {
    retry_export: boolean;
    cancel_deletion: boolean;
    mark_failed: boolean;
  };
  as_of: string;
  timezone: string;
  load_error: string | null;
  counts: {
    needs_attention: number;
    exports_processing: number;
    exports_available: number;
    deletions_scheduled: number;
    failed: number;
  };
  rows: DataRequestRow[];
  total_rows: number;
  total_requests: number;
  health: WorkerHealth[];
  health_note: string;
  selected: DataRequestDetail | null;
};

/**
 * THE RULE THE LIVE PAGE BROKE. Availability follows the clock, not the
 * column: an export whose link has expired is expired, whatever the
 * stored status says.
 */
export function exportState(storedStatus: string, expiresAt: string | null, now = Date.now()): ExportState {
  if (storedStatus === "failed") return "failed";
  const expired = Boolean(expiresAt && new Date(expiresAt).getTime() < now);
  if (expired) return "expired";
  if (storedStatus === "ready" || storedStatus === "available") return "available";
  if (storedStatus === "delivered") return "delivered";
  if (storedStatus === "processing") return "processing";
  return "requested";
}

/** Deleted only when every step succeeded. Anything less says so. */
export function deletionState(
  steps: { state: "done" | "pending" | "failed" | "not_run" }[],
  stored: string,
  graceUntil: string | null,
  now = Date.now(),
): DeletionState {
  if (stored === "cancelled") return "cancelled";
  if (steps.some((s) => s.state === "failed")) {
    return steps.some((s) => s.state === "done") ? "partial" : "failed";
  }
  if (steps.length > 0 && steps.every((s) => s.state === "done")) return "deleted";
  if (steps.some((s) => s.state === "pending")) return "running";
  const eligible = Boolean(graceUntil && new Date(graceUntil).getTime() <= now);
  return eligible ? "eligible" : "scheduled";
}

/* ------------------------------------------------------------------ */
/* THE REAL QUEUE                                                       */
/* ------------------------------------------------------------------ */

const TZ = "America/Vancouver";

/** A time somebody can act on: the zone is part of the time. */
function when(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function ago(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

type ExportRowDb = {
  id: string; user_id: string; status: string; requested_at: string;
  completed_at: string | null; expires_at: string | null; failure_reason: string | null;
  ip: string | null; user_agent: string | null; archive_size_bytes: number | null;
};
type DeletionRowDb = {
  id: string; user_id: string; status: string; requested_at: string;
  grace_until: string | null; executed_at: string | null; cancelled_at: string | null;
  failure_reason: string | null; reason: string | null; ip: string | null; user_agent: string | null;
};
type Person = { id: string; full_name: string | null; role: string };

/*
  THE DELETION'S STEPS ARE NOT RECORDED ANYWHERE YET.

  The worker removes the account; nothing writes down what happened to
  the uploaded files, the live sessions or the related records. So the
  panel reports the one step the database can evidence and says plainly
  that the rest is unrecorded — rather than drawing four green ticks
  nobody earned, which is the exact failure the brief warns about.
*/
function deletionSteps(row: DeletionRowDb): DeletionDetail["steps"] {
  const done = row.status === "executed";
  return [
    {
      label: "Login account removed",
      state: done ? "done" : row.status === "failed" ? "failed" : "not_run",
      detail: row.executed_at ? `Recorded at ${when(row.executed_at)}` : "No execution recorded.",
    },
    { label: "Uploaded files", state: "not_run",
      detail: "The worker does not record an outcome for this step, so nothing here can say it was done." },
    { label: "Live sessions", state: "not_run",
      detail: "Not recorded separately." },
    { label: "Related records (bookings, messages)", state: "not_run",
      detail: "Not recorded separately. Some of these are kept on purpose — see what is retained." },
  ];
}

export async function getDataRequestsView(opts: {
  tab?: string; role?: string | null; status?: string | null;
  window?: string | null; search?: string | null; open?: string | null;
} = {}): Promise<DataRequestsView> {
  const db = createSupabaseServiceClient();

  const [exportsRes, deletionsRes, runsRes] = await Promise.all([
    db.from("data_export_requests")
      .select("id, user_id, status, requested_at, completed_at, expires_at, failure_reason, ip, user_agent, archive_size_bytes")
      .order("requested_at", { ascending: false }).limit(200),
    db.from("account_deletion_requests")
      .select("id, user_id, status, requested_at, grace_until, executed_at, cancelled_at, failure_reason, reason, ip, user_agent")
      .order("requested_at", { ascending: false }).limit(200),
    /* Newest first, so the first row for a worker IS its last run. */
    db.from("worker_runs")
      .select("worker, outcome, finished_at, items_considered, items_processed, items_failed, detail")
      .in("worker", ["exports", "deletions"])
      .order("id", { ascending: false }).limit(50),
  ]);
  const runs = (runsRes.data ?? []) as WorkerRunDb[];

  /* A failed read is reported as a failed read. Never as an empty queue. */
  const loadError = exportsRes.error?.message ?? deletionsRes.error?.message ?? null;
  const exports = (exportsRes.data ?? []) as ExportRowDb[];
  const deletions = (deletionsRes.data ?? []) as DeletionRowDb[];

  const ids = Array.from(new Set([...exports, ...deletions].map((r) => r.user_id).filter(Boolean)));
  const people = new Map<string, Person>();
  if (ids.length) {
    const { data } = await db.from("profiles").select("id, full_name, role").in("id", ids);
    for (const p of (data ?? []) as Person[]) people.set(p.id, p);
  }

  const who = (userId: string) => {
    const p = people.get(userId);
    const role = (p?.role === "helper" ? "helper" : "customer") as "customer" | "helper";
    return {
      name: p?.full_name ?? "Removed account",
      ref: `${role === "helper" ? "HP-" : "CU-"}${userId.slice(0, 4).toUpperCase()}`,
      role,
    };
  };

  const exportRows: DataRequestRow[] = exports.map((r) => {
    const state = exportState(r.status, r.expires_at);
    const keyDate =
      state === "expired" ? { label: "Expired", at: r.expires_at }
      : state === "available" ? { label: "Link expires", at: r.expires_at }
      : state === "failed" ? { label: "Failed", at: r.completed_at ?? r.requested_at }
      : { label: "Requested", at: r.requested_at };
    return {
      id: `DR-${r.id.slice(0, 4).toUpperCase()}`,
      kind: "export" as RequestKind,
      account: who(r.user_id),
      stored_status: r.status,
      state,
      key_date_label: keyDate.label,
      key_date: when(keyDate.at),
      owner: "System",
      updated_at: ago(r.completed_at ?? r.requested_at),
    };
  });

  const deletionRows: DataRequestRow[] = deletions.map((r) => {
    const state = deletionState(deletionSteps(r), r.status, r.grace_until);
    const keyDate =
      state === "deleted" ? { label: "Deleted", at: r.executed_at }
      : state === "cancelled" ? { label: "Cancelled", at: r.cancelled_at }
      : state === "failed" ? { label: "Failed", at: r.executed_at ?? r.requested_at }
      : { label: "Eligible", at: r.grace_until };
    return {
      id: `DR-${r.id.slice(0, 4).toUpperCase()}`,
      kind: "deletion" as RequestKind,
      account: who(r.user_id),
      stored_status: r.status,
      state,
      key_date_label: keyDate.label,
      key_date: when(keyDate.at),
      owner: "System",
      updated_at: ago(r.cancelled_at ?? r.executed_at ?? r.requested_at),
    };
  });

  const tab = opts.tab ?? "all";
  const search = (opts.search ?? "").trim().toLowerCase();
  let rows = [...exportRows, ...deletionRows];
  if (tab === "exports") rows = rows.filter((r) => r.kind === "export");
  if (tab === "deletions") rows = rows.filter((r) => r.kind === "deletion");
  if (tab === "attention") {
    rows = rows.filter((r) => r.state === "failed" || r.state === "expired" || r.state === "partial");
  }
  if (tab === "history") rows = rows.filter((r) => ["deleted", "cancelled", "expired"].includes(r.state));
  if (opts.role && opts.role !== "All") {
    rows = rows.filter((r) => r.account.role === opts.role!.toLowerCase());
  }
  if (search) {
    rows = rows.filter((r) =>
      `${r.id} ${r.account.name} ${r.account.ref}`.toLowerCase().includes(search));
  }

  const counts = {
    needs_attention: [...exportRows, ...deletionRows].filter(
      (r) => r.state === "failed" || r.state === "expired" || r.state === "partial").length,
    exports_processing: exportRows.filter((r) => r.state === "processing" || r.state === "requested").length,
    exports_available: exportRows.filter((r) => r.state === "available").length,
    deletions_scheduled: deletionRows.filter((r) => r.state === "scheduled" || r.state === "eligible").length,
    failed: [...exportRows, ...deletionRows].filter((r) => r.state === "failed").length,
  };

  /*
    WORKER HEALTH IS READ FROM THE RUN LOG, NOT INFERRED FROM ITS WORK.

    This used to date each worker by the newest thing it had finished,
    which cannot answer the question being asked. With no deletion ever
    requested, a worker that has run cleanly every night and a cron that
    was never registered produced the same screen: "never run". Since
    0112 each invocation writes a row — including the empty ones, the
    refused ones and the misconfigured ones — so the three are now told
    apart by evidence rather than by assumption.

    Events before 0112 were never recorded, so a worker with no rows is
    reported as having no RECORD of a run, which is the true statement,
    rather than as never having run.
  */
  const runOf = (worker: string) =>
    (runs ?? []).find((r) => r.worker === worker) ?? null;

  const healthFor = (
    key: string, label: string, schedule: string, lastWork: string | null,
  ): WorkerHealth => {
    const run = runOf(key);
    if (!run) {
      return {
        key, label,
        last_success_at: when(lastWork),
        last_run_at: null,
        state: "never_run",
        detail: `${schedule} No run has been recorded${
          lastWork ? ", though work it completed earlier is dated beside this" : ""
        }. Runs have only been recorded since this was deployed, so a worker that last ran before then shows nothing here.`,
      };
    }
    const at = when(run.finished_at);
    const base = `${schedule} Last run ${at}`;
    switch (run.outcome) {
      case "unauthorized":
        return {
          key, label, last_success_at: when(lastWork), last_run_at: at,
          state: "unauthorized",
          detail: `${base}: the request was refused. The schedule is reaching this route and the secret does not match, so no work is being done.`,
        };
      case "misconfigured":
        return {
          key, label, last_success_at: when(lastWork), last_run_at: at,
          state: "failing",
          detail: `${base}: it could not start. ${run.detail ?? "Configuration is missing."}`,
        };
      case "failed":
        return {
          key, label, last_success_at: when(lastWork), last_run_at: at,
          state: "failing",
          detail: `${base} and failed. ${run.detail ?? ""}`.trim(),
        };
      default:
        return {
          key, label, last_success_at: when(lastWork), last_run_at: at,
          state: run.items_processed > 0 ? "healthy" : "idle",
          detail: run.items_processed > 0
            ? `${base}. ${run.detail ?? ""}`.trim()
            : `${base} with nothing to do — it woke, checked and found an empty queue. That is this worker's normal state, not a silence.`,
        };
    }
  };

  const lastExport = exports.find((r) => r.completed_at)?.completed_at ?? null;
  const lastDeletion = deletions.find((r) => r.executed_at)?.executed_at ?? null;
  const health: WorkerHealth[] = [
    healthFor("exports", "Export worker", "Runs every 30 minutes.", lastExport),
    healthFor("deletions", "Deletion worker", "Runs daily at 05:00 UTC.", lastDeletion),
    ...(counts.failed > 0 ? [{
      key: "failures", label: "Failed requests",
      last_success_at: null,
      state: "failing" as const,
      last_run_at: null,
      detail: `${counts.failed} request${counts.failed === 1 ? "" : "s"} failed and ${counts.failed === 1 ? "has" : "have"} not been retried.`,
    }] : []),
  ];

  const openId = opts.open ?? null;
  const selected = openId ? buildDetail(openId) : null;

  function buildDetail(ref: string): DataRequestDetail | null {
    const key = ref.replace(/^DR-/i, "").toLowerCase();
    const exportRow = exports.find((r) => r.id.toLowerCase().startsWith(key));
    const deletionRow = deletions.find((r) => r.id.toLowerCase().startsWith(key));
    const row = exportRow ?? deletionRow;
    if (!row) return null;

    const account = who(row.user_id);
    const technical = [
      ...(row.ip ? [{ label: "Client IP at request", value: row.ip }] : []),
      ...(row.user_agent ? [{ label: "User agent", value: row.user_agent }] : []),
      { label: "Record id", value: row.id },
    ];

    if (exportRow) {
      const state = exportState(exportRow.status, exportRow.expires_at);
      return {
        id: `DR-${exportRow.id.slice(0, 4).toUpperCase()}`,
        uuid: exportRow.id,
        kind: "export",
        title: "Data export",
        state,
        account: { ...account, id: exportRow.user_id },
        timezone: `${TZ} (local time)`,
        timeline: [
          { label: "Requested", at: when(exportRow.requested_at), note: null },
          { label: "File generated", at: when(exportRow.completed_at),
            note: exportRow.completed_at ? null : "No completion recorded." },
          { label: "Notice sent", at: null,
            note: "Delivery of the notice is not recorded, so this cannot be shown as sent." },
          { label: "Downloaded", at: null,
            note: "No download is recorded. That is not the same as nobody having downloaded it." },
        ],
        export_detail: {
          kind: "export",
          identity_check: { verified: true, method: "Authenticated account request" },
          source: exportRow.user_agent?.includes("Helpward") ? "Helpward app" : "Website",
          requested_at: when(exportRow.requested_at) ?? "—",
          completed_at: when(exportRow.completed_at),
          expires_at: when(exportRow.expires_at),
          delivery: {
            file_generated: exportRow.completed_at ? "yes" : "no",
            /* Neither of these is written down anywhere, so neither is claimed. */
            notice_sent: "not_recorded",
            downloaded: "not_recorded",
            access_note:
              "The archive is private and reachable only by the verified requester. There is no permanent public URL.",
          },
          scope: [
            { label: "Profile", included: true, note: null },
            { label: "Booking history", included: true, note: "Their side of each booking." },
            { label: "Messages involving this account", included: true, note: null },
            { label: "Uploaded content", included: true, note: null },
            { label: "Other people's personal data", included: false, note: "Filtered out." },
            { label: "Payment secrets and passwords", included: false, note: "Never exported." },
          ],
          scope_note: "An export is what this account is entitled to, not everything the record touches.",
        },
        deletion_detail: null,
        technical,
        privacy_note:
          "No passwords or payment secrets are in the archive. The requester's IP is kept for security and is not shown in the list.",
        audit: [
          ...(exportRow.failure_reason
            ? [{ at: when(exportRow.completed_at ?? exportRow.requested_at) ?? "—", actor: "System",
                 action: "Failed", detail: exportRow.failure_reason }]
            : []),
          { at: when(exportRow.requested_at) ?? "—", actor: account.name, action: "Requested", detail: null },
        ],
        actions: {
          review_delivery: state === "available" || state === "expired",
          reissue_blocked_reason: null,
          contact_requester: true,
          cancel_deletion: false,
          destructive_requires_reason: true,
          /* Two builds of the same export race to write one row and
             orphan the loser's file, so a queued one cannot be requeued. */
          retry_export: !["pending", "processing"].includes(exportRow.status),
          retry_blocked_reason: ["pending", "processing"].includes(exportRow.status)
            ? `This export is already ${exportRow.status}. The worker runs every 30 minutes; a second build would race the first.`
            : null,
          mark_failed: ["pending", "processing"].includes(exportRow.status),
          cancel_blocked_reason: null,
        },
      };
    }

    const d = deletionRow!;
    const steps = deletionSteps(d);
    return {
      id: `DR-${d.id.slice(0, 4).toUpperCase()}`,
      uuid: d.id,
      kind: "deletion",
      title: "Account deletion",
      state: deletionState(steps, d.status, d.grace_until),
      account: { ...account, id: d.user_id },
      timezone: `${TZ} (local time)`,
      timeline: [
        { label: "Requested", at: when(d.requested_at), note: d.reason },
        { label: "Eligible", at: when(d.grace_until),
          note: "The grace period ends here. Eligible is not deleted." },
        { label: "Executed", at: when(d.executed_at),
          note: d.executed_at ? null : "The deletion has not been carried out." },
        ...(d.cancelled_at ? [{ label: "Cancelled", at: when(d.cancelled_at), note: null }] : []),
      ],
      export_detail: null,
      deletion_detail: {
        kind: "deletion",
        identity_check: { verified: true, method: "Authenticated account request" },
        source: d.user_agent?.includes("Helpward") ? "Helpward app" : "Website",
        requested_at: when(d.requested_at) ?? "—",
        grace_until: when(d.grace_until),
        executed_at: when(d.executed_at),
        steps,
        retention: RETENTION_CATEGORIES.map((c) => ({ ...c })),
      },
      technical,
      privacy_note:
        "The requester's IP is kept for security and is not shown in the list. What survives a deletion is listed above.",
      audit: [
        ...(d.cancelled_at ? [{ at: when(d.cancelled_at) ?? "—", actor: account.name, action: "Cancelled", detail: null }] : []),
        ...(d.failure_reason ? [{ at: when(d.executed_at ?? d.requested_at) ?? "—", actor: "System", action: "Failed", detail: d.failure_reason }] : []),
        { at: when(d.requested_at) ?? "—", actor: account.name, action: "Requested", detail: d.reason },
      ],
      actions: {
        review_delivery: false,
        reissue_blocked_reason: "This is a deletion. There is nothing to reissue.",
        contact_requester: true,
        cancel_deletion: d.status === "pending",
        destructive_requires_reason: true,
        retry_export: false,
        retry_blocked_reason: "This is a deletion. There is nothing to rebuild.",
        mark_failed: false,
        /*
          THE REASON IT CANNOT BE STOPPED IS THE USEFUL PART. "Already
          deleted" and "the worker is doing it right now" call for
          different responses, and neither is "try again".
        */
        cancel_blocked_reason: d.status === "pending" ? null
          : d.status === "executed" ? "This account has already been deleted. There is nothing to cancel."
          : d.status === "executing" ? "The worker is carrying this out right now."
          : d.status === "cancelled" ? "This deletion was already cancelled."
          : "This deletion failed. Look at what it did before doing anything else.",
      },
    };
  }

  return {
    sample: false,
    writable: false,
    can: { retry_export: true, cancel_deletion: true, mark_failed: true },
    as_of: new Date().toISOString(),
    timezone: `${TZ} (local time)`,
    load_error: loadError,
    counts,
    rows: rows.slice(0, 20),
    total_rows: rows.length,
    total_requests: exports.length + deletions.length,
    health,
    health_note:
      "Each line is the worker's last recorded run, not the last thing it produced — a run that found an empty queue is reported as a run. Runs have only been recorded since migration 0112, so a worker with none shows no record rather than a claim that it never ran. Eligible for deletion still does not mean deleted.",
    selected,
  };
}
