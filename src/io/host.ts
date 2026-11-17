/**
 * The I/O the rules need, as small caching factories over injected primitives. `node.ts` wires the real ones.
 */

import path from 'node:path';
import type { ParsedSource } from '../core/ast.js';
import { internalExportNames } from '../core/internal.js';
import { clearCompiledPolicies } from './policy-cache.js';

/** What the rules ask of the outside world. */
export interface BoundaryHost {
    /** Record a rule invocation, resetting resolution and policy caches after an idle gap. */
    beginRule(): void
    /** The on-disk path of the importer, or undefined if it is no longer on disk. */
    canonicalPath(file: string): string | undefined
    /**
     * Resolve a module specifier.
     *
     * @param importer - Absolute path of the importing file.
     * @param specifier - The module specifier.
     * @param tsconfig - The tsconfig.json to resolve with, or null for the nearest one above the importer.
     * @returns The absolute path of the resolved file, or undefined when it does not resolve.
     */
    resolve(importer: string, specifier: string, tsconfig: string | null): string | undefined
    /**
     * The `@internal` export names of a file.
     *
     * @param file - Absolute path.
     * @returns The names; empty when the file is missing or is not JavaScript or TypeScript.
     */
    internalExports(file: string): ReadonlySet<string>
}

interface Resolution {
    readonly path?:  string
    readonly error?: string
}

/** One resolver configured for one tsconfig.json (or none). */
export interface Resolver {
    /** Resolve `specifier` as imported from the absolute path `file`. */
    resolveDtsSync(file: string, specifier: string): Resolution
    resolveFileSync(file: string, specifier: string): Resolution
    clearCache(): void
}

/** A file's identity for cache validation. */
export interface FileStamp {
    readonly mtimeMs: number
    readonly size:    number
}

/** The primitives behind {@link createHost}. */
export interface HostPrimitives {
    /** A resolver for the given tsconfig.json, or for none. */
    createResolver(tsconfig: string | undefined): Resolver
    /** The stamp of an existing path, or undefined when it is missing; also how tsconfig.json files are found. */
    stat(file: string): FileStamp | undefined
    /** The file's text. */
    readFile(file: string): string
    /** Parse JavaScript or TypeScript; the file name picks the dialect. */
    parse(file: string, text: string): ParsedSource & { readonly hasErrors: boolean }
    /** A monotonic clock in milliseconds. */
    now(): number
    /** The on-disk path, or undefined if the file is not on disk. */
    realpath(file: string): string | undefined
}

const SOURCE_FILE = /\.[cm]?[jt]sx?$/u;
const IDLE_GAP_MS = 1000;

function tsconfigError({ error }: Resolution): string | undefined {
    return error?.startsWith('Failed to load tsconfig ') || error?.startsWith('Tsconfig') ? error : undefined;
}

/** Check config loading even when declaration resolution would skip it for a relative request. */
export function loadTsconfigError(resolver: Resolver, tsconfig: string): string | undefined {
    return tsconfigError(resolver.resolveFileSync(tsconfig, '.'));
}

function assertNoTsconfigError(error: string | undefined): void {
    if(error !== undefined) {
        throw new Error(error);
    }
}

function resolvedPath(result: Resolution): string | undefined {
    assertNoTsconfigError(tsconfigError(result));
    return result.path;
}

/**
 * A lookup of the nearest tsconfig.json at or above a directory, cached per directory.
 *
 * @param exists - Whether an absolute path exists.
 * @param cache - Directory lookup cache, which the host clears after an idle gap.
 * @returns The lookup; it returns the tsconfig.json path, or undefined when there is none up to the file-system root.
 */
export function createTsconfigLocator(exists: (file: string) => boolean, cache = new Map<string, string | undefined>()): (directory: string) => string | undefined {
    const locate = (directory: string): string | undefined => {
        if(cache.has(directory)) {
            return cache.get(directory);
        }
        const candidate = path.join(directory, 'tsconfig.json');
        const parent = path.dirname(directory);
        let found: string | undefined;
        if(exists(candidate)) {
            found = candidate;
        } else if(parent !== directory) {
            found = locate(parent);
        }
        cache.set(directory, found);
        return found;
    };
    return locate;
}

/**
 * The host: resolution with one cached resolver per tsconfig.json and a per-importer result cache, and
 * `@internal` export names from a read-and-parse cache keyed by absolute path and validated by mtime and size.
 *
 * @param primitives - The file system, resolver and parser to use.
 * @returns The host.
 */
export function createHost(primitives: HostPrimitives): BoundaryHost {
    const locations = new Map<string, string | undefined>();
    const locate = createTsconfigLocator(file => primitives.stat(file) !== undefined, locations);
    const resolvers = new Map<string | undefined, Resolver>();
    const resolutions = new Map<string, string | undefined>();
    const canonicalPaths = new Map<string, string | undefined>();
    const sources = new Map<string, FileStamp & { readonly names: ReadonlySet<string> }>();
    let lastRuleAt = Number.POSITIVE_INFINITY;

    const resolverFor = (tsconfig: string | undefined): Resolver => {
        let resolver = resolvers.get(tsconfig);
        if(resolver === undefined) {
            resolver = primitives.createResolver(tsconfig);
            if(tsconfig !== undefined) {
                assertNoTsconfigError(loadTsconfigError(resolver, tsconfig));
            }
            resolvers.set(tsconfig, resolver);
        }
        return resolver;
    };

    return {
        beginRule() {
            const now = primitives.now();
            if(now - lastRuleAt > IDLE_GAP_MS) {
                for(const resolver of resolvers.values()) {
                    resolver.clearCache();
                }
                resolvers.clear();
                resolutions.clear();
                locations.clear();
                canonicalPaths.clear();
                clearCompiledPolicies();
            }
            lastRuleAt = now;
        },
        canonicalPath(file) {
            if(!canonicalPaths.has(file)) {
                canonicalPaths.set(file, primitives.realpath(file));
            }
            return canonicalPaths.get(file);
        },
        resolve(importer, specifier, tsconfig) {
            const key = JSON.stringify([tsconfig, importer, specifier]);
            if(!resolutions.has(key)) {
                const resolver = resolverFor(tsconfig ?? locate(path.dirname(importer)));
                const resolved = resolvedPath(resolver.resolveDtsSync(importer, specifier))
                  ?? resolvedPath(resolver.resolveFileSync(importer, specifier));
                resolutions.set(key, resolved);
            }
            return resolutions.get(key);
        },
        internalExports(file) {
            const stamp = SOURCE_FILE.test(file) ? primitives.stat(file) : undefined;
            if(stamp === undefined) {
                return new Set();
            }
            const cached = sources.get(file);
            if(cached?.mtimeMs === stamp.mtimeMs && cached.size === stamp.size) {
                return cached.names;
            }
            let text: string;
            try {
                text = primitives.readFile(file);
            } catch{
                // The file may have been removed between stat and read.
                return new Set();
            }
            const parsed = primitives.parse(file, text);
            const names = internalExportNames(parsed);
            if(!parsed.hasErrors) {
                sources.set(file, { mtimeMs: stamp.mtimeMs, size: stamp.size, names });
            }
            return names;
        },
    };
}
