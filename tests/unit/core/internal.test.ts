/**
 * Expected values below were taken from TypeScript 6's JSDoc parser (`ts.getJSDocTags` / `node.jsDoc`), which
 * the 1.x `isExportInternal` used.
 */
import { describe, expect, it } from 'bun:test';
import { claimedNames, hasInternalTag, internalExportNames } from '../../../src/core/internal.js';
import { parse, statement } from '../helpers.js';

/** `hasInternalTag` on the body of a `/** … *\/` comment written in full. */
function tagged(comment: string): boolean {
    return hasInternalTag(comment.slice(2, -2));
}

function internals(code: string): string[] {
    return [...internalExportNames(parse(code))].toSorted((a, b) => a.localeCompare(b));
}

describe('hasInternalTag — where a tag starts', () => {
    it('finds a tag at the start of the comment or of a line', () => {
        expect(tagged('/** @internal */')).toBe(true);
        expect(tagged('/**@internal*/')).toBe(true);
        expect(tagged('/**\n * desc\n * @internal\n */')).toBe(true);
        expect(tagged('/**\n *@internal\n */')).toBe(true);
        expect(tagged('/**\n * desc\n   @internal\n */')).toBe(true);
        expect(tagged('/** a\n@internal */')).toBe(true);
        expect(tagged('/**\n\t * \t@internal */')).toBe(true);
    });

    it('finds a tag after whitespace anywhere, even in the description', () => {
        expect(tagged('/** not @internal really */')).toBe(true);
        expect(tagged('/** a\t@internal */')).toBe(true);
        expect(tagged('/** a\u{A0}@internal */')).toBe(true);
        expect(tagged('/** a\u{85}@internal */')).toBe(true);
        expect(tagged('/** a\u{200B}@internal */')).toBe(true);
        expect(tagged('/** @param x @internal */')).toBe(true);
        expect(tagged('/** @foo\t@internal */')).toBe(true);
        expect(tagged('/** x * @internal */')).toBe(true);
    });

    it('finds no tag after other characters', () => {
        expect(tagged('/** @remarks foo@internal */')).toBe(false);
        expect(tagged('/** @foo (@internal) */')).toBe(false);
        expect(tagged(String.raw`/** \@internal */`)).toBe(false);
        expect(tagged('/** {@internal} */')).toBe(false);
        expect(tagged('/** @returns x @ internal */')).toBe(false);
    });

    it('drops one * margin on continuation lines only', () => {
        expect(tagged('/** *@internal */')).toBe(false);
        expect(tagged('/***@internal*/')).toBe(false);
        expect(tagged('/**\n**@internal */')).toBe(false);
        expect(tagged('/** x\n *   * @internal */')).toBe(true);
        expect(tagged('/**\n   *@internal */')).toBe(true);
        expect(tagged('/** a\n  b @internal */')).toBe(true);
        expect(tagged('/** x\r*@internal */')).toBe(true);
        expect(tagged('/** x\r\n*@internal */')).toBe(true);
        expect(tagged('/** x\u{2028}*@internal */')).toBe(false);
    });
});

