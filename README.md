# @hughescr/eslint-plugin-module-boundaries

ESLint rules for enforcing module boundary integrity in TypeScript projects using
`/** @internal */` JSDoc tags.

Requires TypeScript parser services (`@typescript-eslint/parser` with `projectService`).

## Rules

| Rule | Description |
|------|-------------|
| [`no-cross-module-internal`](./docs/rules/no-cross-module-internal.md) | Prevent importing `@internal` exports from a different architectural module |
| [`no-internal-in-barrel`](./docs/rules/no-internal-in-barrel.md) | Prevent barrel `index.ts` files from re-exporting `@internal` exports |
| [`no-star-export-from-non-barrel`](./docs/rules/no-star-export-from-non-barrel.md) | Prevent barrel `index.ts` files from using `export *` from non-barrel files |

## Requirements

- ESLint v10+
- TypeScript v5+
- `@typescript-eslint/parser` with `projectService` enabled
- Node.js v20+

## Installation

```sh
bun add -D @hughescr/eslint-plugin-module-boundaries typescript @typescript-eslint/parser
```

## Usage

### Recommended config (flat config)

```js
// eslint.config.mjs
import moduleBoundaries from '@hughescr/eslint-plugin-module-boundaries';
import { defineConfig } from 'eslint';

export default defineConfig([
  // Spread recommended — enables all three rules at 'error' severity
  ...Object.values(moduleBoundaries.configs.recommended),
]);
```

The `recommended` config enables all rules with `'error'` severity. The
`no-cross-module-internal` rule requires a `modules` option — see the
[full documentation](./docs/rules/no-cross-module-internal.md) for details.

### With module boundaries defined

```js
// eslint.config.mjs
import moduleBoundaries from '@hughescr/eslint-plugin-module-boundaries';
import { defineConfig } from 'eslint';
import typescriptParser from '@typescript-eslint/parser';

const modules = [
  { type: 'config',       pattern: 'src/config/**' },
  { type: 'utils',        pattern: 'src/utils/**' },
  { type: 'storage',      pattern: 'src/storage/**' },
  { type: 'services',     pattern: 'src/services/**' },
  { type: 'integrations', pattern: 'src/integrations/**' },
  { type: 'agent',        pattern: 'src/agent/**' },
  { type: 'app',          pattern: 'src/app/**' },
];

export default defineConfig([
  {
    files:           ['src/**/*.ts'],
    languageOptions: {
      parser:        typescriptParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@hughescr/module-boundaries': moduleBoundaries,
    },
    rules: {
      '@hughescr/module-boundaries/no-cross-module-internal': ['error', { modules }],
      '@hughescr/module-boundaries/no-internal-in-barrel':          'error',
      '@hughescr/module-boundaries/no-star-export-from-non-barrel': 'error',
    },
  },
]);
```

## How it works

All three rules use TypeScript's compiler API (`ts.getJSDocTags()`) to inspect
`@internal` JSDoc tags on exported declarations — not fragile regex text scanning.
This means aliased re-exports, default exports, namespaces, and enums are all
handled correctly.

The rules require `parserServices.program` to be available, which means you must
use `@typescript-eslint/parser` with `projectService: true` (or a `project` path).

## Per-rule documentation

- [`no-cross-module-internal`](./docs/rules/no-cross-module-internal.md)
- [`no-internal-in-barrel`](./docs/rules/no-internal-in-barrel.md)
- [`no-star-export-from-non-barrel`](./docs/rules/no-star-export-from-non-barrel.md)

## License

BSD-3-Clause — see [LICENSE.md](./LICENSE.md).
