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
    .action(async (files: string[], options: any) => {
        const cwd = process.cwd();
        // If files is empty, default to "."
        const targetFiles = files.length > 0 ? files : ["."];

        try {
            logInfo(`Starting Rhine Lint v${version}`);

            // 1. Load User Config
            // Note: We currently auto-detect config. explicit --config path support in loadUserConfig could be added if needed,
            // but loadConfig from jiti handles discovery well.
            const userConfigResult = await loadUserConfig(cwd);

            // 2. Generate Temp Configs
            const temps = await generateTempConfig(cwd, userConfigResult, options.level);

            // 3. Run ESLint
            const eslintSuccess = await runEslint(cwd, temps.eslintPath, options.fix, targetFiles);

            // 4. Run Prettier
            const prettierSuccess = await runPrettier(cwd, temps.prettierPath, options.fix, targetFiles);

            if (!eslintSuccess || !prettierSuccess) {
                // Determine message based on failure
                const parts = [];
                if (!eslintSuccess) parts.push("ESLint found issues");
                if (!prettierSuccess) parts.push("Prettier found issues");

                // logError expects 2 arguments in utils/logger.ts (message, error), 
                // but passing undefined as 2nd arg might cause issues in output depending on consola version
                // Let's just pass the message, and update logic if needed
                logError(`Linting completed with errors: ${parts.join(", ")}`);
                process.exit(1);
            }

            logSuccess("Linting completed successfully.");
        } catch (e) {
            logError("Unexpected error during linting.", e);
            process.exit(1);
        } finally {
            // 5. Cleanup
            await cleanup(cwd);
        }
    });

cli.help();
cli.version(version);
cli.parse();