describe('hasInternalTag — tag names', () => {
    it('matches the internal tag exactly', () => {
        expect(tagged('/** @internal: x */')).toBe(true);
        expect(tagged('/** @internal.x */')).toBe(true);
        expect(tagged('/** @internal(x) */')).toBe(true);
        expect(tagged('/** @internal**/')).toBe(true);
        expect(tagged('/** @foo @internal@bar */')).toBe(true);
    });

    it('reads a run of @ as one tag start', () => {
        expect(tagged('/** @@internal */')).toBe(true);
        expect(tagged('/** @@@internal */')).toBe(true);
        expect(tagged('/** x @@internal */')).toBe(true);
        expect(tagged('/** @@foo @internal */')).toBe(true);
        expect(tagged('/** x@@internal */')).toBe(false);
        expect(tagged('/** @@ internal */')).toBe(false);
        expect(tagged('/** @@internalx */')).toBe(false);
        expect(tagged('/** @a `x @@internal` */')).toBe(false);
    });

    it('does not match longer or different tag names', () => {
        expect(tagged('/** @internalish */')).toBe(false);
        expect(tagged('/** @internal-x */')).toBe(false);
        expect(tagged('/** @internal$ */')).toBe(false);
        expect(tagged('/** @internal_ */')).toBe(false);
        expect(tagged('/** @internal1 */')).toBe(false);
        expect(tagged('/** @internal\u{E9} */')).toBe(false);
        expect(tagged('/** @internal\u{200C} */')).toBe(false);
        expect(tagged('/** @internal\u{200D} */')).toBe(false);
        expect(tagged('/** @INTERNAL */')).toBe(false);
        expect(tagged('/** @inter */')).toBe(false);
    });
});

describe('hasInternalTag — backticks and inline links', () => {
    it('ignores backticks in the description', () => {
        expect(tagged('/** `a @internal` */')).toBe(true);
        expect(tagged('/** ` @internal */')).toBe(true);
        expect(tagged('/** `x @foo @internal` */')).toBe(true);
    });

    it('suppresses tags inside backticks after a tag, until the line ends', () => {
        expect(tagged('/** @remarks `a @internal` */')).toBe(false);
        expect(tagged('/** @remarks x ` @internal */')).toBe(false);
        expect(tagged('/** @a `x` @foo `y @internal` */')).toBe(false);
        expect(tagged('/** @remarks ``a`` @internal */')).toBe(true);
        expect(tagged('/** @a `x @foo` @internal */')).toBe(true);
        expect(tagged('/** @remarks `a\n * @internal` */')).toBe(true);
        expect(tagged('/** @example\n * ```\n * @internal\n * ```\n */')).toBe(true);
    });

    it('skips the text of inline links, across lines', () => {
        expect(tagged('/** {@link a @internal} */')).toBe(false);
        expect(tagged('/** @a {@linkcode x @internal} */')).toBe(false);
        expect(tagged('/** @a {@linkplain x @internal} */')).toBe(false);
        expect(tagged('/** @a {@link x\n * @internal */')).toBe(false);
        expect(tagged('/** {@link x}@internal */')).toBe(false);
        expect(tagged('/** {@link a} @internal */')).toBe(true);
        expect(tagged('/** @a {@link x @b} @internal */')).toBe(true);
        expect(tagged('/** @a {@links x @internal} */')).toBe(true);
        expect(tagged('/** @a {@link-x @internal} */')).toBe(true);
        expect(tagged('/** {@link a} `x @internal` */')).toBe(true);
        expect(tagged('/** @a {@link x} `y @internal` */')).toBe(false);
        expect(tagged('/** {@link a} @b `x @internal` */')).toBe(false);
    });
});

