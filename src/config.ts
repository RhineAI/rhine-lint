/**
 * Rhine Lint configuration options.
 * All options are optional with sensible defaults.
 * Priority: CLI arguments > Config file > Default values
 */
export type Config = {
    /**
     * Project level that determines which linting rules to enable.
     * Each level includes all rules from previous levels:
     * - `'normal'`: Base rules (JS or TS depending on `typescript` option)
     * - `'react'`: Normal + React/JSX/Hooks rules
     * - `'next'`: React + Next.js specific rules
     * @default 'react'
     */
    level?: 'normal' | 'react' | 'next',
    /**
     * Enable TypeScript support and type-aware linting rules.
     * - `true`: Enable TypeScript rules (TS, TSX files)
     * - `false`: JavaScript only mode (JS, JSX files)
     * @default true
     */
    typescript?: boolean,
    /**
     * Directory for storing generated virtual config files and cache metadata.
     * Can be absolute or relative to the project root.
     * @default 'node_modules/.cache/rhine-lint' (if node_modules exists) or '.cache/rhine-lint'
     */
    cacheDir?: string,
    /**
     * Automatically fix linting errors and formatting issues.
     * When enabled, ESLint will apply auto-fixes and Prettier will rewrite files.
     * @default false
     */
    fix?: boolean,
    /**
     * Enable timing output for each phase.
     * Shows elapsed time for: preparation, ESLint, and Prettier phases.
     * @default true
     */
    time?: boolean,
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
     * List of gitignore-style files to read ignore patterns from.
     * Each file should follow .gitignore syntax.
     * @default ['./.gitignore']
     * @example ['./.gitignore', './.eslintignore']
     */
    ignoreFiles?: string[],
    /**
     * List of specific files or patterns to ignore.
     * Patterns follow glob syntax.
     * @default ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock']
     * @example ['temp', 'generated', '*.test.ts']
     */
    ignores?: string[],
    /**
     * @deprecated Use `ignores` instead. This field will be removed in a future version.
     * Additional ignore patterns to exclude files from linting.
     * Patterns follow glob syntax.
     * @example ['temp', 'generated', '*.test.ts']
     */
    ignore?: string[],
    /**
     * ESLint configuration options.
     */
    eslint?: {
        /**
         * Enable ESLint linting.
         * Set to `false` to skip ESLint entirely (only run Prettier).
         * @default true
         */
        enable?: boolean,
        /**
         * ESLint Flat Config array to extend or override default rules.
         * These configurations are merged with Rhine Lint's built-in rules.
         * @see https://eslint.org/docs/latest/use/configure/configuration-files
         * @example
         * ```ts
         * config: [
         *   {
         *     rules: {
         *       'no-console': 'warn',
         *       '@typescript-eslint/no-unused-vars': 'off'
         *     }
         *   }
         * ]
         * ```
         */
        config?: [
            // EsLint Config
        ],
        /**
         * Overlay mode for ESLint configuration.
         * - `true`: User config completely replaces Rhine Lint's default rules
         * - `false`: User config is merged with Rhine Lint's default rules
         * @default false
         */
        overlay?: boolean,
    },
    /**
     * Prettier configuration options.
     */
    prettier?: {
        /**
         * Enable Prettier formatting check.
         * Set to `false` to skip Prettier entirely (only run ESLint).
         * @default true
         */
        enable?: boolean,
        /**
         * Prettier options to extend or override default formatting rules.
         * @see https://prettier.io/docs/en/options.html
         * @example
         * ```ts
         * config: {
         *   semi: true,
         *   singleQuote: false,
         *   printWidth: 80
         * }
         * ```
         */
        config?: {
            // Prettier Config
        },
        /**
         * Overlay mode for Prettier configuration.
         * - `true`: User config completely replaces Rhine Lint's default options
         * - `false`: User config is merged with Rhine Lint's default options
         * @default false
         */
        overlay?: boolean,
    }
}