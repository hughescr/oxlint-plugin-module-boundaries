import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { classifyImporter, classifyTarget, compilePolicy, moduleOf, relativeToRoot } from '../../../src/core/classify.js';
import { fakePolicy, ROOT } from '../helpers.js';

describe('compilePolicy', () => {
    it('indexes the entry files of directory and one-file modules', () => {
        const compiled = compilePolicy(fakePolicy({ entry: ['index.ts', 'lib/index.ts'] }));
        expect(compiled.entries.get('utils')).toEqual(['src/utils/index.ts', 'src/utils/lib/index.ts']);
        expect(compiled.entries.get('main')).toEqual(['src/index.ts']);
    });

    it('collects the entries of every path of a multi-path module', () => {
        const compiled = compilePolicy(fakePolicy({ modules: { libs: ['src/utils', 'src/errors'], main: 'src/index.ts' } }));
        expect(compiled.entries.get('libs')).toEqual(['src/errors/index.ts', 'src/utils/index.ts']);
    });

    it('gives directory modules no entries when entry is false', () => {
        const compiled = compilePolicy(fakePolicy({ entry: false }));
        expect(compiled.entries.get('utils')).toEqual([]);
        expect(compiled.entries.get('main')).toEqual(['src/index.ts']);
    });

    it('indexes edges, keeping the * wildcard', () => {
        const compiled = compilePolicy(fakePolicy({ allow: { app: '*', utils: ['errors'] }, allowTypeOnly: { errors: ['agent'] } }));
        expect(compiled.allow.get('app')).toBe('*');
        expect(compiled.allow.get('utils')).toEqual(new Set(['errors']));
        expect(compiled.allow.has('errors')).toBe(false);
        expect(compiled.allowTypeOnly.get('errors')).toEqual(new Set(['agent']));
    });

    it('compiles the include, ignore and exception globs', () => {
        const compiled = compilePolicy(fakePolicy({
            include:    ['src/**'],
            ignore:     ['**/*.test.ts'],
            exceptions: [{ files: ['src/utils/media/**'], allow: ['errors'], allowTypeOnly: ['agent'] }],
        }));
        expect(compiled.isIncluded('src/x.ts')).toBe(true);
        expect(compiled.isIncluded('tools/x.ts')).toBe(false);
        expect(compiled.isIgnored('src/a.test.ts')).toBe(true);
        expect(compiled.isIgnored('src/a.ts')).toBe(false);
        const [exception] = compiled.exceptions;
        expect(exception!.matches('src/utils/media/a.ts')).toBe(true);
        expect(exception!.matches('src/utils/a.ts')).toBe(false);
        expect(exception!.allow).toEqual(new Set(['errors']));
        expect(exception!.allowTypeOnly).toEqual(new Set(['agent']));
    });

    it('matches nothing with empty include and ignore', () => {
        const compiled = compilePolicy(fakePolicy());
        expect(compiled.isIncluded('src/x.ts')).toBe(false);
        expect(compiled.isIgnored('src/x.ts')).toBe(false);
    });
});