describe('hasInternalTag — structured JSDoc fields', () => {
    it('ignores optional parameter defaults and resumes after their closing bracket', () => {
        expect(tagged('/** @param {string} [name=" @internal "] */')).toBe(false);
        expect(tagged('/** @arg [name=["] @internal "]] {string} */')).toBe(false);
        expect(tagged('/** @argument [name=" @internal "] */')).toBe(false);
        expect(tagged('/** @argument [name=" @internal "] @internal */')).toBe(true);
        expect(tagged('/** @notparam [name=" @internal "] */')).toBe(true);
        expect(tagged('/** @params [name=" @internal "] */')).toBe(true);
        expect(tagged('/** @param [[name=" @internal "]] */')).toBe(true);
        expect(tagged('/** @param {string} [name] [other=" @internal "] */')).toBe(true);
        expect(tagged('/** @param name [other=" @internal "] */')).toBe(true);
    });

    it.each(['"', "'", '`'])('keeps brackets inside %s-quoted defaults, including escapes', (quote) => {
        expect(tagged(String.raw`/** @param [name=${quote}text\q] @internal ${quote}] */`)).toBe(false);
        expect(tagged(String.raw`/** @param [name=${quote}text\ ] @internal ${quote}] */`)).toBe(false);
    });

    it.each(['augments', 'enum', 'exception', 'extends', 'implements', 'return', 'satisfies', 'see', 'template', 'this', 'throws', 'type', 'typedef'])('skips the type-like operand of @%s', (tag) => {
        expect(tagged(`/** @${tag} {" @internal "} T */`)).toBe(false);
    });

    it('ignores brace-enclosed types but not ordinary prose in braces', () => {
        expect(tagged('/** @param { { example: "} @internal " } } name */')).toBe(false);
        expect(tagged(String.raw`/** @param name {"\" @internal "} */`)).toBe(false);
        expect(tagged('/** @returns {\n * " @internal "\n * } @internal */')).toBe(true);
        expect(tagged('/** @returns {" @internal "} */')).toBe(false);
        expect(tagged('/** @returns {{ a: {}, b: " @internal " }} */')).toBe(false);
        expect(tagged('/** @returns prose { " @internal " } */')).toBe(true);
        expect(tagged('/** @param {string} x { " @internal " } */')).toBe(true);
        expect(tagged('/** @param ? value {" @internal "} */')).toBe(true);
        expect(tagged('/** @overload {" @internal "} T */')).toBe(true);
        expect(tagged('/** @remarks { x @internal } */')).toBe(true);
        expect(tagged('/** @param {missing @internal */')).toBe(true);
    });
});

describe('claimedNames', () => {
    it('claims declaration names', () => {
        expect(claimedNames(statement('export function f() {}'))).toEqual(['f']);
        expect(claimedNames(statement('export declare function f(): void;'))).toEqual(['f']);
        expect(claimedNames(statement('export class K {}'))).toEqual(['K']);
        expect(claimedNames(statement('export interface I {}'))).toEqual(['I']);
        expect(claimedNames(statement('export type T = string;'))).toEqual(['T']);
        expect(claimedNames(statement('export enum E { A }'))).toEqual(['E']);
        expect(claimedNames(statement('export namespace N {}'))).toEqual(['N']);
        expect(claimedNames(statement('export namespace A.B.C {}'))).toEqual(['A']);
    });

    it('claims identifier variables only', () => {
        expect(claimedNames(statement('export const a = 1, b = 2;'))).toEqual(['a', 'b']);
        expect(claimedNames(statement('export const { a, b } = c;'))).toEqual([]);
        expect(claimedNames(statement('export const [a] = c, d = 1;'))).toEqual(['d']);
    });

    it('claims no name for export import', () => {
        expect(claimedNames(statement('export import A = N.A;'))).toEqual([]);
    });

    it('claims exported names of export lists, with or without a source', () => {
        expect(claimedNames(statement("export { a as b, c } from './x';"))).toEqual(['b', 'c']);
        expect(claimedNames(statement('export { a as "a-b" };'))).toEqual(['a-b']);
        expect(claimedNames(statement('export {};'))).toEqual([]);
    });

    it('claims default and the declaration name of default exports as TypeScript does', () => {
        expect(claimedNames(statement('export default function f() {}'))).toEqual(['f', 'default']);
        expect(claimedNames(statement('export default function () {}'))).toEqual(['default']);
        expect(claimedNames(statement('export default class K {}'))).toEqual(['K', 'default']);
        expect(claimedNames(statement('export default function f(): void;'))).toEqual(['f', 'default']);
        expect(claimedNames(statement('export default interface I {}'))).toEqual(['I']);
        expect(claimedNames(statement('export default 42;'))).toEqual(['default']);
        expect(claimedNames(statement('export default x;'))).toEqual(['default']);
    });

    it('claims nothing for other statements', () => {
        expect(claimedNames(statement("export * from './x';"))).toEqual([]);
        expect(claimedNames(statement("export * as ns from './x';"))).toEqual([]);
        expect(claimedNames(statement('export = x;'))).toEqual([]);
        expect(claimedNames(statement('function f() {}'))).toEqual([]);
    });
});

