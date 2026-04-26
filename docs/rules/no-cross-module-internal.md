# Rule: `no-cross-module-internal` (`@hughescr/module-boundaries/no-cross-module-internal`)

Prevents importing `@internal`-tagged exports from a different architectural module.

## Rule details

TypeScript projects often use `/** @internal */` JSDoc tags to mark exports as
implementation details that should not be used outside their home module. This rule
enforces those boundaries by reporting an error whenever production code imports an
`@internal` symbol from a module other than its own.

The rule uses TypeScript's AST and JSDoc parser — not fragile regex scanning — so
it handles re-exports, aliases, and documentation comments correctly.

### How it works

1. For each import declaration, the rule determines which module the importing file
   belongs to (via the `modules` option).
2. TypeScript module resolution locates the actual source file being imported.
3. The TypeScript AST is walked to find the exported declaration.
4. `ts.getJSDocTags()` checks whether an `@internal` tag exists.
5. An error is reported if: the importer and the imported symbol are in **different**
   modules AND the symbol is marked `@internal`.

The rule is a **no-op** on test files (filenames containing `.test.` or `.spec.`)
and on files that do not belong to any configured module.

## Examples

Given this `modules` configuration:
```js
{
  modules: [
    { type: 'agent',   pattern: 'src/agent/**' },
    { type: 'storage', pattern: 'src/storage/**' },
  ]
}
```

### Incorrect

```ts
// src/agent/some-file.ts
import { InternalHelper } from '../storage/utils'; // @internal in storage module
```

### Correct

```ts
// src/agent/some-file.ts
import { PublicHelper } from '@/storage'; // public barrel export — fine
import { InternalHelper } from './internal-helper'; // same module — fine
```

## Options

| Option    | Type                                                             | Default | Description                                                                                                          |
|-----------|------------------------------------------------------------------|---------|----------------------------------------------------------------------------------------------------------------------|
| `modules` | `Array<{ type: string; pattern: string \| string[] }>` | (required) | Module boundary definitions. Each entry maps a `type` name to a glob pattern (or array of globs) matching file paths relative to project root. |

### `modules` option shape

The `modules` option accepts the same `boundaryElements` array shape as
`eslint-plugin-boundaries`. Each entry has:

- `type` — A human-readable identifier for the module (used in error messages).
- `pattern` — A picomatch glob or array of globs, matched against the file path
  **relative to the project root** (forward-slash-separated).

Example using `eslint-plugin-boundaries` `boundaryElements` directly:

```js
// eslint.config.mjs
import moduleBoundaries from '@hughescr/eslint-plugin-module-boundaries';
import { defineConfig } from 'eslint';

const boundaryElements = [
  { type: 'config',       pattern: 'src/config/**' },
  { type: 'errors',       pattern: 'src/errors/**' },
  { type: 'utils',        pattern: 'src/utils/**' },
  { type: 'storage',      pattern: 'src/storage/**' },
  { type: 'services',     pattern: 'src/services/**' },
  { type: 'integrations', pattern: 'src/integrations/**' },
  { type: 'agent',        pattern: 'src/agent/**' },
  { type: 'app',          pattern: 'src/app/**' },
];

export default defineConfig([
  ...moduleBoundaries.configs.recommended,
  {
    // Override no-cross-module-internal with your module list
    rules: {
      '@hughescr/module-boundaries/no-cross-module-internal': ['error', {
        modules: boundaryElements,
      }],
    },
  },
]);
```

## When not to use it

- If your project does not use `@internal` JSDoc tags.
- If your project has no module boundaries to enforce.
- In test files (the rule already skips `.test.ts` and `.spec.ts` automatically).

## Further reading

- [JSDoc `@internal` tag](https://jsdoc.app/tags-inner.html)
- [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [`eslint-plugin-boundaries`](https://github.com/javierbrea/eslint-plugin-boundaries) — complementary rule set for enforcing import direction
