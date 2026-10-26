// What a service's base price buys, and what goes beyond it.
//
// Mirrors price_service_cents() in migration 0053. Two implementations of
// one sum is a drift risk, so scripts/verify-pricing-parity.mjs runs both
// over a grid of inputs and fails on any disagreement.
//
// Why both exist: the form needs a live quote as the customer answers,
// and acceptance must recompute server-side from data it trusts — a price
// the browser sent is a price the browser chose.

export type PricingRule = {
  serviceId: string;
  /** Minutes the base price covers. Null = not time-priced. */
  includedMinutes: number | null;
  extraBlockMinutes: number | null;
  extraBlockCents: number | null;
  /** Intake key carrying the duration. */
  durationField: string;
  /** Intake key carrying a count, e.g. "dog_count". */
  unitField: string | null;
  includedUnits: number;
  perExtraUnitCents: number | null;
  crewField: string | null;
  includedCrew: number;
  perExtraCrewCents: number | null;
};

export type IntakeValues = Record<string, string | string[] | undefined>;

/** Read a whole number out of an intake answer, or null if it isn't one. */
function countOf(values: IntakeValues, key: string | null): number | null {
  if (!key) return null;
  const raw = values[key];
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (text == null || String(text).trim() === "") return null;
  const n = Number(String(text).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export type PriceLine = { label: string; cents: number };

export type ServicePrice = {
  /** The commissionable subtotal: no service fee, no tip. */
  subtotalCents: number;
  /** What made it up, for showing the customer why. */
  lines: PriceLine[];
};

/**
 * Price one service from its base and the customer's answers.
 *
 * Blocks are STARTED, not prorated: 61 minutes into 30-minute blocks is
 * two blocks. A helper's time is booked, not metered.
 */
export function priceService(
  baseCents: number,
  rule: PricingRule | null,
  values: IntakeValues,
): ServicePrice {
  const lines: PriceLine[] = [{ label: "Base", cents: baseCents }];
  if (!rule) return { subtotalCents: baseCents, lines };

  let total = baseCents;

  if (rule.includedMinutes != null && rule.extraBlockMinutes && rule.extraBlockCents != null) {
    const minutes = countOf(values, rule.durationField);
    if (minutes != null && minutes > rule.includedMinutes) {
      const blocks = Math.ceil((minutes - rule.includedMinutes) / rule.extraBlockMinutes);
      const cents = blocks * rule.extraBlockCents;
      total += cents;
      lines.push({
        label: `${formatMinutes(minutes - rule.includedMinutes)} beyond the first ${formatMinutes(rule.includedMinutes)}`,
        cents,
      });
    }
  }

  if (rule.unitField && rule.perExtraUnitCents != null) {
    const units = countOf(values, rule.unitField);
    if (units != null && units > rule.includedUnits) {
      const extra = units - rule.includedUnits;
      const cents = extra * rule.perExtraUnitCents;
      total += cents;
      lines.push({ label: `${extra} extra ${plural(rule.unitField, extra)}`, cents });
    }
  }

  if (rule.crewField && rule.perExtraCrewCents != null) {
    const crew = countOf(values, rule.crewField);
    if (crew != null && crew > rule.includedCrew) {
      const extra = crew - rule.includedCrew;
      const cents = extra * rule.perExtraCrewCents;
      total += cents;
      lines.push({ label: `${extra} extra helper${extra === 1 ? "" : "s"}`, cents });
    }
  }

  return { subtotalCents: total, lines };
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const hours = mins / 60;
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${text} hour${hours === 1 ? "" : "s"}`;
}

/** "dog_count" -> "dogs"; "bedrooms" -> "bedrooms". */
function plural(field: string, n: number): string {
  const word = field.replace(/_count$/, "").replace(/_/g, " ");
  if (word.endsWith("s")) return word;
  return n === 1 ? word : `${word}s`;
}

/** Map a database row onto the rule shape. */
export function ruleFromRow(row: Record<string, unknown> | null | undefined): PricingRule | null {
  if (!row) return null;
  return {
    serviceId: String(row.service_id),
    includedMinutes: (row.included_minutes as number | null) ?? null,
    extraBlockMinutes: (row.extra_block_minutes as number | null) ?? null,
    extraBlockCents: (row.extra_block_cents as number | null) ?? null,
    durationField: String(row.duration_field ?? "duration_min"),
    unitField: (row.unit_field as string | null) ?? null,
    includedUnits: (row.included_units as number | null) ?? 1,
    perExtraUnitCents: (row.per_extra_unit_cents as number | null) ?? null,
    crewField: (row.crew_field as string | null) ?? null,
    includedCrew: (row.included_crew as number | null) ?? 1,
    perExtraCrewCents: (row.per_extra_crew_cents as number | null) ?? null,
  };
}
