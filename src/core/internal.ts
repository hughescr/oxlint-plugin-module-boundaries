/**
 * `@internal` export extraction from a parsed file, matching what TypeScript's JSDoc parser reports. Pure.
 */

import { nameText, type Comment, type Declaration, type ExportDefaultDeclaration, type ExportNamedDeclaration, type Name, type Node, type ParsedSource } from './ast.js';

// A JSDoc line break, after which a leading `*` margin is dropped (TypeScript ignores U+2028/U+2029 here).
const JSDOC_LINE_BREAK = /\r\n?|\n/u;
// What tag detection looks at, in order: a newline; a backtick; an inline `{@link…}`, `{@linkcode…}` or
// `{@linkplain…}` with its text up to `}`, where no tag can start; and a tag start, which is a run of `@` after
// the start of the text or TypeScript's whitespace (JavaScript's plus NEL and ZERO WIDTH SPACE), then the tag
// name (ID_Continue covers ZWNJ and ZWJ; `-` and `$` are name characters too, so `@internal-x` is another tag).
const TOKENS = /\n|`|\{@link(?:code|plain)?(?![\p{ID_Continue}$-])[^}]*|(?<=^|[\s\u{85}\u{200B}])@+[\p{ID_Continue}$-]*/gu;
const PARAM_TAG = /^(?:arg(?:ument)?|param)$/u;
const TYPE_TAGS = new Set(['augments', 'enum', 'exception', 'extends', 'implements', 'return', 'returns', 'satisfies', 'see', 'template', 'this', 'throws', 'type', 'typedef']);
const PARAM_NAME = /\[?[\p{ID_Start}$_][\p{ID_Continue}$.-]*/uy;
// Strings are single tokens so a bracket or brace in a literal cannot end the field.
const GROUP_TOKENS = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|[{}[\]]/gu;
// A line break between comments, as TypeScript's leading-comment scan sees one (U+2028/U+2029 count as spaces).
const LINE_BREAK = /[\n\r]/u;
// Declarations whose `id` TypeScript matches by name; `export import A = …` claims no name.
const NAMED_DECLARATIONS = new Set(['FunctionDeclaration', 'TSDeclareFunction', 'ClassDeclaration', 'TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'TSEnumDeclaration', 'TSModuleDeclaration']);
const DEFAULT_CLAIMING = new Set(['FunctionDeclaration', 'TSDeclareFunction', 'ClassDeclaration']);

/**
 * Whether a JSDoc comment carries an `@internal` tag, as TypeScript's JSDoc parser reads it.
 *
 * An `@` starts a tag when whitespace (or the start of a line, after its `*` margin) precedes it. Once a tag
 * has started, an `@` inside backticks on the same line does not start another, and text inside an inline
 * `{@link …}`, a brace-enclosed type, or an optional parameter name/default never does.
 *
 * @param value - The comment body between `/*` and `*\/`, starting with the second `*` of `/**`.
 * @returns Whether the comment has an `@internal` tag.
 */
export function hasInternalTag(value: string): boolean {
    const text = value.slice(1).split(JSDOC_LINE_BREAK).map((line, index) => (index === 0 ? line : withoutMargin(line))).join('\n');
    // Undefined until the first tag starts (backticks in the description do not matter), then whether a
    // backtick span is open on the current line.
    let inBackticks: boolean | undefined;
    const tokens = new RegExp(TOKENS);
    for(let match = tokens.exec(text); match !== null; match = tokens.exec(text)) {
        const [token] = match;
        if(token === '\n') {
            inBackticks &&= false;
        } else if(token === '`') {
            inBackticks = inBackticks === undefined ? undefined : !inBackticks;
        } else if(token.startsWith('@') && inBackticks !== true) {
            if(token.endsWith('@internal')) {
                return true;
            }
            inBackticks = false;
            tokens.lastIndex = structuredEnd(text, tokens.lastIndex, token.slice(token.lastIndexOf('@') + 1));
        }
    }
    return false;
}

function groupEnd(text: string, start: number, opening: string, closing: string): number {
    if(text[start] !== opening) {
        return start;
    }
    let depth = 0;
    for(const match of text.slice(start).matchAll(GROUP_TOKENS)) {
        const [token] = match;
        if(token === opening) {
            depth++;
        } else if(token === closing && --depth === 0) {
            return start + match.index + 1;
        }
    }
    return start;
}

