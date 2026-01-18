import { createJiti } from "jiti";
import path from "node:path";
import fs from "fs-extra";
import { type Config } from "../config.js";
import { logger, logInfo } from "../utils/logger.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

function getAssetPath(filename: string) {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets", filename);
}

const CONFIG_FILENAMES = [
    "rhine-lint.config.ts",
    "rhine-lint.config.js",
    "rhine-lint.config.mjs",
    "rhine-lint.config.cjs",
    "rhine-lint.config.json",
    "config/rhine-lint.config.ts",
    "config/rhine-lint.config.js",
    "config/rhine-lint.config.mjs",
    "config/rhine-lint.config.cjs",
    "config/rhine-lint.config.json",
];

function getCacheDir(cwd: string, userConfig?: Config, cliCacheDir?: string): string {
    if (cliCacheDir) return path.resolve(cwd, cliCacheDir);
    if (userConfig?.cacheDir) return path.resolve(cwd, userConfig.cacheDir);
    const nodeModulesPath = path.join(cwd, "node_modules");
    if (fs.existsSync(nodeModulesPath)) return path.join(nodeModulesPath, ".cache", "rhine-lint");
    return path.join(cwd, ".cache", "rhine-lint");
}

export async function loadUserConfig(cwd: string): Promise<{ config: Config, path?: string }> {
    const jiti = createJiti(fileURLToPath(import.meta.url));
    for (const filename of CONFIG_FILENAMES) {
        const configPath = path.join(cwd, filename);
        if (await fs.pathExists(configPath)) {
            try {
                const configModule = jiti(configPath);
                const config = configModule.default || configModule;
                return { config, path: configPath };
            } catch (e) {
                logger.error(`Failed to load config file ${configPath}:`, e);
                process.exit(1);
            }
        }
    }
    return { config: {} };
}

// 默认的忽略文件列表
const DEFAULT_IGNORE_FILES = ['./.gitignore'];

// 默认的忽略模式列表
const DEFAULT_IGNORES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock'];

// 默认始终忽略的目录
const DEFAULT_IGNORE_DIRS = [
    'node_modules', 'dist', '.next', '.git', '.output', '.nuxt', 'coverage', '.cache'
];

/**
 * 通过分析 package.json 的 dependencies 自动检测项目级别
 * @returns 'next' | 'react' | 'normal'
 */
async function detectLevelFromPackageJson(cwd: string, debug?: boolean): Promise<'next' | 'react' | 'normal'> {
    const pkgPath = path.join(cwd, 'package.json');
    try {
        if (await fs.pathExists(pkgPath)) {
            const pkgJson = await fs.readJson(pkgPath);
            const allDeps = {
                ...pkgJson.dependencies,
                ...pkgJson.devDependencies,
            };

            // 检测 Next.js
            if (allDeps['next']) {
                if (debug) {
                    console.log("DEBUG: Detected 'next' in dependencies, using level: next");
                }
                logInfo("Auto-detected project level: next");
                return 'next';
            }

            // 检测 React
            if (allDeps['react']) {
                if (debug) {
                    console.log("DEBUG: Detected 'react' in dependencies, using level: react");
                }
                logInfo("Auto-detected project level: react");
                return 'react';
            }

            // 无法检测到框架
            if (debug) {
                console.log("DEBUG: No framework detected in dependencies, using level: normal");
            }
            logger.warn("Could not detect project framework from package.json, using level: normal");
            return 'normal';
        }
    } catch (e) {
        logger.debug("Failed to read package.json for level detection", e);
    }

    logger.warn("Could not find package.json, using level: normal");
    return 'normal';
}

