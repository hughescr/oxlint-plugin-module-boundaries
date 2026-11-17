import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import plugin, { defineBoundaries } from '../../src/index.js';
import dependencies, { createDependenciesRule } from '../../src/rules/dependencies.js';
import noCrossModuleInternal, { createNoCrossModuleInternalRule } from '../../src/rules/no-cross-module-internal.js';
import noInternalInBarrel, { createNoInternalInBarrelRule } from '../../src/rules/no-internal-in-barrel.js';
import noStarExportFromNonBarrel, { createNoStarExportFromNonBarrelRule } from '../../src/rules/no-star-export-from-non-barrel.js';
import { fakeHost, fakePolicy } from './helpers.js';

describe('plugin', () => {
    it('names itself after the package and exposes the four rules', () => {
        expect(plugin.meta).toEqual({ name: '@hughescr/oxlint-plugin-module-boundaries', version: pkg.version });
        expect(plugin.rules).toEqual({
            dependencies,
            'no-cross-module-internal':       noCrossModuleInternal,
            'no-internal-in-barrel':          noInternalInBarrel,
            'no-star-export-from-non-barrel': noStarExportFromNonBarrel,
        });
    });
});

it('records every rule invocation even when the file is not checked', () => {
    let calls = 0;
    const host = {
        ...fakeHost({}),
        beginRule() {
            calls++;
        },
    };
    const factories = [createDependenciesRule, createNoCrossModuleInternalRule, createNoInternalInBarrelRule, createNoStarExportFromNonBarrelRule];
    const context = { filename: '/outside/skipped.ts', options: [fakePolicy()], report: () => undefined };
    for(const makeRule of factories) {
        expect(makeRule(host).create(context)).toEqual({});
    }
    expect(calls).toBe(factories.length);
});

describe('package metadata', () => {
    it('advertises the Node range required by Oxlint and oxc-parser', () => {
        expect(pkg.engines.node).toBe('^20.19.0 || >=22.12.0');
    });
});

describe('defineBoundaries', () => {
    it('rejects an explicit tsconfig file that does not parse', () => {
        const root = path.resolve(import.meta.dir, '../fixtures/host');
        const define = () => defineBoundaries({ root, modules: { lib: 'src/lib' }, tsconfig: 'src/main.ts' });
        expect(define).toThrow(TypeError);
        expect(define).toThrow(/Failed to load tsconfig.*main\.ts/u);
    });
    it('points the jsPlugin at this entry module and checks the real file system', () => {
        const root = path.resolve(import.meta.dir, '../fixtures/host');
        const config = defineBoundaries({ root, modules: { lib: 'src/lib' } });
        expect(config.jsPlugins).toEqual([{ name: '@hughescr/module-boundaries', specifier: path.resolve(import.meta.dir, '../../src/index.ts') }]);
        expect(() => defineBoundaries({ root, modules: { lib: 'src/nope' } })).toThrow('modules.lib path src/nope does not exist');
    });
});
