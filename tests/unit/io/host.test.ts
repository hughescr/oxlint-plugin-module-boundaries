import { describe, expect, it } from 'bun:test';
import { createHost, createTsconfigLocator, type FileStamp, type HostPrimitives } from '../../../src/io/host.js';
import { compiledPolicyFor } from '../../../src/io/policy-cache.js';
import { fakePolicy, parse } from '../helpers.js';

describe('createTsconfigLocator', () => {
    it('finds the nearest tsconfig.json at or above a directory', () => {
        const files = new Set(['/repo/tsconfig.json', '/repo/src/tsconfig.json']);
        const locate = createTsconfigLocator(file => files.has(file));
        expect(locate('/repo/src/app')).toBe('/repo/src/tsconfig.json');
        expect(locate('/repo/src')).toBe('/repo/src/tsconfig.json');
        expect(locate('/repo/tools')).toBe('/repo/tsconfig.json');
        expect(locate('/elsewhere/a')).toBeUndefined();
    });

    it('asks the file system about each directory once', () => {
        const asked: string[] = [];
        const locate = createTsconfigLocator((file) => {
            asked.push(file);
            return file === '/repo/tsconfig.json';
        });
        expect(locate('/repo/src/app')).toBe('/repo/tsconfig.json');
        expect(locate('/repo/src/app')).toBe('/repo/tsconfig.json');
        expect(locate('/repo/src/lib')).toBe('/repo/tsconfig.json');
        expect(asked).toEqual(['/repo/src/app/tsconfig.json', '/repo/src/tsconfig.json', '/repo/tsconfig.json', '/repo/src/lib/tsconfig.json']);
    });

    it('stops at the file-system root', () => {
        const asked: string[] = [];
        const locate = createTsconfigLocator((file) => {
            asked.push(file);
            return false;
        });
        expect(locate('/a')).toBeUndefined();
        expect(asked).toEqual(['/a/tsconfig.json', '/tsconfig.json']);
    });
});

interface Recorder {
    readonly resolvers: (string | undefined)[]
    readonly resolved:  string[]
    readonly parsed:    string[]
    readonly cleared:   (string | undefined)[]
    stamps:             Record<string, FileStamp>
    missingAvailable:   boolean
    now:                number
}

const TSCONFIGS: Readonly<Record<string, FileStamp>> = {
    '/repo/tsconfig.json':     { mtimeMs: 1, size: 2 },
    '/repo/pkg/tsconfig.json': { mtimeMs: 1, size: 2 },
};

function primitives(recorder: Recorder): HostPrimitives {
    return {
        createResolver: (tsconfig) => {
            recorder.resolvers.push(tsconfig);
            return {
                resolveDtsSync(file, specifier) {
                    recorder.resolved.push(`${file} ${specifier}`);
                    return specifier === 'missing' || specifier === './data.json' ? {} : { path: `${tsconfig ?? 'none'}:${specifier}` };
                },
                resolveFileSync(_file, specifier) {
                    return specifier === './data.json' || (specifier === 'missing' && recorder.missingAvailable)
                        ? { path: `${tsconfig ?? 'none'}:${specifier}` }
                        : { error: 'Cannot find module' };
                },
                clearCache: () => { recorder.cleared.push(tsconfig); },
            };
        },
        stat:     file => recorder.stamps[file] ?? TSCONFIGS[file],
        now:      () => recorder.now,
        realpath: file => file,
        readFile: () => '/** @internal */ export const hidden = 1;\nexport const shown = 2;',
        parse:    (file, text) => {
            recorder.parsed.push(file);
            return { ...parse(text), hasErrors: false };
        },
    };
}

function newRecorder(): Recorder {
    return { resolvers: [], resolved: [], parsed: [], cleared: [], stamps: {}, missingAvailable: false, now: 0 };
}

