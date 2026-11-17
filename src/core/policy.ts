/**
 * The boundaries policy: its input shape, validation and normalisation.
 *
 * Pure: the only file-system questions (does a path exist, is it a file or a directory, what is its real path)
 * go through the injected {@link PolicyHost}.
 */

import path from 'node:path';

/** Severity of the policy rules. */
export type Severity = 'error' | 'warn';

/** What a path on disk is. */
export type PathKind = 'directory' | 'file';

/** Extra edges for the importing files that match `files`. */
export interface BoundaryException<M extends string = string> {
    /** Globs, relative to `root`, of the importing files this exception covers. */
    readonly files:          readonly string[]
    /** Modules these files may import. */
    readonly allow?:         readonly M[]
    /** Modules these files may import with type-only import statements. */
    readonly allowTypeOnly?: readonly M[]
}

/** The edges out of each module: the modules it may import, or `'*'` for every module. */
export type BoundaryEdges<M extends string = string> = Readonly<Partial<Record<M, '*' | readonly M[]>>>;

/** The policy `defineBoundaries` takes. Every path and glob is relative to `root`. */
export interface BoundariesPolicy<M extends string = string> {
    /** Absolute path of the project directory the policy covers. */
    readonly root:           string
    /** Globs of files that must belong to a module; a linted file that matches and is in no module is reported. */
    readonly include?:       readonly string[]
    /** Globs of files the policy rules skip entirely. */
    readonly ignore?:        readonly string[]
    /** Module name to a directory (everything under it) or a file (a one-file module), or several of them. */
    readonly modules:        Readonly<Record<M, string | readonly string[]>>
    /** Default deny: the modules each module may import. A module with no key may import no other module. */
    readonly allow?:         BoundaryEdges<NoInfer<M>>
    /** Extra edges that only type-only import statements may use. */
    readonly allowTypeOnly?: BoundaryEdges<NoInfer<M>>
    /** File-scoped extra edges, added to the module's own. */
    readonly exceptions?:    readonly BoundaryException<NoInfer<M>>[]
    /** Entry file(s) of a directory module, relative to its directory, or `false` for no entry check. */
    readonly entry?:         string | readonly string[] | false
    /** tsconfig.json used to resolve imports; by default the nearest one above each importing file. */
    readonly tsconfig?:      string
    /** Severity of both policy rules. */
    readonly severity?:      Severity
}

/** One path of one module. */
interface NormalisedModulePath {
    readonly module: string
    /** Relative to root, POSIX separators, no trailing slash. */
    readonly path:   string
    readonly kind:   PathKind
}

/** An exception with its lists filled in. */
interface NormalisedException {
    readonly files:         readonly string[]
    readonly allow:         readonly string[]
    readonly allowTypeOnly: readonly string[]
}

/** Edges keyed by importing module. */
export type NormalisedEdges = Readonly<Record<string, '*' | readonly string[]>>;

/** The validated policy the rules receive as their option. JSON-serialisable. */
export interface NormalisedPolicy {
    /** Real absolute path. */
    readonly root:          string
    readonly include:       readonly string[]
    readonly ignore:        readonly string[]
    /** Every module path, longest first so that the most specific path wins. */
    readonly modules:       readonly NormalisedModulePath[]
    readonly allow:         NormalisedEdges
    readonly allowTypeOnly: NormalisedEdges
    readonly exceptions:    readonly NormalisedException[]
    readonly entry:         readonly string[] | false
    /** Absolute path, or null for the nearest tsconfig.json above each importing file. */
    readonly tsconfig:      string | null
}

/** The file-system questions validation needs answered. */
export interface PolicyHost {
    /** Whether the absolute path is a directory, a file, or missing. */
    kind(absolutePath: string): PathKind | undefined
    /** The real path of an existing absolute path. */
    realpath(absolutePath: string): string
    /** A tsconfig load error, or undefined for a usable config. */
    tsconfigError(absolutePath: string): string | undefined
}

