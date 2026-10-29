import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n")
  .filter(l=>l.includes("=")&&!l.startsWith("#"))
  .map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim().replace(/^["']|["']$/g,"")]));
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const SELECT = "*, category:service_categories(*), country_pricing:service_country_pricing(country, base_price_cents, extra_block_cents)";
const { data, error } = await anon.from("services").select(SELECT).eq("active", true).limit(2);
console.log("  services embed:", error ? `ERROR ${error.code}: ${error.message}` : `${data.length} rows OK`);
if (data?.[0]) console.log("    country_pricing rows on first service:", data[0].country_pricing?.length ?? "none");

// The pricing rules loader
const r2 = await anon.from("service_pricing").select("*").limit(1);
console.log("  service_pricing:", r2.error ? `ERROR: ${r2.error.message}` : "OK");

// profile_contacts embed added to the admin users page
const r3 = await anon.from("profiles").select("id, profile_contacts(phone)").limit(1);
console.log("  profiles+contacts embed:", r3.error ? `ERROR ${r3.error.code}: ${r3.error.message}` : "OK");
