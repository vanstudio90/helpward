// Resolution hooks so node:test can import the app's modules directly.
//
// Two things stand in the way of running app code under plain node:
//   1. the "@/..." path alias, which only tsconfig/Next understand
//   2. server-only modules (next/headers, the `server-only` guard) that are
//      imported at module scope but never actually called in these tests
//
// Both are handled here so the tests need no bundler and no new dependency.

import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

// Modules replaced with inert stubs. They are pulled in transitively by
// server modules under test; the tests inject fakes for anything they
// actually exercise, so the real implementations are never needed.
const STUBS = new Map([
  ["server-only", "export {};"],
  ["next/headers", "export const headers = () => new Map(); export const cookies = () => new Map();"],
  ["next/cache", "export const revalidatePath = () => {}; export const revalidateTag = () => {};"],
  ["next/navigation", "export const redirect = () => { throw new Error('redirect'); }; export const notFound = () => { throw new Error('notFound'); };"],
]);

export async function resolve(specifier, context, nextResolve) {
  if (STUBS.has(specifier)) {
    return { url: `stub:${specifier}`, shortCircuit: true, format: "module" };
  }
  if (specifier.startsWith("@/")) {
    const target = path.join(ROOT, specifier.slice(2));
    // The alias is extensionless in source; try the real file extensions.
    for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx", ".mjs", ".js"]) {
      const candidate = target + ext;
      try {
        const { existsSync, statSync } = await import("node:fs");
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      } catch { /* keep trying */ }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("stub:")) {
    const key = url.slice("stub:".length);
    return { format: "module", source: STUBS.get(key) ?? "export {};", shortCircuit: true };
  }
  return nextLoad(url, context);
}
