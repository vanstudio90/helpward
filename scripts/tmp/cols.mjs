import pg from "pg";
const db=new pg.Client({connectionString:process.env.PRODUCTION_DATABASE_URL,ssl:{rejectUnauthorized:false}});
await db.connect();
console.log("=== provider_profiles stripe columns ===");
console.table((await db.query(`select column_name, data_type, is_nullable
  from information_schema.columns where table_name='provider_profiles'
    and column_name like 'stripe%' order by 1`)).rows);
console.log("=== try the exact update the code performs (rolled back) ===");
await db.query("begin");
try {
  const r = await db.query(`update provider_profiles set
      stripe_connect_account_id=null, stripe_details_submitted=false,
      stripe_transfers_active=false, stripe_requirements_due=null,
      stripe_disabled_reason=null
    where user_id=(select id from auth.users where email='rodolfbugaci1205@gmail.com')`);
  console.log("  rows updated:", r.rowCount, "-> the update itself is fine");
} catch (e) { console.log("  FAILED:", e.message, "| code", e.code); }
await db.query("rollback");
await db.end();
