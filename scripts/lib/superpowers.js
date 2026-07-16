/**
 * Shared Superpowers detection helper.
 * Soft-dependency, on-disk anchor check — used by speccy/build/ship pre-flight.
 *
 * Thin ESM surface over the CommonJS single source of truth
 * (superpowers-core.cjs) so the CJS session-guard engine can share the exact
 * same logic without a forked copy. The public API is unchanged.
 */

import core from "./superpowers-core.cjs";

export const detectSuperpowers = core.detectSuperpowers;
