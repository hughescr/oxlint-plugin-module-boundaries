import { describe, expect, it } from 'bun:test';
import { compiledPolicyFor } from '../../../src/io/policy-cache.js';
import { fakePolicy } from '../helpers.js';

describe('compiledPolicyFor', () => {
    it('compiles each option object once', () => {
        const policy = fakePolicy();
        const compiled = compiledPolicyFor(policy, 'rule');
        expect(compiled.policy).toBe(policy);
        expect(compiledPolicyFor(policy, 'rule')).toBe(compiled);
        expect(compiledPolicyFor(fakePolicy(), 'rule')).not.toBe(compiled);
    });

    it('rejects an option that is not a normalised policy, naming the rule', () => {
        const message = 'my/rule needs the policy that defineBoundaries() returns as its option; configure it with defineBoundaries';
        expect(() => compiledPolicyFor(undefined, 'my/rule')).toThrow(new TypeError(message));
        expect(() => compiledPolicyFor(null, 'my/rule')).toThrow(new TypeError(message));
        expect(() => compiledPolicyFor({ modules: [] }, 'my/rule')).toThrow(new TypeError(message));
        expect(() => compiledPolicyFor({ root: '/project', modules: { app: 'src/app' } }, 'my/rule')).toThrow(new TypeError(message));
    });
});
