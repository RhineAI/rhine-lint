#!/usr/bin/env node
import { createRequire } from 'module';
import path from "node:path";
import { loadUserConfig, generateTempConfig, cleanup } from "./core/config.js";
import { runEslint, runPrettier } from "./core/runner.js";
import { logError, logSuccess, logInfo, logTime } from "./utils/logger.js";

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const cac = require('cac');
const version: string = pkg.version || "0.0.0";
const cli = cac.cac ? cac.cac("rhine-lint") : cac("rhine-lint");

interface CliOptions {
    fix?: boolean;
    config?: string;
    level?: string;
    typescript?: boolean;
    projectTypeCheck?: boolean;
    tsconfig?: string;
    ignoreFile?: string | string[] | boolean;
    ignore?: string | string[] | boolean;
    cacheDir?: string;
    time?: boolean;
    onlyEslint?: boolean;
    onlyPrettier?: boolean;
    debug?: boolean;
}

cli
    .command("[...files]", "Lint files")
    .option("--fix", "Fix lint errors")
    .option("--config <path>", "Path to config file")
    .option("--level <level>", "Project level (normal, react, next)")
    .option("--no-typescript", "Disable TypeScript support (JavaScript only mode)")
    .option("--no-project-type-check", "Disable project-based type checking (faster for single files)")
    .option("--tsconfig <path>", "Path to tsconfig file for type checking and import resolution")
    .option("--ignore-file [path]", "Add gitignore-style file for ignore patterns (can be used multiple times)")
    .option("--ignore [pattern]", "Add ignore pattern (can be used multiple times)")
    .option("--no-ignore", "Disable all ignore rules (including .gitignore)")
    .option("--cache-dir <dir>", "Custom temporary cache directory")
    .option("--no-time", "Disable elapsed time display for each phase")
    .option("--only-eslint", "Only run ESLint (skip Prettier)")
    .option("--only-prettier", "Only run Prettier (skip ESLint)")
    .option("--debug", "Enable debug mode")
    .action(async (files: string[], options: CliOptions) => {
        const cwd = process.cwd();
        // If files is empty, default to "."
        const targetFiles = files.length > 0 ? files : ["."];
        let usedCachePath: string | undefined;

        // 计时功能：默认启用，可通过 --no-time 或配置文件禁用
        let showTime = options.time !== false;
        const startTotal = Date.now();
        let startPhase = startTotal;

        try {
            logInfo(`Starting Rhine Lint v${version}`);

            // 1. Load User Config
            // Note: We currently auto-detect config. explicit --config path support in loadUserConfig could be added if needed,
            // but loadConfig from jiti handles discovery well.
            const userConfigResult = await loadUserConfig(cwd);

            // 从配置文件读取 time 选项（CLI 优先）
            if (options.time === undefined && userConfigResult.config.time !== undefined) {
                showTime = userConfigResult.config.time;
            }

            if (userConfigResult.path) {
                // Show relative path if config is inside project
                const relativePath = path.relative(cwd, userConfigResult.path);
                const displayPath = relativePath.startsWith('..') ? userConfigResult.path : relativePath;
                logInfo(`Using config: ${displayPath}`);
            } else {
                logInfo("Using default configuration");
            }

            // 2. Generate Temp Configs
            // Normalize ignore option to array (--no-ignore sets options.ignore to false, --ignore without value sets to true)
            const noIgnore = options.ignore === false;
            let ignorePatterns: string[] = [];
            if (!noIgnore && options.ignore && options.ignore !== true) {
                ignorePatterns = Array.isArray(options.ignore)
                    ? options.ignore.filter((p: unknown) => typeof p === 'string')
                    : [options.ignore];
            }
            // Normalize ignore-file option to array
            let ignoreFiles: string[] = [];
            if (!noIgnore && options.ignoreFile && options.ignoreFile !== true) {
                ignoreFiles = Array.isArray(options.ignoreFile)
                    ? options.ignoreFile.filter((p: unknown) => typeof p === 'string')
                    : [options.ignoreFile];
            }
            const temps = await generateTempConfig(cwd, userConfigResult, options.level, options.typescript, options.cacheDir, options.debug, options.projectTypeCheck, options.tsconfig, ignorePatterns, noIgnore, ignoreFiles);
            usedCachePath = temps.cachePath; // Save for cleanup

            // 输出使用的 level 和 typescript 设置
            const typescript = options.typescript ?? userConfigResult.config.typescript ?? true;
            const projectTypeCheck = options.projectTypeCheck ?? userConfigResult.config.projectTypeCheck ?? true;
            let modeStr = typescript ? "TypeScript" : "JavaScript";
            if (typescript && projectTypeCheck) {
                modeStr += " - Project Base";
            }
            logInfo(`Using level: ${temps.resolvedLevel} (${modeStr})`);

            // 计时：第一阶段（准备阶段）
            if (showTime) {
                logTime("Preparation", Date.now() - startPhase);
                startPhase = Date.now();
            }
            console.log();

            // 确定是否启用 ESLint 和 Prettier
            // --only-eslint: 只运行 ESLint，跳过 Prettier (CLI 优先于配置文件)
            // --only-prettier: 只运行 Prettier，跳过 ESLint (CLI 优先于配置文件)
            // 配置文件中的 enable 选项作为默认值
            let enableEslint: boolean;
            let enablePrettier: boolean;

            if (options.onlyEslint) {
                enableEslint = true;
                enablePrettier = false;
            } else if (options.onlyPrettier) {
                enableEslint = false;
                enablePrettier = true;
            } else {
                enableEslint = userConfigResult.config.eslint?.enable ?? true;
                enablePrettier = userConfigResult.config.prettier?.enable ?? true;
            }

            let eslintResult: string | null = null;
            let prettierResult: string | null = null;

            // 3. Run ESLint
            if (enableEslint) {
                eslintResult = await runEslint(cwd, temps.eslintPath, options.fix ?? false, targetFiles);

                // 计时：第二阶段（ESLint）
                if (showTime) {
                    logTime("ESLint", Date.now() - startPhase);
                    startPhase = Date.now();
                }
                console.log();
            } else {
                logInfo("ESLint: Disabled");
                console.log();
            }

            // 4. Run Prettier
            if (enablePrettier) {
                prettierResult = await runPrettier(cwd, temps.prettierPath, options.fix ?? false, targetFiles);

                // 计时：第三阶段（Prettier）
                if (showTime) {
                    logTime("Prettier", Date.now() - startPhase);
                }
                console.log();
            } else {
                logInfo("Prettier: Disabled");
                console.log();
            }

            if (eslintResult || prettierResult) {
                logError("Linting completed with issues:");
                if (enableEslint) {
                    if (eslintResult) {
                        logError(`ESLint: ${eslintResult}`);
                    } else {
                        logSuccess(`ESLint: No issues found`);
                    }
                }

                if (enablePrettier) {
                    if (prettierResult) {
                        logError(`Prettier: ${prettierResult}`);
                    } else {
                        logSuccess(`Prettier: No issues found`);
                    }
                }
                process.exit(1);
            }

            logSuccess("Linting completed successfully.");
        } catch (e) {
            logError("Unexpected error during linting.", e);
            process.exit(1);
        } finally {
            // 5. Cleanup
            if (usedCachePath) {
                await cleanup(usedCachePath);
            }
        }
    });

cli.help();
cli.version(version);
cli.parse();
