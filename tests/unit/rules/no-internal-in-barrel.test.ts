import { describe, expect, it } from 'bun:test';
import rule, { createNoInternalInBarrelRule } from '../../../src/rules/no-internal-in-barrel.js';
import { fakeHost, lint } from '../helpers.js';

const host = fakeHost(
    {
        './with-internal': '/p/with-internal.ts',
        './public-only':   '/p/public-only.ts',
        './with-default':  '/p/with-default.ts',
        external:          '/p/node_modules/external/index.ts',
    },
    {
        '/p/with-internal.ts':               ['internalFunction', 'InternalClass', 'INTERNAL_CONST', 'publicAlias'],
        '/p/with-default.ts':                ['default'],
        '/p/node_modules/external/index.ts': ['something'],
    }
);
const noInternalInBarrel = createNoInternalInBarrelRule(host);

function check(code: string, file = '/p/index.ts'): ReturnType<typeof lint> {
    return lint(noInternalInBarrel, code, file);
}

function names(code: string): string[] {
    return check(code).map(report => report.data!.name!);
}

describe('no-internal-in-barrel — meta', () => {
    it('describes the rule and its message', () => {
        expect(noInternalInBarrel.meta).toEqual({
            type: 'problem',
            docs: {
                description: 'Disallow barrel index.ts files from re-exporting @internal-tagged exports',
                url:         'https://github.com/hughescr/eslint-plugin-module-boundaries/blob/main/docs/rules/no-internal-in-barrel.md',
            },
            messages: { internalInBarrel: "'{{name}}' is marked @internal and must not be re-exported from a barrel index.ts." },
            schema:   [],
        });
        expect(rule.meta).toEqual(noInternalInBarrel.meta);
    });
});

describe('no-internal-in-barrel', () => {
    it('reports each @internal re-export on its specifier, by its original name', () => {
        expect(check("export { publicFunction, internalFunction, INTERNAL_CONST } from './with-internal';")).toEqual([
            { messageId: 'internalInBarrel', data: { name: 'internalFunction' }, text: 'internalFunction' },
            { messageId: 'internalInBarrel', data: { name: 'INTERNAL_CONST' }, text: 'INTERNAL_CONST' },
        ]);
        expect(names("export { internalFunction as exposedFunction } from './with-internal';")).toEqual(['internalFunction']);
        expect(names("export type { InternalClass } from './with-internal';")).toEqual(['InternalClass']);
        expect(names("export { default as InternalThing } from './with-default';")).toEqual(['default']);
        expect(names("export { publicAlias } from './with-internal';")).toEqual(['publicAlias']);
    });

    it('allows public re-exports', () => {
        expect(check("export { publicFunction } from './public-only';\nexport { publicFunction } from './with-internal';")).toEqual([]);
    });

    it('ignores local exports, star re-exports, default exports and unresolved sources', () => {
        expect(check("export { internalFunction };\nexport * from './with-internal';\nexport default 42;\nexport { internalFunction } from './missing';")).toEqual([]);
    });

    it('checks relative sources only', () => {
        expect(check("export { something } from 'external';")).toEqual([]);
        expect(host.calls.map(call => call.specifier)).not.toContain('external');
    });

    it('applies to index.ts files only, resolving with the nearest tsconfig', () => {
        expect(check("export { internalFunction } from './with-internal';", '/p/some-module.ts')).toEqual([]);
        expect(check("export { internalFunction } from './with-internal';", '/p/index.tsx')).toEqual([]);
        expect(host.calls.every(call => call.importer === '/p/index.ts' && call.tsconfig === null)).toBe(true);
    });
});
