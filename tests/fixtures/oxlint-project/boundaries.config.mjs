// ast-grep-ignore: sonar-no-internal-api-use-javascript -- tests/integration/oxlint.test.ts bundles src/ to this cache path before it runs Oxlint; it is not a package.
import { defineBoundaries } from '../../../node_modules/.cache/oxlint-plugin-module-boundaries-it/index.js';

export default defineBoundaries({
    root:          import.meta.dirname,
    include:       ['src/**'],
    ignore:        ['**/*.test.ts'],
    modules:       { main: 'src/index.ts', app: 'src/app', utils: 'src/utils', errors: 'src/errors' },
    allow:         { main: ['app'], app: ['utils', 'errors'] },
    allowTypeOnly: { utils: ['errors'] },
});
