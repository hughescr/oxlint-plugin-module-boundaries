# Rule: `dependencies` (`@hughescr/module-boundaries/dependencies`)

Enforces the boundaries policy: which modules may import which, which edges are type-only, and which file of a
module other modules must import.

## Configuration

`defineBoundaries` enables this rule with the normalised policy as its option; see the
[README](../../README.md#policy-reference) for the policy fields. Configuring the rule by hand without that
option throws.

## Rule details

The rule runs on files whose physical paths are under the policy `root` and do not match `ignore`.

- A file in no module is reported once (`unassigned`) when `include` matches it, and skipped otherwise.
- In a file of module A, every import-like is checked: `import … from`, `export … from`, `export * from`,
  `import('x')`, `require('x')`, `import x = require('x')` and type-position `import('x')`. Namespace aliases
  such as `import x = Ns.member` are not imports. An import is skipped when it does not resolve, resolves
  outside `root`, resolves into `node_modules`, or resolves to a file in no module.
- An import inside module A is always allowed.
- An import of module B is allowed when `allow[A]` is `'*'` or lists B, or when an exception whose `files` match
  the importing file lists B. Otherwise it is allowed when the import is type-only and `allowTypeOnly[A]` (or a
  matching exception's `allowTypeOnly`) lists B; a value import along such an edge is reported as `typeOnly`.
  Anything else is `notAllowed`.
- An allowed import must resolve to one of B's entry files (`<module directory>/<entry>` exactly, so
  `utils/nested/index.ts` is not an entry of `utils`), unless `entry` is `false`. Otherwise it is `notEntry`.

Type-only means statement level: `import type …` (including `import type x = require('x')`),
`export type … from`, `export type * from`, and type-position `import()`. An inline `import { type T }`, a
side-effect import and an empty specifier list are value imports.

Each import is reported at most once.

## Messages

| Message id   | Example |
|--------------|---------|
| `unassigned` | `'src/stray.ts' is in no module of the boundaries policy; add it to a module or narrow `include`.` |
| `notAllowed` | `Module 'utils' may not import module 'app' ('@/app').` |
| `typeOnly`   | `Module 'utils' may import module 'errors' only with a type-only import ('@/errors'); use `import type`.` |
| `notEntry`   | `Module 'app' must import module 'utils' through its entry 'src/utils/index.ts', not '../utils/helper'.` |

## Examples

With `modules: { utils: 'src/utils', errors: 'src/errors', app: 'src/app' }`,
`allow: { app: ['utils', 'errors'] }` and `allowTypeOnly: { utils: ['errors'] }`:

```ts
// src/app/index.ts
import { util } from '@/utils';             // allowed: listed edge, entry file
import { helper } from '../utils/helper';  // notEntry
// src/utils/kinds.ts
import type { AppError } from '@/errors';  // allowed: type-only edge
import { AppError } from '@/errors';       // typeOnly
import { start } from '@/app';             // notAllowed
```

## When not to use it

When the project has no layered module structure to enforce.
