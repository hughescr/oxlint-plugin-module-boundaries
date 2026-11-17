/**
 * The real file system, oxc-resolver and oxc-parser behind the host and the policy validation.
 */

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { parseSync } from 'oxc-parser';
import { ResolverFactory } from 'oxc-resolver';
import type { PathKind, PolicyHost } from '../core/policy.js';
import { createHost, loadTsconfigError, type BoundaryHost, type FileStamp, type HostPrimitives, type Resolver } from './host.js';

function kind(absolutePath: string): PathKind | undefined {
    const stats = statSync(absolutePath, { throwIfNoEntry: false });
    if(stats === undefined) {
        return undefined;
    }
    return stats.isDirectory() ? 'directory' : 'file';
}

/** File-system answers for policy validation. */
export const nodePolicyHost: PolicyHost = {
    kind,
    realpath:      absolutePath => realpathSync(absolutePath),
    tsconfigError: absolutePath => loadTsconfigError(createNodeResolver(absolutePath), absolutePath),
};

/**
 * A resolver for one tsconfig.json, or for none. The host calls its `resolveDtsSync`, which follows
 * TypeScript's `moduleResolution: "bundler"` (extensionless imports, `.js` written for `.ts`, directory
 * indexes) and the tsconfig's `paths`, then falls back to `resolveFileSync` for other existing files.
 *
 * @param tsconfig - Absolute path of the tsconfig.json, or undefined.
 * @returns The resolver.
 */
export function createNodeResolver(tsconfig: string | undefined): Resolver {
    return new ResolverFactory(tsconfig === undefined ? {} : { tsconfig: { configFile: tsconfig, references: 'auto' } });
}

function stat(file: string): FileStamp | undefined {
    return statSync(file, { throwIfNoEntry: false });
}

function parse(file: string, text: string): ReturnType<HostPrimitives['parse']> {
    const { program, comments, errors } = parseSync(file, text);
    return { body: program.body, comments, text, hasErrors: errors.length > 0 };
}

function canonicalPath(file: string): string | undefined {
    try {
        return nodePolicyHost.realpath(file);
    } catch (error) {
        const { code } = error as NodeJS.ErrnoException;
        if(code !== 'ENOENT' && code !== 'ENOTDIR') {
            throw error;
        }
        // Lint may have already read the file before it was removed.
        return undefined;
    }
}

/** The host the published rules use. */
export const nodeHost: BoundaryHost = createHost({
    createResolver: createNodeResolver,
    stat,
    readFile:       file => readFileSync(file, 'utf8'),
    parse,
    now:            () => performance.now(),
    realpath:       canonicalPath,
});
