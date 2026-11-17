/**
 * Rule: no-cross-module-internal. Disallows importing `@internal` exports from a different module of the policy.
 */

import { nameText, type ExportNamedDeclaration, type ExportSpecifier, type ImportDeclaration, type ImportSpecifier, type Node } from '../core/ast.js';
import { classifyImporter, classifyTarget } from '../core/classify.js';
import type { BoundaryHost } from '../io/host.js';
import { nodeHost } from '../io/node.js';
import { compiledPolicyFor } from '../io/policy-cache.js';
import { docsUrl, type RuleModule } from './rule.js';

const RULE_ID = '@hughescr/module-boundaries/no-cross-module-internal';

/** The name a specifier reads from the target file: `a` in `import { a as b }` and in `export { a as b } from`. */
function importedName(specifier: Node): string | undefined {
    if(specifier.type === 'ImportSpecifier') {
        return nameText((specifier as ImportSpecifier).imported);
    }
    return specifier.type === 'ExportSpecifier' ? nameText((specifier as ExportSpecifier).local) : undefined;
}

/**
 * Build the rule over a host.
 *
 * @param host - Resolves imports and reads `@internal` exports.
 * @returns The rule.
 */
export function createNoCrossModuleInternalRule(host: BoundaryHost): RuleModule {
    return {
        meta: {
            type: 'problem',
            docs: {
                description: 'Disallow importing @internal exports from a different module of the boundaries policy',
                url:         docsUrl('no-cross-module-internal'),
            },
            messages: {
                crossModuleInternal: "'{{name}}' is marked @internal in module '{{sourceModule}}' and cannot be imported from module '{{importerModule}}'.",
            },
            schema: [{ type: 'object' }],
        },
        create(context) {
            host.beginRule();
            const compiled = compiledPolicyFor(context.options[0], RULE_ID);
            const importer = host.canonicalPath(context.filename);
            if(importer === undefined) {
                return {};
            }
            const scope = classifyImporter(compiled, importer);
            if(scope.kind !== 'module') {
                return {};
            }
            const check = (node: ExportNamedDeclaration | ImportDeclaration): void => {
                if(node.source === null) {
                    return;
                }
                const resolved = host.resolve(importer, String(node.source.value), compiled.policy.tsconfig);
                if(resolved === undefined) {
                    return;
                }
                const target = classifyTarget(compiled, resolved);
                if(target === undefined || target.module === scope.module) {
                    return;
                }
                const internal = host.internalExports(resolved);
                for(const specifier of node.specifiers) {
                    const name = importedName(specifier);
                    if(name !== undefined && internal.has(name)) {
                        context.report({
                            node:      specifier,
                            messageId: 'crossModuleInternal',
                            data:      { name, sourceModule: target.module, importerModule: scope.module },
                        });
                    }
                }
            };
            return { ImportDeclaration: check, ExportNamedDeclaration: check };
        },
    };
}

export default createNoCrossModuleInternalRule(nodeHost);