describe('createHost — resolve', () => {
    it('resolves with the nearest tsconfig.json, one resolver per tsconfig', () => {
        const record = newRecorder();
        const host = createHost(primitives(record));
        expect(host.resolve('/repo/src/a.ts', './b', null)).toBe('/repo/tsconfig.json:./b');
        expect(host.resolve('/repo/src/c.ts', './d', null)).toBe('/repo/tsconfig.json:./d');
        expect(host.resolve('/repo/pkg/e.ts', './f', null)).toBe('/repo/pkg/tsconfig.json:./f');
        expect(host.resolve('/outside/g.ts', './h', null)).toBe('none:./h');
        expect(record.resolvers).toEqual(['/repo/tsconfig.json', '/repo/pkg/tsconfig.json', undefined]);
    });

    it('resolves with an explicit tsconfig when given one', () => {
        const record = newRecorder();
        const host = createHost(primitives(record));
        expect(host.resolve('/repo/src/a.ts', './b', '/custom/tsconfig.json')).toBe('/custom/tsconfig.json:./b');
        expect(record.resolvers).toEqual(['/custom/tsconfig.json']);
    });

    it('caches hits and misses by importer, specifier and tsconfig within the idle window', () => {
        const record = newRecorder();
        const host = createHost(primitives(record));
        host.beginRule();
        expect(host.resolve('/repo/a.ts', 'missing', null)).toBeUndefined();
        record.missingAvailable = true;
        record.now = 1000;
        host.beginRule();
        expect(host.resolve('/repo/a.ts', 'missing', null)).toBeUndefined();
        expect(host.resolve('/repo/a.ts', './b', null)).toBe('/repo/tsconfig.json:./b');
        expect(host.resolve('/repo/a.ts', './b', null)).toBe('/repo/tsconfig.json:./b');
        expect(host.resolve('/repo/a.ts', './b', '/x/tsconfig.json')).toBe('/x/tsconfig.json:./b');
        expect(host.resolve('/repo/c.ts', './b', null)).toBe('/repo/tsconfig.json:./b');
        expect(record.resolved).toEqual(['/repo/a.ts missing', '/repo/a.ts ./b', '/repo/a.ts ./b', '/repo/c.ts ./b']);
    });
});

describe('createHost — refresh and resolution fallback', () => {
    it('refreshes caches after a gap between rules, but keeps the parse cache', () => {
        const record = newRecorder();
        const file = '/repo/src/a.ts';
        record.stamps = { [file]: { mtimeMs: 2, size: 10 } };
        const option = fakePolicy();
        const host = createHost(primitives(record));
        host.beginRule();
        expect(host.resolve(file, 'missing', null)).toBeUndefined();
        expect(host.resolve(file, './b', null)).toBe('/repo/tsconfig.json:./b');
        const compiled = compiledPolicyFor(option, 'test');
        const names = host.internalExports(file);
        record.now = 900;
        host.beginRule();
        record.now = 1800;
        host.beginRule();
        expect(compiledPolicyFor(option, 'test')).toBe(compiled);
        expect(record.cleared).toEqual([]);

        record.now = 2801;
        record.missingAvailable = true;
        record.stamps['/repo/src/tsconfig.json'] = { mtimeMs: 1, size: 1 };
        host.beginRule();
        expect(host.resolve(file, 'missing', null)).toBe('/repo/src/tsconfig.json:missing');
        expect(host.resolve(file, './b', null)).toBe('/repo/src/tsconfig.json:./b');
        expect(host.resolve('/repo/c.ts', './b', null)).toBe('/repo/tsconfig.json:./b');
        expect(record.resolvers).toEqual(['/repo/tsconfig.json', '/repo/src/tsconfig.json', '/repo/tsconfig.json']);
        expect(record.cleared).toEqual(['/repo/tsconfig.json']);
        expect(compiledPolicyFor(option, 'test')).not.toBe(compiled);
        expect(host.internalExports(file)).toBe(names);
    });

    it('falls back to plain files with the same tsconfig and prefers declaration hits', () => {
        const host = createHost(primitives(newRecorder()));
        expect(host.resolve('/repo/a.ts', './data.json', '/explicit.json')).toBe('/explicit.json:./data.json');
        expect(host.resolve('/repo/a.ts', './b', '/explicit.json')).toBe('/explicit.json:./b');
    });

    it('throws a named tsconfig error from preflight, declaration resolution, or fallback', () => {
        for(const failAt of ['preflight', 'declaration', 'fallback']) {
            const config = '/repo/tsconfig.json';
            const error = failAt === 'fallback' ? `Tsconfig not found ${config}` : `Failed to load tsconfig ${config}: malformed JSON`;
            const host = createHost({
                ...primitives(newRecorder()),
                createResolver: () => ({
                    resolveDtsSync:  () => (failAt === 'declaration' ? { error } : {}),
                    resolveFileSync: (_file, specifier) => ({
                        error: (specifier === '.' ? failAt === 'preflight' : failAt === 'fallback') ? error : 'Cannot find module',
                    }),
                    clearCache() { /* This fake does not cache. */ },
                }),
            });
            expect(() => host.resolve('/repo/a.ts', './b', null)).toThrow(error);
        }
    });

    it('caches the canonical importer path only within the idle window', () => {
        const record = newRecorder();
        const file = '/repo/alias/a.ts';
        let canonical = '/repo/src/a.ts';
        const host = createHost({ ...primitives(record), realpath: () => canonical });
        host.beginRule();
        expect(host.canonicalPath(file)).toBe(canonical);
        canonical = '/repo/pkg/a.ts';
        expect(host.canonicalPath(file)).toBe('/repo/src/a.ts');
        record.now = 1001;
        host.beginRule();
        expect(host.canonicalPath(file)).toBe(canonical);
    });
});

