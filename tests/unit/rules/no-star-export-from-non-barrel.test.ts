import { describe, expect, it } from 'bun:test';
import rule, { createNoStarExportFromNonBarrelRule } from '../../../src/rules/no-star-export-from-non-barrel.js';
import { fakeHost, lint } from '../helpers.js';

const host = fakeHost({
    './sub':            '/p/sub/index.ts',
    './regular-module': '/p/regular-module.ts',
    './sub-index':      '/p/sub-index.ts',
    external:           '/p/node_modules/external/index.ts',
});
const noStarExport = createNoStarExportFromNonBarrelRule(host);

function check(code: string, options: readonly unknown[] = [], file = '/p/index.ts'): ReturnType<typeof lint> {
    return lint(noStarExport, code, file, options);
}

function report(source: string, text = `export * from '${source}';`): ReturnType<typeof lint>[number] {
    return { messageId: 'starFromNonBarrel', data: { source }, text };
}

describe('no-star-export-from-non-barrel — meta', () => {
    it('describes the rule, its message and its option', () => {
        expect(noStarExport.meta).toEqual({
            type: 'problem',
            docs: {
                description: 'Disallow barrel index.ts files from using export * from non-barrel files',
                url:         'https://github.com/hughescr/eslint-plugin-module-boundaries/blob/main/docs/rules/no-star-export-from-non-barrel.md',
            },
            messages: {
                starFromNonBarrel: "export * from '{{source}}' re-exports from a non-barrel file. @internal items can leak silently. Use explicit `export { ... } from` to enumerate names, or re-export from a barrel index.ts.",
            },
            schema: [
                {
                    type:                 'object',
                    additionalProperties: false,
                    properties:           { allowBarrelOfBarrels: { type: 'boolean', 'default': true } },
                },
            ],
        });
        expect(rule.meta).toEqual(noStarExport.meta);
    });
});

describe('no-star-export-from-non-barrel', () => {
    it('allows a star re-export of another barrel by default', () => {
        expect(check("export * from './sub';")).toEqual([]);
        expect(check("export * from './sub';", [{}])).toEqual([]);
        expect(check("export * from './sub';", [{ allowBarrelOfBarrels: true }])).toEqual([]);
    });

    it('reports a star re-export of a non-barrel or unresolvable file', () => {
        expect(check("export * from './regular-module';")).toEqual([report('./regular-module')]);
        expect(check("export * from './sub-index';")).toEqual([report('./sub-index')]);
        expect(check("export * from './nonexistent-module';")).toEqual([report('./nonexistent-module')]);
        expect(check("export * as Ns from './regular-module';")).toEqual([report('./regular-module', "export * as Ns from './regular-module';")]);
    });

    it('reports every relative star re-export when allowBarrelOfBarrels is false', () => {
        expect(check("export * from './sub';", [{ allowBarrelOfBarrels: false }])).toEqual([report('./sub')]);
    });

    it('ignores external packages, named re-exports and non-barrel files', () => {
        expect(check("export * from 'external';\nexport { Foo } from './regular-module';")).toEqual([]);
        expect(check("export * from './regular-module';", [], '/p/some-module.ts')).toEqual([]);
        expect(host.calls.every(call => call.importer === '/p/index.ts' && call.tsconfig === null && call.specifier.startsWith('.'))).toBe(true);
    });
});
