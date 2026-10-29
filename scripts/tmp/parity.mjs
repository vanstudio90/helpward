import pg from "pg";
const db=new pg.Client({connectionString:process.env.PRODUCTION_DATABASE_URL,ssl:{rejectUnauthorized:false}});
await db.connect();
const charged=async(svc,country)=>Number((await db.query(
  `select price_service_cents($1,$2::jsonb) c`,[svc,JSON.stringify({_country:country})])).rows[0].c);
const money=c=>(c/100).toFixed(2);

const fetchText=async u=>{const r=await fetch(u);const s=await r.text();
  return s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g,"").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ");};

const out=[];
const services=(await db.query(`select id from services where active order by id`)).rows.map(r=>r.id);

// 1. Static service page must show BOTH markets' prices.
for (const id of services.slice(0,8)) {
  const us=await charged(id,"US"), ca=await charged(id,"CA");
  const t=await fetchText(`https://helpward.com/services/${id}`);
  const okUS=t.includes(`US$${money(us)}`)||t.includes(`US$${(us/100).toFixed(0)}`);
  const okCA=t.includes(`CA$${money(ca)}`)||t.includes(`CA$${(ca/100).toFixed(0)}`);
  out.push({page:`/services/${id}`,charged:`US${money(us)}/CA${money(ca)}`,
            shown:(okUS&&okCA)?"both":okUS?"US only":okCA?"CA only":"NEITHER",
            pass:(okUS&&okCA)?"PASS":"FAIL"});
}
// 2. City pages must show THEIR market's price only.
for (const [city,cc] of [["san-diego","US"],["vancouver","CA"]]) {
  for (const id of ["dog-walking","wait-in-line","moving-help"]) {
    const c=await charged(id,cc);
    const t=await fetchText(`https://helpward.com/cities/${city}/${id}`);
    const sym=cc==="CA"?"CA$":"US$";
    const ok=t.includes(`${sym}${money(c)}`)||t.includes(`${sym}${(c/100).toFixed(0)}`);
    out.push({page:`/cities/${city}/${id}`,charged:`${sym}${money(c)}`,
              shown:ok?"matches":"MISMATCH",pass:ok?"PASS":"FAIL"});
  }
}
console.table(out);
console.log(out.every(x=>x.pass==="PASS")?"ALL PASS":`${out.filter(x=>x.pass==="FAIL").length} FAIL`);
await db.end();
