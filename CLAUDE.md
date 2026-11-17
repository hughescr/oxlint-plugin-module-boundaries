# CLAUDE.md — oxlint-plugin-module-boundaries

## Project Overview

`@hughescr/oxlint-plugin-module-boundaries` is an Oxlint JS plugin published to npm under the `@hughescr`
scope with public access. A project writes one policy file with `defineBoundaries(policy)` and extends the
fragment it returns; the plugin then enforces allowed module edges, type-only edges, module entry files and
`@internal` exports. It needs no TypeScript program: oxc-resolver resolves imports and oxc-parser parses
target files. Licensed under BSD-3-Clause. The GitHub repository is
`hughescr/oxlint-plugin-module-boundaries`.

TypeScript source in `src/` is built to `dist/` via `node node_modules/tsrs/bin/tsrs -p tsconfig.build.json`.
The `prepublishOnly` hook runs the build automatically on publish.

---

## Key Commands

```bash
bun run test        # Unit tests plus the real-Oxlint integration test
bun run typecheck   # tsrs TypeScript type-check (no emit)
bun run lint        # Node-run Oxlint, package.json ESLint, and ast-grep
bun run lint:fix    # Fix Oxlint and package.json ESLint findings
bun run build       # Build dist/ from src/ with tsrs
bun run dead-code   # knip
bun run mutate      # Stryker mutation testing (100% threshold, unit tests only)
```

---

## Architecture

```
src/
  index.ts              # Entry: default export is the plugin { meta, rules }; named export defineBoundaries
  define-boundaries.ts  # Builds the config fragment (jsPlugins entry + override with both policy rules)
  core/                 # Pure: no I/O
    ast.ts              # The ESTree/TS-ESTree node shapes the rules read
    policy.ts           # Policy types, validation and normalisation (file system injected as PolicyHost)
    classify.ts         # Compiled policy, file-to-module classification, importer/target scope
    edge.ts             # The edge decision: allowed / notAllowed / typeOnly / notEntry
    imports.ts          # Import-like extraction, including external TypeScript import-equals declarations
    internal.ts         # @internal export names, matching TypeScript's JSDoc parser
  io/
    host.ts             # Resolution, nearest-tsconfig and realpath caches; parse cache (mtime+size)
    node.ts             # Real fs, oxc-resolver and oxc-parser wired into host.ts
    policy-cache.ts     # Compiled policy per rule-option object (plain Map: Oxlint patches WeakMap)
  rules/                # Thin adapters: create<Rule>Rule(host) plus a default export over the real host
tests/
  unit/                 # Fake contexts and hosts; oxc-parser builds the ASTs. Every test well under 1 ms
  integration/          # Bundles src/ and runs real Oxlint under Node on tests/fixtures/oxlint-project
  fixtures/             # host/ (resolver fixtures), oxlint-project/ (integration project)
docs/rules/*.md         # Per-rule documentation
```

Rules are plain ESLint-shaped objects (`meta`, `create`). Oxlint gives JS plugins no parser services and no
cross-file API, so the rules resolve and parse targets themselves through `io/`. More than one second between
rule invocations clears the resolver (including its native caches), nearest-tsconfig, realpath and compiled
policy caches. The parse cache survives the idle gap and only stores error-free results, validated by mtime
and size. Keep `typescript` out of `src/`.

---

## Quality Gates

Before any PR or commit:
- [ ] All tests pass (`bun run test`)
- [ ] Zero TypeScript errors (`bun run typecheck`, tsrs)
- [ ] Zero lint warnings or ast-grep findings (`bun run lint`)
- [ ] Zero knip findings (`bun run dead-code`)
- [ ] Mutation score = 100% (`bun run mutate`), with no whole-function or whole-file `Stryker disable` regions

Lint uses `@hughescr/oxlint-config-default` via `oxlint.config.ts`, including `bunTest` and merged root
settings, with `node/no-sync` off because lint rules run synchronously. Run Oxlint under Node, never Bun, with
`--deny-warnings`. `eslint.package-json.config.mjs` is only for package.json; `sgconfig.yml` loads the shared
ast-grep syntax and directive rules. Suppress only specific findings with reasoned `eslint-disable-next-line`
comments using Oxlint's actual rule ids; do not add whole-file disables under `src/`. TypeScript stays
installed only for Stryker's TypeScript checker; it is not the build/typecheck command.

Stryker runs the unit tests only (`bun.testFiles` in `stryker.conf.mjs`) with `coverageAnalysis: 'all'`:
stryker-bun-runner 1.2.x attributes per-test coverage to the wrong tests, which let killable mutants survive,
and the whole unit suite takes well under a second. Incremental mode can keep stale statuses after code moves
around an unchanged mutant; `bun run mutate --force` re-runs every mutant.

**Sandbox Note**: `reports/stryker-incremental.json` is protected by `denyWrite`
in `.claude/settings.json`. Run mutation testing with `dangerouslyDisableSandbox: true`.

---

## Versioning

**Claude must NOT edit the `version` field** in `package.json` unless Craig asks for a specific version.
Craig bumps it when ready to publish via:

```bash
bun pm version --no-git-tag-version <bump>
```

The `postversion` script handles the git-flow release cycle automatically.

---

## Git Workflow

- Git-flow model: `develop` is the active working branch; `main` holds releases only
- PRs should target `develop`
- Commit message convention for releases: `"Bump package version to X.Y.Z"`