function argumentStart(text: string, offset: number): number {
    const rest = text.slice(offset);
    return offset + (rest.length - rest.trimStart().length);
}

function structuredEnd(text: string, offset: number, tag: string): number {
    if(PARAM_TAG.test(tag)) {
        const start = argumentStart(text, offset);
        const typeEnd = groupEnd(text, start, '{', '}');
        const nameStart = argumentStart(text, typeEnd);
        PARAM_NAME.lastIndex = nameStart;
        const name = PARAM_NAME.exec(text)?.[0];
        if(name === undefined) {
            return typeEnd;
        }
        const nameEnd = name.startsWith('[') ? groupEnd(text, nameStart, '[', ']') : nameStart + name.length;
        return typeEnd === start ? groupEnd(text, argumentStart(text, nameEnd), '{', '}') : nameEnd;
    }
    return TYPE_TAGS.has(tag) ? groupEnd(text, argumentStart(text, offset), '{', '}') : offset;
}

/** A continuation line of a JSDoc comment without its leading whitespace and one `*` margin. */
function withoutMargin(line: string): string {
    const trimmed = line.trimStart();
    return trimmed.startsWith('*') ? trimmed.slice(1) : trimmed;
}

function declarationNames(declaration: Declaration): string[] {
    if(declaration.type === 'VariableDeclaration') {
        return (declaration.declarations ?? []).flatMap(({ id }) => (id.type === 'Identifier' ? [nameText(id as Name)] : []));
    }
    return NAMED_DECLARATIONS.has(declaration.type) ? [nameText(declaration.id!)] : [];
}

/**
 * The export names a top-level statement claims, in the order TypeScript's `isExportInternal` looks them up.
 *
 * @param statement - A top-level statement.
 * @returns The names; empty for statements that export nothing TypeScript would match.
 */
export function claimedNames(statement: Node): string[] {
    if(statement.type === 'ExportNamedDeclaration') {
        const { declaration, specifiers } = statement as ExportNamedDeclaration;
        return declaration ? declarationNames(declaration) : specifiers.map(specifier => nameText(specifier.exported));
    }
    if(statement.type === 'ExportDefaultDeclaration') {
        const { declaration } = statement as ExportDefaultDeclaration;
        const named = declaration.id ? [nameText(declaration.id)] : [];
        if(declaration.type === 'TSInterfaceDeclaration') {
            return named;
        }
        return DEFAULT_CLAIMING.has(declaration.type) ? [...named, 'default'] : ['default'];
    }
    return [];
}

function statementStart(statement: Node): number {
    const decorators = (statement as { declaration?: Declaration | null }).declaration?.decorators ?? [];
    return Math.min(statement.start, ...decorators.map(decorator => decorator.start));
}

/**
 * The names of a file's exports that carry JSDoc `@internal`, with the semantics of the 1.x `isExportInternal`:
 * the first top-level statement that exports a name decides it; JSDoc attaches as TypeScript attaches it (a
 * comment on the same line as the previous statement's end does not); and a re-export statement
 * (`export { a } from …`, `export { a }`) is judged by its own JSDoc, not the original declaration's.
 *
 * @param source - The parsed file.
 * @returns The `@internal` export names.
 */
export function internalExportNames(source: ParsedSource): Set<string> {
    const claimed = new Map<string, boolean>();
    let commentIndex = 0;
    let previousEnd = 0;
    for(const statement of source.body) {
        const start = statementStart(statement);
        let collecting = previousEnd === 0;
        let cursor = previousEnd;
        let internal = false;
        for(; commentIndex < source.comments.length && source.comments[commentIndex]!.end <= start; commentIndex++) {
            const comment: Comment = source.comments[commentIndex]!;
            if(comment.start >= previousEnd) {
                collecting ||= LINE_BREAK.test(source.text.slice(cursor, comment.start));
                internal ||= collecting && comment.type === 'Block' && comment.value.startsWith('*') && hasInternalTag(comment.value);
                cursor = comment.end;
            }
        }
        for(const name of claimedNames(statement)) {
            if(!claimed.has(name)) {
                claimed.set(name, internal);
            }
        }
        previousEnd = statement.end;
    }
    return new Set([...claimed].filter(([, internal]) => internal).map(([name]) => name));
}
