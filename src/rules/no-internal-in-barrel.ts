/**
 * Rule: no-internal-in-barrel. Disallows barrel index.ts files from re-exporting `@internal` exports.
 */

import path from 'node:path';
import { nameText, type ExportNamedDeclaration } from '../core/ast.js';
import type { BoundaryHost } from '../io/host.js';
import { nodeHost } from '../io/node.js';
import { docsUrl, type RuleModule } from './rule.js';

/**
 * Build the rule over a host.
 *
 * @param host - Resolves imports with the nearest tsconfig.json and reads `@internal` exports.
 * @returns The rule.
 */
export function createNoInternalInBarrelRule(host: BoundaryHost): RuleModule {
    return {
        meta: {
            type: 'problem',
            docs: {
                description: 'Disallow barrel index.ts files from re-exporting @internal-tagged exports',
                url:         docsUrl('no-internal-in-barrel'),
            },
            messages: {
                internalInBarrel: "'{{name}}' is marked @internal and must not be re-exported from a barrel index.ts.",
            },
            schema: [],
        },
        create(context) {
            host.beginRule();
            if(path.basename(context.filename) !== 'index.ts') {
                return {};
            }
            return {
                ExportNamedDeclaration(node: ExportNamedDeclaration) {
                    if(node.source === null) {
                        return;
                    }
                    const source = String(node.source.value);
                    if(!source.startsWith('.')) {
                        return;
                    }
                    const resolved = host.resolve(context.filename, source, null);
                    if(resolved === undefined) {
                        return;
                    }
                    const internal = host.internalExports(resolved);
                    for(const specifier of node.specifiers) {
                        const name = nameText(specifier.local);
                        if(internal.has(name)) {
                            context.report({ node: specifier, messageId: 'internalInBarrel', data: { name } });
                        }
                    }
                },
            };
        },
    };
}

export default createNoInternalInBarrelRule(nodeHost);
