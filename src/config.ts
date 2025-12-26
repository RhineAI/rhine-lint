export type Config = {
    type?: 'js' | 'ts' | 'frontend' | 'react' | 'nextjs',
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