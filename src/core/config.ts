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
    debug?: boolean
): Promise<{ eslintPath: string; prettierPath: string; cachePath: string }> {

    const cachePath = getCacheDir(cwd, userConfigResult.config, cliCacheDir);
    await fs.ensureDir(cachePath);

    const eslintTempPath = path.join(cachePath, "eslint.config.mjs");
    const prettierTempPath = path.join(cachePath, "prettier.config.mjs");
    const metaPath = path.join(cachePath, "metadata.json");
    const gitignorePath = path.join(cwd, ".gitignore");

    let calculatedHash = "";
    try {
        const hash = createHash("sha256");
        hash.update(pkg.version || "0.0.0");
        hash.update(cliLevel || "default");
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

    // Use Absolute Paths for ignores to avoid relative path hell from .cache dir.
    // ESLint Flat Config supports absolute paths in ignores.

    const toRelativeGlob = (p: string) => {
        // 1. Invert negation logic
        // gitignore: "node_modules" -> Ignore.
        // gitignore-to-glob: "!node_modules" (if excludes logic used, but actually let's check raw lines?)
        // Wait, if gitignore-to-glob is simple parser, it keeps "node_modules".
        // If it returns "node_modules", then p="node_modules".
        // ESLint ignores: "node_modules".
        // If gitignore: "!foo", lib returns "!foo". ESLint: "!foo" (Unignore).
        // SO: if p does NOT start with !, it is an ignore. Return as is.
        // if p starts with !, it is un-ignore. Return as is.
        // WAIT. My previous analysis of "!" inversion was based on observed behavior of lib returning "!" for ignores?
        // The logs showed "!C:/..." for ignores.
        // So YES, the lib returns "!" for ignores.
        // So we MUST strip "!" to get the pattern to Ignore.

        const isActuallyIgnore = p.startsWith('!');
        let clean = isActuallyIgnore ? p.slice(1) : p;

        // 2. Identify recursion/rooting validity
        // Check if original pattern (clean) was rooted
        const isRooted = clean.startsWith('/') || clean.startsWith('\\');

        // Strip leading slashes
        clean = clean.replace(/^[\/\\]/, '');
        clean = clean.replace(/\\/g, '/');

        // 3. Check for directory (using absolute path for check)
        const abs = path.join(cwd, clean);
        let isDir = false;
        try {
            // Only check if no wildcard to avoid FS errors
            if (clean && !clean.includes('*') && !path.extname(clean)) {
                if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) isDir = true;
            }
        } catch (e) { }

        // Append /** for directories to ignore contents
        if (isDir && !clean.endsWith('/')) {
            clean += '/**';
        } else if (clean.endsWith('/')) {
            clean += '**';
        }

        // 4. Construct Relative Path
        // If rooted, anchor to ../../
        // If recursive, anchor to ../../**/
        let rel = '';
        if (isRooted) {
            rel = '../../' + clean;
        } else {
            // If pattern already has **, don't add another? 
            // But ../../ is needed.
            // If pattern is "dist/**", we want "../../**/dist/**" if recursive?
            // Or "../../dist/**" if rooted?
            // Assuming recursive if not rooted.
            rel = '../../**/' + clean;
        }

        // 5. Apply negation (If isActuallyIgnore is true, we want Ignore, so NO '!'. If false, we want Unignore, so '!')
        // Logic: 
        // Lib: !foo -> Ignore foo.  ESLint: foo
        // Lib: foo -> Unignore foo. ESLint: !foo
        // So: return (isActuallyIgnore ? '' : '!') + rel;

        return (isActuallyIgnore ? '' : '!') + rel;
    };

    const projectDefaults = [
        'node_modules', 'dist', '.next', '.git', '.output', '.nuxt', 'coverage', '.cache'
    ].map(dir => {
        // These are recursive defaults
        return `../../**/${dir}/**`;
    });

    if (await fs.pathExists(gitignorePath)) {
        try {
            const gitignoreToGlob = require("gitignore-to-glob");
            const rawPatterns: string[] = gitignoreToGlob(gitignorePath) || [];
            const parsedGitignores = rawPatterns
                .map(p => p.trim())
                .filter(p => p && !p.startsWith('#'))
                .map(p => toRelativeGlob(p));
            ignoredPatterns = [...projectDefaults, ...parsedGitignores];
        } catch (e) {
            logger.debug("Failed to parse .gitignore", e);
            ignoredPatterns = projectDefaults;
        }
    } else {
        ignoredPatterns = projectDefaults;
    }

    if (debug) {
        console.log("-----------------------------------------");
        console.log("DEBUG: Final Ignores List (Relative Paths):");
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

let overrides = {};
switch (level) {
  case "nextjs": overrides = { ENABLE_NEXT: true }; break;
  case "frontend": overrides = { ENABLE_FRONTEND: true, ENABLE_NEXT: false }; break;
  case "ts": overrides = { ENABLE_FRONTEND: false }; break;
  case "js": overrides = { ENABLE_FRONTEND: false, ENABLE_TYPE_CHECKED: false }; break;
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
