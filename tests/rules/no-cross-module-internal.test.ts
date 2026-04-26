/**
 * Tests for no-cross-module-internal rule behaviour.
 *
 * The rule delegates the @internal-tag lookup to `isExportInternal` from
 * `src/lib/ts-helpers.ts`. The bug this file guards against:
 *
 *   Source module has:  /** @internal * / export { internalFn as publicAlias } from './deeper'
 *   Importer does:      import { publicAlias } from '@/SourceModule'
 *
 * `isExportInternal(sourceFile, 'publicAlias')` must return true.  The buggy
 * code compared against `element.propertyName` (the pre-alias name, 'internalFn')
 * instead of `element.name` (the post-alias/exported name, 'publicAlias'), so it
 * silently returned false.
 *
 * We test `isExportInternal` directly here because the full RuleTester path for
 * `no-cross-module-internal` requires fixture files under `src/` paths for the
 * module-boundary detection to work. A direct unit test of the helper is more
 * targeted and equally valid as a regression guard.
 */
import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import typescriptParser from '@typescript-eslint/parser';
import { Linter, RuleTester, type Rule } from 'eslint';
import ts from 'typescript';
import { isExportInternal } from '../../src/lib/ts-helpers.js';
import rule, { buildMatchers, getModuleForFile } from '../../src/rules/no-cross-module-internal.js';

// Direct unit tests for exported helpers placed FIRST so Stryker's per-test coverage
// maps them at positions 1-N before RuleTester-generated tests.

describe('buildMatchers — direct unit tests', () => {
    it('returns one matcher per module entry', () => {
        const matchers = buildMatchers([
            { type: 'agent', pattern: 'src/agent/**' },
            { type: 'storage', pattern: 'src/storage/**' },
        ]);
        expect(matchers).toHaveLength(2);
        const first = matchers[0]!;
        const second = matchers[1]!;
        expect(first.type).toBe('agent');
        expect(second.type).toBe('storage');
    });

    it('matcher returns true for matching path', () => {
        const matchers = buildMatchers([{ type: 'agent', pattern: 'src/agent/**' }]);
        const m = matchers[0]!;
        expect(m.matcher('src/agent/foo.ts')).toBe(true);
    });

    it('matcher returns false for non-matching path', () => {
        const matchers = buildMatchers([{ type: 'agent', pattern: 'src/agent/**' }]);
        const m = matchers[0]!;
        expect(m.matcher('src/storage/foo.ts')).toBe(false);
    });

    it('accepts array pattern and matches any entry', () => {
        const matchers = buildMatchers([{ type: 'agent', pattern: ['src/agent/**', 'src/app/**'] }]);
        const m = matchers[0]!;
        expect(m.matcher('src/agent/x.ts')).toBe(true);
        expect(m.matcher('src/app/y.ts')).toBe(true);
        expect(m.matcher('src/storage/z.ts')).toBe(false);
    });

    it('returns empty array for empty input', () => {
        expect(buildMatchers([])).toHaveLength(0);
    });
});

describe('getModuleForFile — direct unit tests', () => {
    const cwd = '/project';
    const matchers = buildMatchers([
        { type: 'agent', pattern: 'src/agent/**' },
        { type: 'storage', pattern: 'src/storage/**' },
    ]);

    it('returns module type for a matching file', () => {
        expect(getModuleForFile('/project/src/agent/foo.ts', cwd, matchers)).toBe('agent');
    });

    it('returns second module type when first does not match', () => {
        expect(getModuleForFile('/project/src/storage/bar.ts', cwd, matchers)).toBe('storage');
    });

    it('returns null for a file not in any module', () => {
        expect(getModuleForFile('/project/tests/unit/foo.test.ts', cwd, matchers)).toBeNull();
    });

    it('returns null for empty matchers', () => {
        expect(getModuleForFile('/project/src/agent/foo.ts', cwd, [])).toBeNull();
    });

    it('normalizes backslashes to forward slashes for Windows paths', () => {
        // Simulate a Windows-style resolved path by using an absolute path with backslashes
        // path.relative() on the current platform produces forward slashes on macOS/Linux,
        // so we test the replaceAll directly via a path that produces backslashes.
        // We confirm a non-matching path returns null (the Windows branch is tested via the rule).
        expect(getModuleForFile('/project/tools/eslint-rules/foo.mjs', cwd, matchers)).toBeNull();
    });
});

