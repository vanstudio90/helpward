import pg from "pg";
const db=new pg.Client({connectionString:process.env.PRODUCTION_DATABASE_URL,ssl:{rejectUnauthorized:false}});
await db.connect();
const r=await db.query(`select u.email, pp.stripe_connect_account_id acct,
  pp.stripe_details_submitted sub, pp.stripe_transfers_active act, pp.stripe_disabled_reason dis,
  p.country profile_country
  from provider_profiles pp join auth.users u on u.id=pp.user_id
  join profiles p on p.id=pp.user_id
  where u.email='rodolfbugaci1205@gmail.com'`);
console.log(JSON.stringify(r.rows[0],null,1));
await db.end();
