import { describe, expect, it } from 'bun:test';
import { normalisePolicy } from '../../../src/core/policy.js';
import rule, { createDependenciesRule } from '../../../src/rules/dependencies.js';
import { fakeHost, fakePolicy, fakePolicyHost, lint, ROOT } from '../helpers.js';

const policy = fakePolicy({
    include:       ['src/**'],
    ignore:        ['**/*.test.ts'],
    allow:         { app: ['utils', 'errors'], main: ['app'] },
    allowTypeOnly: { utils: ['errors'] },
    exceptions:    [{ files: ['src/utils/media/**'], allow: ['errors'] }],
});

const host = fakeHost({
    '@/utils':      `${ROOT}/src/utils/index.ts`,
    '@/utils/deep': `${ROOT}/src/utils/deep.ts`,
    '@/errors':     `${ROOT}/src/errors/index.ts`,
    '@/app':        `${ROOT}/src/app/index.ts`,
    './sibling':    `${ROOT}/src/utils/sibling.ts`,
    '@/stray':      `${ROOT}/src/stray.ts`,
    pkg:            `${ROOT}/node_modules/pkg/index.js`,
    '../elsewhere': '/elsewhere/index.ts',
});
const dependencies = createDependenciesRule(host);

function check(code: string, file: string, options: readonly unknown[] = [policy]): ReturnType<typeof lint> {
    return lint(dependencies, code, `${ROOT}/${file}`, options);
}

describe('dependencies — meta', () => {
    it('describes the rule and its messages', () => {
        expect(dependencies.meta).toEqual({
            type: 'problem',
            docs: {
                description: 'Enforce the boundaries policy: allowed module edges, type-only edges and module entry files',
                url:         'https://github.com/hughescr/oxlint-plugin-module-boundaries/blob/main/docs/rules/dependencies.md',
            },
            messages: {
                unassigned: "'{{file}}' is in no module of the boundaries policy; add it to a module or narrow `include`.",
                notAllowed: "Module '{{from}}' may not import module '{{to}}' ('{{specifier}}').",
                typeOnly:   "Module '{{from}}' may import module '{{to}}' only with a type-only import ('{{specifier}}'); use `import type`.",
                notEntry:   "Module '{{from}}' must import module '{{to}}' through its entry {{entry}}, not '{{specifier}}'.",
            },
            schema: [{ type: 'object' }],
        });
    });

    it('is built over the real host by default', () => {
        expect(rule.meta).toEqual(dependencies.meta);
    });
});

describe('dependencies — scope', () => {
    it('reports an included file in no module once, on the program', () => {
        expect(check("import { a } from '@/app';\nexport const b = 1;", 'src/stray.ts')).toEqual([
            { messageId: 'unassigned', data: { file: 'src/stray.ts' }, text: "import { a } from '@/app';\nexport const b = 1;" },
        ]);
    });

    it('skips files outside root, ignored files and files that are neither in a module nor included', () => {
        expect(lint(dependencies, "import { a } from '@/app';", '/elsewhere/src/utils/a.ts', [policy])).toEqual([]);
        expect(check("import { a } from '@/app';", 'src/utils/a.test.ts')).toEqual([]);
        expect(check("import { a } from '@/app';", 'tools/a.ts')).toEqual([]);
        expect(host.calls.filter(call => call.importer.endsWith('a.test.ts') || call.importer.startsWith('/elsewhere'))).toEqual([]);
    });

    it('fails loudly without a policy option', () => {
        expect(() => check('', 'src/utils/a.ts', [])).toThrow('@hughescr/module-boundaries/dependencies needs the policy that defineBoundaries() returns');
    });
});

