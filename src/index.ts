/**
 * @hughescr/oxlint-plugin-module-boundaries
 *
 * An Oxlint JS plugin for module boundaries. The default export is the plugin; `defineBoundaries` turns a
 * project's policy into the config fragment that registers the plugin and enables the policy rules.
 */

import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };
import { createDefineBoundaries } from './define-boundaries.js';
import { nodePolicyHost } from './io/node.js';
import dependencies from './rules/dependencies.js';
import noCrossModuleInternal from './rules/no-cross-module-internal.js';
import noInternalInBarrel from './rules/no-internal-in-barrel.js';
import noStarExportFromNonBarrel from './rules/no-star-export-from-non-barrel.js';
import type { RuleModule } from './rules/rule.js';

export type { BoundaryException, BoundaryEdges, BoundariesPolicy, NormalisedPolicy, Severity } from './core/policy.js';
export type { BoundariesConfig, DefineBoundaries, PolicyRuleEntry } from './define-boundaries.js';

/**
 * Validate a boundaries policy and return the Oxlint config fragment to extend: the jsPlugin entry plus an
 * override enabling `dependencies` and `no-cross-module-internal` with the normalised policy.
 *
 * @throws {TypeError} When the policy is invalid; the message names the problem.
 */
export const defineBoundaries = createDefineBoundaries(fileURLToPath(import.meta.url), nodePolicyHost);

type RuleName = 'dependencies' | 'no-cross-module-internal' | 'no-internal-in-barrel' | 'no-star-export-from-non-barrel';

const plugin: { readonly meta: { readonly name: string, readonly version: string }, readonly rules: Readonly<Record<RuleName, RuleModule>> } = {
    meta:  { name: pkg.name, version: pkg.version },
    rules: {
        dependencies,
        'no-cross-module-internal':       noCrossModuleInternal,
        'no-internal-in-barrel':          noInternalInBarrel,
        'no-star-export-from-non-barrel': noStarExportFromNonBarrel,
    },
};

export default plugin;
