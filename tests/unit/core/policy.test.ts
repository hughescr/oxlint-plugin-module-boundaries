import { describe, expect, it } from 'bun:test';
import { normalisePolicy, type PolicyHost } from '../../../src/core/policy.js';
import { fakePolicyHost, ROOT } from '../helpers.js';

const base = { root: ROOT, modules: { app: 'src/app', utils: 'src/utils' } };

function normalise(overrides: Record<string, unknown>, host: PolicyHost = fakePolicyHost): ReturnType<typeof normalisePolicy> {
    return normalisePolicy({ ...base, ...overrides }, host);
}

function failure(input: unknown, host: PolicyHost = fakePolicyHost): string {
    try {
        normalisePolicy(input, host);
    } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
        return (error as TypeError).message;
    }
    throw new TypeError('expected normalisePolicy to throw');
}

describe('normalisePolicy — defaults', () => {
    it('fills every optional field', () => {
        expect(normalise({})).toEqual({
            policy: {
                root:    ROOT,
                include: [],
                ignore:  [],
                modules: [
                    { module: 'utils', path: 'src/utils', kind: 'directory' },
                    { module: 'app', path: 'src/app', kind: 'directory' },
                ],
                allow:         {},
                allowTypeOnly: {},
                exceptions:    [],
                entry:         ['index.ts'],
                tsconfig:      null,
            },
            severity: 'error',
        });
    });

    it('produces a JSON-serialisable policy', () => {
        const { policy } = normalise({ exceptions: [{ files: ['src/utils/x.ts'] }], allow: { app: '*' }, tsconfig: 'tsconfig.json' });
        // eslint-disable-next-line unicorn/prefer-structured-clone -- the JSON round trip is the property under test, not a clone
        expect(JSON.parse(JSON.stringify(policy))).toEqual(policy);
    });

    it('uses the real path of root', () => {
        const host: PolicyHost = { ...fakePolicyHost, kind: absolutePath => fakePolicyHost.kind(absolutePath.replace('/real/project', ROOT)), realpath: absolutePath => absolutePath.replace(/^\/project/u, '/real/project') };
        const { policy } = normalise({ tsconfig: 'tsconfig.json' }, host);
        expect(policy.root).toBe('/real/project');
        expect(policy.tsconfig).toBe('/real/project/tsconfig.json');
    });
});

