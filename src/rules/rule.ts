/**
 * The ESLint-shaped rule object Oxlint's JS plugins accept, narrowed to what these rules use.
 */

import type { Node } from '../core/ast.js';

/** What a rule reports. */
interface ReportDescriptor {
    readonly node:      Node
    readonly messageId: string
    readonly data?:     Readonly<Record<string, string>>
}

/** The part of Oxlint's rule context the rules read. */
interface RuleContext {
    /** Absolute path of the file being linted. */
    readonly filename: string
    readonly options:  readonly unknown[]
    report(descriptor: ReportDescriptor): void
}

/** Node visitors keyed by node type. */
type Visitors = Readonly<Partial<Record<string, (node: never) => void>>>;

/** A rule. */
export interface RuleModule {
    readonly meta: {
        readonly type:     'problem'
        readonly docs:     { readonly description: string, readonly url: string }
        readonly messages: Readonly<Record<string, string>>
        readonly schema:   readonly unknown[]
    }
    create(context: RuleContext): Visitors
}

/**
 * The documentation URL of a rule.
 *
 * @param name - The rule name without the plugin prefix.
 * @returns The URL.
 */
export function docsUrl(name: string): string {
    return `https://github.com/hughescr/eslint-plugin-module-boundaries/blob/main/docs/rules/${name}.md`;
}
