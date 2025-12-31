export type Config = {
    type?: 'js' | 'ts' | 'frontend' | 'react' | 'nextjs',
    cacheDir?: string,
    fix?: boolean,
    /**
     * Enable project-based type checking with tsconfig.
     * This enables `projectService` and `strictTypeChecked` rules.
     * Slower but more accurate type-aware linting.
     * Set to `false` to disable for faster single-file processing.
     * @default true
     */
    projectTypeCheck?: boolean,
    /**
     * Path to tsconfig file for TypeScript type checking and import resolution.
     * Can be absolute or relative to the project root.
     * @default './tsconfig.json' (or './tsconfig.app.json' if exists)
     */
    tsconfig?: string,
    /**
     * Additional ignore patterns to exclude files from linting.
     * Patterns follow glob syntax.
     * @example ['temp', 'generated', '*.test.ts']
     */
    ignore?: string[],
    eslint?: {
        config?: [
            // EsLint Config
        ],
        overlay?: boolean,
    },
    prettier?: {
        config?: {
            // Prettier Config
        },
        overlay?: boolean,
    }
}