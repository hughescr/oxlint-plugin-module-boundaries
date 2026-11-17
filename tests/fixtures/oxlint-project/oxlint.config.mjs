import boundaries from './boundaries.config.mjs';

export default {
    categories: { correctness: 'off' },
    plugins:    [],
    'extends':  [boundaries],
    rules:      {
        '@hughescr/module-boundaries/no-internal-in-barrel':          'error',
        '@hughescr/module-boundaries/no-star-export-from-non-barrel': 'error',
    },
};
