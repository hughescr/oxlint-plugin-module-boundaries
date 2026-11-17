/**
 * The compiled form of a normalised policy and the file classification built on it. Pure.
 */

import nativePath from 'node:path';
import picomatch from 'picomatch';
import { relativeInside, type NormalisedEdges, type NormalisedPolicy, type PathApi } from './policy.js';

type Matcher = (relativePath: string) => boolean;
type Edges = ReadonlyMap<string, '*' | ReadonlySet<string>>;

/** An exception ready to match importing files. */
interface CompiledException {
    readonly matches:       Matcher
    readonly allow:         ReadonlySet<string>
    readonly allowTypeOnly: ReadonlySet<string>
}

/** A normalised policy with its globs compiled and its lookups indexed. */
export interface CompiledPolicy {
    readonly policy:        NormalisedPolicy
    readonly paths:         PathApi
    readonly isIncluded:    Matcher
    readonly isIgnored:     Matcher
    readonly allow:         Edges
    readonly allowTypeOnly: Edges
    readonly exceptions:    readonly CompiledException[]
    /** Entry files of each module, relative to root. */
    readonly entries:       ReadonlyMap<string, readonly string[]>
}

/** A file the policy rules leave alone. */
interface Skipped {
    readonly kind: 'skip'
}

/** A file `include` covers that belongs to no module. */
interface Unassigned {
    readonly kind:     'unassigned'
    readonly relative: string
}

/** A file in a module. */
interface InModule {
    readonly kind:     'module'
    readonly relative: string
    readonly module:   string
}

/** Where an importing file stands. */
type ImporterScope = InModule | Skipped | Unassigned;

/** A resolved import target inside a module. */
interface Target {
    readonly relative: string
    readonly module:   string
}

function edges(normalised: NormalisedEdges): Edges {
    return new Map(Object.entries(normalised).map(([from, targets]) => [from, targets === '*' ? '*' : new Set(targets)]));
}

/**
 * Compile a normalised policy: build the glob matchers and index the edges and entry files.
 *
 * @param policy - A policy from `normalisePolicy`.
 * @param paths - Native path operations, injectable to test Windows and POSIX on the same platform.
 * @returns The compiled policy.
 */
export function compilePolicy(policy: NormalisedPolicy, paths: PathApi = nativePath): CompiledPolicy {
    const entries = new Map<string, string[]>();
    for(const { module, path, kind } of policy.modules) {
        const files = kind === 'file' ? [path] : (policy.entry || []).map(entry => `${path}/${entry}`);
        entries.set(module, [...entries.get(module) ?? [], ...files]);
    }
    return {
        policy,
        paths,
        isIncluded:    picomatch([...policy.include]),
        isIgnored:     picomatch([...policy.ignore]),
        allow:         edges(policy.allow),
        allowTypeOnly: edges(policy.allowTypeOnly),
        exceptions:    policy.exceptions.map(exception => ({
            matches:       picomatch([...exception.files]),
            allow:         new Set(exception.allow),
            allowTypeOnly: new Set(exception.allowTypeOnly),
        })),
        entries,
    };
}

/**
 * The path of a file relative to the policy root, or undefined when the file is not under it.
 *
 * @param compiled - The compiled policy.
 * @param file - Absolute path.
 * @returns The POSIX relative path, or undefined.
 */
export function relativeToRoot(compiled: CompiledPolicy, file: string): string | undefined {
    return relativeInside(compiled.policy.root, file, compiled.paths);
}

/**
 * The module a file belongs to: the module with the longest path containing it.
 *
 * @param compiled - The compiled policy.
 * @param relative - Path relative to root.
 * @returns The module name, or undefined when the file is in no module.
 */
export function moduleOf(compiled: CompiledPolicy, relative: string): string | undefined {
    return compiled.policy.modules.find(({ path, kind }) => (kind === 'file' ? relative === path : relative.startsWith(`${path}/`)))?.module;
}

/**
 * Classify a file being linted against the policy.
 *
 * @param compiled - The compiled policy.
 * @param file - Absolute path of the file being linted.
 * @returns `skip` outside root, for ignored files and for files in no module that `include` does not cover;
 *   `unassigned` for files in no module that `include` covers; otherwise the file's module.
 */
export function classifyImporter(compiled: CompiledPolicy, file: string): ImporterScope {
    const relative = relativeToRoot(compiled, file);
    if(relative === undefined || compiled.isIgnored(relative)) {
        return { kind: 'skip' };
    }
    const module = moduleOf(compiled, relative);
    if(module !== undefined) {
        return { kind: 'module', relative, module };
    }
    return compiled.isIncluded(relative) ? { kind: 'unassigned', relative } : { kind: 'skip' };
}

/**
 * Classify a resolved import target.
 *
 * @param compiled - The compiled policy.
 * @param file - Absolute path the import resolved to.
 * @returns The target's module, or undefined when it is outside root, in node_modules, or in no module.
 */
export function classifyTarget(compiled: CompiledPolicy, file: string): Target | undefined {
    const relative = relativeToRoot(compiled, file);
    if(relative === undefined || `/${relative}`.includes('/node_modules/')) {
        return undefined;
    }
    const module = moduleOf(compiled, relative);
    return module === undefined ? undefined : { relative, module };
}