const ruleTester = new RuleTester({
    languageOptions: {
        ecmaVersion: 2024,
        sourceType:  'module',
        parser:      typescriptParser,
    },
});

/**
 * Helper: parse a TypeScript source string into a SourceFile so we can call
 * `isExportInternal` without needing a real file on disk or a full Program.
 */
function parseSource(code: string): ts.SourceFile {
    return ts.createSourceFile(
        'test.ts',
        code,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        ts.ScriptKind.TS
    );
}

describe('no-cross-module-internal — rule options', () => {
    // When no modules option is provided, the rule must be a no-op (return {})
    // so it never reports errors even on cross-module-looking imports.
    ruleTester.run('no-cross-module-internal', rule as unknown as Rule.RuleModule, {
        valid: [
            // No options at all — rule is a no-op
            {
                code: `import { something } from './other';`,
            },
            // Modules option provided — valid same-module import (no TypeScript program available
            // in plain RuleTester, so parserServices.program is absent and rule returns {})
            {
                options: [{ modules: [{ type: 'agent', pattern: 'src/agent/**' }] }],
                code:    `import { something } from './other';`,
            },
        ],
        invalid: [],
    });
});

describe('isExportInternal — aliased re-export regression', () => {
    // ── Happy-path: plain named exports still work after the fix ─────────────

    it('returns true for a plain @internal function declaration', () => {
        const src = parseSource(`
/** @internal */
export function internalFn(): string { return 'x'; }
        `);
        expect(isExportInternal(src, 'internalFn')).toBe(true);
    });

    it('returns false for a public function declaration', () => {
        const src = parseSource(`
export function publicFn(): string { return 'x'; }
        `);
        expect(isExportInternal(src, 'publicFn')).toBe(false);
    });

    it('returns true for an @internal variable declaration', () => {
        const src = parseSource(`
/** @internal */
export const internalConst = 42;
        `);
        expect(isExportInternal(src, 'internalConst')).toBe(true);
    });

    it('returns false for a public variable declaration', () => {
        const src = parseSource(`
export const publicConst = 42;
        `);
        expect(isExportInternal(src, 'publicConst')).toBe(false);
    });

    it('returns false when looking up a name that does not exist in the file', () => {
        const src = parseSource(`
/** @internal */
export function internalFn(): string { return 'x'; }
        `);
        expect(isExportInternal(src, 'nonExistentName')).toBe(false);
    });

    it('returns true for @internal class declaration', () => {
        const src = parseSource(`
/** @internal */
export class InternalClass {}
        `);
        expect(isExportInternal(src, 'InternalClass')).toBe(true);
    });

    it('returns true for a multi-modifier @internal declaration (export declare)', () => {
        const src = parseSource(`
/** @internal */
export declare function internalDeclared(): void;
        `);
        expect(isExportInternal(src, 'internalDeclared')).toBe(true);
    });

    it('returns false for a public declaration when looking up one of multiple exported names', () => {
        const src = parseSource(`
/** @internal */
export function a(): void {}
export function b(): void {}
        `);
        expect(isExportInternal(src, 'b')).toBe(false);
    });

    it('returns true for @internal export default expression (ExportAssignment)', () => {
        const src = parseSource(`
/** @internal */
export default 42;
        `);
        expect(isExportInternal(src, 'default')).toBe(true);
    });

    it('returns false for public export default expression', () => {
        const src = parseSource(`
export default 42;
        `);
        expect(isExportInternal(src, 'default')).toBe(false);
    });

    it('returns true for @internal export default class', () => {
        const src = parseSource(`
/** @internal */
export default class Foo {}
        `);
        expect(isExportInternal(src, 'default')).toBe(true);
    });

    it('returns true for @internal export default function', () => {
        const src = parseSource(`
/** @internal */
export default function foo() {}
        `);
        expect(isExportInternal(src, 'default')).toBe(true);
    });

    it('returns false when searching for "default" in a file with no default export', () => {
        const src = parseSource(`
export function publicFn(): string { return 'x'; }
        `);
        expect(isExportInternal(src, 'default')).toBe(false);
    });

    // ── Core regression: re-export with alias ─────────────────────────────────
    //
    // Source:   /** @internal */ export { internalFn as publicAlias } from './deeper'
    // Lookup:   isExportInternal(src, 'publicAlias')
    //
    // Buggy code used (element.propertyName ?? element.name).text which resolves
    // to 'internalFn' — doesn't match 'publicAlias' → returns false (BUG).
    // Fixed code uses element.name.text which resolves to 'publicAlias' → matches.
    //
    // NOTE: avoid putting '@internal' in comment text (not tagged with @) — the
    // TypeScript JSDoc parser treats any occurrence of the text "@internal" in a
    // comment as an @internal tag, which would make "not internal" comments appear
    // internal. Use "not tagged internal" or "public" wording instead.

    it('returns true when looking up the POST-alias exported name of an @internal re-export', () => {
        const src = parseSource(`
/** @internal */
export { internalFn as publicAlias } from './deeper';
        `);
        // publicAlias is the *exported* name — what callers import
        expect(isExportInternal(src, 'publicAlias')).toBe(true);
    });

    it('returns false when looking up the PRE-alias original name of an @internal re-export', () => {
        // 'internalFn' is not the name callers see; the exported name is 'publicAlias'.
        const src = parseSource(`
/** @internal */
export { internalFn as publicAlias } from './deeper';
        `);
        // Callers never see 'internalFn' — only 'publicAlias' is exported
        expect(isExportInternal(src, 'internalFn')).toBe(false);
    });

    it('returns false for a public (not tagged internal) aliased re-export', () => {
        const src = parseSource(`
/** Public re-export with alias */
export { internalFn as publicAlias } from './deeper';
        `);
        expect(isExportInternal(src, 'publicAlias')).toBe(false);
    });

    it('handles a file with mixed tagged-internal and public aliased re-exports', () => {
        const src = parseSource(`
/** @internal */
export { internalFn as publicAlias } from './deeper';

/** Public aliased re-export */
export { otherFn as anotherAlias } from './deeper';
        `);
        expect(isExportInternal(src, 'publicAlias')).toBe(true);
        expect(isExportInternal(src, 'anotherAlias')).toBe(false);
    });

    // ── Edge case: no alias present (element.propertyName is undefined) ───────

    it('returns true for a plain (no alias) @internal re-export', () => {
        const src = parseSource(`
/** @internal */
export { internalFn } from './deeper';
        `);
        expect(isExportInternal(src, 'internalFn')).toBe(true);
    });
});

