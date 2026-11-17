# Rule: `no-internal-in-barrel` (`@hughescr/module-boundaries/no-internal-in-barrel`)

Prevents barrel `index.ts` files from re-exporting `@internal`-tagged exports.

## Rule details

Barrel files (`index.ts`) define a module's public API surface. Re-exporting a
symbol marked `/** @internal */` through a barrel accidentally promotes it to the
public API, allowing other modules to import it even though it was intended to be
an implementation detail.

This rule fires on every named re-export (`export { Name } from './source'`) in
an `index.ts` file where the original declaration is tagged `@internal`.

### How it works

1. The rule applies only to files whose basename is `index.ts`.
2. For each `export { Foo } from './source'` statement with a relative source, the
   rule resolves the source file with oxc-resolver, using TypeScript's `bundler`
   resolution and the nearest `tsconfig.json` above the barrel.
3. It parses the source file and checks, for each specifier's original name,
   whether that export carries an `@internal` JSDoc tag (read as described in
   [`no-cross-module-internal`](./no-cross-module-internal.md#rule-details)).
4. If it does, an error is reported on the offending specifier.

Star re-exports (`export * from '...'`) are skipped because the rule does not
enumerate the names they carry. Use the `no-star-export-from-non-barrel` rule to
prevent those entirely. Sources that do not resolve are skipped.

The rule takes no policy; enable it by name.

## Examples

### Incorrect

```ts
// src/storage/index.ts
/** @internal */
export function internalHelper() { return 42; }

// src/storage/index.ts — another barrel
export { internalHelper } from './storage'; // ERROR: internalHelper is @internal
```

### Correct

```ts
// src/storage/index.ts
export { publicHelper } from './storage'; // fine — publicHelper is not @internal
```

## Messages

| Message id         | Example |
|--------------------|---------|
| `internalInBarrel` | `'hidden' is marked @internal and must not be re-exported from a barrel index.ts.` |

## Options

This rule has no options.

## When not to use it

- If your project does not use `@internal` JSDoc tags.
- If you intentionally expose all exports from a barrel and do not use `@internal`.

## Further reading

- [`no-star-export-from-non-barrel`](./no-star-export-from-non-barrel.md) — companion rule preventing silent name leaks via star re-exports
- [`no-cross-module-internal`](./no-cross-module-internal.md) — companion rule preventing cross-module imports of `@internal` symbols
