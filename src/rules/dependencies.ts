/**
 * Rule: dependencies. Enforces the policy's allowed edges, type-only edges and module entry files.
 */

import type { Node } from '../core/ast.js';
import { classifyImporter, classifyTarget } from '../core/classify.js';
import { decideEdge } from '../core/edge.js';
import { importLikeOf, type ImportLikeNode } from '../core/imports.js';
import type { BoundaryHost } from '../io/host.js';
import { nodeHost } from '../io/node.js';
import { compiledPolicyFor } from '../io/policy-cache.js';
import { docsUrl, type RuleModule } from './rule.js';

const RULE_ID = '@hughescr/module-boundaries/dependencies';
const IMPORT_LIKE_TYPES = ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression', 'CallExpression', 'TSImportEqualsDeclaration', 'TSImportType'];

/**
 * Build the rule over a host.
 *
 * @param host - Resolves the imports.
 * @returns The rule.
 */
export function createDependenciesRule(host: Pick<BoundaryHost, 'beginRule' | 'canonicalPath' | 'resolve'>): RuleModule {
    return {
        meta: {
            type: 'problem',
            docs: {
                description: 'Enforce the boundaries policy: allowed module edges, type-only edges and module entry files',
                url:         docsUrl('dependencies'),
            },
            messages: {
                unassigned: "'{{file}}' is in no module of the boundaries policy; add it to a module or narrow `include`.",
                notAllowed: "Module '{{from}}' may not import module '{{to}}' ('{{specifier}}').",
                typeOnly:   "Module '{{from}}' may import module '{{to}}' only with a type-only import ('{{specifier}}'); use `import type`.",
                notEntry:   "Module '{{from}}' must import module '{{to}}' through its entry {{entry}}, not '{{specifier}}'.",
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
            if(scope.kind === 'skip') {
                return {};
            }
            if(scope.kind === 'unassigned') {
                return { Program: (node: Node) => context.report({ node, messageId: 'unassigned', data: { file: scope.relative } }) };
            }
            const check = (node: ImportLikeNode): void => {
                const importLike = importLikeOf(node);
                if(importLike === undefined) {
                    return;
                }
                const resolved = host.resolve(importer, importLike.specifier, compiled.policy.tsconfig);
                if(resolved === undefined) {
                    return;
                }
                const target = classifyTarget(compiled, resolved);
                if(target === undefined) {
                    return;
                }
                const verdict = decideEdge(compiled, {
                    importer: scope.relative,
                    from:     scope.module,
                    target:   target.relative,
                    to:       target.module,
                    typeOnly: importLike.typeOnly,
                });
                if(verdict.kind === 'allowed') {
                    return;
                }
                const entry = verdict.kind === 'notEntry' ? verdict.entries.map(file => `'${file}'`).join(' or ') : '';
                context.report({
                    node,
                    messageId: verdict.kind,
                    data:      { from: scope.module, to: target.module, specifier: importLike.specifier, entry },
                });
            };
            return Object.fromEntries(IMPORT_LIKE_TYPES.map(type => [type, check]));
        },
    };
}

export default createDependenciesRule(nodeHost);