describe('dependencies — edges', () => {
    it('allows edges in allow that land on the entry, and imports inside a module', () => {
        expect(check("import { a } from '@/utils';\nimport { e } from '@/errors';", 'src/app/a.ts')).toEqual([]);
        expect(check("import { a } from './sibling';\nimport { d } from '@/utils/deep';", 'src/utils/a.ts')).toEqual([]);
        expect(check("import { a } from '@/app';", 'src/index.ts')).toEqual([]);
    });

    it('denies an edge from a symlinked importer to a module registered through an alias', () => {
        const importer = `${ROOT}/src/utils/a.ts`;
        const alias = `${ROOT}/overlap/a.ts`;
        const recording = {
            ...fakeHost({ '@/app': `${ROOT}/src/app/index.ts` }),
            canonicalPath: (file: string) => (file === alias ? importer : undefined),
        };
        const ruleForAlias = createDependenciesRule(recording);
        const option = normalisePolicy({ root: ROOT, modules: { utils: 'src/utils', app: 'src/errors' } }, {
            ...fakePolicyHost,
            realpath: file => (file === `${ROOT}/src/errors` ? `${ROOT}/src/app` : file),
        }).policy;
        const code = "import { a } from '@/app';";
        expect(lint(ruleForAlias, code, alias, [option]).map(report => report.messageId)).toEqual(['notAllowed']);
        expect(lint(ruleForAlias, code, importer, [option])).toEqual([]);
        expect(recording.calls).toEqual([{ importer, specifier: '@/app', tsconfig: null }]);
    });

    it('reports a forbidden edge', () => {
        expect(check("import { a } from '@/app';", 'src/utils/a.ts')).toEqual([
            { messageId: 'notAllowed', data: { from: 'utils', to: 'app', specifier: '@/app', entry: '' }, text: "import { a } from '@/app';" },
        ]);
    });

    it('reports a value import along a type-only edge, and allows the type-only import', () => {
        expect(check("import type { E } from '@/errors';", 'src/utils/a.ts')).toEqual([]);
        expect(check("import { type E } from '@/errors';", 'src/utils/a.ts')).toEqual([
            { messageId: 'typeOnly', data: { from: 'utils', to: 'errors', specifier: '@/errors', entry: '' }, text: "import { type E } from '@/errors';" },
        ]);
    });

    it('applies exceptions to the files they match', () => {
        expect(check("import { e } from '@/errors';", 'src/utils/media/a.ts')).toEqual([]);
    });

    it('reports an allowed edge that skips the entry, naming the entry', () => {
        expect(check("import { d } from '@/utils/deep';", 'src/app/a.ts')).toEqual([
            {
                messageId: 'notEntry',
                data:      { from: 'app', to: 'utils', specifier: '@/utils/deep', entry: "'src/utils/index.ts'" },
                text:      "import { d } from '@/utils/deep';",
            },
        ]);
    });

    it('names every entry when a module has several', () => {
        const several = fakePolicy({ allow: { app: '*' }, entry: ['index.ts', 'public.ts'] });
        expect(check("import { d } from '@/utils/deep';", 'src/app/a.ts', [several])[0]!.data!.entry).toBe("'src/utils/index.ts' or 'src/utils/public.ts'");
    });

    it('ignores imports that do not resolve, leave root, enter node_modules or reach no module', () => {
        expect(check("import a from 'missing';\nimport b from 'pkg';\nimport c from '../elsewhere';\nimport d from '@/stray';", 'src/utils/a.ts')).toEqual([]);
    });
});

describe('dependencies — import kinds', () => {
    it('checks every import-like node, once each', () => {
        const code = [
            "export { a } from '@/app';",
            "export * from '@/app';",
            "const b = import('@/app');",
            "const c = require('@/app');",
            "type D = import('@/app').D;",
            "const e = load('@/app');",
            'export const f = 1;',
        ].join('\n');
        expect(check(code, 'src/utils/a.ts').map(report => [report.messageId, report.text])).toEqual([
            ['notAllowed', "export { a } from '@/app';"],
            ['notAllowed', "export * from '@/app';"],
            ['notAllowed', "import('@/app')"],
            ['notAllowed', "require('@/app')"],
            ['notAllowed', "import('@/app').D"],
        ]);
    });

    it('checks external import-equals declarations as value or type-only, not namespace aliases', () => {
        const code = [
            "import App = require('@/app');",
            "import Value = require('@/errors');",
            "import type Type = require('@/errors');",
            'import member = Namespace.member;',
        ].join('\n');
        expect(check(code, 'src/utils/a.ts').map(report => [report.messageId, report.text])).toEqual([
            ['notAllowed', "import App = require('@/app');"],
            ['typeOnly', "import Value = require('@/errors');"],
        ]);
    });

    it('treats type-position imports as type-only', () => {
        expect(check("type E = import('@/errors').E;\nexport type * from '@/errors';", 'src/utils/a.ts')).toEqual([]);
    });

    it('resolves with the policy tsconfig when it has one', () => {
        const withTsconfig = fakePolicy({ tsconfig: 'tsconfig.json' });
        const recording = fakeHost({});
        lint(createDependenciesRule(recording), "import a from './x';", `${ROOT}/src/app/a.ts`, [withTsconfig]);
        lint(createDependenciesRule(recording), "import a from './x';", `${ROOT}/src/app/a.ts`, [fakePolicy()]);
        expect(recording.calls).toEqual([
            { importer: `${ROOT}/src/app/a.ts`, specifier: './x', tsconfig: `${ROOT}/tsconfig.json` },
            { importer: `${ROOT}/src/app/a.ts`, specifier: './x', tsconfig: null },
        ]);
    });
});
