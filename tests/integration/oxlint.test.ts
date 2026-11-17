/**
 * Runs the real Oxlint (under Node, as consumers do) on tests/fixtures/oxlint-project, whose policy file calls
 * `defineBoundaries` and whose config only `extends` the result.
 *
 * The plugin is bundled from src/ into node_modules/.cache first, because the fixture imports it from there.
 * This file spawns processes, so the Stryker run leaves it out (see stryker.conf.mjs).
 */
import { beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repo = path.resolve(import.meta.dir, '../..');
const fixture = path.join(repo, 'tests/fixtures/oxlint-project');
const config = path.join(fixture, 'oxlint.config.mjs');
const SLOW = 60_000;

interface Finding {
    readonly file:    string
    readonly line:    number
    readonly rule:    string
    readonly message: string
}

function oxlint(cwd: string): { readonly exitCode: number, readonly findings: Finding[] } {
    const result = Bun.spawnSync(['node', path.join(repo, 'node_modules/oxlint/bin/oxlint'), '-c', config, '--format', 'unix', fixture], { cwd, stdout: 'pipe', stderr: 'pipe' });
    const findings = result.stdout.toString().split('\n').flatMap((line) => {
        const match = /^(.+?):(\d+):\d+: (.*) \[Error\/@hughescr\/module-boundaries\((.+)\)\]$/u.exec(line);
        return match === null ? [] : [{ file: path.relative(fixture, path.resolve(cwd, match[1]!)), line: Number(match[2]), rule: match[4]!, message: match[3]! }];
    });
    return { exitCode: result.exitCode, findings: findings.toSorted((a, b) => a.file.localeCompare(b.file) || a.line - b.line) };
}

const expected: readonly (readonly [string, number, string, string])[] = [
    ['src/app/index.ts', 3, 'dependencies', "Module 'app' must import module 'utils' through its entry 'src/utils/index.ts', not '../utils/helper'."],
    ['src/app/index.ts', 4, 'dependencies', "Module 'app' must import module 'utils' through its entry 'src/utils/index.ts', not '@/utils/nested'."],
    ['src/app/index.ts', 5, 'no-cross-module-internal', "'internalThing' is marked @internal in module 'utils' and cannot be imported from module 'app'."],
    ['src/stray.ts', 1, 'dependencies', "'src/stray.ts' is in no module of the boundaries policy; add it to a module or narrow `include`."],
    ['src/utils/index.ts', 2, 'no-internal-in-barrel', "'hidden' is marked @internal and must not be re-exported from a barrel index.ts."],
    ['src/utils/index.ts', 3, 'no-star-export-from-non-barrel', "export * from './star' re-exports from a non-barrel file. @internal items can leak silently. Use explicit `export { ... } from` to enumerate names, or re-export from a barrel index.ts."],
    ['src/utils/kinds.ts', 2, 'dependencies', "Module 'utils' may import module 'errors' only with a type-only import ('@/errors'); use `import type`."],
    ['src/utils/kinds.ts', 3, 'dependencies', "Module 'utils' may not import module 'app' ('@/app')."],
    ['src/utils/kinds.ts', 5, 'dependencies', "Module 'utils' may not import module 'app' ('@/app')."],
    ['src/utils/kinds.ts', 6, 'dependencies', "Module 'utils' may not import module 'app' ('@/app')."],
    ['src/utils/kinds.ts', 7, 'dependencies', "Module 'utils' may not import module 'app' ('@/app')."],
    ['src/utils/kinds.ts', 8, 'dependencies', "Module 'utils' may not import module 'app' ('@/app')."],
    ['src/utils/kinds.ts', 9, 'dependencies', "Module 'utils' may not import module 'app' ('@/app')."],
];

describe('real Oxlint on the fixture project', () => {
    beforeAll(async () => {
        const build = await Bun.build({
            entrypoints: [path.join(repo, 'src/index.ts')],
            outdir:      path.join(repo, 'node_modules/.cache/oxlint-plugin-module-boundaries-it'),
            target:      'node',
            format:      'esm',
            packages:    'external',
        });
        if(!build.success) {
            throw new AggregateError(build.logs, 'bundling src/ for the Oxlint fixture failed');
        }
    }, SLOW);

    it('reports every message id on the expected lines and nothing on allowed edges', () => {
        const { exitCode, findings } = oxlint(repo);
        expect(findings.map(({ file, line, rule, message }) => [file, line, rule, message])).toEqual(expected.map(row => [...row]));
        expect(exitCode).toBe(1);
    }, SLOW);

    it('gives the same result when Oxlint starts in another working directory', () => {
        const { findings } = oxlint(tmpdir());
        expect(findings.map(({ file, line, rule }) => [file, line, rule])).toEqual(expected.map(([file, line, rule]) => [file, line, rule]));
    }, SLOW);
});

/**
 * The published declarations must not need `@types/node`: a consumer with `skipLibCheck: false` and no Node types
 * has to type-check them. Declarations are emitted fresh here (the same tsrs build as `bun run build`, into the
 * cache directory) so the test never depends on a stale or missing `dist/`.
 */
describe('emitted declarations', () => {
    const out = path.join(repo, 'node_modules/.cache/oxlint-plugin-module-boundaries-dts');
    const tsrs = path.join(repo, 'node_modules/tsrs/bin/tsrs');

    function tsrsRun(args: readonly string[]): { readonly exitCode: number, readonly output: string } {
        const result = Bun.spawnSync(['node', tsrs, ...args], { cwd: repo, stdout: 'pipe', stderr: 'pipe' });
        return { exitCode: result.exitCode, output: result.stdout.toString() + result.stderr.toString() };
    }

    let build: { readonly exitCode: number, readonly output: string };

    beforeAll(() => {
        rmSync(out, { recursive: true, force: true });
        mkdirSync(out, { recursive: true });
        build = tsrsRun(['-p', 'tsconfig.build.json', '--outDir', path.join(out, 'dist')]);
    }, SLOW);

    it('reference no Node module or Node type anywhere under dist', () => {
        expect(build.output).toBe('');
        expect(build.exitCode).toBe(0);
        const files = readdirSync(path.join(out, 'dist'), { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.d.ts'));
        expect(files).toContain('index.d.ts');
        const leaks = files.flatMap(file => readFileSync(path.join(out, 'dist', file), 'utf8').split('\n')
            .flatMap((line, index) => (/['"]node:|\btypeof path\b|\bNodeJS\b|\bBuffer\b/u.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [])));
        expect(leaks).toEqual([]);
    });

    it('type-check in a consumer with skipLibCheck off and no @types/node', () => {
        const tsconfig = path.join(out, 'tsconfig.json');
        writeFileSync(tsconfig, JSON.stringify({
            compilerOptions: { target: 'ESNext', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: false, noEmit: true, types: [] },
            files:           ['dist/index.d.ts'],
        }));
        const check = tsrsRun(['-p', tsconfig]);
        expect(check.output).toBe('');
        expect(check.exitCode).toBe(0);
    }, SLOW);
});
