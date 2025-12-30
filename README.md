# Rhine Lint

<p align="center">
  <img src="https://img.shields.io/npm/v/rhine-lint?style=flat-square" alt="npm version" />
  <img src="https://img.shields.io/npm/l/rhine-lint?style=flat-square" alt="license" />
  <img src="https://img.shields.io/badge/style-opinionated-blue?style=flat-square" alt="style" />
</p>

> **现在的 Web 开发中，配置 ESLint、Prettier、TypeScript 以及各种插件（React, Next.js, CSS, Markdown...）往往是一场噩梦。**
> 重复的样板代码、版本冲突、复杂的 Flat Config 迁移... **Rhine Lint** 旨在结束这一切。

**Rhine Lint** 是一个「零配置」的现代化代码规范解决方案。它深度整合了 **ESLint (v9 Flat Config)** 与 **Prettier**，为你提供开箱即用的最佳实践。你无需再手动安装数十个 `eslint-plugin-*` 依赖，也无需编写数百行的配置文件。只需一个依赖，一行命令，即可获得顶级的代码质量守护。

## ✨ 特性 (Features)

- **⚡️ 零配置启动 (Zero Config)**: 默认提供适用于 TypeScript、React、Next.js 的最佳实践配置，安装即用。
- **🛠️ 统一工具链 (Unified Toolchain)**: 一个 `rl` 命令同时执行代码检查 (Lint) 和代码格式化 (Format)。
- **🏗️ 全栈支持 (Full Stack)**:
  - **JavaScript / TypeScript**: 完整的类型检查支持。
  - **Frontend**: React (v18/v19), React Hooks, JSX A11y.
  - **Frameworks**: Next.js (Pages & App Router).
  - **Styles**: CSS, SCSS format supports.
  - **Others**: JSON, Markdown support.
- **🔧 智能配置生成 (Smart Config)**: 运行时动态生成配置文件，无需担心 ESLint/Prettier 配置文件污染项目根目录。
- **🧩 灵活扩展 (Extensible)**: 支持 `rhine-lint.config.ts` 进行规则覆盖或深度定制。

## 📦 安装 (Installation)

在你的项目中作为开发依赖安装：

```bash
# Bun (Recommended)
bun add -D rhine-lint

# npm
npm install --save-dev rhine-lint

# pnpm
pnpm add -D rhine-lint

# yarn
yarn add -D rhine-lint
```

## 🚀 快速开始 (Quick Start)

### 命令行使用 (CLI)

安装完成后，你可以直接使用 `rl` 命令：

```bash
# 检查当前目录下所有文件 (默认 lint + check format)
npx rl

# 自动修复所有可修复的代码风格问题
npx rl --fix

# 检查指定文件或目录
npx rl src/components

# 指定项目类型 (覆盖自动检测或默认值)
npx rl --level nextjs
```

### 推荐配置

在 `package.json` 中添加 scripts，方便日常使用：

```json
{
  "scripts": {
    "lint": "rl",
    "lint:fix": "rl --fix"
  }
}
```

## ⚙️ 配置 (Configuration)

虽然 Rhine Lint 是零配置的，但也支持通过配置文件进行深度定制。它会自动检测项目根目录下的 `rhine-lint.config.{ts,js,mjs,json}`。

### 配置文件示例 (`rhine-lint.config.ts`)

```typescript
import { type Config } from 'rhine-lint';

export default {
  // 指定项目级别: 'js' | 'ts' | 'frontend' | 'nextjs'
  // 默认为 'frontend'
  level: 'nextjs',

  // 是否默认开启修复模式 (可选)
  fix: false,

  // ESLint 专项配置
  eslint: {
    // 启用/禁用特定范围的规则
    scope: {
      frontend: true,      // 开启前端规则 (React 等)
      nextjs: true,        // 开启 Next.js 规则
      imoprtX: true,       // 开启 Import 排序等规则
    },
    
    // 自定义 ESLint 规则 (Flat Config 格式)
    // 这里的配置会与默认配置合并
    config: [
      {
        rules: {
          'no-console': 'warn',
          'react/no-unknown-property': 'off'
        }
      }
    ]
  },

  // Prettier 专项配置
  prettier: {
    config: {
      printWidth: 100,
      semi: true
    }
  }
} as Config;
```

