import { describe, expect, it } from 'bun:test';
import type { OxlintConfig } from 'oxlint';
import type { NormalisedPolicy } from '../../src/core/policy.js';
import { createDefineBoundaries, PLUGIN_ALIAS, SOURCE_FILES } from '../../src/define-boundaries.js';
import { fakePolicyHost, ROOT } from './helpers.js';

const defineBoundaries = createDefineBoundaries('/plugin/dist/index.js', fakePolicyHost);

describe('createDefineBoundaries', () => {
    it('returns the jsPlugin entry and an override enabling both policy rules with the normalised policy', () => {
        const config = defineBoundaries({ root: ROOT, modules: { app: 'src/app', utils: 'src/utils' }, allow: { app: ['utils'] }, severity: 'warn' });
        const policy: NormalisedPolicy = {
            root:          ROOT,
            include:       [],
            ignore:        [],
            modules:       [{ module: 'utils', path: 'src/utils', kind: 'directory' }, { module: 'app', path: 'src/app', kind: 'directory' }],
            allow:         { app: ['utils'] },
            allowTypeOnly: {},
            exceptions:    [],
            entry:         ['index.ts'],
            tsconfig:      null,
        };
        expect(config).toEqual({
            jsPlugins: [{ name: '@hughescr/module-boundaries', specifier: '/plugin/dist/index.js' }],
            overrides: [{
                files: ['**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}'],
                rules: {
                    '@hughescr/module-boundaries/dependencies':             ['warn', policy],
                    '@hughescr/module-boundaries/no-cross-module-internal': ['warn', policy],
                },
            }],
        });
        expect(PLUGIN_ALIAS).toBe('@hughescr/module-boundaries');
        expect(config.overrides[0]!.files).not.toBe(SOURCE_FILES);
    });

    it('defaults the severity to error', () => {
        const config = defineBoundaries({ root: ROOT, modules: { app: 'src/app' } });
        expect(config.overrides[0]!.rules['@hughescr/module-boundaries/dependencies'][0]).toBe('error');
    });

    it('throws a TypeError for an invalid policy', () => {
        expect(() => defineBoundaries({ root: ROOT, modules: {} })).toThrow(new TypeError('defineBoundaries: modules must name at least one module'));
    });

    it('types module names from modules and returns an Oxlint config', () => {
        const config: OxlintConfig = defineBoundaries({
            root:          ROOT,
            modules:       { app: 'src/app', utils: 'src/utils', errors: 'src/errors' },
            allow:         { app: '*', utils: ['errors'] },
            allowTypeOnly: { errors: ['utils'] },
            exceptions:    [{ files: ['src/utils/x.ts'], allow: ['app'] }],
        });
        expect(config.overrides).toHaveLength(1);
        expect(() => defineBoundaries({
            root:    ROOT,
            modules: { app: 'src/app', utils: 'src/utils' },
            allow:   {
                // @ts-expect-error -- 'nope' is not a module
                app: ['nope'],
            },
        })).toThrow('allow.app names nope');
        expect(() => defineBoundaries({
            root:    ROOT,
            modules: { app: 'src/app', utils: 'src/utils' },
            allow:   {
                // @ts-expect-error -- an allow key must be a module
                nope: '*',
            },
        })).toThrow('allow key names nope');
        expect(() => defineBoundaries({
            root:       ROOT,
            modules:    { app: 'src/app' },
            // @ts-expect-error -- exception lists name modules
            exceptions: [{ files: ['x'], allowTypeOnly: ['nope'] }],
        })).toThrow('exceptions[0].allowTypeOnly names nope');
    });
});
