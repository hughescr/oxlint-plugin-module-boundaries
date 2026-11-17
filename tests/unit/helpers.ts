/**
 * Shared test helpers: parse with oxc-parser (the parser Oxlint uses), drive a rule through a fake context, and
 * build policies over a fake file system.
 */

import { parseSync } from 'oxc-parser';
import type { Node, ParsedSource } from '../../src/core/ast.js';
import { normalisePolicy, type NormalisedPolicy, type PathKind, type PolicyHost } from '../../src/core/policy.js';
import type { BoundaryHost } from '../../src/io/host.js';
import type { RuleModule } from '../../src/rules/rule.js';

type ReportDescriptor = Parameters<Parameters<RuleModule['create']>[0]['report']>[0];

/** Root of the fake project the policy helpers describe. */
export const ROOT = '/project';

/** Paths that exist in the fake project, relative to {@link ROOT}. */
export const FAKE_TREE: Readonly<Record<string, PathKind>> = {
    '':                'directory',
    src:               'directory',
    'src/app':         'directory',
    'src/utils':       'directory',
    'src/utils/media': 'directory',
    'src/errors':      'directory',
    'src/agent':       'directory',
    'src/index.ts':    'file',
    'tsconfig.json':   'file',
};

/** A policy host over {@link FAKE_TREE} whose real path of the root is itself. */
export const fakePolicyHost: PolicyHost = {
    kind:          absolutePath => FAKE_TREE[absolutePath === ROOT ? '' : absolutePath.slice(ROOT.length + 1)],
    realpath:      absolutePath => absolutePath,
    tsconfigError: () => undefined,
};

/**
 * A normalised policy over the fake project.
 *
 * @param overrides - Policy fields to set beyond `root` and the default modules.
 * @returns The normalised policy.
 */
export function fakePolicy(overrides: Record<string, unknown> = {}): NormalisedPolicy {
    return normalisePolicy({
        root:    ROOT,
        modules: { app: 'src/app', utils: 'src/utils', errors: 'src/errors', agent: 'src/agent', main: 'src/index.ts' },
        ...overrides,
    }, fakePolicyHost).policy;
}

/**
 * Parse source text the way Oxlint does.
 *
 * @param code - The source.
 * @param filename - Picks the dialect.
 * @returns The statements, comments and text.
 */
export function parse(code: string, filename = 'file.ts'): ParsedSource {
    const { program, comments } = parseSync(filename, code);
    return { body: program.body, comments, text: code };
}

/**
 * The first top-level statement of the source.
 *
 * @param code - The source.
 * @returns The statement.
 */
export function statement<T extends Node = Node>(code: string): T {
    return parse(code).body[0] as T;
}

/**
 * The first node of a type anywhere in the source.
 *
 * @param code - The source.
 * @param type - The node type.
 * @returns The node.
 */
export function find<T extends Node = Node>(code: string, type: string): T {
    let found: Node | undefined;
    walk(parseSync('file.ts', code).program, (node) => {
        found ??= node.type === type ? node : undefined;
    });
    return found as T;
}

function walk(value: unknown, visit: (node: Node) => void): void {
    if(Array.isArray(value)) {
        for(const item of value) {
            walk(item, visit);
        }
        return;
    }
    if(typeof value !== 'object' || value === null) {
        return;
    }
    if(typeof (value as Partial<Node>).type === 'string') {
        visit(value as Node);
    }
    for(const child of Object.values(value)) {
        walk(child, visit);
    }
}

/** A report reduced to what the tests compare: message id, data and the reported source text. */
export interface Reported {
    readonly messageId: string
    readonly data?:     Readonly<Record<string, string>>
    readonly text:      string
}

/**
 * Lint source with a rule through a fake context.
 *
 * @param rule - The rule.
 * @param code - The source.
 * @param filename - Absolute path of the file being linted.
 * @param options - The rule options.
 * @returns The reports.
 */
export function lint(rule: RuleModule, code: string, filename: string, options: readonly unknown[] = []): Reported[] {
    const reports: ReportDescriptor[] = [];
    const visitors = rule.create({ filename, options, report: descriptor => reports.push(descriptor) });
    walk(parseSync(filename, code).program, (node) => {
        (visitors[node.type] as ((node: Node) => void) | undefined)?.(node);
    });
    return reports.map(({ messageId, data, node }) => ({ messageId, ...(data === undefined ? {} : { data }), text: code.slice(node.start, node.end) }));
}

/** A recorded call to a fake host's `resolve`. */
export interface ResolveCall {
    readonly importer:  string
    readonly specifier: string
    readonly tsconfig:  string | null
}

/**
 * A host that resolves from a table and reads `@internal` exports from another.
 *
 * @param resolutions - Specifier to absolute path.
 * @param internals - Absolute path to its `@internal` export names.
 * @returns The host and the resolve calls it saw.
 */
export function fakeHost(resolutions: Readonly<Record<string, string>>, internals: Readonly<Record<string, readonly string[]>> = {}): BoundaryHost & { calls: ResolveCall[] } {
    const calls: ResolveCall[] = [];
    return {
        calls,
        beginRule() { /* This fake does not cache. */ },
        canonicalPath: file => file,
        resolve(importer, specifier, tsconfig) {
            calls.push({ importer, specifier, tsconfig });
            return resolutions[specifier];
        },
        internalExports: file => new Set(internals[file]),
    };
}
