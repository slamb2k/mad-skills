/**
 * Shared feature-dev plugin detection helper.
 * Soft-dependency, on-disk anchor check — used by build's pre-flight table.
 *
 * Thin ESM surface over the CommonJS single source of truth
 * (hooks/lib/superpowers-core.cjs) so the CJS session-guard engine can share the
 * exact same logic without a forked copy. Core lives under hooks/ because that
 * is the tree the plugin distribution reliably ships; scripts/ is build-only.
 * The public API is unchanged.
 */

import core from "../../hooks/lib/superpowers-core.cjs";

export const detectFeatureDev = core.detectFeatureDev;
