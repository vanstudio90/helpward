/*
 * WHICH PROJECT AM I ABOUT TO CHANGE.
 *
 * One identity check, shared by every script that can touch production.
 * It exists because the first version of this logic lived inside
 * migrate.mjs and had a hole an audit walked straight through:
 *
 *   --production skips the dotenv files on purpose, so
 *   REHEARSAL_DATABASE_URL is usually ABSENT in that mode — which meant
 *   the "is this the rehearsal project?" comparison had nothing to
 *   compare against and silently passed. Pointing --production at the
 *   rehearsal URI reached the connection attempt.
 *
 * Two rules follow from that, and both are implemented here:
 *
 *   1. The expected production project is stated EXPLICITLY, by the
 *      operator, as HELPWARD_PRODUCTION_REF. A target is correct because
 *      it matches what was declared, not because it failed to match
 *      something that happened to be in the environment.
 *
 *   2. The rehearsal ref is read from the .env.rehearsal FILE, not from
 *      the environment, so it is known whether or not that variable was
 *      exported.
 *
 * Never returns or prints a password or a key — only project refs and
 * hosts.
 */

import fs from "node:fs";
import path from "node:path";

/** The project ref in a Supabase session-pooler URI (user `postgres.<ref>`). */
export function refFromPostgresUri(uri) {
  try {
    const u = new URL(uri);
    const user = decodeURIComponent(u.username);
    return {
      ref: /^postgres\.(.+)$/.exec(user)?.[1] ?? null,
      host: u.host,
      port: u.port || "5432",
    };
  } catch {
    return { ref: null, host: null, port: null };
  }
}

/** The project ref in a Supabase REST URL (https://<ref>.supabase.co). */
export function refFromRestUrl(url) {
  return /^https:\/\/([a-z0-9]{16,})\.supabase\./.exec(String(url ?? ""))?.[1] ?? null;
}

/**
 * The project ref inside a legacy Supabase JWT key.
 *
 * Newer `sb_secret_…` / `sb_publishable_…` keys are opaque, so this
 * returns null for them. Callers must say "could not verify" rather than
 * "verified" in that case — an unverifiable check is not a passing one.
 */
export function refFromKey(key) {
  const parts = String(key ?? "").split(".");
  if (parts.length !== 3) return null;
  try {
    const body = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof body.ref === "string" ? body.ref : null;
  } catch {
    return null;
  }
}

/** Read one variable straight out of a dotenv file, ignoring the environment. */
export function fromEnvFile(file, key) {
  try {
    const txt = fs.readFileSync(path.resolve(file), "utf8");
    const re = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "m");
    const raw = re.exec(txt)?.[1];
    return raw ? raw.trim().replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

/**
 * Every project ref this machine knows to be NON-production, read from
 * files so it is known regardless of what is exported.
 */
export function knownNonProductionRefs() {
  const refs = new Set();
  // ONLY .env.rehearsal. On this machine .env.local holds the PRODUCTION
  // project, so including it here would make the module refuse the real
  // target as "a rehearsal project" — a guard that blocks the correct
  // action, which is its own kind of broken.
  for (const file of [".env.rehearsal"]) {
    const pg = fromEnvFile(file, "REHEARSAL_DATABASE_URL") ?? fromEnvFile(file, "DATABASE_URL");
    const r1 = pg ? refFromPostgresUri(pg).ref : null;
    if (r1) refs.add(r1);
    const rest = fromEnvFile(file, "NEXT_PUBLIC_SUPABASE_URL") ?? fromEnvFile(file, "SUPABASE_URL");
    const r2 = refFromRestUrl(rest);
    if (r2) refs.add(r2);
  }
  return refs;
}

export class TargetError extends Error {}

/**
 * Assert that a production target is the declared one.
 *
 * `observed` is a list of { label, ref } drawn from whatever this script
 * is about to use — the SQL URI, the REST URL, the service key. Every ref
 * that could be determined must equal HELPWARD_PRODUCTION_REF; any that
 * could not is reported as unverified rather than accepted.
 *
 * Throws TargetError with an operator-readable message. Returns a short
 * report to print.
 */
export function assertProductionTarget(observed, opts = {}) {
  const expected = (opts.expectedRef ?? process.env.HELPWARD_PRODUCTION_REF ?? "").trim();
  if (!expected) {
    throw new TargetError(
      "HELPWARD_PRODUCTION_REF is not set.\n" +
      "  Production mode requires the expected project ref to be stated explicitly —\n" +
      "  a target is correct because it matches what you declared, not because it\n" +
      "  failed to match something that happened to be in the environment.\n" +
      "  Find it in the Supabase project URL: https://<ref>.supabase.co",
    );
  }

  const nonProd = knownNonProductionRefs();
  if (nonProd.has(expected)) {
    throw new TargetError(
      `HELPWARD_PRODUCTION_REF is "${expected}", which this machine's env files\n` +
      "  name as a rehearsal/development project. Refusing.",
    );
  }

  const lines = [];
  const unverified = [];
  for (const { label, ref } of observed) {
    if (ref == null) { unverified.push(label); continue; }
    if (nonProd.has(ref)) {
      throw new TargetError(
        `The ${label} points at project "${ref}", which this machine's env files\n` +
        "  name as a rehearsal/development project. Refusing before connecting.",
      );
    }
    if (ref !== expected) {
      throw new TargetError(
        `The ${label} points at project "${ref}", but HELPWARD_PRODUCTION_REF is\n` +
        `  "${expected}". Refusing before connecting — one of them is wrong.`,
      );
    }
    lines.push(`${label}: ${ref}`);
  }

  if (observed.length > 0 && lines.length === 0) {
    throw new TargetError(
      "Could not determine the project for any of: " +
      observed.map((o) => o.label).join(", ") +
      "\n  Refusing: an unverifiable target is not a verified one.",
    );
  }

  return { expected, verified: lines, unverified };
}