describe('relativeToRoot and moduleOf', () => {
    const compiled = compilePolicy(fakePolicy({ modules: { outer: 'src', utils: 'src/utils', media: 'src/utils/media', main: 'src/index.ts' } }));

    it('relativises paths under root only', () => {
        expect(relativeToRoot(compiled, `${ROOT}/src/a.ts`)).toBe('src/a.ts');
        expect(relativeToRoot(compiled, '/projectile/src/a.ts')).toBeUndefined();
        expect(relativeToRoot(compiled, '/elsewhere/a.ts')).toBeUndefined();
    });

    it('classifies native Windows paths with slash globs and rejects different drives', () => {
        const windows = compilePolicy({ ...fakePolicy({ include: ['src/**'], ignore: ['**/*.test.ts'] }), root: String.raw`C:\repo` }, path.win32);
        expect(classifyImporter(windows, String.raw`c:\REPO\src\app\a.ts`)).toEqual({ kind: 'module', relative: 'src/app/a.ts', module: 'app' });
        expect(classifyImporter(windows, String.raw`C:\repo\src\app\a.test.ts`)).toEqual({ kind: 'skip' });
        expect(classifyImporter(windows, String.raw`C:\repo\src\stray.ts`)).toEqual({ kind: 'unassigned', relative: 'src/stray.ts' });
        expect(classifyTarget(windows, String.raw`C:\repo\src\utils\index.ts`)).toEqual({ relative: 'src/utils/index.ts', module: 'utils' });
        expect(relativeToRoot(windows, String.raw`D:\repo\src\app\a.ts`)).toBeUndefined();
        expect(relativeToRoot(windows, String.raw`C:\repo\..\outside.ts`)).toBeUndefined();
    });

    it('handles the POSIX filesystem root, dot segments, and literal backslashes', () => {
        const filesystem = compilePolicy({ ...fakePolicy(), root: '/' }, path.posix);
        expect(relativeToRoot(filesystem, '/src/../src/a.ts')).toBe('src/a.ts');
        expect(relativeToRoot(filesystem, '/')).toBeUndefined();
        expect(relativeToRoot(filesystem, String.raw`/src/a\b.ts`)).toBe(String.raw`src/a\b.ts`);
        expect(relativeToRoot(compiled, `${ROOT}/../outside.ts`)).toBeUndefined();
        expect(relativeToRoot(compiled, `${ROOT}/..`)).toBeUndefined();
        expect(relativeToRoot(compiled, `${ROOT}/..a.ts`)).toBe('..a.ts');
    });

    it('picks the most specific module', () => {
        expect(moduleOf(compiled, 'src/utils/media/a.ts')).toBe('media');
        expect(moduleOf(compiled, 'src/utils/a.ts')).toBe('utils');
        expect(moduleOf(compiled, 'src/a.ts')).toBe('outer');
        expect(moduleOf(compiled, 'src/index.ts')).toBe('main');
    });

    it('matches directory modules by whole path segments and file modules exactly', () => {
        expect(moduleOf(compiled, 'src/utilsx/a.ts')).toBe('outer');
        expect(moduleOf(compiled, 'src/index.tsx')).toBe('outer');
        expect(moduleOf(compiled, 'src')).toBeUndefined();
        expect(moduleOf(compiled, 'lib/a.ts')).toBeUndefined();
    });
});

describe('classifyImporter', () => {
    const compiled = compilePolicy(fakePolicy({ include: ['src/**'], ignore: ['**/*.test.ts'] }));

    it('skips files outside root', () => {
        expect(classifyImporter(compiled, '/elsewhere/src/app/a.ts')).toEqual({ kind: 'skip' });
    });

    it('skips ignored files, even inside a module', () => {
        expect(classifyImporter(compiled, `${ROOT}/src/app/a.test.ts`)).toEqual({ kind: 'skip' });
    });

    it('classifies files in a module', () => {
        expect(classifyImporter(compiled, `${ROOT}/src/app/a.ts`)).toEqual({ kind: 'module', relative: 'src/app/a.ts', module: 'app' });
    });

    it('reports included files in no module as unassigned and skips the rest', () => {
        expect(classifyImporter(compiled, `${ROOT}/src/stray.ts`)).toEqual({ kind: 'unassigned', relative: 'src/stray.ts' });
        expect(classifyImporter(compiled, `${ROOT}/tools/build.ts`)).toEqual({ kind: 'skip' });
    });
});

describe('classifyTarget', () => {
    const compiled = compilePolicy(fakePolicy());

    it('classifies a file in a module', () => {
        expect(classifyTarget(compiled, `${ROOT}/src/utils/index.ts`)).toEqual({ relative: 'src/utils/index.ts', module: 'utils' });
    });

    it('ignores files outside root, in node_modules or in no module', () => {
        expect(classifyTarget(compiled, '/elsewhere/src/utils/index.ts')).toBeUndefined();
        expect(classifyTarget(compiled, `${ROOT}/src/utils/node_modules/x/index.ts`)).toBeUndefined();
        expect(classifyTarget(compiled, `${ROOT}/node_modules/x/index.ts`)).toBeUndefined();
        expect(classifyTarget(compiled, `${ROOT}/src/stray.ts`)).toBeUndefined();
    });

    it('does not mistake a directory merely named like node_modules', () => {
        expect(classifyTarget(compiled, `${ROOT}/src/utils/my_node_modules/x.ts`)).toEqual({ relative: 'src/utils/my_node_modules/x.ts', module: 'utils' });
    });
});
