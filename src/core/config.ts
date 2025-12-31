import { defu } from "defu";
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
                logInfo(`Using config file: ${configPath}`);
                return { config, path: configPath };
            } catch (e) {
                logger.error(`Failed to load config file ${configPath}:`, e);
                process.exit(1);
            }
        }
    }
    logInfo("No config file found, using default configuration.");
    return { config: {} };
}

export async function generateTempConfig(
    cwd: string,
    userConfigResult: { config: Config, path?: string },
    cliLevel?: string,
    cliCacheDir?: string,
    debug?: boolean,
    cliProjectTypeCheck?: boolean,
    cliTsconfig?: string,
    cliIgnorePatterns: string[] = [],
    noIgnore: boolean = false
): Promise<{ eslintPath: string; prettierPath: string; cachePath: string }> {

    const cachePath = getCacheDir(cwd, userConfigResult.config, cliCacheDir);
    await fs.ensureDir(cachePath);

    const eslintTempPath = path.join(cachePath, "eslint.config.mjs");
    const prettierTempPath = path.join(cachePath, "prettier.config.mjs");
    const metaPath = path.join(cachePath, "metadata.json");
    const gitignorePath = path.join(cwd, ".gitignore");

    // Determine projectTypeCheck: CLI flag takes precedence over config file, default is true
    // When --no-project-type-check is used, options.projectTypeCheck will be false
    const projectTypeCheck = cliProjectTypeCheck ?? userConfigResult.config.projectTypeCheck ?? true;

    // Determine tsconfig path: CLI flag takes precedence over config file
    const tsconfigPath = cliTsconfig ?? userConfigResult.config.tsconfig;

    let calculatedHash = "";
    try {
        const hash = createHash("sha256");
        hash.update(pkg.version || "0.0.0");
        hash.update(cliLevel || "default");
        hash.update(projectTypeCheck ? "ptc-on" : "ptc-off");
        hash.update(tsconfigPath || "default-tsconfig");
        hash.update(cliIgnorePatterns.join(",") || "no-cli-ignore");
        hash.update(noIgnore ? "no-ignore" : "with-ignore");
        if (userConfigResult.path && await fs.pathExists(userConfigResult.path)) {
            const content = await fs.readFile(userConfigResult.path);
            hash.update(content);
        }
        if (await fs.pathExists(gitignorePath)) {
            const content = await fs.readFile(gitignorePath);
            hash.update(content);
        } else {
            hash.update("no-gitignore");
        }
        calculatedHash = hash.digest("hex");

        if (await fs.pathExists(metaPath)) {
            const meta = await fs.readJson(metaPath);
            if (meta.hash === calculatedHash && await fs.pathExists(eslintTempPath) && await fs.pathExists(prettierTempPath)) {
                logger.debug(`Cache hit! Configs reused from ${cachePath}`);
                return { eslintPath: eslintTempPath, prettierPath: prettierTempPath, cachePath };
            }
        }
    } catch (e) {
        logger.debug("Cache check failed, regenerating...", e);
    }

    let ignoredPatterns: string[] = [];

    // If --no-ignore is set, skip all ignore processing
    if (!noIgnore) {
        // Parse .gitignore file and convert to ESLint ignore patterns
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

        // Default directories to always ignore (relative to project root)
        const defaultIgnores = [
            'node_modules', 'dist', '.next', '.git', '.output', '.nuxt', 'coverage', '.cache'
        ].map(dir => `**/${dir}/**`);

        if (await fs.pathExists(gitignorePath)) {
            try {
                const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');

                if (debug) {
                    console.log("-----------------------------------------");
                    console.log("DEBUG: .gitignore content preview:");
                    console.log(gitignoreContent.substring(0, 500));
                    console.log("-----------------------------------------");
                }

                const parsedPatterns = parseGitignore(gitignoreContent);

                if (debug) {
                    console.log("-----------------------------------------");
                    console.log("DEBUG: Parsed gitignore patterns:");
                    parsedPatterns.forEach((p, i) => console.log(`  [${i}] "${p}"`));
                    console.log("-----------------------------------------");
                }

                // Merge defaults with parsed patterns, removing duplicates
                const allPatterns = [...defaultIgnores, ...parsedPatterns];
                ignoredPatterns = [...new Set(allPatterns)];
            } catch (e) {
                logger.debug("Failed to parse .gitignore", e);
                ignoredPatterns = defaultIgnores;
            }
        } else {
            ignoredPatterns = defaultIgnores;
        }

        // Add CLI and config file ignore patterns
        const configIgnorePatterns = (userConfigResult.config.ignore || []).filter((p): p is string => typeof p === 'string');
        const allCliPatterns = [...cliIgnorePatterns, ...configIgnorePatterns];
        if (allCliPatterns.length > 0) {
            // Normalize CLI patterns (add **/ prefix and /** suffix if needed)
            const normalizedCliPatterns = allCliPatterns.map(pattern => {
                // If pattern doesn't start with ** or !, add **/ prefix
                if (!pattern.startsWith('**') && !pattern.startsWith('!')) {
                    pattern = `**/${pattern}`;
                }
                // If pattern doesn't end with /** and doesn't contain *, add /** suffix
                if (!pattern.endsWith('/**') && !pattern.includes('*')) {
                    pattern = `${pattern}/**`;
                }
                return pattern;
            });
            ignoredPatterns = [...new Set([...ignoredPatterns, ...normalizedCliPatterns])];

            if (debug) {
                console.log("-----------------------------------------");
                console.log("DEBUG: CLI/Config ignore patterns added:");
                normalizedCliPatterns.forEach((p, i) => console.log(`  [${i}] "${p}"`));
                console.log("-----------------------------------------");
            }
        }
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
    if (userConfigResult.path && (userConfigResult.path.endsWith('.ts') || userConfigResult.path.endsWith('.mts') || userConfigResult.path.endsWith('.cts'))) {
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

    const eslintContent = `
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
const level = "${cliLevel || ''}" || userOne.level || "frontend";

// Project-based type checking: CLI flag (${projectTypeCheck}) takes precedence over config file
const projectTypeCheck = ${projectTypeCheck} || userOne.projectTypeCheck || false;

// TSConfig path: CLI flag takes precedence over config file
const tsconfigPath = ${tsconfigPath ? `"${tsconfigPath}"` : 'null'} || userOne.tsconfig || null;

let overrides = { ENABLE_PROJECT_BASE_TYPE_CHECKED: projectTypeCheck };
if (tsconfigPath) {
  overrides.TSCONFIG_PATH = tsconfigPath;
}
switch (level) {
  case "nextjs": overrides = { ...overrides, ENABLE_NEXT: true }; break;
  case "frontend": overrides = { ...overrides, ENABLE_FRONTEND: true, ENABLE_NEXT: false }; break;
  case "ts": overrides = { ...overrides, ENABLE_FRONTEND: false }; break;
  case "js": overrides = { ...overrides, ENABLE_FRONTEND: false, ENABLE_TYPE_CHECKED: false }; break;
}

const defaultEslint = createConfig(overrides);
let finalConfig;
const prefixConfig = [];

${ignoredPatterns.length > 0 ? `
prefixConfig.push({ ignores: ${JSON.stringify(ignoredPatterns)} });
` : ''}

if (${isEslintOverlay} || userEslint.overlay) {
    if (Array.isArray(userEslint.config)) {
        finalConfig = [...prefixConfig, ...defaultEslint, ...userEslint.config];
    } else {
        finalConfig = defu(userEslint, defaultEslint); 
        if (!Array.isArray(finalConfig)) finalConfig = [...prefixConfig, finalConfig];
    }
} else {
    const userConf = userEslint.config || [];
    const defaultConf = Array.isArray(defaultEslint) ? defaultEslint : [defaultEslint];
    finalConfig = [...prefixConfig, ...defaultConf, ...userConf];
}

export default finalConfig;
`;

    const prettierContent = `
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
    finalConfig = defu(userPrettier.config || {}, defaultPrettier);
} else {
    finalConfig = defu(userPrettier.config || {}, defaultPrettier);
}

export default finalConfig;
`;

    await fs.writeFile(eslintTempPath, eslintContent);
    await fs.writeFile(prettierTempPath, prettierContent);
    await fs.writeJson(metaPath, { hash: calculatedHash, timestamp: Date.now() });

    return { eslintPath: eslintTempPath, prettierPath: prettierTempPath, cachePath };
}

export async function cleanup(cachePath: string) {
    if (cachePath && await fs.pathExists(cachePath)) {
        // await fs.remove(cachePath); 
    }
}