### 参数说明 (Arguments)

CLI 参数优先级高于配置文件：

- `--fix`: 自动修复错误。
- `--config <path>`: 指定配置文件路径。
- `--level <level>`: 强制指定项目类型（`js`, `ts`, `frontend`, `nextjs`）。
- `--cache-dir <dir>`: 指定缓存目录（默认使用 `node_modules/.cache/rhine-lint`）。

## 🔍 项目级别 (Project Levels)

Rhine Lint 根据 `level` 参数加载不同的规则集：

- **`js`**: 基础 JavaScript 项目。仅包含标准 JS 规则和 Prettier。
- **`ts`**: TypeScript 项目。包含 TS 类型检查规则、TSDoc 等。
- **`frontend`** (默认): 前端 React 项目。包含 `ts` 级别所有规则，加上 `React`, `React Hooks`, `JSX` 相关规则。
- **`nextjs`**: Next.js 项目。包含 `frontend` 级别所有规则，加上 `@next/eslint-plugin-next` 的 Core Web Vitals 等规则。

## 🧠 技术实现与原理 (Implementation Details)

Rhine Lint 不仅仅是一个简单的 ESLint 配置包，它是一个 **Linter Orchestrator (检查器编排工具)**。以下是其内部工作流程，帮助理解它是如何保持项目清洁的。

### 1. 动态配置生成 (Dynamic Configuration Generation)
传统的 ESLint 配置共享方式通常要求用户在项目中创建一个 `eslint.config.js` 并 `extend` 一个包。Rhine Lint 采用了不同的策略：**(Virtual Configuration)**。

当你运行 `rl` 时：
1.  **读取配置**: 它首先读取用户的 `rhine-lint.config.ts`。
2.  **生成临时配置**: 在缓存目录（如 `node_modules/.cache/rhine-lint/`）中，它会基于内存中的逻辑动态生成真实的 `eslint.config.mjs` 和 `prettier.config.mjs` 文件。
    - 这个过程将 `rhine-lint` 内部预设的规则与用户的自定义规则进行合并。
    - 它自动处理了 `tsconfig.json` 的路径解析、Ignore 文件的合并等复杂逻辑。
3.  **环境隔离**: 这种方式确保了你的项目根目录不会被各种工具的配置文件弄乱。

### 2. 执行流程 (Execution Flow)
Rhine Lint 实际上是 ESLint 和 Prettier 之上的一个 **Wrapper**：

```mermaid
graph LR
    User[用户执行 rl] --> CLI[CLI Parser (cac)]
    CLI --> Config[Config Loader]
    Config --> Gen[Config Generator]
    Gen --> Cache[写入临时 Config (.cache/)]
    
    Cache --> AsyncRun{并发执行}
    AsyncRun --> ESLint[Spawn: ESLint]
    AsyncRun --> Prettier[Spawn: Prettier]
    
    ESLint --> Output[输出结果]
    Prettier --> Output
```

- **ESLint 执行**: 调用 `eslint` 二进制文件，指向生成的临时配置文件。利用 ESLint v9 的 Flat Config 系统，实现了极快的文件匹配和规则计算。
- **Prettier 执行**: 调用 `prettier` 二进制文件，同样指向临时配置文件。
- **结果聚合**: `rl` 会捕获子进程的输出流，进行清洗和格式化，最终以统一的格式呈现给用户。如果任一工具报错，`rl` 也会以非零状态码退出，确保 CI/CD 流程的正确性。

### 3. 技术栈 (Tech Stack)
- **Runtime**: Node.js (支持 ESM).
- **ESLint v9**: 全面拥抱 Flat Config，不再支持旧版 `.eslintrc`。
- **Prettier**: 强固的代码格式化。
- **TypeScript-ESLint**: 最新的 TS 解析器和规则插件。
- **Core Plugins**: 集成了 `eslint-plugin-react`, `eslint-plugin-react-hooks`, `@next/eslint-plugin-next`, `eslint-plugin-import-x`, `eslint-plugin-unused-imports`, `@eslint/markdown`, `@eslint/css` 等数十个核心插件。

---

## License

MIT © [RhineAI](https://github.com/RhineAI)
