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
    name => `https://github.com/hughescr/eslint-plugin-module-boundaries/blob/main/docs/rules/${name}.md`
);

export default createRule({
    name: 'no-star-export-from-non-barrel',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow barrel index.ts files from using export * from non-barrel files',
        },
        messages: {
            starFromNonBarrel: "export * from '{{source}}' re-exports from a non-barrel file. @internal items can leak silently. Use explicit `export { ... } from` to enumerate names, or re-export from a barrel index.ts.",
        },
        schema: [
            {
                type:                 'object',
                additionalProperties: false,
                properties:           {
                    allowBarrelOfBarrels: {
                        type:      'boolean',
                        'default': true,
                    },
                },
            },
        ],
    },

    defaultOptions: [{ allowBarrelOfBarrels: true }] as [{ allowBarrelOfBarrels?: boolean }],

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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard; options[0] should always be set by defaultOptions but RuleTester can call create() before defaultOptions are applied
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
