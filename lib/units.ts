// Rendering a number with its unit.
//
// Intake echoed answers as `${value} ${unit}` with the unit written in
// the plural on the field, so every count of one read wrong: "1 dogs",
// "1 rooms", "1 helpers", "1 parcels". It also put the currency symbol
// on the wrong side — "20 $" rather than "$20".
//
// Small, but these strings are what a helper reads when deciding whether
// to accept a job, and what a customer reads back on their own booking.

/** Symbols that go in FRONT of the number. */
const PREFIX_UNITS = new Set(["$", "£", "€"]);

/** Units that are a symbol, not a noun: never pluralised, never singularised. */
const SYMBOL_UNITS = new Set(["kg", "lb", "km", "mi", "m", "cm", "ft", "min", "hr"]);

/** Irregular or non-obvious singulars. Only what the catalogue uses. */
const SINGULARS: Record<string, string> = {
  people: "person",
  inches: "inch",
  boxes: "box",
};

/** The singular of a plural unit noun. */
export function singularize(unit: string): string {
  const known = SINGULARS[unit];
  if (known) return known;
  if (unit.endsWith("ies")) return `${unit.slice(0, -3)}y`;
  if (unit.endsWith("ses") || unit.endsWith("xes")) return unit.slice(0, -2);
  if (unit.endsWith("s")) return unit.slice(0, -1);
  return unit;
}

/**
 * Render a value with its unit the way a person writes it.
 *
 * `unit` is whatever the intake field declares, which is the plural form
 * for countable things ("dogs") because that is how the field is
 * labelled in the form.
 */
export function formatUnit(value: number | string, unit: string | undefined): string {
  if (!unit) return String(value);
  if (PREFIX_UNITS.has(unit)) return `${unit}${value}`;
  if (SYMBOL_UNITS.has(unit)) return `${value} ${unit}`;

  const n = typeof value === "number" ? value : Number(value);
  // A non-numeric value cannot be counted, so leave the unit alone.
  if (!Number.isFinite(n)) return `${value} ${unit}`;

  return `${value} ${Math.abs(n) === 1 ? singularize(unit) : unit}`;
}