describe('normalisePolicy — fields', () => {
    it('keeps include and ignore globs', () => {
        const { policy } = normalise({ include: ['src/**'], ignore: ['**/*.test.ts', '**/*.spec.ts'] });
        expect(policy.include).toEqual(['src/**']);
        expect(policy.ignore).toEqual(['**/*.test.ts', '**/*.spec.ts']);
    });

    it('accepts a file module and several paths per module', () => {
        const { policy } = normalise({ modules: { main: 'src/index.ts', libs: ['src/utils', 'src/errors'] } });
        expect(policy.modules).toEqual([
            { module: 'main', path: 'src/index.ts', kind: 'file' },
            { module: 'libs', path: 'src/errors', kind: 'directory' },
            { module: 'libs', path: 'src/utils', kind: 'directory' },
        ]);
    });

    it('orders module paths longest first whatever order they are written in', () => {
        const short = normalise({ modules: { outer: 'src', inner: 'src/utils', deepest: 'src/utils/media' } }).policy.modules;
        const long = normalise({ modules: { deepest: 'src/utils/media', inner: 'src/utils', outer: 'src' } }).policy.modules;
        expect(short.map(item => item.module)).toEqual(['deepest', 'inner', 'outer']);
        expect(long.map(item => item.module)).toEqual(['deepest', 'inner', 'outer']);
    });

    it('normalises module paths to POSIX relative form without trailing slash', () => {
        const { policy } = normalise({ modules: { app: './src//app/', utils: 'src/x/../utils' } });
        expect(policy.modules.map(item => item.path)).toEqual(['src/utils', 'src/app']);
    });

    it('keeps allow and allowTypeOnly edges, including the * wildcard', () => {
        const { policy } = normalise({ allow: { app: '*', utils: [] }, allowTypeOnly: { utils: ['app'] } });
        expect(policy.allow).toEqual({ app: '*', utils: [] });
        expect(policy.allowTypeOnly).toEqual({ utils: ['app'] });
    });

    it('fills exception lists', () => {
        const { policy } = normalise({
            exceptions: [
                { files: ['src/utils/media/**'], allow: ['app'] },
                { files: ['src/utils/x.ts'], allowTypeOnly: ['app'] },
            ],
        });
        expect(policy.exceptions).toEqual([
            { files: ['src/utils/media/**'], allow: ['app'], allowTypeOnly: [] },
            { files: ['src/utils/x.ts'], allow: [], allowTypeOnly: ['app'] },
        ]);
    });

    it('accepts entry as a string, an array or false', () => {
        expect(normalise({ entry: 'main.ts' }).policy.entry).toEqual(['main.ts']);
        expect(normalise({ entry: ['index.ts', './lib/index.ts'] }).policy.entry).toEqual(['index.ts', 'lib/index.ts']);
        expect(normalise({ entry: false }).policy.entry).toBe(false);
    });

    it('resolves tsconfig against root', () => {
        expect(normalise({ tsconfig: 'tsconfig.json' }).policy.tsconfig).toBe(`${ROOT}/tsconfig.json`);
        expect(normalise({ tsconfig: `${ROOT}/tsconfig.json` }).policy.tsconfig).toBe(`${ROOT}/tsconfig.json`);
    });

    it('accepts warn severity', () => {
        expect(normalise({ severity: 'warn' }).severity).toBe('warn');
        expect(normalise({ severity: 'error' }).severity).toBe('error');
    });
});

