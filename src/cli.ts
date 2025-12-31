#!/usr/bin/env node
import { createRequire } from 'module';
// import cac from "cac";
import { loadUserConfig, generateTempConfig, cleanup } from "./core/config.js";
import { runEslint, runPrettier } from "./core/runner.js";
import { logError, logSuccess, logInfo } from "./utils/logger.js";

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const cac = require('cac');
const version: string = pkg.version || "0.0.0";
const cli = cac.cac ? cac.cac("rhine-lint") : cac("rhine-lint");

cli
    .command("[...files]", "Lint files")
    .option("--fix", "Fix lint errors")
    .option("--config <path>", "Path to config file")
    .option("--level <level>", "Project level (js, ts, frontend, nextjs)")
    .option("--cache-dir <dir>", "Custom temporary cache directory")
    .option("--debug", "Enable debug mode")
    .action(async (files: string[], options: any) => {
        const cwd = process.cwd();
        // If files is empty, default to "."
        const targetFiles = files.length > 0 ? files : ["."];
        let usedCachePath: string | undefined;

        try {
            logInfo(`Starting Rhine Lint v${version}`);

            // 1. Load User Config
            // Note: We currently auto-detect config. explicit --config path support in loadUserConfig could be added if needed,
            // but loadConfig from jiti handles discovery well.
            const userConfigResult = await loadUserConfig(cwd);

            if (userConfigResult.path) {
                logInfo(`Using config: ${userConfigResult.path}`);
            } else {
                logInfo("Using default configuration");
            }
            console.log();

            // 2. Generate Temp Configs
            const temps = await generateTempConfig(cwd, userConfigResult, options.level, options.cacheDir, options.debug);
            usedCachePath = temps.cachePath; // Save for cleanup

            // 3. Run ESLint
            const eslintResult = await runEslint(cwd, temps.eslintPath, options.fix, targetFiles);

            console.log();

            // 4. Run Prettier
            const prettierResult = await runPrettier(cwd, temps.prettierPath, options.fix, targetFiles);

            console.log();

            if (eslintResult || prettierResult) {
                logError("Linting completed with issues:");
                if (eslintResult) {
                    logError(`ESLint: ${eslintResult}`);
                } else {
                    logSuccess(`ESLint: No issues found`);
                }

                if (prettierResult) {
                    logError(`Prettier: ${prettierResult}`);
                } else {
                    logSuccess(`Prettier: No issues found`);
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
