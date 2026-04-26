// eslint-disable-next-line import-x/no-extraneous-dependencies -- @hughescr/eslint-config-default is a devDependency; this file is not part of the published package
import baseConfig from '@hughescr/eslint-config-default';

// Extract plugin references from base config so we can reference them in overrides
// without re-importing (needed for import-x/order override in the test config block).
const basePluginsConfig = baseConfig.find(c => c.plugins && 'import-x' in c.plugins);

const config = [
    {
        // Exclude generated/build output and test fixture files.
        // dist/ contains compiled TypeScript — no need to lint generated files.
        // tests/fixtures/ contains minimal fixture stubs excluded from tsconfig.
        ignores: ['dist/**', 'tests/fixtures/**'],
    },
    ...baseConfig,
    {
        // Global override: treat bun:* modules as builtins for import ordering and resolution.
        // Also turn off n/no-missing-import for bun:* builtins which the n plugin cannot resolve.
        plugins: basePluginsConfig?.plugins ?? {},
        rules:   {
            'import-x/order': ['warn', {
                groups:                        ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
                pathGroups:                    [{ pattern: 'bun:*', group: 'builtin' }],
                pathGroupsExcludedImportTypes: [],
                'newlines-between':            'never',
                alphabetize:                   { order: 'asc', caseInsensitive: true },
            }],
            // bun:* are Bun built-in modules; the n plugin cannot resolve them
            'n/no-missing-import': 'off',
        },
    },
];

export default config;
