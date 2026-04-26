const isCI = Boolean(process.env.GITHUB_SHA);
const strykerConfig = {
    checkers:         ['typescript'],
    packageManager:   'npm',
    incremental:      !isCI,
    reporters:        isCI ? ['clear-text', 'progress', 'dashboard'] : ['progress', 'json', 'html'],
    testRunner:       'bun',
    bun:              { inspectorTimeout: isCI ? 30_000 : 5000 },
    plugins:          ['@hughescr/stryker-bun-runner', '@stryker-mutator/typescript-checker'],
    coverageAnalysis: 'perTest',
    disableBail:      true,
    mutate:           ['src/**/*.ts', '!src/index.ts'],
    ignorePatterns:   ['**', '!src/**/*.ts', '!tests/**/*.ts', '!bunfig.toml', '!tsconfig.json', '!*.ts', '!*.mjs'],
    thresholds:       { high: 100, low: 100, 'break': 100 },
    concurrency:      isCI ? 2 : 12,
    tempDirName:      '.stryker-tmp',
    warnings:         { slow: false },
};
export default strykerConfig;
