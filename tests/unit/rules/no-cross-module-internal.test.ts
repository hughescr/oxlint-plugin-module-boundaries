import { describe, expect, it } from 'bun:test';
import rule, { createNoCrossModuleInternalRule } from '../../../src/rules/no-cross-module-internal.js';
import { fakeHost, fakePolicy, lint, ROOT } from '../helpers.js';

const policy = fakePolicy({ include: ['src/**'], ignore: ['**/*.test.ts'] });
const utilsIndex = `${ROOT}/src/utils/index.ts`;
const appHelper = `${ROOT}/src/app/helper.ts`;

const host = fakeHost(
    {
        '@/utils':    utilsIndex,
        './helper':   appHelper,
        '@/stray':    `${ROOT}/src/stray.ts`,
        '../outside': '/elsewhere/x.ts',
    },
    {
        [utilsIndex]:             ['hidden', 'default', 'quoted-name'],
        [appHelper]:              ['hidden'],
        [`${ROOT}/src/stray.ts`]: ['hidden'],
        '/elsewhere/x.ts':        ['hidden'],
    }
);
const noCrossModuleInternal = createNoCrossModuleInternalRule(host);

function check(code: string, file = 'src/app/a.ts', options: readonly unknown[] = [policy]): ReturnType<typeof lint> {
    return lint(noCrossModuleInternal, code, `${ROOT}/${file}`, options);
}

const hiddenReport = { messageId: 'crossModuleInternal', data: { name: 'hidden', sourceModule: 'utils', importerModule: 'app' } };

describe('no-cross-module-internal — meta', () => {
    it('describes the rule and its message', () => {
        expect(noCrossModuleInternal.meta).toEqual({
            type: 'problem',
            docs: {
                description: 'Disallow importing @internal exports from a different module of the boundaries policy',
                url:         'https://github.com/hughescr/eslint-plugin-module-boundaries/blob/main/docs/rules/no-cross-module-internal.md',
            },
            messages: {
                crossModuleInternal: "'{{name}}' is marked @internal in module '{{sourceModule}}' and cannot be imported from module '{{importerModule}}'.",
            },
            schema: [{ type: 'object' }],
        });
        expect(rule.meta).toEqual(noCrossModuleInternal.meta);
    });
});

describe('no-cross-module-internal', () => {
    it('reports each @internal name imported from another module', () => {
        expect(check("import { shown, hidden, hidden as alias } from '@/utils';")).toEqual([
            { ...hiddenReport, text: 'hidden' },
            { ...hiddenReport, text: 'hidden as alias' },
        ]);
    });

    it('checks a symlinked importer under its physical module', () => {
        const importer = `${ROOT}/src/app/a.ts`;
        const alias = `${ROOT}/alias/a.ts`;
        const recording = {
            ...fakeHost({ '@/utils': utilsIndex }, { [utilsIndex]: ['hidden'] }),
            canonicalPath: (file: string) => (file === alias ? importer : undefined),
        };
        const ruleForAlias = createNoCrossModuleInternalRule(recording);
        const code = "import { hidden } from '@/utils';";
        expect(lint(ruleForAlias, code, alias, [policy])).toEqual([{ ...hiddenReport, text: 'hidden' }]);
        expect(lint(ruleForAlias, code, importer, [policy])).toEqual([]);
        expect(recording.calls).toEqual([{ importer, specifier: '@/utils', tsconfig: null }]);
    });

    it('reports @internal names re-exported from another module', () => {
        expect(check("export { hidden as again, shown } from '@/utils';")).toEqual([{ ...hiddenReport, text: 'hidden as again' }]);
        expect(check("export { default } from '@/utils';")).toEqual([
            { messageId: 'crossModuleInternal', data: { name: 'default', sourceModule: 'utils', importerModule: 'app' }, text: 'default' },
        ]);
    });

    it('reads string import names', () => {
        expect(check("import { 'quoted-name' as q } from '@/utils';").map(report => report.data!.name)).toEqual(['quoted-name']);
    });

    it('ignores default and namespace imports, local exports and star re-exports', () => {
        expect(check("import hidden from '@/utils';\nimport * as all from '@/utils';\nexport { local };\nexport * from '@/utils';\nconst local = 1;")).toEqual([]);
    });

    it('allows @internal names inside the same module', () => {
        expect(check("import { hidden } from './helper';")).toEqual([]);
    });

    it('ignores targets that do not resolve, are outside root or are in no module', () => {
        expect(check("import { hidden } from 'missing';\nimport { hidden as h } from '../outside';\nimport { hidden as s } from '@/stray';")).toEqual([]);
    });

    it('skips files outside modules and ignored files', () => {
        expect(check("import { hidden } from '@/utils';", 'src/stray.ts')).toEqual([]);
        expect(check("import { hidden } from '@/utils';", 'tools/a.ts')).toEqual([]);
        expect(check("import { hidden } from '@/utils';", 'src/app/a.test.ts')).toEqual([]);
    });

    it('resolves with the policy tsconfig when it has one', () => {
        const recording = fakeHost({});
        lint(createNoCrossModuleInternalRule(recording), "import { a } from './x';", `${ROOT}/src/app/a.ts`, [fakePolicy({ tsconfig: 'tsconfig.json' })]);
        expect(recording.calls).toEqual([{ importer: `${ROOT}/src/app/a.ts`, specifier: './x', tsconfig: `${ROOT}/tsconfig.json` }]);
    });

    it('fails loudly without a policy option', () => {
        expect(() => check('', 'src/app/a.ts', [])).toThrow('@hughescr/module-boundaries/no-cross-module-internal needs the policy that defineBoundaries() returns');
    });
});