/**
 * Native path operations used for containment and conversion to slash-separated paths. Structural, so that the
 * published declarations need no Node types; `node:path` (and its `win32` and `posix` variants) satisfy it.
 */
export interface PathApi {
    relative(from: string, to: string): string
    isAbsolute(path: string): boolean
    readonly sep: string
}

/** Return a slash-separated path strictly inside root, or undefined. */
export function relativeInside(root: string, file: string, paths: PathApi = path): string | undefined {
    const relative = paths.relative(root, file);
    if(relative === '' || paths.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${paths.sep}`)) {
        return undefined;
    }
    return relative.replaceAll(paths.sep, '/');
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const POLICY_KEYS = new Set(['root', 'include', 'ignore', 'modules', 'allow', 'allowTypeOnly', 'exceptions', 'entry', 'tsconfig', 'severity']);
const EXCEPTION_KEYS = new Set(['files', 'allow', 'allowTypeOnly']);
const DEFAULT_ENTRY = ['index.ts'];

function fail(message: string): never {
    throw new TypeError(`defineBoundaries: ${message}`);
}

function record(value: unknown, what: string): UnknownRecord {
    if(typeof value !== 'object' || value === null || Array.isArray(value)) {
        fail(`${what} must be an object`);
    }
    return value as UnknownRecord;
}

function rejectUnknownKeys(value: UnknownRecord, known: ReadonlySet<string>, what: string): void {
    const unknown = Object.keys(value).filter(key => !known.has(key));
    if(unknown.length > 0) {
        fail(`${what} has unknown key(s): ${unknown.join(', ')}`);
    }
}

function strings(value: unknown, what: string): string[] {
    if(!Array.isArray(value) || !value.every(item => typeof item === 'string' && item.length > 0)) {
        fail(`${what} must be an array of non-empty strings`);
    }
    return [...value as string[]];
}

function globs(value: unknown, what: string): string[] {
    const list = strings(value, what);
    for(const glob of list) {
        // win32.isAbsolute also rejects leading slash, on any platform.
        if(path.win32.isAbsolute(glob) || glob.startsWith('../')) {
            fail(`${what} glob ${JSON.stringify(glob)} must be relative to root`);
        }
    }
    return list;
}

function nonEmptyStrings(value: unknown, what: string): string[] {
    const list = strings(typeof value === 'string' ? [value] : value, what);
    if(list.length === 0) {
        fail(`${what} must not be empty`);
    }
    return list;
}

function relativePath(raw: string, what: string): string {
    const normal = path.posix.normalize(raw).replace(/\/$/u, '');
    if(path.posix.isAbsolute(raw) || normal === '.' || `${normal}/`.startsWith('../')) {
        fail(`${what} ${JSON.stringify(raw)} must be a relative path inside root`);
    }
    return normal;
}

function normaliseRoot(value: unknown, host: PolicyHost): string {
    if(typeof value !== 'string' || !path.isAbsolute(value)) {
        fail(`root must be an absolute path, got ${JSON.stringify(value)}`);
    }
    if(host.kind(value) !== 'directory') {
        fail(`root ${value} is not an existing directory`);
    }
    return host.realpath(value);
}

function normaliseModules(value: unknown, root: string, host: PolicyHost): NormalisedModulePath[] {
    const entries = Object.entries(record(value, 'modules'));
    if(entries.length === 0) {
        fail('modules must name at least one module');
    }
    const owners = new Map<string, string>();
    const paths: NormalisedModulePath[] = [];
    for(const [module, raw] of entries) {
        for(const item of nonEmptyStrings(raw, `modules.${module}`)) {
            const lexical = relativePath(item, `modules.${module} path`);
            const absolute = path.join(root, lexical);
            const kind = host.kind(absolute);
            if(kind === undefined) {
                fail(`modules.${module} path ${lexical} does not exist under ${root}`);
            }
            const relative = relativeInside(root, host.realpath(absolute));
            if(relative === undefined) {
                fail(`modules.${module} path ${JSON.stringify(item)} must resolve inside root`);
            }
            const owner = owners.get(relative);
            if(owner !== undefined) {
                fail(`modules.${owner} and modules.${module} both claim ${relative}`);
            }
            owners.set(relative, module);
            paths.push({ module, path: relative, kind });
        }
    }
    return paths.toSorted((a, b) => b.path.length - a.path.length);
}

function knownModules(value: unknown, what: string, names: ReadonlySet<string>): string[] {
    const list = strings(value, what);
    for(const name of list) {
        if(!names.has(name)) {
            fail(`${what} names ${name}, which is not a module (modules: ${[...names].join(', ')})`);
        }
    }
    return list;
}

function edges(value: unknown, what: string, names: ReadonlySet<string>): NormalisedEdges {
    if(value === undefined) {
        return {};
    }
    return Object.fromEntries(Object.entries(record(value, what)).map(([from, targets]) => {
        knownModules([from], `${what} key`, names);
        return [from, targets === '*' ? '*' : knownModules(targets, `${what}.${from}`, names)];
    }));
}

function exceptions(value: unknown, names: ReadonlySet<string>): NormalisedException[] {
    if(value === undefined) {
        return [];
    }
    if(!Array.isArray(value)) {
        fail('exceptions must be an array');
    }
    return value.map((item: unknown, index) => {
        const what = `exceptions[${index}]`;
        const exception = record(item, what);
        rejectUnknownKeys(exception, EXCEPTION_KEYS, what);
        const files = globs(exception.files, `${what}.files`);
        if(files.length === 0) {
            fail(`${what}.files must not be empty`);
        }
        return {
            files,
            allow:         knownModules(exception.allow ?? [], `${what}.allow`, names),
            allowTypeOnly: knownModules(exception.allowTypeOnly ?? [], `${what}.allowTypeOnly`, names),
        };
    });
}

function entry(value: unknown): readonly string[] | false {
    if(value === false) {
        return false;
    }
    return nonEmptyStrings(value ?? DEFAULT_ENTRY, 'entry').map(item => relativePath(item, 'entry'));
}

function tsconfig(value: unknown, root: string, host: PolicyHost): string | null {
    if(value === undefined) {
        return null;
    }
    if(typeof value !== 'string' || value.length === 0) {
        fail(`tsconfig must be a non-empty path, got ${JSON.stringify(value)}`);
    }
    const absolute = path.resolve(root, value);
    if(host.kind(absolute) !== 'file') {
        fail(`tsconfig ${absolute} does not exist`);
    }
    const error = host.tsconfigError(absolute);
    if(error !== undefined) {
        fail(error);
    }
    return absolute;
}

function severity(value: unknown): Severity {
    if(value === undefined) {
        return 'error';
    }
    if(value !== 'error' && value !== 'warn') {
        fail(`severity must be 'error' or 'warn', got ${JSON.stringify(value)}`);
    }
    return value;
}

/**
 * Validate a boundaries policy and normalise it into the rules' option.
 *
 * @param input - The policy as written in the project's policy file.
 * @param host - Answers the file-system questions.
 * @returns The normalised policy and the rules' severity.
 * @throws {TypeError} Naming the first problem found.
 */
export function normalisePolicy(input: unknown, host: PolicyHost): { policy: NormalisedPolicy, severity: Severity } {
    const policy = record(input, 'the policy');
    rejectUnknownKeys(policy, POLICY_KEYS, 'the policy');
    const root = normaliseRoot(policy.root, host);
    const modules = normaliseModules(policy.modules, root, host);
    const names = new Set(modules.map(item => item.module));
    return {
        policy: {
            root,
            include:       globs(policy.include === undefined ? [] : policy.include, 'include'),
            ignore:        globs(policy.ignore === undefined ? [] : policy.ignore, 'ignore'),
            modules,
            allow:         edges(policy.allow, 'allow', names),
            allowTypeOnly: edges(policy.allowTypeOnly, 'allowTypeOnly', names),
            exceptions:    exceptions(policy.exceptions, names),
            entry:         entry(policy.entry),
            tsconfig:      tsconfig(policy.tsconfig, root, host),
        },
        severity: severity(policy.severity),
    };
}
