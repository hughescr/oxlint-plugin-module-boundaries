# @hughescr/oxlint-plugin-module-boundaries

An [Oxlint](https://oxc.rs/docs/guide/usage/linter) JS plugin that enforces a project's module boundaries from
one policy file: which modules may import which, which edges are type-only, which file of a module others must
import, and which `/** @internal */` exports stay inside their module. It needs no TypeScript program: imports
are resolved with [oxc-resolver](https://github.com/oxc-project/oxc-resolver) (TypeScript's `bundler`
resolution plus your tsconfig `paths`, with plain-file resolution as a fallback for files such as JSON) and
target files are parsed with oxc-parser.

## Setup

1. Install it next to Oxlint (1.94 or later) on Node.js `^20.19.0 || >=22.12.0`:

   ```sh
   bun add -D @hughescr/oxlint-plugin-module-boundaries oxlint
   ```

2. Write the policy file, for example `boundaries.config.mjs` at the project root:

   ```js
   import { defineBoundaries } from '@hughescr/oxlint-plugin-module-boundaries';

   export default defineBoundaries({
       root:    import.meta.dirname,
       include: ['src/**'],
       ignore:  ['**/*.{test,spec}.*'],
       modules: {
           utils:  'src/utils',
           errors: 'src/errors',
           app:    'src/app',
           main:   'src/index.ts',
       },
       allow: {
           errors: ['utils'],
           app:    '*',
           main:   ['app'],
       },
   });
   ```

3. Extend it from `oxlint.config.ts`:

   ```ts
   import { defineConfig } from 'oxlint';
   import boundaries from './boundaries.config.mjs';

   export default defineConfig({
       extends: [boundaries],
   });
   ```

`defineBoundaries` returns a config fragment that registers the plugin and enables `dependencies` and
`no-cross-module-internal` with the validated policy. Nothing goes in `settings`, and Oxlint can run from any
working directory. The barrel rules take no policy; enable them by name:

```ts
rules: {
    '@hughescr/module-boundaries/no-internal-in-barrel':          'error',
    '@hughescr/module-boundaries/no-star-export-from-non-barrel': 'error',
},
```

## Policy reference

| Field           | Type                                      | Default            | Meaning |
|-----------------|-------------------------------------------|--------------------|---------|
| `root`          | absolute path                             | required           | The project directory. Every path and glob below is relative to it. It must exist. |
| `include`       | globs                                     | `[]`               | A linted file that matches and belongs to no module is reported (`unassigned`). |
| `ignore`        | globs                                     | `[]`               | Files the policy rules skip entirely. |
| `modules`       | `{ name: path \| path[] }`                | required           | Each path is an existing directory (the module is everything under it) or an existing file (a one-file module). |
| `allow`         | `{ module: module[] \| '*' }`             | `{}`               | Default deny: the modules each module may import. A module with no key may import no other module. |
| `allowTypeOnly` | `{ module: module[] \| '*' }`             | `{}`               | Extra edges that only type-only import statements may use. |
| `exceptions`    | `{ files, allow?, allowTypeOnly? }[]`     | `[]`               | Extra edges for the importing files that match `files`, added to their module's own. |
| `entry`         | path \| path[] \| `false`                 | `'index.ts'`       | Entry file(s) of a directory module, relative to its directory. A one-file module is its own entry. `false` turns the entry check off. |
| `tsconfig`      | path                                      | nearest per file   | The tsconfig.json to resolve with; by default the nearest one above each importing file. |
| `severity`      | `'error' \| 'warn'`                       | `'error'`          | Severity of both policy rules. |

Globs use [picomatch](https://github.com/micromatch/picomatch) syntax and match slash-separated paths relative
to `root` on every platform. Supply arrays of non-empty strings; absolute globs and globs starting with `../`
are invalid.

A file belongs to the module whose physical path contains it; when module paths nest, the longest path wins.
Symlinks are resolved for `root`, module paths and source files before matching. Importing inside one's own
module is always allowed and never entry-checked.

`defineBoundaries` throws a `TypeError` naming the problem when `root` is missing, relative or not a directory;
when a module path does not exist, resolves outside `root`, or resolves to a path already claimed; when `allow`,
`allowTypeOnly` or `exceptions` name something that is not a module; when an explicit `tsconfig` cannot be loaded;
when `modules` is empty; for an unknown key; and for any value of the wrong type. In TypeScript the module names
are inferred from `modules`, so a misspelt name in `allow`, `allowTypeOnly` or `exceptions` is also a type error.

A tsconfig load error during import resolution stops linting and names the config. An import that simply cannot
be resolved is skipped by the policy rules.

## Rules

Rule ids are `@hughescr/module-boundaries/<rule>`.

| Rule | Message ids | What it reports |
|------|-------------|-----------------|
| [`dependencies`](./docs/rules/dependencies.md) | `unassigned`, `notAllowed`, `typeOnly`, `notEntry` | Imports along edges the policy does not allow, value imports along type-only edges, imports that skip the target module's entry file, and included files in no module. |
| [`no-cross-module-internal`](./docs/rules/no-cross-module-internal.md) | `crossModuleInternal` | Named imports and re-exports of `@internal` exports from another module. |
| [`no-internal-in-barrel`](./docs/rules/no-internal-in-barrel.md) | `internalInBarrel` | An `index.ts` re-exporting an `@internal` export. |
| [`no-star-export-from-non-barrel`](./docs/rules/no-star-export-from-non-barrel.md) | `starFromNonBarrel` | An `index.ts` using `export * from` a file that is not itself a barrel. |

## Suppressing a finding

Suppress one finding with a reason, using the full rule id:

```ts
// eslint-disable-next-line @hughescr/module-boundaries/dependencies -- the session types are shared on purpose until #123 moves them
import type { SessionRole } from '@/agent/session/types';
```

## Migrating

### From 1.x (`@hughescr/eslint-plugin-module-boundaries`)

- Install `@hughescr/oxlint-plugin-module-boundaries` and remove the 1.x package, `@typescript-eslint/parser`,
  and any shim that gave the rules a TypeScript program.
- `no-cross-module-internal` no longer takes `{ modules: [...] }`. Its option is the policy, which
  `defineBoundaries` supplies; describe the modules there. Files the old rule skipped by name (`.test.`,
  `.spec.`) are now skipped only when they match the policy's `ignore`. The rule now also checks
  `export { … } from` re-exports and any import that resolves inside `root`, not only `.` and `@/` specifiers.
- `no-internal-in-barrel` and `no-star-export-from-non-barrel` keep their behaviour and options.
- The `recommended` config is gone; enable the rules as shown in Setup.

### From eslint-plugin-boundaries

- Each element becomes an entry in `modules`. A file element (such as `src/index.ts`) becomes a one-file module
  instead of a file category.
- Each `allow` policy becomes `allow[module]`; `dependency: { kind: 'type' }` policies become `allowTypeOnly`;
  policies narrowed with `fileInternalPath` become `exceptions` whose `files` are the matching paths relative to
  `root`. `default: 'disallow'` is the only mode.
- An entry-point rule of the form "disallow `!index.ts`" is the default `entry: 'index.ts'`.
- `boundaries/ignore` becomes `ignore`; `boundaries/include` (or the override's `files`) becomes `include`.
- Drop the plugin, its resolver setting and the root `settings` merge. Disable comments must name
  `@hughescr/module-boundaries/dependencies` instead of `boundaries/dependencies`.

## Limits

- Only literal module specifiers are checked: `import(name)` or `require(path)` with a computed argument is
  ignored.
- The policy governs imports between files under `root`. Imports of packages (anything resolving into
  `node_modules`) are not policed; use `no-restricted-imports` for those.
- There is no cycle detection.
- A type-only import is a statement-level one: `import type` (including `import type x = require('…')`),
  `export type … from`, and type-position `import()`. An inline `import { type T }` counts as a value import.
- `dependencies` checks `import x = require('…')` as a value import; namespace aliases such as
  `import x = Namespace.member` do not import a module.

## Development

```sh
bun install
bun run lint        # Oxlint under Node, package.json ESLint, ast-grep
bun run typecheck   # tsrs
bun run build       # tsrs, to dist/
bun run test        # unit tests, plus one integration test that runs real Oxlint on tests/fixtures/oxlint-project
bun run dead-code   # knip
bun run mutate      # Stryker, 100% threshold, unit tests only
```

## License

BSD-3-Clause — see [LICENSE.md](./LICENSE.md).
