/**
 * The edge decision: may this importing file, in this module, import that target? Pure.
 */

import type { CompiledPolicy } from './classify.js';

/** One import-like, classified on both ends. */
export interface Edge {
    /** Importing file, relative to root. */
    readonly importer: string
    readonly from:     string
    /** Resolved target, relative to root. */
    readonly target:   string
    readonly to:       string
    /** Whether the import statement is type-only (`import type`, `export type … from`, a type-position `import()`). */
    readonly typeOnly: boolean
}

/** An allowed edge, or a denial without details. */
interface PlainVerdict {
    readonly kind: 'allowed' | 'notAllowed' | 'typeOnly'
}

/** An allowed edge that misses the target module's entry files. */
interface NotEntryVerdict {
    readonly kind:    'notEntry'
    readonly entries: readonly string[]
}

/** The decision, named by the rule message id it reports (or `allowed`). */
type Verdict = NotEntryVerdict | PlainVerdict;

type EdgeList = 'allow' | 'allowTypeOnly';

function permits(compiled: CompiledPolicy, list: EdgeList, edge: Edge): boolean {
    const targets = compiled[list].get(edge.from);
    return targets === '*'
      || targets?.has(edge.to) === true
      || compiled.exceptions.some(exception => exception[list].has(edge.to) && exception.matches(edge.importer));
}

/**
 * Decide one edge.
 *
 * An import inside its own module is always allowed. Otherwise the edge must be in `allow` (or a matching
 * exception's `allow`), or the import must be type-only and the edge in `allowTypeOnly` (or a matching
 * exception's `allowTypeOnly`). An allowed edge must then land on one of the target module's entry files,
 * unless the policy's `entry` is `false`.
 *
 * @param compiled - The compiled policy.
 * @param edge - The classified import.
 * @returns The verdict.
 */
export function decideEdge(compiled: CompiledPolicy, edge: Edge): Verdict {
    if(edge.from === edge.to) {
        return { kind: 'allowed' };
    }
    if(!permits(compiled, 'allow', edge)) {
        if(!permits(compiled, 'allowTypeOnly', edge)) {
            return { kind: 'notAllowed' };
        }
        if(!edge.typeOnly) {
            return { kind: 'typeOnly' };
        }
    }
    // Every module has at least one path, so compilePolicy indexed entries for it.
    const entries = compiled.entries.get(edge.to)!;
    return compiled.policy.entry === false || entries.includes(edge.target) ? { kind: 'allowed' } : { kind: 'notEntry', entries };
}
