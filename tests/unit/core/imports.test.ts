import { describe, expect, it } from 'bun:test';
import { importLikeOf, type ImportLikeNode } from '../../../src/core/imports.js';
import { find, statement } from '../helpers.js';

function fromStatement(code: string): ReturnType<typeof importLikeOf> {
    return importLikeOf(statement<ImportLikeNode>(code));
}

function fromNode(code: string, type: string): ReturnType<typeof importLikeOf> {
    return importLikeOf(find<ImportLikeNode>(code, type));
}

describe('importLikeOf — static imports and re-exports', () => {
    it('reads value imports, including side-effect, empty and inline-type imports', () => {
        expect(fromStatement("import { a } from './a';")).toEqual({ specifier: './a', typeOnly: false });
        expect(fromStatement("import './a';")).toEqual({ specifier: './a', typeOnly: false });
        expect(fromStatement("import {} from './a';")).toEqual({ specifier: './a', typeOnly: false });
        expect(fromStatement("import { type A } from './a';")).toEqual({ specifier: './a', typeOnly: false });
        expect(fromStatement("import { type A, type B } from './a';")).toEqual({ specifier: './a', typeOnly: false });
    });

    it('reads statement-level type-only imports', () => {
        expect(fromStatement("import type { A } from './a';")).toEqual({ specifier: './a', typeOnly: true });
        expect(fromStatement("import type * as A from './a';")).toEqual({ specifier: './a', typeOnly: true });
    });

    it('reads re-exports, type-only only at statement level', () => {
        expect(fromStatement("export { a } from './a';")).toEqual({ specifier: './a', typeOnly: false });
        expect(fromStatement("export { type A } from './a';")).toEqual({ specifier: './a', typeOnly: false });
        expect(fromStatement("export type { A } from './a';")).toEqual({ specifier: './a', typeOnly: true });
        expect(fromStatement("export * from './a';")).toEqual({ specifier: './a', typeOnly: false });
        expect(fromStatement("export * as a from './a';")).toEqual({ specifier: './a', typeOnly: false });
        expect(fromStatement("export type * from './a';")).toEqual({ specifier: './a', typeOnly: true });
    });

    it('ignores local exports', () => {
        expect(fromStatement('export { a };')).toBeUndefined();
        expect(fromStatement('export const a = 1;')).toBeUndefined();
    });
});

describe('importLikeOf — expressions and type positions', () => {
    it('reads import() with a literal specifier as a value import', () => {
        expect(fromNode("const a = import('./a');", 'ImportExpression')).toEqual({ specifier: './a', typeOnly: false });
        expect(fromNode('const a = import(name);', 'ImportExpression')).toBeUndefined();
        expect(fromNode('const a = import(`./a`);', 'ImportExpression')).toBeUndefined();
    });

    it('reads require() with a literal specifier as a value import', () => {
        expect(fromNode("const a = require('./a');", 'CallExpression')).toEqual({ specifier: './a', typeOnly: false });
        expect(fromNode('const a = require(name);', 'CallExpression')).toBeUndefined();
        expect(fromNode('const a = require();', 'CallExpression')).toBeUndefined();
        expect(fromNode('const a = require(1);', 'CallExpression')).toBeUndefined();
    });

    it('ignores other calls', () => {
        expect(fromNode("const a = load('./a');", 'CallExpression')).toBeUndefined();
        expect(fromNode("const a = module.require('./a');", 'CallExpression')).toBeUndefined();
        expect(fromNode("const a = (0, require)('./a');", 'CallExpression')).toBeUndefined();
    });

    it('reads a type-position import() as type-only', () => {
        expect(fromNode("type A = import('./a').A;", 'TSImportType')).toEqual({ specifier: './a', typeOnly: true });
        expect(fromNode("type A = typeof import('./a');", 'TSImportType')).toEqual({ specifier: './a', typeOnly: true });
    });
});
