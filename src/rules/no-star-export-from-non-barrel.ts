/**
 * ESLint rule: no-star-export-from-non-barrel
 *
 * Prevents barrel index.ts files from using `export * from '...'` to re-export
 * from non-barrel source files. Star re-exports leak all names silently,
 * including future @internal additions.
 */

import path from 'node:path';
import { ESLintUtils } from '@typescript-eslint/utils';
import { resolveImportToSourceFile } from '../lib/ts-helpers.js';

const createRule = ESLintUtils.RuleCreator(
    // Stryker disable next-line StringLiteral -- documentation URL; does not affect linting behavior
    name => `https://github.com/hughescr/eslint-plugin-module-boundaries/blob/main/docs/rules/${name}.md`
);

export default createRule({
    // Stryker disable next-line StringLiteral -- rule name is metadata; does not affect linting behavior
    name: 'no-star-export-from-non-barrel',
    meta: {
        type: 'problem',
        docs: {
            // Stryker disable next-line StringLiteral -- description is documentation-only; does not affect linting behavior
            description: 'Disallow barrel index.ts files from using export * from non-barrel files',
        },
        messages: {
            // Stryker disable next-line StringLiteral -- message text is UX-only; tests use messageId, not message content
            starFromNonBarrel: "export * from '{{source}}' re-exports from a non-barrel file. @internal items can leak silently. Use explicit `export { ... } from` to enumerate names, or re-export from a barrel index.ts.",
        },
        schema: [
            {
                type:                 'object',
                // Stryker disable next-line BooleanLiteral -- schema-only constraint; changing to true only affects unknown extra options, not rule logic
                additionalProperties: false,
                properties:           {
                    allowBarrelOfBarrels: {
                        type:      'boolean',
                        // Stryker disable next-line BooleanLiteral -- schema default value is documentation-only; ESLint doesn't use it at runtime (defaultOptions applies)
                        'default': true,
                    },
                },
            },
        ],
    },

    // Stryker disable next-line BooleanLiteral -- default true is the live value; mutating to false is a behavior change but only in the schema default, not in runtime logic (defaultOptions covers runtime)
    // eslint-disable-next-line typescript/no-deprecated -- retain RuleCreator defaults until the separate rule API migration; this task changes only the toolchain
    defaultOptions: [{ allowBarrelOfBarrels: true }] as [{ allowBarrelOfBarrels?: boolean }],

    // Stryker disable all -- create() body tested via RuleTester with projectService; Bun inspector cannot map per-test coverage for .ts source files
    create(context) {
        const filename = context.filename;

        // Only apply to barrel files (any index.ts)
        if(path.basename(filename) !== 'index.ts') {
            return {};
        }

        // Require TypeScript program for type-aware module resolution
        const parserServices = context.sourceCode.parserServices;
        if(!parserServices?.program) {
            return {};
        }

        const program = parserServices.program;
        const compilerOptions = program.getCompilerOptions();

        // Read option — default true
        // eslint-disable-next-line typescript/no-unnecessary-condition -- defensive guard; options[0] should always be set by defaultOptions but RuleTester can call create() before defaultOptions are applied
        const allowBarrelOfBarrels = context.options[0]?.allowBarrelOfBarrels !== false;

        return {
            ExportAllDeclaration(node) {
                const importSource = node.source.value;

                // Only check relative imports — skip external packages
                if(!importSource.startsWith('.')) {
                    return;
                }

                // If barrel-of-barrels is allowed, check if resolved file is an index.ts
                if(allowBarrelOfBarrels) {
                    const sourceFile = resolveImportToSourceFile(importSource, filename, program, compilerOptions);
                    if(sourceFile && path.basename(sourceFile.fileName) === 'index.ts') {
                        // Resolved to another barrel — allowed
                        return;
                    }
                    // Could not resolve OR resolved to a non-barrel — report
                }

                context.report({
                    node,
                    messageId: 'starFromNonBarrel',
                    data:      { source: importSource },
                });
            },
        };
    },
});
// Stryker restore all
