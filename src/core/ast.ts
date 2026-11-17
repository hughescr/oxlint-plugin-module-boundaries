/**
 * The slice of the ESTree / TS-ESTree shape (as Oxlint and oxc-parser produce it) that the rules read.
 *
 * Only the fields the core touches are declared; every node carries `type` and UTF-16 `start`/`end` offsets.
 */

/** Any AST node. */
export interface Node {
    readonly type:  string
    readonly start: number
    readonly end:   number
}

/** An identifier. */
interface Identifier extends Node {
    readonly type: 'Identifier'
    readonly name: string
}

/** A literal; module specifiers and string export names are string literals. */
interface Literal extends Node {
    readonly type:  'Literal'
    readonly value: unknown
}

/** `A.B` in `namespace A.B {}`. */
interface QualifiedName extends Node {
    readonly type: 'TSQualifiedName'
    readonly left: Name
}

/** Something that names a declaration or an export. */
export type Name = Identifier | Literal | QualifiedName;

/** A comment, as `sourceCode.getAllComments()` and oxc-parser return it. */
export interface Comment {
    readonly type:  'Block' | 'Line'
    readonly value: string
    readonly start: number
    readonly end:   number
}

/** `import … from 'x'`. */
export interface ImportDeclaration extends Node {
    readonly type:        'ImportDeclaration'
    readonly source:      Literal
    readonly importKind?: string
    readonly specifiers:  readonly Node[]
}

/** `{ a as b }` inside an import declaration. */
export interface ImportSpecifier extends Node {
    readonly type:     'ImportSpecifier'
    readonly imported: Name
}

/** `{ a as b }` inside an export declaration. */
export interface ExportSpecifier extends Node {
    readonly type:     'ExportSpecifier'
    readonly local:    Name
    readonly exported: Name
}

/** A declaration that may follow `export` or `export default`. */
export interface Declaration extends Node {
    readonly id?:           Name | null
    readonly declarations?: readonly { readonly id: Node }[]
    readonly decorators?:   readonly Node[]
}

/** `export const a = 1`, `export { a }`, `export { a } from 'x'`. */
export interface ExportNamedDeclaration extends Node {
    readonly type:        'ExportNamedDeclaration'
    readonly declaration: Declaration | null
    readonly specifiers:  readonly ExportSpecifier[]
    readonly source:      Literal | null
    readonly exportKind?: string
}

/** `export default …`. */
export interface ExportDefaultDeclaration extends Node {
    readonly type:        'ExportDefaultDeclaration'
    readonly declaration: Declaration
}

/** `export * from 'x'`, `export * as ns from 'x'`, `export type * from 'x'`. */
export interface ExportAllDeclaration extends Node {
    readonly type:        'ExportAllDeclaration'
    readonly source:      Literal
    readonly exportKind?: string
}

/** `import('x')`. */
export interface ImportExpression extends Node {
    readonly type:   'ImportExpression'
    readonly source: Node
}

/** `f(x)`; `require('x')` is the one the rules care about. */
export interface CallExpression extends Node {
    readonly type:      'CallExpression'
    readonly callee:    Node
    readonly arguments: readonly Node[]
}

/** `require('x')` on the right of a TypeScript import-equals declaration. */
interface TSExternalModuleReference extends Node {
    readonly type:       'TSExternalModuleReference'
    readonly expression: Literal
}

/** `import x = require('x')` or `import x = Ns.y`. */
export interface TSImportEqualsDeclaration extends Node {
    readonly type:            'TSImportEqualsDeclaration'
    readonly moduleReference: TSExternalModuleReference | Name
    readonly importKind?:     string
}

/** `import('x')` in a type position. */
export interface TSImportType extends Node {
    readonly type:   'TSImportType'
    readonly source: Node
}

/** A parsed file: its top-level statements, its comments and its text. */
export interface ParsedSource {
    readonly body:     readonly Node[]
    readonly comments: readonly Comment[]
    readonly text:     string
}

/**
 * The string value of a node when it is a string literal. String literals are the only expression nodes with a
 * string `value`; a template literal has none.
 *
 * @param node - Any node.
 * @returns The string, or undefined for anything else.
 */
export function stringValue(node: Node): string | undefined {
    const value = (node as Partial<Literal>).value;
    return typeof value === 'string' ? value : undefined;
}

/**
 * The text of a declaration or export name, as TypeScript's `name.text` reads it.
 *
 * `A.B` reads as `A`, the outermost namespace, and a string name reads as its value.
 *
 * @param name - An identifier, string literal or qualified name.
 * @returns The name.
 */
export function nameText(name: Name): string {
    switch(name.type) {
        case 'TSQualifiedName': {
            return nameText(name.left);
        }
        case 'Identifier': {
            return name.name;
        }
        case 'Literal': {
            return String(name.value);
        }
    }
}
