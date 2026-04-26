/**
 * ESLint rule: no-cross-module-internal
 *
 * Prevents importing @internal exports from a different architectural module.
 * Uses TypeScript's AST and JSDoc parsing — not fragile regex scanning.
 */

import path from 'node:path';
import { ESLintUtils } from '@typescript-eslint/utils';
import picomatch from 'picomatch';
import { isExportInternal, resolveImportToSourceFile } from '../lib/ts-helpers.js';

const createRule = ESLintUtils.RuleCreator(
    name => `https://github.com/hughescr/eslint-plugin-module-boundaries/blob/main/docs/rules/${name}.md`
);

/** One entry in the `modules` option. */
export interface ModuleEntry {
    type:    string
    pattern: string | string[]
}

/** Pre-built matcher for a module boundary. */
interface ModuleMatcher {
    type:    string
    matcher: (s: string) => boolean
}

/**
 * Determine which module a file belongs to based on its relative path.
 *
 * @param filePath - Absolute path to the file.
 * @param cwd - Project root directory.
 * @param matchers - Pre-built picomatch matchers from `buildMatchers`.
 * @returns The module type string, or null if not in any known module.
 */
export function getModuleForFile(
    filePath: string,
    cwd: string,
    matchers: ModuleMatcher[]
): string | null {
    const rel = path.relative(cwd, filePath).replaceAll('\\', '/');
    for(const { type, matcher } of matchers) {
        if(matcher(rel)) {
            return type;
        }
    }
    return null;
}

/**
 * Build picomatch matchers from the `modules` option.
 *
 * @param modules - Array of module boundary entries.
 * @returns Array of pre-built matchers.
 */
export function buildMatchers(modules: ModuleEntry[]): ModuleMatcher[] {
    return modules.map(({ type, pattern }) => ({
        type,
        matcher: picomatch(pattern),
    }));
}

export default createRule({
    name: 'no-cross-module-internal',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow importing @internal exports from a different architectural module',
        },
        messages: {
            crossModuleInternal: "'{{name}}' is marked @internal in module '{{sourceModule}}' and cannot be imported from module '{{importerModule}}'.",
        },
        schema: [
            {
                type:       'object',
                properties: {
                    modules: {
                        type:     'array',
                        minItems: 1,
                        items:    {
                            type:       'object',
                            properties: {
                                type:    { type: 'string', minLength: 1 },
                                pattern: {
                                    oneOf: [
                                        { type: 'string', minLength: 1 },
                                        {
                                            type:     'array',
                                            minItems: 1,
                                            items:    { type: 'string', minLength: 1 },
                                        },
                                    ],
                                },
                            },
                            required:             ['type', 'pattern'],
                            additionalProperties: false,
                        },
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    defaultOptions: [] as [{ modules?: ModuleEntry[] }?],

    create(context) {
        const modules = context.options[0]?.modules;

        // No-op if no modules option provided
        if(!modules?.length) {
            return {};
        }

        const matchers = buildMatchers(modules);
        const cwd = context.cwd;
        const filename = context.filename;

        // Skip test files
        if(filename.includes('.test.') || filename.includes('.spec.')) {
            return {};
        }

        const importerModule = getModuleForFile(filename, cwd, matchers);

        // Skip files not in any known module
        if(!importerModule) {
            return {};
        }

        // Get parser services for TypeScript type information
        const parserServices = context.sourceCode.parserServices;
        if(!parserServices?.program) {
            // Not a TypeScript file or type information not available
            return {};
        }

        const program = parserServices.program;
        const compilerOptions = program.getCompilerOptions();

        return {
            ImportDeclaration(node) {
                const importSource = node.source.value;

                // Skip external packages (not starting with . or @/)
                if(!importSource.startsWith('.') && !importSource.startsWith('@/')) {
                    return;
                }

                // Resolve the import to a source file using TypeScript's resolution
                const sourceFile = resolveImportToSourceFile(importSource, filename, program, compilerOptions);
                if(!sourceFile) {
                    return;
                }

                const sourceModule = getModuleForFile(sourceFile.fileName, cwd, matchers);

                // Skip if same module or unknown module
                if(!sourceModule || sourceModule === importerModule) {
                    return;
                }

                // Check each imported specifier
                for(const specifier of node.specifiers) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- ESTree node type is a string enum; comparison to literal is the standard ESLint pattern
                    if(specifier.type !== 'ImportSpecifier') {
                        continue;
                    }

                    const importedName = 'name' in specifier.imported ? specifier.imported.name : String(specifier.imported.value);

                    // Check if the export has @internal tag in the source file
                    if(isExportInternal(sourceFile, importedName)) {
                        context.report({
                            node:      specifier,
                            messageId: 'crossModuleInternal',
                            data:      {
                                name: importedName,
                                sourceModule,
                                importerModule,
                            },
                        });
                    }
                }
            },
        };
    },
});
