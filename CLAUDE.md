# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rhine Lint is a zero-config linting solution that wraps ESLint (v9 Flat Config) and Prettier. It provides a single `rl` CLI command that handles both linting and formatting without requiring users to install dozens of plugins or write configuration files.

## CLI Commands

```bash
# Initialize config interactively
rl init

# Lint files (default: current directory)
rl [files...]

# Lint with auto-fix
rl --fix

# Specify project level
rl --level next

# Other options
rl --no-typescript          # JavaScript only mode
rl --no-project-type-check  # Faster, less accurate
rl --only-eslint            # Skip Prettier
rl --only-prettier          # Skip ESLint
rl --debug                  # Show debug info
```

## Build Commands

```bash
# Build the project (compiles TypeScript and copies assets)
bun run build
```

After building, the CLI can be tested locally:
```bash
node dist/cli.js [command] [options]
```

## Architecture

### Core Flow: Init → Generate → Execute

1. **CLI Entry** (`src/cli.ts`): Parses arguments using `cac`, handles two commands:
   - `rl init` - Generates a config file based on detected project features
   - `rl [...files]` - Main linting command

2. **Config Loading** (`src/core/config.ts`):
   - Loads user config from `rhine-lint.config.{ts,js,mjs,cjs,json}`
   - Uses `jiti` for TypeScript config transpilation
   - Implements SHA-256 fingerprint caching to skip regeneration when config hasn't changed

3. **Virtual Config Generation** (`src/core/config.ts`):
   - Generates temporary `eslint.config.mjs` and `prettier.config.mjs` in cache directory
   - Cache location: `node_modules/.cache/rhine-lint/` or `.cache/rhine-lint/`
   - Merges user config with built-in defaults using `defu`

4. **Execution** (`src/core/runner.ts`):
   - Spawns ESLint and Prettier as child processes (not API calls)
   - Resolves binary paths robustly, handling npm exports restrictions

5. **Init Command** (`src/core/init.ts`):
   - Interactive CLI wizard using Node.js `readline`
   - Detects TypeScript, React, Next.js, Sass from package.json (dependencies, devDependencies, peerDependencies)
   - Prompts user to confirm/override: level, TypeScript, projectTypeCheck, add scripts to package.json
   - Generates `rhine-lint.config.ts` (if TypeScript) or `.js` (if not)
   - Optionally adds `lint` and `lint:fix` scripts to package.json

### Rule Assets (`src/assets/`)

- `eslint.config.js`: Factory function `createConfig(overrides)` that builds ESLint flat config
- `prettier.config.js`: Default Prettier options

The ESLint config factory accepts OPTIONS to enable/disable:
- `ENABLE_TYPE_CHECKED` / `ENABLE_PROJECT_BASE_TYPE_CHECKED`: TypeScript type-aware rules
- `ENABLE_FRONTEND`: React/JSX rules
- `ENABLE_NEXT`: Next.js rules
- `ENABLE_MARKDOWN`, `ENABLE_JSON`, `ENABLE_STYLESHEET`: File type support

### Project Levels

- `normal`: Base JS/TS rules only
- `react`: Normal + React/Hooks/JSX rules
- `next`: React + Next.js plugin rules

Level is auto-detected from package.json dependencies if not specified.

## Key Implementation Details

- **Process Isolation**: ESLint and Prettier run as spawned processes, not API calls, for maximum compatibility
- **TypeScript Config Support**: User `.ts` configs are transpiled to `.mjs` at runtime using the TypeScript compiler
- **Caching**: Config regeneration is skipped when the SHA-256 hash of inputs (version, level, user config content, gitignore) matches cached metadata
- **Ignore Handling**: Parses `.gitignore` files and converts patterns to ESLint ignore format

## File Structure

```
src/
├── cli.ts           # CLI entry point
├── config.ts        # Type definitions for Config
├── index.ts         # Public API exports
├── core/
│   ├── config.ts    # Config loading and virtual config generation
│   ├── init.ts      # `rl init` command implementation
│   └── runner.ts    # ESLint/Prettier subprocess execution
├── assets/
│   ├── eslint.config.js   # ESLint rule factory
│   └── prettier.config.js # Default Prettier config
└── utils/
    └── logger.ts    # Colored console output helpers
```

## Adding New ESLint Plugins

1. Install the plugin in rhine-lint's dependencies
2. Import and register in `src/assets/eslint.config.js`
3. Add a new OPTIONS flag (e.g., `ENABLE_VUE`)
4. Update the `Config` type in `src/config.ts` if exposing to users

## Generated Config File Structure

The `rl init` command generates config with this property order:
1. `level` - Project level (normal/react/next)
2. `typescript` - TypeScript support
3. `projectTypeCheck` - Project-based type checking (only if TypeScript enabled)
4. `ignores` - Ignore patterns
5. `eslint` - ESLint configuration
6. `prettier` - Prettier configuration

Note: `fix` mode is controlled exclusively via CLI `--fix` flag, not in config file.

## Test
修改或完成新功能后，请测试自己的代码正常。通过`bun run build`构建，并在`playground`目录的项目中验证。


## Procedure

### Community

- 交流中使用中文。代码仅在注释使用中文，代码输出信息和日志等全使用英文
- 说明应简洁清晰，只说重点

### Edit

- 写入文件请使用相对路径，不要使用绝对路径
- 路径分隔符统一使用`/`，不要用`\`

### Code Changes

- 严格规范的类型定义
- 完善的异常处理机制，抛出可能出现的异常，清晰的说明信息
- 打印详细的错误信息以便调试
- 打印日志时，以`文件名.函数名: `开头，但是抛出异常时不需要
- 保证代码的可读性与可维护性
- 避免过度设计
- 在适当情况下提出优化建议

### Command

- 项目使用`bun`作为包管理器，相关命令优先使用`bun`
- 如需安装依赖包，请自行安装

### Bug Fix

- 出现问题时，应先彻底分析问题。然后解释Bug出现的的根本原因。最后再提供准确且有针对性的解决方案
- 当你发现错误原因不清晰时，可主动向代码中加入console.log并询问控制台输出，但请在问题解决后移除这些输出
- 若经历多轮调试，反复尝试后，成功修复。应反向分析问题主因，并回退先前不再需要的调试性修改

### Git

- 禁止使用任何有风险的Git操作，仅可查看变更，拉取提交推送代码
- 禁止携带任何协作者，包括你和任何其他人或AI工具
- 使用 Rebase，不使用 Merge
- 采用规范的 Github 约定式提交格式(如下)

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

规范 type 类型

```
feat: 新功能
fix: 修复bug
docs: 文档变更
style: 代码格式变更（不影响代码逻辑）
refactor: 重构（既不是新功能也不是修复bug）
test: 测试相关
chore: 构建过程或辅助工具的变动
perf: 性能优化
ci: CI配置文件和脚本变更
build: 影响构建系统或外部依赖的变更
revert: 回滚之前的commit
```
