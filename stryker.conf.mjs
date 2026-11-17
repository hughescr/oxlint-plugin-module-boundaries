import { globSync } from 'node:fs';

const isCI = Boolean(process.env.GITHUB_SHA);
const strykerConfig = {
    checkers:         ['typescript'],
    packageManager:   'npm',
    incremental:      !isCI,
    reporters:        isCI ? ['clear-text', 'progress', 'dashboard'] : ['progress', 'json', 'html'],
    testRunner:       'bun',
    // Unit tests only: tests/integration spawns Oxlint on a bundle of src/, which never sees a mutant.
    bun:              { inspectorTimeout: isCI ? 30_000 : 5000, testFiles: globSync('tests/unit/**/*.test.ts') },
    plugins:          ['@hughescr/stryker-bun-runner', '@stryker-mutator/typescript-checker'],
    // 'perTest' let mutants survive that a test kills when run (stryker-bun-runner 1.2.x attributes coverage to
    // the wrong tests and filters the killers out); the whole unit suite takes well under a second, so run it all.
    coverageAnalysis: 'all',
    disableBail:      true,
    mutate:           ['src/**/*.ts'],
    // package.json is imported by src/index.ts; tests/fixtures holds the tsconfig.json files the host tests resolve with.
    ignorePatterns:   ['**', '!src/**/*.ts', '!tests/**', '!bunfig.toml', '!tsconfig.json', '!package.json', '!*.ts', '!*.mjs'],
    thresholds:       { high: 100, low: 100, 'break': 100 },
    concurrency:      isCI ? 2 : 12,
    tempDirName:      '.stryker-tmp',
    warnings:         { slow: false },
};
export default strykerConfig;
