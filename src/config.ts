export type Config = {
    type?: 'js' | 'ts' | 'frontend' | 'react' | 'nextjs',
    cacheDir?: string,
    fix?: boolean,
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