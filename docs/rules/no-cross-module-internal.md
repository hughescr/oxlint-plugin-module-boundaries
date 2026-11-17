# Rule: `no-cross-module-internal` (`@hughescr/module-boundaries/no-cross-module-internal`)

Disallows importing `@internal`-tagged exports from a different module of the boundaries policy.

## Configuration

`defineBoundaries` enables this rule with the normalised policy as its option; see the
[README](../../README.md#policy-reference). It uses the same scope and module classification as
[`dependencies`](./dependencies.md): files with physical paths under `root`, minus `ignore`, in a module.

## Rule details

`/** @internal */` marks an export as an implementation detail of its module. For each `import { … } from` and
`export { … } from` whose source resolves to a file in a different module, the rule reports every named
specifier whose export in that file carries an `@internal` JSDoc tag. Default and namespace imports, local
exports and `export *` are not checked.

`@internal` is read the way TypeScript's JSDoc parser reads it: a JSDoc block comment attached to the exporting
statement (not one on the same line as the end of the previous statement), with the tag starting at the start
of a line or after whitespace. Text inside `{@link …}`, brace-enclosed JSDoc types, or optional parameter
names and defaults is not a tag. The first top-level statement that exports a name decides it, so an overload
signature without the tag hides a tagged implementation.

For a re-export (`export { a as b } from './x'` or `export { a }`), the tag is read from the re-export statement
itself, not from the original declaration. A re-export chain can therefore be cut at any level by tagging the
re-export.

## Messages

| Message id            | Example |
|-----------------------|---------|
| `crossModuleInternal` | `'internalThing' is marked @internal in module 'utils' and cannot be imported from module 'app'.` |

## Examples

### Incorrect

```ts
// src/agent/some-file.ts
import { InternalHelper } from '@/storage';        // @internal in module storage
export { InternalHelper as Helper } from '@/storage';
```

### Correct

```ts
// src/agent/some-file.ts
import { PublicHelper } from '@/storage';             // not @internal
import { InternalHelper } from './internal-helper';   // same module
```

## When not to use it

When the project does not use `@internal` tags.
