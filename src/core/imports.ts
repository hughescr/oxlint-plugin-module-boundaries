/**
 * Import-like extraction from AST nodes. Pure.
 */

import { stringValue, type CallExpression, type ExportAllDeclaration, type ExportNamedDeclaration, type ImportDeclaration, type ImportExpression, type Node, type TSImportEqualsDeclaration, type TSImportType } from './ast.js';

/** A node that may import a module. */
export type ImportLikeNode = CallExpression | ExportAllDeclaration | ExportNamedDeclaration | ImportDeclaration | ImportExpression | TSImportEqualsDeclaration | TSImportType;

/** A module specifier and how it is imported. */
interface ImportLike {
    readonly specifier: string
    /** Statement-level type-only: `import type`, `export type … from`, `export type * from`, or a type-position `import()`. */
    readonly typeOnly:  boolean
}

// Only an identifier callee can carry the name `require`; `module.require(…)` and `(0, require)(…)` do not.
function isRequire(node: CallExpression): boolean {
    return (node.callee as Node & { name?: unknown }).name === 'require';
}

function literal(node: Node | null | undefined, typeOnly: boolean): ImportLike | undefined {
    const specifier = node ? stringValue(node) : undefined;
    return specifier === undefined ? undefined : { specifier, typeOnly };
}

/**
 * The import a node makes, if it makes one with a literal specifier.
 *
 * Covers `import … from`, `export … from`, `export * from`, `import('x')`, `require('x')`,
 * `import x = require('x')` and type-position `import('x')`. An inline `import { type T }`, a side-effect import and an empty specifier list are value
 * imports: only the statement-level `type` keyword makes an import type-only.
 *
 * @param node - A node of one of the import-like types.
 * @returns The specifier and kind, or undefined when the node imports nothing or uses a non-literal specifier.
 */
export function importLikeOf(node: ImportLikeNode): ImportLike | undefined {
    switch(node.type) {
        case 'ImportDeclaration': {
            return literal(node.source, node.importKind === 'type');
        }
        case 'ExportNamedDeclaration':
        case 'ExportAllDeclaration': {
            return literal(node.source, node.exportKind === 'type');
        }
        case 'ImportExpression': {
            return literal(node.source, false);
        }
        case 'TSImportEqualsDeclaration': {
            const reference = node.moduleReference;
            return reference.type === 'TSExternalModuleReference' ? literal(reference.expression, node.importKind === 'type') : undefined;
        }
        case 'TSImportType': {
            return literal(node.source, true);
        }
        case 'CallExpression': {
            return isRequire(node) ? literal(node.arguments[0], false) : undefined;
        }
    }
}
