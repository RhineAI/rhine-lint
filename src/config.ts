export type Config = {
    type?: 'js' | 'ts' | 'frontend' | 'react' | 'nextjs',
    cacheDir?: string,
    fix?: boolean,
    eslint?: {
        config?: [
            // EsLint Config
        ],
        overlay?: boolean,
        /**
         * Enable project-based type checking with tsconfig.
         * This enables `projectService` and `strictTypeChecked` rules.
         * Slower but more accurate type-aware linting.
         * Set to `false` to disable for faster single-file processing.
         * @default true
         */
        projectTypeCheck?: boolean,
    },
    prettier?: {
        config?: {
            // Prettier Config
        },
        overlay?: boolean,
    }
}