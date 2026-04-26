# Rule: `no-star-export-from-non-barrel` (`@hughescr/module-boundaries/no-star-export-from-non-barrel`)

Prevents barrel `index.ts` files from using `export * from '...'` to re-export from
non-barrel source files.

## Rule details

`export * from './module'` silently re-exports every name in the target file —
including any `@internal` symbols added in the future. This makes it impossible
for `no-internal-in-barrel` to catch leaks, because the exported names are not
enumerated at the use site.

This rule blocks `export *` from non-barrel files while still allowing
`export * from './subdir'` when `./subdir/index.ts` exists
(barrel-of-barrels pattern, enabled by default via `allowBarrelOfBarrels`).

### Allowed vs. blocked

| Statement                             | Allowed?                                         |
|---------------------------------------|--------------------------------------------------|
| `export * from './sub'` (sub is a barrel)  | Yes — when `allowBarrelOfBarrels: true` (default) |
| `export * from './sub'` (sub is a barrel)  | No — when `allowBarrelOfBarrels: false` |
| `export * from './types'` (non-barrel)     | Never |
| `export * from './nonexistent'` (unresolvable) | Never |
| `export { Foo } from './types'` (named re-export) | Allowed — use `no-internal-in-barrel` for @internal checks |
| `export * from 'some-package'` (external) | Allowed — rule only checks relative imports |

## Examples

### Incorrect

```ts
// src/agent/index.ts
export * from './types'; // ERROR: types.ts is not a barrel
```

### Correct

```ts
// src/agent/index.ts
export { AgentClass } from './types';   // explicit names — fine
export * from './sub-module';           // fine when sub-module/index.ts exists
```

## Options

| Option               | Type    | Default | Description                                           |
|----------------------|---------|---------|-------------------------------------------------------|
| `allowBarrelOfBarrels` | `boolean` | `true` | Allow `export * from './subdir'` when `./subdir/index.ts` exists. Set to `false` to block all star re-exports in barrels. |

## When not to use it

- If you intentionally use `export *` and accept the risk of leaking `@internal` symbols.
- In files that are not barrel `index.ts` files (the rule does not apply to them).

## Further reading

- [`no-internal-in-barrel`](./no-internal-in-barrel.md) — catches `@internal` leaks via named re-exports
- [`no-cross-module-internal`](./no-cross-module-internal.md) — catches cross-module `@internal` imports
