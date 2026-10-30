#!/usr/bin/env node
/*
 * Swap one service's catalogue photo.
 *
 *   node scripts/set-service-image.mjs <service-id> <image-url> [--apply]
 *
 * Without --apply it only reports what WOULD change. With it, the row is
 * updated — after checking the URL actually serves an image, because a
 * 404 in this column shows a customer a grey box where a service should
 * be and nothing else in the system will notice.
 *
 * Reads .env.rehearsal by default; pass --env .env.local for production.
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const envIdx = args.indexOf("--env");
const envFile = envIdx === -1 ? ".env.rehearsal" : args[envIdx + 1];
const positional = args.filter((a, i) =>
  !a.startsWith("--") && (envIdx === -1 || (i !== envIdx + 1)));
const [serviceId, imageUrl] = positional;

if (!serviceId || !imageUrl) {
  console.error("usage: set-service-image.mjs <service-id> <image-url> [--apply] [--env FILE]");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envFile, "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error(`${envFile} has no Supabase URL / service-role key`);

const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

// The service has to exist and be one we actually sell.
const existing = await (await fetch(
  `${url}/rest/v1/services?id=eq.${serviceId}&select=id,title,image_url,active`, { headers }
)).json();
if (!existing.length) throw new Error(`No service "${serviceId}"`);
const svc = existing[0];

// An image_url that 404s is a grey box on the busiest screen in the app.
const probe = await fetch(imageUrl, { method: "GET", headers: { range: "bytes=0-2047" } });
const type = probe.headers.get("content-type") ?? "";
if (!probe.ok || !type.startsWith("image/")) {
  throw new Error(`That URL did not serve an image (status ${probe.status}, type "${type}")`);
}

console.log(`service : ${svc.title} (${svc.id})${svc.active ? "" : "  [INACTIVE]"}`);
console.log(`from    : ${svc.image_url ?? "(none)"}`);
console.log(`to      : ${imageUrl}`);
console.log(`checked : ${probe.status} ${type}`);

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write it.");
  process.exit(0);
}

const res = await fetch(`${url}/rest/v1/services?id=eq.${serviceId}`, {
  method: "PATCH", headers: { ...headers, prefer: "return=representation" },
  body: JSON.stringify({ image_url: imageUrl }),
});
if (!res.ok) throw new Error(`Update failed: ${res.status} ${await res.text()}`);
console.log("\nUpdated.");
