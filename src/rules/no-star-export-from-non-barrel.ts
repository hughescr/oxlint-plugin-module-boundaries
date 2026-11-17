/**
 * Rule: no-star-export-from-non-barrel. Disallows barrel index.ts files from using `export * from` a file that
 * is not itself a barrel: a star re-export leaks every name silently, including future `@internal` additions.
 */

import path from 'node:path';
import type { ExportAllDeclaration } from '../core/ast.js';
import type { BoundaryHost } from '../io/host.js';
import { nodeHost } from '../io/node.js';
import { docsUrl, type RuleModule } from './rule.js';

/**
 * Build the rule over a host.
 *
 * @param host - Resolves imports with the nearest tsconfig.json.
 * @returns The rule.
 */
export function createNoStarExportFromNonBarrelRule(host: Pick<BoundaryHost, 'beginRule' | 'resolve'>): RuleModule {
    return {
        meta: {
            type: 'problem',
            docs: {
                description: 'Disallow barrel index.ts files from using export * from non-barrel files',
                url:         docsUrl('no-star-export-from-non-barrel'),
            },
            messages: {
                starFromNonBarrel: "export * from '{{source}}' re-exports from a non-barrel file. @internal items can leak silently. Use explicit `export { ... } from` to enumerate names, or re-export from a barrel index.ts.",
            },
            schema: [
                {
                    type:                 'object',
                    additionalProperties: false,
                    properties:           { allowBarrelOfBarrels: { type: 'boolean', 'default': true } },
                },
            ],
        },
        create(context) {
            host.beginRule();
            if(path.basename(context.filename) !== 'index.ts') {
                return {};
            }
            const allowBarrelOfBarrels = (context.options[0] as { allowBarrelOfBarrels?: unknown } | undefined)?.allowBarrelOfBarrels !== false;
            return {
                ExportAllDeclaration(node: ExportAllDeclaration) {
                    const source = String(node.source.value);
                    if(!source.startsWith('.')) {
                        return;
                    }
                    const resolved = allowBarrelOfBarrels ? host.resolve(context.filename, source, null) : undefined;
                    if(resolved !== undefined && path.basename(resolved) === 'index.ts') {
                        return;
                    }
                    context.report({ node, messageId: 'starFromNonBarrel', data: { source } });
                },
            };
        },
    };
}

export default createNoStarExportFromNonBarrelRule(nodeHost);