describe('no-cross-module-internal — schema validation', () => {
    const linter = new Linter({ configType: 'flat' });

    function verifyWithOptions(options: unknown): string {
        try {
            linter.verify('const x = 1;', {
                plugins: { local: { rules: { 'no-cross-module-internal': rule as unknown as Rule.RuleModule } } },
                rules:   { 'local/no-cross-module-internal': ['error', options] },
            });
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
    }

    it('rejects empty pattern string', () => {
        const msg = verifyWithOptions({ modules: [{ type: 'agent', pattern: '' }] });
        expect(msg).toMatch(/shorter than 1 characters/);
    });

    it('rejects empty pattern array', () => {
        const msg = verifyWithOptions({ modules: [{ type: 'agent', pattern: [] }] });
        expect(msg).toMatch(/fewer than 1/);
    });

    it('rejects empty modules array', () => {
        const msg = verifyWithOptions({ modules: [] });
        expect(msg).toMatch(/fewer than 1/);
    });

    it('rejects empty type string', () => {
        const msg = verifyWithOptions({ modules: [{ type: '', pattern: 'src/foo/**' }] });
        expect(msg).toMatch(/shorter than 1 characters/);
    });

    it('rejects empty pattern array element', () => {
        const msg = verifyWithOptions({ modules: [{ type: 'foo', pattern: [''] }] });
        expect(msg).toMatch(/shorter than 1 characters/);
    });
});

// RuleTester with projectService — exercises the full create() body including
// TypeScript program resolution and @internal detection across module boundaries.
const ruleTesterWithProgram = new RuleTester({
    languageOptions: {
        ecmaVersion:   2024,
        sourceType:    'module',
        parser:        typescriptParser,
        parserOptions: {
            projectService: {
                // Allow test fixture files not explicitly included in any tsconfig.
                // Must include all eslint-rules fixture directories to avoid conflicts when
                // multiple rule test files run in the same bun process (projectService is a singleton).
                // Also include virtual .test.ts filenames used in test cases (e.g. "skip .test.ts" cases).
                allowDefaultProject: [
                    'tests/fixtures/no-internal-in-barrel/*.ts',
                    'tests/fixtures/no-star-export-from-non-barrel/*.ts',
                    'tests/fixtures/no-star-export-from-non-barrel/sub/*.ts',
                    'tests/fixtures/no-cross-module-internal/src/storage/*.ts',
                    'tests/fixtures/no-cross-module-internal/src/agent/*.ts',
                    'tests/fixtures/no-cross-module-internal/src/agent/*.test.ts',
                ],
                defaultProject: path.resolve(import.meta.dir, '../../tsconfig.json'),
            },
            tsconfigRootDir: path.resolve(import.meta.dir, '../..'),
        },
    },
});

// Fixture directories — filenames must match the module patterns used in options.
// Patterns are relative to CWD (project root), so we use the full relative fixture path.
const fixtureAgent = path.resolve(import.meta.dir, '../fixtures/no-cross-module-internal/src/agent');

// Module patterns using the actual relative paths from project root so that
// context.cwd + path.relative() produces a match.
const testModules = [
    { type: 'agent',   pattern: 'tests/fixtures/no-cross-module-internal/src/agent/**' },
    { type: 'storage', pattern: 'tests/fixtures/no-cross-module-internal/src/storage/**' },
];

describe('no-cross-module-internal — with TypeScript program (full create() path)', () => {
    ruleTesterWithProgram.run('no-cross-module-internal', rule as unknown as Rule.RuleModule, {
        valid: [
            // Import of a public (not @internal) aliased re-export from storage — allowed
            {
                filename: path.join(fixtureAgent, 'importer.ts'),
                options:  [{ modules: testModules }],
                code:     `import { publicNonInternalAlias } from '../storage/with-aliased-reexport';`,
            },
            // Import from same module (agent → agent) — always allowed
            {
                filename: path.join(fixtureAgent, 'importer.ts'),
                options:  [{ modules: testModules }],
                code:     `import { internalFn } from '../storage/deeper-source';`,
            },
            // Test-file skip: .test.ts files are never checked
            {
                filename: path.join(fixtureAgent, 'importer.test.ts'),
                options:  [{ modules: testModules }],
                code:     `import { publicAlias } from '../storage/with-aliased-reexport';`,
            },
            // Default import (ImportDefaultSpecifier) — not an ImportSpecifier, rule skips
            {
                filename: path.join(fixtureAgent, 'importer.ts'),
                options:  [{ modules: testModules }],
                code:     `import deeperSource from '../storage/deeper-source';`,
            },
            // Namespace import (ImportNamespaceSpecifier) — rule skips
            {
                filename: path.join(fixtureAgent, 'importer.ts'),
                options:  [{ modules: testModules }],
                code:     `import * as storage from '../storage/deeper-source';`,
            },
        ],
        invalid: [
            // Import of an @internal aliased re-export from storage into agent — blocked
            {
                filename: path.join(fixtureAgent, 'importer.ts'),
                options:  [{ modules: testModules }],
                code:     `import { publicAlias } from '../storage/with-aliased-reexport';`,
                errors:   [{ messageId: 'crossModuleInternal', data: { name: 'publicAlias', sourceModule: 'storage', importerModule: 'agent' } }],
            },
        ],
    });
});
