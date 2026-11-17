import { describe, expect, it } from 'bun:test';
import { compilePolicy, type CompiledPolicy } from '../../../src/core/classify.js';
import { decideEdge, type Edge } from '../../../src/core/edge.js';
import { fakePolicy } from '../helpers.js';

const compiled = compilePolicy(fakePolicy({
    allow:         { app: '*', main: ['app'], agent: ['utils'] },
    allowTypeOnly: { agent: ['errors'], utils: '*' },
    exceptions:    [
        { files: ['src/utils/media/**'], allow: ['errors'] },
        { files: ['src/errors/typed.ts'], allowTypeOnly: ['agent'] },
    ],
}));

function edge(overrides: Partial<Edge>): Edge {
    return { importer: 'src/app/a.ts', from: 'app', target: 'src/utils/index.ts', to: 'utils', typeOnly: false, ...overrides };
}

function decide(overrides: Partial<Edge>, policy: CompiledPolicy = compiled): string {
    return decideEdge(policy, edge(overrides)).kind;
}

describe('decideEdge — module edges', () => {
    it('allows any import inside the same module, without an entry check', () => {
        expect(decide({ importer: 'src/utils/a.ts', from: 'utils', target: 'src/utils/deep/b.ts', to: 'utils' })).toBe('allowed');
    });

    it('allows an edge listed in allow, or covered by *', () => {
        expect(decide({ importer: 'src/agent/a.ts', from: 'agent' })).toBe('allowed');
        expect(decide({ to: 'errors', target: 'src/errors/index.ts' })).toBe('allowed');
        expect(decide({ importer: 'src/index.ts', from: 'main', to: 'app', target: 'src/app/index.ts' })).toBe('allowed');
    });

    it('denies an edge not listed, and every edge from a module with no allow key', () => {
        expect(decide({ importer: 'src/agent/a.ts', from: 'agent', to: 'app', target: 'src/app/index.ts' })).toBe('notAllowed');
        expect(decide({ importer: 'src/index.ts', from: 'main', to: 'utils' })).toBe('notAllowed');
        expect(decide({ importer: 'src/errors/a.ts', from: 'errors', to: 'utils' })).toBe('notAllowed');
    });

    it('allows type-only edges only for type-only imports', () => {
        const typeEdge = { importer: 'src/agent/a.ts', from: 'agent', to: 'errors', target: 'src/errors/index.ts' };
        expect(decide({ ...typeEdge, typeOnly: true })).toBe('allowed');
        expect(decide({ ...typeEdge, typeOnly: false })).toBe('typeOnly');
        const wildcard = { importer: 'src/utils/a.ts', from: 'utils', to: 'app', target: 'src/app/index.ts' };
        expect(decide({ ...wildcard, typeOnly: true })).toBe('allowed');
        expect(decide({ ...wildcard, typeOnly: false })).toBe('typeOnly');
    });

    it('reports notAllowed for a type-only import along an edge that is not even type-only allowed', () => {
        expect(decide({ importer: 'src/errors/a.ts', from: 'errors', to: 'agent', target: 'src/agent/index.ts', typeOnly: true })).toBe('notAllowed');
    });

    it('adds exception edges only for the files they match', () => {
        const media = { from: 'utils', to: 'errors', target: 'src/errors/index.ts' };
        expect(decide({ ...media, importer: 'src/utils/media/a.ts' })).toBe('allowed');
        expect(decide({ ...media, importer: 'src/utils/a.ts' })).toBe('typeOnly');
        const typed = { from: 'errors', to: 'agent', target: 'src/agent/index.ts' };
        expect(decide({ ...typed, importer: 'src/errors/typed.ts', typeOnly: true })).toBe('allowed');
        expect(decide({ ...typed, importer: 'src/errors/typed.ts', typeOnly: false })).toBe('typeOnly');
        expect(decide({ ...typed, importer: 'src/errors/other.ts', typeOnly: true })).toBe('notAllowed');
    });

    it('does not let an exception for one target open another', () => {
        expect(decide({ importer: 'src/utils/media/a.ts', from: 'utils', to: 'agent', target: 'src/agent/index.ts' })).toBe('typeOnly');
        expect(decide({ importer: 'src/errors/typed.ts', from: 'errors', to: 'app', target: 'src/app/index.ts', typeOnly: true })).toBe('notAllowed');
    });
});

describe('decideEdge — entry files', () => {
    it('requires an allowed edge to land on an entry file, naming the entries', () => {
        expect(decideEdge(compiled, edge({ target: 'src/utils/helper.ts' }))).toEqual({ kind: 'notEntry', entries: ['src/utils/index.ts'] });
        expect(decideEdge(compiled, edge({ target: 'src/utils/nested/index.ts' }))).toEqual({ kind: 'notEntry', entries: ['src/utils/index.ts'] });
    });

    it('checks the entry of type-only edges too', () => {
        expect(decide({ importer: 'src/agent/a.ts', from: 'agent', to: 'errors', target: 'src/errors/types.ts', typeOnly: true })).toBe('notEntry');
    });

    it('treats a one-file module as its own entry', () => {
        expect(decide({ importer: 'src/app/a.ts', to: 'main', target: 'src/index.ts' })).toBe('allowed');
    });

    it('skips the entry check when entry is false', () => {
        const noEntry = compilePolicy(fakePolicy({ allow: { app: '*' }, entry: false }));
        expect(decide({ target: 'src/utils/helper.ts' }, noEntry)).toBe('allowed');
        expect(decide({ importer: 'src/utils/a.ts', from: 'utils', to: 'app', target: 'src/app/index.ts' }, noEntry)).toBe('notAllowed');
    });
});
