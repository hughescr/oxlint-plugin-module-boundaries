/**
 * @hughescr/eslint-plugin-module-boundaries
 *
 * ESLint plugin for enforcing module boundary integrity in TypeScript projects.
 * Requires TypeScript parser services (`@typescript-eslint/parser` with `projectService`).
 */

import pkg from '../package.json' with { type: 'json' };
import noCrossModuleInternal from './rules/no-cross-module-internal.js';
import noInternalInBarrel from './rules/no-internal-in-barrel.js';
import noStarExportFromNonBarrel from './rules/no-star-export-from-non-barrel.js';

const plugin = {
    meta:    { name: pkg.name, version: pkg.version },
    configs: {} as Record<string, unknown>,
    rules:   {
        'no-cross-module-internal':       noCrossModuleInternal,
        'no-internal-in-barrel':          noInternalInBarrel,
        'no-star-export-from-non-barrel': noStarExportFromNonBarrel,
    },
};

plugin.configs.recommended = {
    plugins: { '@hughescr/module-boundaries': plugin },
    rules:   {
        '@hughescr/module-boundaries/no-cross-module-internal':       'error',
        '@hughescr/module-boundaries/no-internal-in-barrel':          'error',
        '@hughescr/module-boundaries/no-star-export-from-non-barrel': 'error',
    },
};

export default plugin;