describe('normalisePolicy — failures', () => {
    it('rejects a non-object policy', () => {
        expect(failure(null)).toBe('defineBoundaries: the policy must be an object');
        expect(failure([])).toBe('defineBoundaries: the policy must be an object');
        expect(failure('x')).toBe('defineBoundaries: the policy must be an object');
    });

    it('rejects unknown policy keys', () => {
        expect(failure({ ...base, allowTypeonly: {}, files: [] })).toBe('defineBoundaries: the policy has unknown key(s): allowTypeonly, files');
    });

    it('rejects a missing, relative or non-directory root', () => {
        expect(failure({ modules: base.modules })).toBe('defineBoundaries: root must be an absolute path, got undefined');
        expect(failure({ ...base, root: 'project' })).toBe('defineBoundaries: root must be an absolute path, got "project"');
        expect(failure({ ...base, root: '/elsewhere' })).toBe('defineBoundaries: root /elsewhere is not an existing directory');
        expect(failure({ ...base, root: `${ROOT}/src/index.ts` })).toBe('defineBoundaries: root /project/src/index.ts is not an existing directory');
    });

    it('rejects missing or empty modules', () => {
        expect(failure({ root: ROOT })).toBe('defineBoundaries: modules must be an object');
        expect(failure({ root: ROOT, modules: {} })).toBe('defineBoundaries: modules must name at least one module');
    });

    it('rejects module paths of the wrong type, empty, outside root or missing', () => {
        expect(failure({ root: ROOT, modules: { app: 3 } })).toBe('defineBoundaries: modules.app must be an array of non-empty strings');
        expect(failure({ root: ROOT, modules: { app: [] } })).toBe('defineBoundaries: modules.app must not be empty');
        expect(failure({ root: ROOT, modules: { app: '' } })).toBe('defineBoundaries: modules.app must be an array of non-empty strings');
        expect(failure({ root: ROOT, modules: { app: ['src/app', 7] } })).toBe('defineBoundaries: modules.app must be an array of non-empty strings');
        expect(failure({ root: ROOT, modules: { app: '/project/src/app' } })).toBe('defineBoundaries: modules.app path "/project/src/app" must be a relative path inside root');
        expect(failure({ root: ROOT, modules: { app: '.' } })).toBe('defineBoundaries: modules.app path "." must be a relative path inside root');
        expect(failure({ root: ROOT, modules: { app: './' } })).toBe('defineBoundaries: modules.app path "./" must be a relative path inside root');
        expect(failure({ root: ROOT, modules: { app: '..' } })).toBe('defineBoundaries: modules.app path ".." must be a relative path inside root');
        expect(failure({ root: ROOT, modules: { app: '../x' } })).toBe('defineBoundaries: modules.app path "../x" must be a relative path inside root');
        expect(failure({ root: ROOT, modules: { app: 'src/../../x' } })).toBe('defineBoundaries: modules.app path "src/../../x" must be a relative path inside root');
        expect(failure({ root: ROOT, modules: { app: 'src/nope' } })).toBe('defineBoundaries: modules.app path src/nope does not exist under /project');
    });

    it('accepts a path that only starts with two dots', () => {
        const host: PolicyHost = { ...fakePolicyHost, kind: absolutePath => (absolutePath === ROOT ? 'directory' : 'file'), realpath: absolutePath => absolutePath };
        expect(normalisePolicy({ root: ROOT, modules: { app: '..app' } }, host).policy.modules[0]!.path).toBe('..app');
    });

    it('uses the physical module path and rejects aliases outside or equal to the root', () => {
        const aliases = new Map([
            [`${ROOT}/src/app`, `${ROOT}/src/errors`],
            [`${ROOT}/src/utils`, `${ROOT}ile/src/utils`],
            [`${ROOT}/src/agent`, ROOT],
        ]);
        const host: PolicyHost = { ...fakePolicyHost, realpath: file => aliases.get(file) ?? file };
        expect(normalise({ modules: { app: 'src/app' } }, host).policy.modules).toEqual([{ module: 'app', path: 'src/errors', kind: 'directory' }]);
        expect(failure({ root: ROOT, modules: { utils: 'src/utils' } }, host)).toContain('inside root');
        expect(failure({ root: ROOT, modules: { agent: 'src/agent' } }, host)).toContain('inside root');
        expect(failure({ root: ROOT, modules: { app: 'src/app', errors: 'src/errors' } }, host)).toBe('defineBoundaries: modules.app and modules.errors both claim src/errors');
    });

    it('rejects the same path in two modules', () => {
        expect(failure({ root: ROOT, modules: { app: 'src/app', other: './src/app/' } })).toBe('defineBoundaries: modules.app and modules.other both claim src/app');
    });

    it('rejects include and ignore that are not arrays of non-empty strings', () => {
        expect(failure({ ...base, include: 'src/**' })).toBe('defineBoundaries: include must be an array of non-empty strings');
        expect(failure({ ...base, ignore: [''] })).toBe('defineBoundaries: ignore must be an array of non-empty strings');
        expect(failure({ ...base, include: [['src/**']] })).toBe('defineBoundaries: include must be an array of non-empty strings');
    });

    it('rejects null, scalar exception globs, and absolute or parent globs in every field', () => {
        expect(failure({ ...base, include: null })).toContain('include must be an array');
        expect(failure({ ...base, ignore: null })).toContain('ignore must be an array');
        expect(failure({ ...base, exceptions: [{ files: 'src/**' }] })).toContain('exceptions[0].files must be an array');
        expect(failure({ ...base, exceptions: [{ files: [1] }] })).toContain('exceptions[0].files must be an array');
        expect(failure({ ...base, include: ['/src/**'] })).toContain('include');
        expect(failure({ ...base, ignore: ['C:/src/**'] })).toContain('ignore');
        expect(failure({ ...base, exceptions: [{ files: ['../src/**'] }] })).toContain('exceptions[0].files');
        expect(failure({ ...base, include: ['../src/**'] })).toContain('include');
        expect(failure({ ...base, ignore: [String.raw`\\server\share\**`] })).toContain('ignore');
        expect(normalise({ include: ['..source/**'], ignore: [] }).policy.include).toEqual(['..source/**']);
    });

    it('rejects allow and allowTypeOnly that name unknown modules or are the wrong type', () => {
        expect(failure({ ...base, allow: [] })).toBe('defineBoundaries: allow must be an object');
        expect(failure({ ...base, allow: { nope: '*' } })).toBe('defineBoundaries: allow key names nope, which is not a module (modules: utils, app)');
        expect(failure({ ...base, allow: { app: ['utils', 'nope'] } })).toBe('defineBoundaries: allow.app names nope, which is not a module (modules: utils, app)');
        expect(failure({ ...base, allow: { app: 'utils' } })).toBe('defineBoundaries: allow.app must be an array of non-empty strings');
        expect(failure({ ...base, allowTypeOnly: { app: ['nope'] } })).toBe('defineBoundaries: allowTypeOnly.app names nope, which is not a module (modules: utils, app)');
        expect(failure({ ...base, allowTypeOnly: { nope: [] } })).toBe('defineBoundaries: allowTypeOnly key names nope, which is not a module (modules: utils, app)');
    });

    it('rejects malformed exceptions', () => {
        expect(failure({ ...base, exceptions: {} })).toBe('defineBoundaries: exceptions must be an array');
        expect(failure({ ...base, exceptions: ['x'] })).toBe('defineBoundaries: exceptions[0] must be an object');
        expect(failure({ ...base, exceptions: [{ files: ['a'], allwo: [] }] })).toBe('defineBoundaries: exceptions[0] has unknown key(s): allwo');
        expect(failure({ ...base, exceptions: [{ allow: ['app'] }] })).toBe('defineBoundaries: exceptions[0].files must be an array of non-empty strings');
        expect(failure({ ...base, exceptions: [{ files: [] }] })).toBe('defineBoundaries: exceptions[0].files must not be empty');
        expect(failure({ ...base, exceptions: [{ files: ['a'] }, { files: ['b'], allow: ['nope'] }] })).toBe('defineBoundaries: exceptions[1].allow names nope, which is not a module (modules: utils, app)');
        expect(failure({ ...base, exceptions: [{ files: ['a'], allowTypeOnly: ['nope'] }] })).toBe('defineBoundaries: exceptions[0].allowTypeOnly names nope, which is not a module (modules: utils, app)');
    });

    it('rejects a bad entry', () => {
        expect(failure({ ...base, entry: true })).toBe('defineBoundaries: entry must be an array of non-empty strings');
        expect(failure({ ...base, entry: [] })).toBe('defineBoundaries: entry must not be empty');
        expect(failure({ ...base, entry: '../index.ts' })).toBe('defineBoundaries: entry "../index.ts" must be a relative path inside root');
    });

    it('rejects a bad or missing tsconfig', () => {
        expect(failure({ ...base, tsconfig: '' })).toBe('defineBoundaries: tsconfig must be a non-empty path, got ""');
        expect(failure({ ...base, tsconfig: 1 })).toBe('defineBoundaries: tsconfig must be a non-empty path, got 1');
        expect(failure({ ...base, tsconfig: 'src' })).toBe('defineBoundaries: tsconfig /project/src does not exist');
        expect(failure({ ...base, tsconfig: 'missing.json' })).toBe('defineBoundaries: tsconfig /project/missing.json does not exist');
    });

    it('rejects a bad severity', () => {
        expect(failure({ ...base, severity: 'off' })).toBe('defineBoundaries: severity must be \'error\' or \'warn\', got "off"');
        expect(failure({ ...base, severity: 2 })).toBe('defineBoundaries: severity must be \'error\' or \'warn\', got 2');
    });
});
