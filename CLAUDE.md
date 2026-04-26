# CLAUDE.md — eslint-plugin-module-boundaries

## Project Overview

`@hughescr/eslint-plugin-module-boundaries` is an ESLint plugin published to npm
under the `@hughescr` scope with public access. It provides three rules for
enforcing module boundary integrity in TypeScript projects using `@internal` JSDoc
tags. Licensed under BSD-3-Clause.

TypeScript source in `src/` is built to `dist/` via `tsc -p tsconfig.build.json`.
The `prepublishOnly` hook runs the build automatically on publish.

---

## Key Commands

```bash
bun test            # Run all rule tests
bun run typecheck   # TypeScript type-check (no emit)
bun run lint        # ESLint with unix formatter
bun run build       # Build dist/ from src/
bun run mutate      # Stryker mutation testing (100% target)
```

---

## Architecture

```
src/
  index.ts              # Plugin entry — exports { meta, configs, rules }
  rules/
    no-cross-module-internal.ts
    no-internal-in-barrel.ts
    no-star-export-from-non-barrel.ts
  lib/
    ts-helpers.ts       # Shared TypeScript AST helpers for @internal detection
tests/
  rules/
    *.test.ts           # RuleTester-based tests (migrated from Isambard)
  fixtures/             # Fixture .ts files used by RuleTester projectService
docs/
  rules/
    *.md                # Per-rule documentation
```

All rules use `@typescript-eslint/utils`'s `ESLintUtils.RuleCreator` factory for
typed message IDs and proper `meta.docs.url` pointing at the published docs.

---

## Quality Gates

Before any PR or commit:
- [ ] All tests pass (`bun test`)
- [ ] Zero TypeScript errors (`bun run typecheck`)
- [ ] Zero lint warnings (`bun run lint`)
- [ ] Mutation score = 100% for changed files (`bun run mutate`)

**Sandbox Note**: `reports/stryker-incremental.json` is protected by `denyWrite`
in `.claude/settings.json`. Run mutation testing with `dangerouslyDisableSandbox: true`.

---

## Versioning

The package starts at `0.9.0`. **Claude must NOT edit the `version` field** in
`package.json` — Craig bumps it when ready to publish via:

```bash
bun pm version --no-git-tag-version <bump>
```

The `postversion` script handles the git-flow release cycle automatically.

---

## Git Workflow

- Git-flow model: `develop` is the active working branch; `main` holds releases only
- PRs should target `develop`
- Commit message convention for releases: `"Bump package version to X.Y.Z"`
