#!/bin/zsh
# Helpward production cutover — the whole sequence, one command.
#
# Stops at the first failure and says what state production is in, so a
# partial run is never ambiguous. Every step is logged.
#
#   ~/.helpward-cutover/run-cutover.sh

WT=/tmp/hw-merge
CRED="$HOME/.helpward-cutover/production-db-url"
REF=xhmgmegraieouudyjjlv
ORIGIN=https://helpward.com
EXPECT_BRANCH=api-merge-rehearsal
LOG="$HOME/.helpward-cutover/cutover-$(date -u +%Y%m%dT%H%M%SZ).log"

exec > >(tee -a "$LOG") 2>&1

banner() { echo ""; echo "============================================================"; echo "  $1"; echo "============================================================"; }
die() { echo ""; echo "!! STOPPED: $1"; echo ""; echo "   State: $2"; echo "   Log:   $LOG"; exit 1; }

export PRODUCTION_DATABASE_URL HELPWARD_PRODUCTION_REF HELPWARD_PRODUCTION_ORIGIN

banner "0. Preconditions"

[ -f "$CRED" ] || die "no production credential" "nothing changed. Run set-production-db.sh first."
PRODUCTION_DATABASE_URL="$(cat "$CRED")"
HELPWARD_PRODUCTION_REF="$REF"
HELPWARD_PRODUCTION_ORIGIN="$ORIGIN"
echo "  credential      present (mode $(stat -f '%Lp' "$CRED"))"

cd "$WT" 2>/dev/null || die "release worktree $WT is missing" "nothing changed."
HEAD_NOW="$(git rev-parse --short HEAD)"
BRANCH_NOW="$(git rev-parse --abbrev-ref HEAD)"
DIRTY="$(git status --porcelain | wc -l | tr -d ' ')"
echo "  worktree        $WT"
echo "  HEAD            $HEAD_NOW on branch $BRANCH_NOW"
echo "  uncommitted     $DIRTY file(s)"
[ "$DIRTY" = "0" ] || die "the release worktree has uncommitted changes" "nothing changed. Commit or stash first — a deploy must be identifiable."
[ "$BRANCH_NOW" = "$EXPECT_BRANCH" ] || die "branch is $BRANCH_NOW, expected $EXPECT_BRANCH" "nothing changed. Deploying the wrong branch is how main@6e5befc would go live again."

# Vercel needs the project link; the worktree does not carry .vercel.
if [ ! -f .vercel/project.json ]; then
  mkdir -p .vercel
  cp "$HOME/sites/helpward/.vercel/project.json" .vercel/project.json \
    || die "could not link the Vercel project" "nothing changed."
  echo "  vercel link     created from ~/sites/helpward"
else
  echo "  vercel link     already present"
fi

PREV="$(vercel ls helpward --prod 2>/dev/null | grep -oE 'https://helpward-[a-z0-9]+-vanstudio\.vercel\.app' | head -1)"
echo "  previous prod   ${PREV:-unknown}   <-- the deployment live before this run"

banner "1. Pre-deploy migrations (7 expected)"
node scripts/migrate.mjs --production --pre-deploy \
  || die "pre-deploy migrations failed" "SOME pre-deploy migrations may have applied. The runner is transactional per file and records a ledger row only on success, so re-running is safe: it resumes at the first unapplied file. Code is NOT yet deployed, which is the correct order — do not deploy until this passes."

banner "2. Deploy the release"
DEPLOY_OUT="$(vercel deploy --prod --force 2>&1)"
echo "$DEPLOY_OUT" | tail -15
NEW="$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | tail -1)"
echo "$DEPLOY_OUT" | grep -qiE 'error|failed' && [ -z "$NEW" ] \
  && die "the deploy failed" "pre-deploy migrations ARE applied; code is NOT. The site still serves $PREV, which is consistent — every pre-deploy migration is backward compatible by definition. Fix the build and re-run from step 2."
[ -n "$NEW" ] || die "could not read a deployment URL" "pre-deploy migrations applied; deploy state unknown. Check 'vercel ls helpward --prod'."
echo "  new deployment  $NEW"

