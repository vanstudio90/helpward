import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter(l=>l.includes("=")&&!l.startsWith("#"))
  .map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim().replace(/^["']|["']$/g,"")]));
const adm = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  {auth:{autoRefreshToken:false,persistSession:false}});
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const ref = env.NEXT_PUBLIC_SUPABASE_URL.split("//")[1].split(".")[0];

const made = [];
async function probe(role) {
  const email = `repro-${role}-${Date.now()}@helpward.com`, password = "Throwaway!2345";
  const { data: c, error: ce } = await adm.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: "Repro", role, country: "CA" },
  });
  if (ce) { console.log(`  create ${role}: ${ce.message}`); return; }
  made.push(c.user.id);
  const { data: s, error: se } = await anon.auth.signInWithPassword({ email, password });
  if (se) { console.log(`  signin ${role}: ${se.message}`); return; }

  // The cookie @supabase/ssr reads.
  const payload = Buffer.from(JSON.stringify({
    access_token: s.session.access_token, refresh_token: s.session.refresh_token,
    expires_at: s.session.expires_at, expires_in: s.session.expires_in,
    token_type: "bearer", user: s.session.user,
  })).toString("base64");
  const cookie = `sb-${ref}-auth-token=base64-${payload}`;

  const pages = role === "provider"
    ? ["/provider/dashboard", "/provider/menu", "/provider/active", "/provider/earnings"]
    : ["/dashboard", "/settings", "/new-request", "/bookings"];
  for (const p of pages) {
    const r = await fetch(`https://helpward.com${p}`, { headers: { cookie }, redirect: "manual" });
    const body = r.status === 200 ? await r.text() : "";
    const broke = body.includes("Something went wrong");
    console.log(`  ${role.padEnd(8)} ${p.padEnd(22)} ${r.status}${broke ? "  <-- ERROR BOUNDARY" : ""}`);
  }
}
await probe("provider");
await probe("customer");
for (const id of made) await adm.auth.admin.deleteUser(id);
console.log(`\n  cleaned up ${made.length} probe accounts`);
