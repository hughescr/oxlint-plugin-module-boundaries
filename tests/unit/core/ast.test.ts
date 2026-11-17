import { describe, expect, it } from 'bun:test';
import { nameText, stringValue, type Name } from '../../../src/core/ast.js';
import { find } from '../helpers.js';

describe('stringValue', () => {
    it('reads string literals only', () => {
        expect(stringValue(find("x('a');", 'Literal'))).toBe('a');
        expect(stringValue(find('x(1);', 'Literal'))).toBeUndefined();
        expect(stringValue(find('x(`a`);', 'TemplateLiteral'))).toBeUndefined();
        expect(stringValue(find('x(a);', 'Identifier'))).toBe(undefined);
    });
});

describe('nameText', () => {
    it('reads identifiers, string names and the outermost qualified name', () => {
        expect(nameText(find<Name>('a;', 'Identifier'))).toBe('a');
        expect(nameText(find<Name>("export { a as 'a-b' };", 'Literal'))).toBe('a-b');
        expect(nameText(find<Name>('namespace A.B.C {}', 'TSQualifiedName'))).toBe('A');
    });
});
