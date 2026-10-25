# 0031 was removed deliberately

`0031_payout_split.sql` contained a `CREATE OR REPLACE accept_request` that
implemented the 80/20-on-subtotal split. The hardened version of the same
function — adding the catalog re-derivation and the sealed-quote check —
lives in `0036_attestation_integrity.sql`.

Keeping both meant the deployment order decided which definition survived,
and the checked-in runbook applied 0031 *after* 0036, silently restoring the
unhardened function and dropping the integrity guards (review finding D05).

There is now exactly one definition of `accept_request`, at the end of
`0036`. The payout split is unchanged: helper 80% of the service subtotal
plus 100% of tips, Helpward 20% plus the $4.50 service fee.

`supabase/rollback/0031_down.sql` was removed for the same reason — it
restored the pre-split function *and* the bundle mispricing, and nothing
should be able to do that by accident.