describe('internalExportNames — attachment', () => {
    it('reads the JSDoc of each export kind', () => {
        expect(internals([
            '/** @internal */ export function f() {}',
            '/** @internal */ export const c = 1;',
            '/** @internal */ export class K {}',
            '/** @internal */ export default 1;',
            '/** @internal */ export { a as b } from "./x";',
            'export const pub = 1;',
            'export { d };',
        ].join('\n'))).toEqual(['b', 'c', 'default', 'f', 'K']);
    });

    it('needs a JSDoc block comment', () => {
        expect(internals('/* @internal */\nexport const a = 1;')).toEqual([]);
        expect(internals('// @internal\nexport const a = 1;')).toEqual([]);
        expect(internals('//* @internal\nexport const a = 1;')).toEqual([]);
        expect(internals('/**/ export const a = 1;')).toEqual([]);
    });

    it('reads every JSDoc comment before the statement', () => {
        expect(internals('/** @internal */ /** other */\nexport const a = 1;')).toEqual(['a']);
        expect(internals('/** @internal */\n// line\nexport const a = 1;')).toEqual(['a']);
        expect(internals('/** @internal */\n\n\nexport const a = 1;')).toEqual(['a']);
        expect(internals('/** @internal */export const a = 1;')).toEqual(['a']);
        expect(internals('foo();\n/** @internal */export const a = 1;')).toEqual(['a']);
    });

    it('does not attach a comment on the line where the previous statement ends', () => {
        expect(internals('foo(); /** @internal */\nexport const a = 1;')).toEqual([]);
        expect(internals('foo();/** @internal */\nexport const a = 1;')).toEqual([]);
        expect(internals('foo();\n/** @internal */ export const a = 1;')).toEqual(['a']);
        expect(internals('foo(); // x\n/** @internal */\nexport const a = 1;')).toEqual(['a']);
        expect(internals('foo(); /* x\n */ /** @internal */\nexport const a = 1;')).toEqual([]);
        expect(internals('foo();/* x\n */ /** @internal */\nexport const a = 1;')).toEqual([]);
        expect(internals('foo(); \u{2028}/** @internal */ export const a = 1;')).toEqual([]);
        expect(internals('foo(); \r/** @internal */ export const a = 1;')).toEqual(['a']);
    });

    it('ignores comments inside earlier statements', () => {
        expect(internals('function f() {\n  /** @internal */\n}\nexport const a = 1;')).toEqual([]);
        expect(internals('function f() {\n  // x\n}\n/** @internal */ export const a = 1;')).toEqual(['a']);
        expect(internals('function f() {\n  /* x */\n} /** @internal */\nexport const a = 1;')).toEqual([]);
    });

    it('attaches a comment written before a decorator', () => {
        expect(internals('/** @internal */\n@dec export class A {}\nexport const b = 1;')).toEqual(['A']);
        expect(internals('/** @internal */\n@a @b export class A {}')).toEqual(['A']);
        expect(internals('@dec /** @internal */ export class A {}')).toEqual([]);
    });

    it('lets the first statement that exports a name decide it', () => {
        expect(internals('export function f(): void;\n/** @internal */\nexport function f() {}')).toEqual([]);
        expect(internals('/** @internal */\nexport function f(): void;\nexport function f() {}')).toEqual(['f']);
        expect(internals('/** @internal */\nexport default class K {}')).toEqual(['default', 'K']);
    });

    it('returns nothing for a file without exports', () => {
        expect(internals('/** @internal */\nconst a = 1;')).toEqual([]);
        expect(internals('')).toEqual([]);
    });
});
