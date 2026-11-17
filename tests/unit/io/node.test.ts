import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createNodeResolver, nodeHost, nodePolicyHost } from '../../../src/io/node.js';

const fixture = realpathSync(path.resolve(import.meta.dir, '../../fixtures/host'));
const main = path.join(fixture, 'src/main.ts');

describe('nodePolicyHost', () => {
    it('tells directories, files and missing paths apart', () => {
        expect(nodePolicyHost.kind(fixture)).toBe('directory');
        expect(nodePolicyHost.kind(main)).toBe('file');
        expect(nodePolicyHost.kind(path.join(fixture, 'missing'))).toBeUndefined();
    });

    it('returns real paths', () => {
        expect(nodePolicyHost.realpath(path.join(fixture, 'src/../src/main.ts'))).toBe(main);
    });
});

describe('createNodeResolver', () => {
    it('resolves relative imports without a tsconfig', () => {
        expect(createNodeResolver(undefined).resolveDtsSync(main, './helper').path).toBe(path.join(fixture, 'src/helper.ts'));
        expect(createNodeResolver(undefined).resolveDtsSync(main, '@lib').path).toBeUndefined();
    });

    it('applies the tsconfig paths', () => {
        expect(createNodeResolver(path.join(fixture, 'tsconfig.json')).resolveDtsSync(main, '@lib').path).toBe(path.join(fixture, 'src/lib/index.ts'));
    });
});

describe('nodeHost', () => {
    let scratch: string;
    let broken: string;

    beforeAll(() => {
        scratch = mkdtempSync(path.join(tmpdir(), 'boundaries-parse-'));
        broken = path.join(scratch, 'broken.ts');
        writeFileSync(broken, 'export const missing = ;');
    });

    afterAll(() => {
        rmSync(scratch, { recursive: true, force: true });
    });

    it('resolves through the nearest tsconfig.json', () => {
        expect(nodeHost.resolve(main, '@lib', null)).toBe(path.join(fixture, 'src/lib/index.ts'));
        expect(nodeHost.resolve(main, '@lib/index', null)).toBe(path.join(fixture, 'src/lib/index.ts'));
    });

    it('resolves extensionless, .js-for-.ts and directory imports', () => {
        expect(nodeHost.resolve(main, './helper', null)).toBe(path.join(fixture, 'src/helper.ts'));
        expect(nodeHost.resolve(main, './helper.js', null)).toBe(path.join(fixture, 'src/helper.ts'));
        expect(nodeHost.resolve(main, './sub', null)).toBe(path.join(fixture, 'src/sub/index.ts'));
    });

    it('returns undefined for what does not resolve', () => {
        expect(nodeHost.resolve(main, './missing', null)).toBeUndefined();
    });

    it('resolves an existing JSON file after declaration resolution misses', () => {
        expect(nodeHost.resolve(main, '../tsconfig.json', null)).toBe(path.join(fixture, 'tsconfig.json'));
    });

    it('fails loudly on a now-invalid tsconfig even when the import is relative', () => {
        expect(() => nodeHost.resolve(main, './helper', main)).toThrow(/Failed to load tsconfig.*main\.ts/u);
    });

    it('returns empty but does not cache actual parser errors', () => {
        const first = nodeHost.internalExports(broken);
        expect(first).toEqual(new Set());
        expect(nodeHost.internalExports(broken)).not.toBe(first);
    });

    it('canonicalises existing paths and skips paths that disappeared', () => {
        expect(nodeHost.canonicalPath(path.join(fixture, 'src/../src/main.ts'))).toBe(main);
        expect(nodeHost.canonicalPath(path.join(fixture, 'src/missing.ts'))).toBeUndefined();
        expect(nodeHost.canonicalPath(path.join(main, 'file.ts'))).toBeUndefined();
        expect(() => nodeHost.canonicalPath('\0')).toThrow(TypeError);
    });

    it('reads @internal exports from disk', () => {
        const target = path.join(fixture, 'src/lib/index.ts');
        const names = nodeHost.internalExports(target);
        expect(names).toEqual(new Set(['hidden']));
        expect(nodeHost.internalExports(target)).toBe(names);
        expect(nodeHost.internalExports(path.join(fixture, 'src/missing.ts'))).toEqual(new Set());
        expect(nodeHost.internalExports(path.join(fixture, 'tsconfig.json'))).toEqual(new Set());
    });
});
