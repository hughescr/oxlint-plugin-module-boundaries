# CLAUDE.md — eslint-plugin-module-boundaries

## Project Overview

`@hughescr/eslint-plugin-module-boundaries` is an ESLint plugin published to npm
under the `@hughescr` scope with public access. It provides three rules for
enforcing module boundary integrity in TypeScript projects using `@internal` JSDoc
tags. Licensed under BSD-3-Clause.

TypeScript source in `src/` is built to `dist/` via `node node_modules/tsrs/bin/tsrs -p tsconfig.build.json`.
The `prepublishOnly` hook runs the build automatically on publish.

---

## Key Commands

```bash
bun run test        # Run all rule tests
bun run typecheck   # tsrs TypeScript type-check (no emit)
bun run lint        # Node-run Oxlint, package.json ESLint, and ast-grep
bun run lint:fix    # Fix Oxlint and package.json ESLint findings
bun run build       # Build dist/ from src/ with tsrs
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
- [ ] All tests pass (`bun run test`)
- [ ] Zero TypeScript errors (`bun run typecheck`, tsrs)
- [ ] Zero lint warnings or ast-grep findings (`bun run lint`)
- [ ] Mutation score = 100% for changed files (`bun run mutate`)

Lint uses `@hughescr/oxlint-config-default` via `oxlint.config.ts`, including `bunTest`
and merged root settings. Run Oxlint under Node, never Bun, with `--deny-warnings`.
`eslint.package-json.config.mjs` is only for package.json; `sgconfig.yml` loads the
shared ast-grep syntax and directive rules. Suppress only specific findings with
reasoned `eslint-disable-next-line` comments using Oxlint's actual rule ids (such
as `typescript/…` or `import-x-js/…`); do not add whole-file disables under `src/`.
TypeScript remains installed for the plugin's compiler API, RuleTester and Stryker's
TypeScript checker; it is not the build/typecheck command.

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
