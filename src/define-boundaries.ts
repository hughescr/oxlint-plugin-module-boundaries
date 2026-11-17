/**
 * `defineBoundaries`: validate a project's policy and turn it into the Oxlint config fragment it extends.
 */

import { normalisePolicy, type BoundariesPolicy, type NormalisedPolicy, type PolicyHost, type Severity } from './core/policy.js';

/** The jsPlugins alias the fragment registers; rule ids are `@hughescr/module-boundaries/<rule>`. */
export const PLUGIN_ALIAS = '@hughescr/module-boundaries';

/** Every JavaScript and TypeScript source file; the rules themselves narrow to the policy's root. */
export const SOURCE_FILES = ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}'];

/** A policy rule's configuration: severity and the normalised policy. */
export type PolicyRuleEntry = [Severity, NormalisedPolicy];

/** The Oxlint config fragment `defineBoundaries` returns; extend it as is. */
export interface BoundariesConfig {
    jsPlugins: { name: string, specifier: string }[]
    overrides: {
        files: string[]
        rules: {
            '@hughescr/module-boundaries/dependencies':             PolicyRuleEntry
            '@hughescr/module-boundaries/no-cross-module-internal': PolicyRuleEntry
        }
    }[]
}

/** `defineBoundaries` with the module names of the policy inferred, so a misspelt name is a type error. */
export type DefineBoundaries = <const M extends string>(policy: BoundariesPolicy<M>) => BoundariesConfig;

/**
 * Build `defineBoundaries` for one plugin entry file and file system.
 *
 * @param specifier - Absolute path of the plugin's entry module, which Oxlint loads as the jsPlugin.
 * @param host - Answers the policy's file-system questions.
 * @returns `defineBoundaries`.
 */
export function createDefineBoundaries(specifier: string, host: PolicyHost): DefineBoundaries {
    return (input) => {
        const { policy, severity } = normalisePolicy(input, host);
        const entry: PolicyRuleEntry = [severity, policy];
        return {
            jsPlugins: [{ name: PLUGIN_ALIAS, specifier }],
            overrides: [{
                files: [...SOURCE_FILES],
                rules: {
                    '@hughescr/module-boundaries/dependencies':             entry,
                    '@hughescr/module-boundaries/no-cross-module-internal': entry,
                },
            }],
        };
    };
}
