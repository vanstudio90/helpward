const KEY = process.env.RESEND_KEY;
const send = async (to) => {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Helpward <hello@helpward.com>", to: [to],
      subject: "Mailbox reachability check",
      text: "Automated check that this mailbox accepts mail. No reply needed.",
    }),
  });
  const b = await r.json();
  return b.id;
};
const ids = {};
for (const a of ["support@helpward.com", "hello@helpward.com"]) {
  ids[a] = await send(a);
  console.log(`  sent to ${a} -> ${ids[a]}`);
}
console.log("\n  waiting for delivery/bounce status...");
await new Promise(r => setTimeout(r, 25000));
for (const [a, id] of Object.entries(ids)) {
  const r = await fetch(`https://api.resend.com/emails/${id}`, { headers: { Authorization: `Bearer ${KEY}` } });
  const b = await r.json();
  console.log(`  ${a.padEnd(24)} last_event = ${b.last_event ?? b.status ?? "unknown"}`);
}
