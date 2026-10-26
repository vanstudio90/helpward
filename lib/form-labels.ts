/**
 * Tidy a label scraped from the page into something worth showing in a
 * reminder.
 *
 * Labels arrive carrying the decoration the page puts around them: the red
 * asterisk marking a field required, the "(optional)" suffix, and the hint
 * that follows a question inside the same element. A reminder reading
 * "How long do you need? * Pick the closest — you can extend later" is
 * worse than no reminder.
 *
 * Lives in lib/ rather than beside the component so it can be tested: the
 * test loader does not handle .tsx, and this is the half with no DOM in it.
 */
export function tidyLabel(text: string): string {
  return text
    .replace(/\(optional\)/gi, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    // A hint runs on after the question in the same element; keep the
    // question. Splitting on the space AFTER a "?" leaves labels that
    // merely contain one intact.
    .split(/(?<=\?)\s/)[0]
    .trim();
}