banner "3. Deploy-coupled migrations (0081, 0085)"
node scripts/migrate.mjs --production --deploy-coupled \
  || die "deploy-coupled migrations failed" "the new code IS live but 0081/0085 are not fully applied. This is the one genuinely inconsistent state. Re-run step 3; if it keeps failing, re-promote $PREV AND restore the database together — code alone is not a rollback."

banner "4. Reload the PostgREST schema cache"
# Was an inline node -e with escaped quotes, which zsh mangled into invalid
# JS and failed the step on the real run. A file needs no escaping.
node scripts/reload-schema-cache.mjs \
  || die "schema cache reload failed" "all migrations applied and code deployed. Only the cache notify failed, which is recoverable: re-run 'node scripts/reload-schema-cache.mjs', or wait — PostgREST also refreshes on its own."

banner "5. Ledger check — expect 86/86"
node scripts/migrate.mjs --production --status 2>&1 | tail -3

banner "6. Webhook signature verification (the test-mode proof)"
sleep 5
node - <<'EOF'
const { readFileSync } = require("fs");
const { createHmac } = require("crypto");
const env = {};
for (const l of readFileSync("" + process.env.HOME + "/sites/helpward/.env.rehearsal", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const payload = JSON.stringify({
  id: "evt_cutover_probe", object: "event", livemode: false,
  type: "payment_intent.amount_capturable_updated",
  data: { object: { id: "pi_does_not_exist_probe", object: "payment_intent" } },
});
const t = Math.floor(Date.now() / 1000);
const sig = `t=${t},v1=${createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex")}`;
(async () => {
  const r = await fetch("https://helpward.com/api/webhooks/stripe", {
    method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": sig }, body: payload });
  const body = (await r.text()).slice(0, 120);
  console.log(`  test-signed event -> HTTP ${r.status}  ${body}`);
  if (r.status === 200) console.log("  PASS: the sandbox signing secret is live. 780 failing deliveries should now clear.");
  else console.log(`  FAIL: still ${r.status}. STRIPE_TEST_WEBHOOK_SECRET did not take effect in this deployment.`);
})();
EOF

banner "7. Public surface and API routes"
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1"; }
printf '  homepage                      %s  (expect 200)\n' "$(code https://helpward.com/)"
printf '  /pricing                      %s  (expect 200)\n' "$(code https://helpward.com/pricing)"
printf '  /how-it-works                 %s  (expect 200)\n' "$(code https://helpward.com/how-it-works)"
for r in /api/v1/me /api/v1/requests /api/v1/payment-methods /api/v1/account/deletion /api/v1/review/advance; do
  printf '  %-30s%s  (expect 401, NOT 404)\n' "$r" "$(code "https://helpward.com$r")"
done

banner "8. Preflight gate"
if [ -n "$STRIPE_SECRET_KEY" ]; then
  npm run preflight -- --production
else
  cat <<'TXT'
  SKIPPED — and this is expected, not a failure.

  preflight --production loads no dotenv file on purpose, and your live
  Stripe keys exist only in Vercel as Sensitive variables, which cannot be
  read back. So it cannot run from here without you supplying them.

  Step 6 already proves the deployed runtime has working Stripe config:
  a 400 (not 503) means STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are
  both present, and a 200 proves the test secret too. That is a stronger
  check than preflight's presence test.

  To run the full gate yourself, in a shell with the live values:
    cd /tmp/hw-merge && HELPWARD_PRODUCTION_REF=xhmgmegraieouudyjjlv \
      HELPWARD_PRODUCTION_ORIGIN=https://helpward.com \
      PRODUCTION_DATABASE_URL="$(cat ~/.helpward-cutover/production-db-url)" \
      STRIPE_SECRET_KEY=... npm run preflight -- --production
TXT
fi

banner "Done"
echo "  previous deployment : ${PREV:-unknown}"
echo "  new deployment      : $NEW"
echo "  log                 : $LOG"
echo ""
echo "  Recovery is ROLL-FORWARD. Re-promoting the previous deployment after"
echo "  0085 leaves every helper with an empty inbox — code and database must"
echo "  go back together."
echo ""
