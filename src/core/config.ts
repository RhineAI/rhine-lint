import { defu } from "defu";
import path from "node:path";
import fs from "fs-extra";
import { type Config } from "../config.js";
import { logger, logInfo } from "../utils/logger.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const CACHE_DIR = ".rhine-lint-cache";

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

export async function loadUserConfig(cwd: string): Promise<{ config: Config, path?: string }> {
    let configPath: string | undefined;

    for (const file of CONFIG_FILENAMES) {
        const p = path.join(cwd, file);
        if (await fs.pathExists(p)) {
            configPath = p;
            break;
        }
    }

    if (!configPath) {
        return { config: {} };
    }

    try {
        logInfo(`Loading config from ${configPath}`);
        const isJson = configPath.endsWith(".json");
        let loaded: any;
        if (isJson) {
            loaded = await fs.readJson(configPath);
        } else {
            const importUrl = pathToFileURL(configPath).href;
            const mod = await import(importUrl);
            loaded = mod.default || mod;
        }

        return {
            config: (loaded as Config) || {},
            path: configPath
        };
    } catch (e) {
        logger.debug("Failed to load user config.", e);
        logger.warn(`Found config file at ${configPath} but failed to load it.`);
        return { config: {} };
    }
}

export async function generateTempConfig(
    cwd: string,
    userConfigResult: { config: Config, path?: string }
): Promise<{ eslintPath: string; prettierPath: string }> {

    const cachePath = path.join(cwd, CACHE_DIR);
    await fs.ensureDir(cachePath);

    const eslintTempPath = path.join(cachePath, "eslint.config.mjs");
    const prettierTempPath = path.join(cachePath, "prettier.config.mjs");

    const defaultEslintPath = pathToFileURL(getAssetPath("eslint.config.js")).href;
    const defaultPrettierPath = pathToFileURL(getAssetPath("prettier.config.js")).href;

    const userConfigUrl = userConfigResult.path ? pathToFileURL(userConfigResult.path).href : null;
    const defuUrl = pathToFileURL(require.resolve("defu")).href;
    const jitiUrl = pathToFileURL(require.resolve("jiti")).href;

    // Resolve @eslint/compat for includeIgnoreFile if needed
    // We assume @eslint/compat is installed as dependency of rhine-lint
    let compatUrl: string | null = null;
    try {
        compatUrl = pathToFileURL(require.resolve("@eslint/compat")).href;
    } catch (e) {
        // ignore
    }

    const gitignorePath = path.join(cwd, ".gitignore");
    const hasGitignore = await fs.pathExists(gitignorePath);
    const gitignoreUrl = hasGitignore ? pathToFileURL(gitignorePath).href : null;

    const isEslintOverlay = userConfigResult.config.eslint?.overlay ?? false;
    const isPrettierOverlay = userConfigResult.config.prettier?.overlay ?? false;

    const eslintContent = `
import { createJiti } from "${jitiUrl}";
import { fileURLToPath } from "node:url";
import path from "node:path";
import defaultOne from "${defaultEslintPath}";
import { defu } from "${defuUrl}";
${compatUrl && hasGitignore ? `import { includeIgnoreFile } from "${compatUrl}";` : ''}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jiti = createJiti(__filename);

${userConfigUrl ? `
const loaded = await jiti.import("${userConfigUrl.replace('file:///', '').replace(/%20/g, ' ')}", { default: true });
const userOne = loaded.default || loaded;
` : 'const userOne = {};'}

const userEslint = userOne.eslint || {};
const defaultEslint = defaultOne;

let finalConfig;

// Prepend ignore file if exists
const prefixConfig = [];
${compatUrl && hasGitignore && gitignoreUrl ? `
prefixConfig.push(includeIgnoreFile("${gitignoreUrl.replace('file:///', '').replace(/%20/g, ' ')}"));
` : ''}

if (${isEslintOverlay} || userEslint.overlay) {
    if (Array.isArray(userEslint.config)) {
        finalConfig = [...prefixConfig, ...defaultEslint, ...userEslint.config];
    } else {
        finalConfig = defu(userEslint, defaultEslint); 
        // Note: merging object into array-based config is weird, assume flat config array concatenation for robustness
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

    return { eslintPath: eslintTempPath, prettierPath: prettierTempPath };
}

export async function cleanup(cwd: string) {
    const cachePath = path.join(cwd, CACHE_DIR);
    if (await fs.pathExists(cachePath)) {
        await fs.remove(cachePath);
    }
}
