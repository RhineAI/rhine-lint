# Rhine Lint

内置 EsLint 与 Prettier 的代码风格包。可零配置直接使用 rl 命令。

不建议在你的项目中，重复安装 eslint, prettier, typescript-eslint, 及各种插件包。

## Performance

```text
执行 rl 即执行 eslint . 和 prettier .

执行 rl <filename> 即执行 eslint <filename> 和 prettier <filename> .

执行 rl --fix 即执行 eslint . --fix 和 prettier . --write
```

## Install

```bash
bun add -D rhine-lint
```

## Arguments

```text
--config 指定配置文件路径

--fix 是否修复

--level 指定项目种类用于对应默认配置
```

## Config
会自动检测以下文件作为配置:
```text
rhine-lint.config.js
rhine-lint.config.ts
rhine-lint.config.cjs
rhine-lint.config.mjs
rhine-lint.config.json
config/rhine-lint.config.js
config/rhine-lint.config.ts
config/rhine-lint.config.cjs
config/rhine-lint.config.mjs
config/rhine-lint.config.json
```

配置文件格式:
```ts
export type Config = {
    level?: 'none' | 'js' | 'ts' | 'frontend' | 'nextjs', 
    fix?: boolean,
    tsconfig?: string,
    eslint?: {
        scope?: {
            script?: boolean,
            typeChecked?: boolean,
            projectBaseTypeChecked?: boolean,
            frontend?: boolean,
            nextjs?: boolean,
            markdown?: boolean,
            json?: boolean,
            stylesheet?: boolean,
            ignorePrettier?: boolean,
        },
        config?: [
            // EsLint Flatten Config
        ],
        // Default false for Merge Mode, true for Overlay Mode
        overlay?: boolean,
    },
    prettier?: {
        config?: {
            // Prettier Config
        },
        // Default false for Merge Mode, true for Overlay Mode
        overlay?: boolean,
    }
}
```