export async function generateTempConfig(
    cwd: string,
    userConfigResult: { config: Config, path?: string },
    cliLevel?: string,
    cliTypescript?: boolean,
    cliCacheDir?: string,
    debug?: boolean,
    cliProjectTypeCheck?: boolean,
    cliTsconfig?: string,
    cliIgnorePatterns: string[] = [],
    noIgnore: boolean = false,
    cliIgnoreFiles: string[] = [],
    forceRegenerate: boolean = false
): Promise<{ eslintPath: string; prettierPath: string; cachePath: string; resolvedLevel: string }> {

    const cachePath = getCacheDir(cwd, userConfigResult.config, cliCacheDir);
    await fs.ensureDir(cachePath);

    const eslintTempPath = path.join(cachePath, "eslint.config.mjs");
    const prettierTempPath = path.join(cachePath, "prettier.config.mjs");
    const metaPath = path.join(cachePath, "metadata.json");

    // Determine typescript: CLI flag takes precedence over config file, default is true
    // When --no-typescript is used, options.typescript will be false
    const typescript = cliTypescript ?? userConfigResult.config.typescript ?? true;

    // Determine projectTypeCheck: CLI flag takes precedence over config file, default is true
    // When --no-project-type-check is used, options.projectTypeCheck will be false
    const projectTypeCheck = cliProjectTypeCheck ?? userConfigResult.config.projectTypeCheck ?? true;

    // Determine tsconfig path: CLI flag takes precedence over config file
    const tsconfigPath = cliTsconfig ?? userConfigResult.config.tsconfig;

    // Determine level: CLI > config > auto-detect from package.json
    let resolvedLevel: string;
    if (cliLevel) {
        resolvedLevel = cliLevel;
    } else if (userConfigResult.config.level) {
        resolvedLevel = userConfigResult.config.level;
    } else {
        resolvedLevel = await detectLevelFromPackageJson(cwd, debug);
    }

    // 解析忽略文件列表：CLI 覆盖 config，否则使用 config 或默认值
    // CLI 优先级最高，如果 CLI 有值则完全使用 CLI 的值
    const resolvedIgnoreFiles = cliIgnoreFiles.length > 0
        ? cliIgnoreFiles
        : (userConfigResult.config.ignoreFiles !== undefined
            ? userConfigResult.config.ignoreFiles
            : DEFAULT_IGNORE_FILES);

    // 解析忽略模式列表：CLI 覆盖 config，否则使用 config 或默认值
    // 同时兼容旧的 ignore 字段
    const configIgnores = userConfigResult.config.ignores ?? userConfigResult.config.ignore ?? [];
    const resolvedIgnores = cliIgnorePatterns.length > 0
        ? cliIgnorePatterns
        : (configIgnores.length > 0
            ? configIgnores
            : DEFAULT_IGNORES);

    let calculatedHash = "";
    try {
        const hash = createHash("sha256");
        hash.update(pkg.version || "0.0.0");
        hash.update(resolvedLevel || "default");
        hash.update(typescript ? "ts-on" : "ts-off");
        hash.update(projectTypeCheck ? "ptc-on" : "ptc-off");
        hash.update(tsconfigPath || "default-tsconfig");
        hash.update(resolvedIgnoreFiles.join(",") || "no-ignore-files");
        hash.update(resolvedIgnores.join(",") || "no-ignores");
        hash.update(noIgnore ? "no-ignore" : "with-ignore");
        if (userConfigResult.path && await fs.pathExists(userConfigResult.path)) {
            const content = await fs.readFile(userConfigResult.path);
            hash.update(content);
        }
        // 为每个忽略文件计算 hash
        for (const ignoreFile of resolvedIgnoreFiles) {
            const ignoreFilePath = path.resolve(cwd, ignoreFile);
            if (await fs.pathExists(ignoreFilePath)) {
                const content = await fs.readFile(ignoreFilePath);
                hash.update(content);
            } else {
                hash.update(`no-file:${ignoreFile}`);
            }
        }
        calculatedHash = hash.digest("hex");

        // Skip cache check if forceRegenerate is true
        if (!forceRegenerate && await fs.pathExists(metaPath)) {
            const meta = await fs.readJson(metaPath);
            if (meta.hash === calculatedHash && await fs.pathExists(eslintTempPath) && await fs.pathExists(prettierTempPath)) {
                logger.debug(`Cache hit! Configs reused from ${cachePath}`);

                // Copy config files to specified locations even when cache hits
                if (userConfigResult.config.eslint?.copyConfigFileTo) {
                    const targetPath = path.resolve(cwd, userConfigResult.config.eslint.copyConfigFileTo);
                    try {
                        await fs.copy(eslintTempPath, targetPath);
                        logInfo(`ESLint config copied to: ${targetPath}`);
                    } catch (e) {
                        logger.warn(`Failed to copy ESLint config to ${targetPath}:`, e);
                    }
                }

                if (userConfigResult.config.prettier?.copyConfigFileTo) {
                    const targetPath = path.resolve(cwd, userConfigResult.config.prettier.copyConfigFileTo);
                    try {
                        await fs.copy(prettierTempPath, targetPath);
                        logInfo(`Prettier config copied to: ${targetPath}`);
                    } catch (e) {
                        logger.warn(`Failed to copy Prettier config to ${targetPath}:`, e);
                    }
                }

                return { eslintPath: eslintTempPath, prettierPath: prettierTempPath, cachePath, resolvedLevel };
            }
        }
    } catch (e) {
        logger.debug("Cache check failed, regenerating...", e);
    }

    let ignoredPatterns: string[] = [];

    // If --no-ignore is set, skip all ignore processing
    if (!noIgnore) {
        // Parse gitignore-style file and convert to ESLint ignore patterns
        // ESLint ignores are relative to the cwd where ESLint runs (which is the project root)
        // NOT relative to the config file location
        const parseGitignore = (content: string): string[] => {
            const patterns: string[] = [];
            const lines = content.split('\n');

            for (let line of lines) {
                // Remove Windows line endings and trim
                line = line.replace(/\r$/, '').trim();

                // Skip empty lines and comments
                if (!line || line.startsWith('#')) continue;

                // Handle negation (un-ignore)
                const isNegation = line.startsWith('!');
                if (isNegation) {
                    line = line.slice(1);
                }

                // Determine if pattern is rooted (starts with /)
                const isRooted = line.startsWith('/');
                if (isRooted) {
                    line = line.slice(1);
                }

                // Normalize path separators
                line = line.replace(/\\/g, '/');

                // Handle directory patterns (ends with /)
                const isDir = line.endsWith('/');
                if (isDir) {
                    line = line.slice(0, -1);
                }

                // Build the ESLint ignore pattern
                // Patterns are relative to the cwd where ESLint runs (project root)
                let pattern: string;

                if (isRooted) {
                    // Rooted patterns: only match at project root
                    // e.g., /node_modules -> node_modules/**
                    pattern = line;
                } else {
                    // Non-rooted patterns: match anywhere in the tree
                    // e.g., .next -> **/.next/**
                    pattern = `**/${line}`;
                }

                // Add /** suffix for directories and patterns that should match all contents
                if (isDir || !line.includes('*')) {
                    // Check if it's likely a directory (no extension or common directory names)
                    const shouldMatchContents = isDir ||
                        !path.extname(line) ||
                        line.endsWith('.next') ||
                        line.endsWith('.git') ||
                        line.endsWith('.cache');

                    if (shouldMatchContents && !pattern.endsWith('/**')) {
                        pattern += '/**';
                    }
                }

                // Apply negation prefix for ESLint if this was an un-ignore pattern
                if (isNegation) {
                    pattern = '!' + pattern;
                }

                patterns.push(pattern);
            }

            return patterns;
        };

        // 规范化忽略模式（添加 **/ 前缀和 /** 后缀）
        const normalizePattern = (pattern: string): string => {
            // If pattern doesn't start with ** or !, add **/ prefix
            if (!pattern.startsWith('**') && !pattern.startsWith('!')) {
                pattern = `**/${pattern}`;
            }
            // If pattern doesn't end with /** and doesn't contain *, add /** suffix
            if (!pattern.endsWith('/**') && !pattern.includes('*')) {
                pattern = `${pattern}/**`;
            }
            return pattern;
        };

        // 1. 添加默认始终忽略的目录
        const defaultDirPatterns = DEFAULT_IGNORE_DIRS.map(dir => `**/${dir}/**`);
        ignoredPatterns.push(...defaultDirPatterns);

        // 2. 解析所有忽略文件
        for (const ignoreFile of resolvedIgnoreFiles) {
            const ignoreFilePath = path.resolve(cwd, ignoreFile);
            if (await fs.pathExists(ignoreFilePath)) {
                try {
                    const content = await fs.readFile(ignoreFilePath, 'utf-8');

                    if (debug) {
                        console.log("-----------------------------------------");
                        console.log(`DEBUG: ${ignoreFile} content preview:`);
                        console.log(content.substring(0, 500));
                        console.log("-----------------------------------------");
                    }

                    const parsedPatterns = parseGitignore(content);

                    if (debug) {
                        console.log("-----------------------------------------");
                        console.log(`DEBUG: Parsed patterns from ${ignoreFile}:`);
                        parsedPatterns.forEach((p, i) => console.log(`  [${i}] "${p}"`));
                        console.log("-----------------------------------------");
                    }

                    ignoredPatterns.push(...parsedPatterns);
                } catch (e) {
                    logger.debug(`Failed to parse ignore file: ${ignoreFile}`, e);
                }
            } else if (debug) {
                console.log(`DEBUG: Ignore file not found: ${ignoreFile}`);
            }
        }

        // 3. 添加解析后的忽略模式
        if (resolvedIgnores.length > 0) {
            const normalizedPatterns = resolvedIgnores
                .filter((p): p is string => typeof p === 'string')
                .map(normalizePattern);
            ignoredPatterns.push(...normalizedPatterns);

            if (debug) {
                console.log("-----------------------------------------");
                console.log("DEBUG: Resolved ignore patterns:");
                normalizedPatterns.forEach((p, i) => console.log(`  [${i}] "${p}"`));
                console.log("-----------------------------------------");
            }
        }

        // 去重
        ignoredPatterns = [...new Set(ignoredPatterns)];
    } else if (debug) {
        console.log("-----------------------------------------");
        console.log("DEBUG: --no-ignore flag set, skipping all ignore rules");
        console.log("-----------------------------------------");
    }

    if (debug) {
        console.log("-----------------------------------------");
        console.log("DEBUG: Final Ignores List:");
        ignoredPatterns.forEach(p => console.log(p));
        console.log("-----------------------------------------");
    }


    const defaultEslintPath = pathToFileURL(getAssetPath("eslint.config.js")).href;
    const defaultPrettierPath = pathToFileURL(getAssetPath("prettier.config.js")).href;
    const userConfigUrl = userConfigResult.path ? pathToFileURL(userConfigResult.path).href : null;
    const defuUrl = pathToFileURL(require.resolve("defu")).href;
    const jitiUrl = pathToFileURL(require.resolve("jiti")).href;

    let finalUserConfigUrl = userConfigUrl;
    const tsExtensions = ['.ts', '.mts', '.cts'];
    if (userConfigResult.path && tsExtensions.some(ext => userConfigResult.path!.endsWith(ext))) {
        try {
            const ts = await import('typescript');
            const fileContent = await fs.readFile(userConfigResult.path, 'utf-8');
            const transpiled = ts.transpileModule(fileContent, {
                compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext }
            });
            const compiledName = 'rhine-lint.user-config.mjs';
            const compiledPath = path.join(cachePath, compiledName);
            await fs.writeFile(compiledPath, transpiled.outputText);
            finalUserConfigUrl = pathToFileURL(compiledPath).href;
        } catch (e) {
            logger.debug("Failed to transpile user config.", e);
        }
    }

    const isEslintOverlay = userConfigResult.config.eslint?.overlay ?? false;
    const isPrettierOverlay = userConfigResult.config.prettier?.overlay ?? false;

    const eslintContent = `// prettier-ignore-file
/* eslint-disable */

/**
 * ⚠️ AUTO-GENERATED FILE - DO NOT EDIT MANUALLY ⚠️
 *
 * This file is automatically generated by Rhine Lint.
 * Any manual changes will be overwritten on the next run.
 *
 * To customize ESLint rules, please edit your rhine-lint.config file.
 * @see https://github.com/RhineAI/rhine-lint
 */

import { createJiti } from "${jitiUrl}";
import { fileURLToPath } from "node:url";
import path from "node:path";
import createConfig from "${defaultEslintPath}";
import { defu } from "${defuUrl}";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jiti = createJiti(__filename);

${finalUserConfigUrl ? `
const loaded = await jiti.import("${finalUserConfigUrl.replace('file:///', '').replace(/%20/g, ' ')}", { default: true });
const userOne = loaded.default || loaded;
` : 'const userOne = {};'}

const userEslint = userOne.eslint || {};
const level = "${resolvedLevel}";
const typescript = ${typescript};

// Project-based type checking: CLI flag (${projectTypeCheck}) takes precedence over config file
const projectTypeCheck = ${projectTypeCheck} || userOne.projectTypeCheck || false;

// TSConfig path: CLI flag takes precedence over config file
const tsconfigPath = ${tsconfigPath ? `"${tsconfigPath}"` : 'null'} || userOne.tsconfig || null;

// 根据 level 和 typescript 计算启用的规则
let overrides = {
  ENABLE_TYPE_CHECKED: typescript,
  ENABLE_PROJECT_BASE_TYPE_CHECKED: typescript && projectTypeCheck,
  ENABLE_FRONTEND: level === "react" || level === "next",
  ENABLE_NEXT: level === "next",
};
if (tsconfigPath) {
  overrides.TSCONFIG_PATH = tsconfigPath;
}

const defaultEslint = createConfig(overrides);
let finalConfig;
const prefixConfig = [];

${ignoredPatterns.length > 0 ? `
prefixConfig.push({ ignores: ${JSON.stringify(ignoredPatterns)} });
` : ''}

if (${isEslintOverlay} || userEslint.overlay) {
    // overlay=true: 用户配置完全覆盖内置配置
    const userConf = userEslint.config || [];
    if (Array.isArray(userConf)) {
        finalConfig = [...prefixConfig, ...userConf];
    } else {
        finalConfig = [...prefixConfig, userConf];
    }
} else {
    // overlay=false: 内置配置 + 用户配置追加
    const userConf = userEslint.config || [];
    const defaultConf = Array.isArray(defaultEslint) ? defaultEslint : [defaultEslint];
    finalConfig = [...prefixConfig, ...defaultConf, ...userConf];
}

export default finalConfig;
`;

    const prettierContent = `// prettier-ignore-file
/* eslint-disable */

/**
 * ⚠️ AUTO-GENERATED FILE - DO NOT EDIT MANUALLY ⚠️
 *
 * This file is automatically generated by Rhine Lint.
 * Any manual changes will be overwritten on the next run.
 *
 * To customize Prettier options, please edit your rhine-lint.config file.
 * @see https://github.com/RhineAI/rhine-lint
 */

import { createJiti } from "${jitiUrl}";
import defaultOne from "${defaultPrettierPath}";
import { defu } from "${defuUrl}";

const jiti = createJiti(import.meta.url);

${userConfigUrl ? `
const loaded = await jiti.import("${userConfigUrl}", { default: true });
const userOne = loaded.default || loaded;
` : 'const userOne = {};'}

const userPrettier = userOne.prettier || {};
const defaultPrettier = defaultOne;

let finalConfig;
if (${isPrettierOverlay} || userPrettier.overlay) {
    // overlay=true: 用户配置完全覆盖内置配置
    finalConfig = userPrettier.config || {};
} else {
    // overlay=false: 内置配置为基础，用户配置补充
    finalConfig = defu(userPrettier.config || {}, defaultPrettier);
}

export default finalConfig;
`;

    await fs.writeFile(eslintTempPath, eslintContent);
    await fs.writeFile(prettierTempPath, prettierContent);
    await fs.writeJson(metaPath, { hash: calculatedHash, timestamp: Date.now() });

    // Copy config files to specified locations if configured
    if (userConfigResult.config.eslint?.copyConfigFileTo) {
        const targetPath = path.resolve(cwd, userConfigResult.config.eslint.copyConfigFileTo);
        try {
            await fs.copy(eslintTempPath, targetPath);
            logInfo(`ESLint config copied to: ${targetPath}`);
        } catch (e) {
            logger.warn(`Failed to copy ESLint config to ${targetPath}:`, e);
        }
    }

    if (userConfigResult.config.prettier?.copyConfigFileTo) {
        const targetPath = path.resolve(cwd, userConfigResult.config.prettier.copyConfigFileTo);
        try {
            await fs.copy(prettierTempPath, targetPath);
            logInfo(`Prettier config copied to: ${targetPath}`);
        } catch (e) {
            logger.warn(`Failed to copy Prettier config to ${targetPath}:`, e);
        }
    }

    return { eslintPath: eslintTempPath, prettierPath: prettierTempPath, cachePath, resolvedLevel };
}

export async function cleanup(cachePath: string) {
    if (cachePath && await fs.pathExists(cachePath)) {
        // await fs.remove(cachePath); 
    }
}
