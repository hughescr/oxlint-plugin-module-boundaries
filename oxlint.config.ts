import config, { bunTest, root } from '@hughescr/oxlint-config-default';
import { defineConfig, type OxlintConfig } from 'oxlint';

export default defineConfig<OxlintConfig>({
    ...root,
    'extends':      [config, bunTest],
    settings:       { ...root.settings, ...bunTest.settings },
    ignorePatterns: ['dist/', 'node_modules/', 'reports/', '.stryker-tmp/', 'tests/fixtures/'],
    rules:          {
        // Bun builtins are not resolvable by the Node import resolver.
        'n-js/no-missing-import': 'off',
        'import-x-js/order':      ['warn', {
            groups:                        ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
            pathGroups:                    [{ pattern: 'bun:*', group: 'builtin' }],
            pathGroupsExcludedImportTypes: [],
            'newlines-between':            'never',
            alphabetize:                   { order: 'asc', caseInsensitive: true },
        }],
    },
    overrides: [
        {
            files: ['oxlint.config.ts', 'eslint.package-json.config.mjs'],
            rules: {
                'import-x-js/no-extraneous-dependencies': ['error', {
                    devDependencies: ['oxlint.config.ts', 'eslint.package-json.config.mjs'],
                }],
            },
        },
    ],
});
