import type { Config } from '../src/config.js';

export default {
    level: 'normal',
    typescript: true,
    projectTypeCheck: false,
    eslint: {
        copyConfigFileTo: './eslint.config.mjs',
    },
    prettier: {
        copyConfigFileTo: './prettier.config.mjs',
    },
} satisfies Config;
