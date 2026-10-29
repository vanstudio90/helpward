import net from "node:net";
// Ask Google's MX whether these mailboxes exist, without sending anything.
function probe(addr) {
  return new Promise((res) => {
    const s = net.createConnection(25, "smtp.google.com");
    let step = 0, out = [];
    const steps = ["EHLO helpward.com", "MAIL FROM:<probe@helpward.com>", `RCPT TO:<${addr}>`, "QUIT"];
    s.setTimeout(15000, () => { s.destroy(); res({ addr, result: "timeout (port 25 likely blocked)" }); });
    s.on("data", (d) => {
      const line = d.toString().trim();
      out.push(line);
      if (step === 3) { s.end(); return res({ addr, result: out[out.length - 2] ?? line }); }
      s.write(steps[step++] + "\r\n");
    });
    s.on("error", (e) => res({ addr, result: "connect error: " + e.message }));
  });
}
for (const a of ["support@helpward.com", "hello@helpward.com"]) {
  const r = await probe(a);
  console.log(`  ${r.addr.padEnd(24)} ${r.result}`);
}
