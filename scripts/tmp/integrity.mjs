import pg from "pg";
const db=new pg.Client({connectionString:process.env.PRODUCTION_DATABASE_URL,ssl:{rejectUnauthorized:false}});
await db.connect();
const q=async s=>(await db.query(s)).rows;
const out=[]; const t=(n,g,w)=>out.push({check:n,got:String(g),want:String(w),pass:String(g)===String(w)?"PASS":"FAIL"});

// Catalogue
t("active services", (await q(`select count(*) n from services where active`))[0].n, "26");
t("active services missing a local price",
  (await q(`select count(*) n from services s where s.active and (
     not exists (select 1 from service_country_pricing c where c.service_id=s.id and c.country='US') or
     not exists (select 1 from service_country_pricing c where c.service_id=s.id and c.country='CA'))`))[0].n, "0");
t("CA ever priced below US",
  (await q(`select count(*) n from service_country_pricing u join service_country_pricing c
            on c.service_id=u.service_id and c.country='CA'
            where u.country='US' and c.base_price_cents < u.base_price_cents`))[0].n, "0");
t("professional-cuddler inactive",
  (await q(`select active from services where id='professional-cuddler'`))[0].active, "false");
t("motorcycle-taxi active", (await q(`select active from services where id='motorcycle-taxi'`))[0].active, "true");
t("motorcycle-taxi off the $12 fare",
  (await q(`select base_price_cents from services where id='motorcycle-taxi'`))[0].base_price_cents, "2500");

// Security invariants set today
t("TRUNCATE granted to client roles (app tables)",
  (await q(`select count(*) n from information_schema.role_table_grants g
            join pg_class c on c.relname=g.table_name
            join pg_namespace ns on ns.oid=c.relnamespace and ns.nspname='public'
            where g.grantee in ('anon','authenticated') and g.privilege_type='TRUNCATE'
              and pg_get_userbyid(c.relowner)='postgres'`))[0].n, "0");
t("provider_cities write policies", (await q(`select count(*) n from pg_policies
   where tablename='provider_cities' and cmd<>'SELECT'`))[0].n, "0");
t("schema_migrations readable by clients",
  (await q(`select count(*) n from information_schema.role_table_grants
            where table_name='schema_migrations' and grantee in ('anon','authenticated')
              and privilege_type='SELECT'`))[0].n, "0");

// Live data that must not have been disturbed
t("helper profiles", (await q(`select count(*) n from provider_profiles`))[0].n, "31");
t("bookings", (await q(`select count(*) n from bookings`))[0].n, "0");
t("admins", (await q(`select count(*) n from profiles where role='admin'`))[0].n, "1");

console.table(out);
console.log(out.every(x=>x.pass==="PASS")?"ALL PASS":`${out.filter(x=>x.pass==="FAIL").length} FAIL`);
await db.end();
