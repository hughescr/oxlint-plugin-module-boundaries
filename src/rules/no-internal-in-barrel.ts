/**
 * ESLint rule: no-internal-in-barrel
 *
 * Prevents barrel index.ts files from re-exporting @internal-tagged exports.
 * Uses TypeScript's AST and JSDoc parsing to check for @internal tags.
 */

import path from 'node:path';
import { ESLintUtils } from '@typescript-eslint/utils';
import { isExportInternal, resolveImportToSourceFile } from '../lib/ts-helpers.js';

const createRule = ESLintUtils.RuleCreator(
    // Stryker disable next-line StringLiteral -- documentation URL; does not affect linting behavior
    name => `https://github.com/hughescr/eslint-plugin-module-boundaries/blob/main/docs/rules/${name}.md`
);

export default createRule({
    // Stryker disable next-line StringLiteral -- rule name is metadata; does not affect linting behavior
    name: 'no-internal-in-barrel',
    meta: {
        type: 'problem',
        docs: {
            // Stryker disable next-line StringLiteral -- description is documentation-only; does not affect linting behavior
            description: 'Disallow barrel index.ts files from re-exporting @internal-tagged exports',
        },
        messages: {
            // Stryker disable next-line StringLiteral -- message text is UX-only; tests use messageId, not message content
            internalInBarrel: "'{{name}}' is marked @internal and must not be re-exported from a barrel index.ts.",
        },
        schema: [],
    },

    // Stryker disable next-line ArrayDeclaration -- empty default options array; rule takes no options so mutating the default is behavior-equivalent
    defaultOptions: [],

    // Stryker disable all -- create() body tested via RuleTester with projectService; Bun inspector cannot map per-test coverage for .ts source files
    create(context) {
        const filename = context.filename;

        // Only apply to barrel files: any index.ts
        // (Scope restriction to src/**/*.ts is enforced by the consumer's eslint.config.mjs)
        if(path.basename(filename) !== 'index.ts') {
            return {};
        }

        // Require TypeScript program for type-aware resolution
        const parserServices = context.sourceCode.parserServices;
        if(!parserServices?.program) {
            return {};
        }

        const program = parserServices.program;
        const compilerOptions = program.getCompilerOptions();

        return {
            ExportNamedDeclaration(node) {
                // Only handle re-exports with a source: export { Foo } from './module'
                if(!node.source) {
                    return;
                }

                const importSource = node.source.value;

                // Only check relative imports — skip external packages
                if(!importSource.startsWith('.')) {
                    return;
                }

                // Resolve to source file
                const sourceFile = resolveImportToSourceFile(importSource, filename, program, compilerOptions);
                if(!sourceFile) {
                    return;
                }

                // Check each exported specifier
                for(const specifier of node.specifiers) {
                    // The exported name the caller uses is specifier.exported.name
                    // The original name in the source is specifier.local.name
                    const originalName = 'name' in specifier.local ? specifier.local.name : String(specifier.local.value);

                    if(isExportInternal(sourceFile, originalName)) {
                        context.report({
                            node:      specifier,
                            messageId: 'internalInBarrel',
                            data:      { name: originalName },
                        });
                    }
                }
            },
        };
    },
});
// Stryker restore all
