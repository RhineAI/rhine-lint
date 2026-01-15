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
npm run build

# Test (currently just a placeholder)
npm run test
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
