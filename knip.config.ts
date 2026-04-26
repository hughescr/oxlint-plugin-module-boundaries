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
};

export default config;