describe('createHost — internalExports', () => {
    it('keeps partially parsed exports but does not cache that result', () => {
        const record = newRecorder();
        const file = '/repo/a.ts';
        record.stamps = { [file]: { mtimeMs: 1, size: 10 } };
        let hasErrors = true;
        const base = primitives(record);
        const host = createHost({ ...base, parse: (target, text) => ({ ...base.parse(target, text), hasErrors }) });
        expect(host.internalExports(file)).toEqual(new Set(['hidden']));
        hasErrors = false;
        const healthy = host.internalExports(file);
        expect(healthy).toEqual(new Set(['hidden']));
        expect(host.internalExports(file)).toBe(healthy);
        expect(record.parsed).toEqual([file, file]);
    });

    it('treats racing file reads as unresolved without caching the failure', () => {
        const record = newRecorder();
        const file = '/repo/a.ts';
        record.stamps = { [file]: { mtimeMs: 1, size: 10 } };
        let exists = false;
        const base = primitives(record);
        const host = createHost({
            ...base,
            readFile: (target) => {
                if(!exists) {
                    throw new TypeError('file removed after stat');
                }
                return base.readFile(target);
            },
        });
        expect(host.internalExports(file)).toEqual(new Set());
        expect(record.parsed).toEqual([]);
        exists = true;
        expect(host.internalExports(file)).toEqual(new Set(['hidden']));
    });
    it('reads the @internal exports of a source file', () => {
        const record = newRecorder();
        record.stamps = { '/repo/a.ts': { mtimeMs: 1, size: 10 } };
        expect(createHost(primitives(record)).internalExports('/repo/a.ts')).toEqual(new Set(['hidden']));
    });

    it('returns nothing for missing files and files that are not JavaScript or TypeScript', () => {
        const record = newRecorder();
        record.stamps = { '/repo/data.json': { mtimeMs: 1, size: 10 }, '/repo/a.ts.bak': { mtimeMs: 1, size: 10 } };
        const host = createHost(primitives(record));
        expect(host.internalExports('/repo/missing.ts')).toEqual(new Set());
        expect(host.internalExports('/repo/data.json')).toEqual(new Set());
        expect(host.internalExports('/repo/a.ts.bak')).toEqual(new Set());
        expect(record.parsed).toEqual([]);
    });

    it('parses every JavaScript and TypeScript extension', () => {
        const files = ['/r/a.ts', '/r/a.tsx', '/r/a.mts', '/r/a.cts', '/r/a.d.ts', '/r/a.js', '/r/a.jsx', '/r/a.mjs', '/r/a.cjs'];
        const record = newRecorder();
        record.stamps = Object.fromEntries(files.map(file => [file, { mtimeMs: 1, size: 1 }]));
        const host = createHost(primitives(record));
        for(const file of files) {
            expect(host.internalExports(file)).toEqual(new Set(['hidden']));
        }
        expect(record.parsed).toEqual(files);
    });

    it('re-parses a file only when its mtime or size changes', () => {
        const record = newRecorder();
        record.stamps = { '/repo/a.ts': { mtimeMs: 1, size: 10 } };
        const host = createHost(primitives(record));
        const first = host.internalExports('/repo/a.ts');
        expect(host.internalExports('/repo/a.ts')).toBe(first);
        record.stamps = { '/repo/a.ts': { mtimeMs: 2, size: 10 } };
        host.internalExports('/repo/a.ts');
        record.stamps = { '/repo/a.ts': { mtimeMs: 2, size: 11 } };
        host.internalExports('/repo/a.ts');
        host.internalExports('/repo/a.ts');
        expect(record.parsed).toEqual(['/repo/a.ts', '/repo/a.ts', '/repo/a.ts']);
    });
});
