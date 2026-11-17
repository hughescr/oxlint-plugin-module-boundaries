/**
 * The compiled-policy cache, keyed by the rule option object.
 *
 * Oxlint hands every file that uses one option set the same option object, so compiling once per object is
 * enough. A plain `Map`, not a `WeakMap`: Oxlint patches the global `WeakMap` to drop entries between files.
 */

import { compilePolicy, type CompiledPolicy } from '../core/classify.js';
import type { NormalisedPolicy } from '../core/policy.js';

const compiled = new Map<object, CompiledPolicy>();

/** Discard compiled policies when the lint host sees an idle gap. */
export function clearCompiledPolicies(): void {
    compiled.clear();
}

function isNormalisedPolicy(option: unknown): option is NormalisedPolicy {
    return typeof option === 'object' && option !== null && typeof (option as Partial<NormalisedPolicy>).root === 'string'
      && Array.isArray((option as Partial<NormalisedPolicy>).modules);
}

/**
 * The compiled policy for a rule option.
 *
 * @param option - The rule's first option, which should be the policy `defineBoundaries` normalised.
 * @param rule - The rule's id, for the error message.
 * @returns The compiled policy.
 * @throws {TypeError} When the option is not a normalised policy.
 */
export function compiledPolicyFor(option: unknown, rule: string): CompiledPolicy {
    if(!isNormalisedPolicy(option)) {
        throw new TypeError(`${rule} needs the policy that defineBoundaries() returns as its option; configure it with defineBoundaries`);
    }
    let result = compiled.get(option);
    if(result === undefined) {
        result = compilePolicy(option);
        compiled.set(option, result);
    }
    return result;
}
