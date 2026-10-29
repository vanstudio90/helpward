import { SUBJECT, TEXT, HTML } from "./email.mjs";
const r = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.RESEND_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    from: "Helpward <support@helpward.com>", reply_to: "support@helpward.com",
    to: ["rodolfbugaci1205@gmail.com"],
    subject: "[FINAL TEST] " + SUBJECT, html: HTML, text: TEXT,
    headers: { "List-Unsubscribe": "<mailto:support@helpward.com?subject=unsubscribe>" },
  }),
});
console.log("  status:", r.status, JSON.stringify(await r.json()));
