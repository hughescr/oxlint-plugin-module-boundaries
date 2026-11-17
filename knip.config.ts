import type { KnipConfig } from 'knip';

const config: KnipConfig = {
    $schema: 'https://unpkg.com/knip@6/schema.json',
    entry:   [
        'src/index.ts',
        '*.config.{mjs,ts}',
        'tools/**/*.sh',
        'tests/**/*.test.ts',
    ],
    project: [
        'src/**/*.ts',
    ],
    // knip's Stryker plugin maps `testRunner: 'bun'` to @stryker-mutator/bun-runner, but the 'bun' runner is
    // registered by @hughescr/stryker-bun-runner (listed, and loaded through `plugins`); that package does not exist.
    ignoreDependencies: ['@stryker-mutator/bun-runner'],
};

export default config;
