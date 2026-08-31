/**
 * Module-resolution hooks for character-builder-extract.ts.
 *
 * Registered via node:module `register()` on top of tsx's own hooks. Two jobs:
 *
 * 1. Resolve Forge Steel's `@/…` tsconfig path alias against the read-only
 *    checkout (FORGESTEEL_ROOT), so its data modules can be evaluated from
 *    outside that repository without modifying it.
 * 2. Stub `@/utils/utils`: the real module imports browser-only packages
 *    (jspdf, html2canvas, dompurify, …) that are not installed in the
 *    checkout, and its `Utils.guid()` is nondeterministic. The data closure
 *    only ever calls `Utils.guid()`, so the stub returns a fixed marker
 *    string — generated ids are labels we never key on (DEC-0014 / R-L).
 *
 * Everything else defers to the next hook in the chain (tsx), which handles
 * TypeScript transformation and extensionless relative imports.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FORGESTEEL_ROOT =
  process.env.FORGESTEEL_ROOT ?? '/srv/presidium/projects/ironyard-v2/code/.reference/forgesteel';

const UTILS_STUB = 'data:text/javascript,export const Utils = { guid: () => "fs-generated" };';

interface ResolveContext {
  conditions: string[];
  parentURL?: string;
}

interface ResolveResult {
  url: string;
  shortCircuit?: boolean;
  format?: string | null;
}

type NextResolve = (
  specifier: string,
  context: ResolveContext,
) => ResolveResult | Promise<ResolveResult>;

export function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve,
): ResolveResult | Promise<ResolveResult> {
  if (specifier === '@/utils/utils') {
    return { url: UTILS_STUB, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    const rest = specifier.slice(2);
    for (const candidate of [`${rest}.ts`, `${rest}.tsx`, `${rest}/index.ts`, rest]) {
      const path = join(FORGESTEEL_ROOT, 'src', candidate);
      if (existsSync(path)) {
        return { url: pathToFileURL(path).href, shortCircuit: true };
      }
    }
    throw new Error(`Cannot resolve Forge Steel alias: ${specifier}`);
  }
  return nextResolve(specifier, context);
}
