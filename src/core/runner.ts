import { spawn } from "node:child_process";
import { logger, logInfo, logError } from "../utils/logger.js";

export async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        logger.debug(`Executing: ${command} ${args.join(" ")}`);
        const proc = spawn(command, args, {
            cwd,
            stdio: "inherit",
            shell: true, // Use shell to resolve commands like 'eslint' from node_modules
        });

        proc.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });

        proc.on("error", (err) => {
            reject(err);
        });
    });
}

const IS_BUN = typeof process.versions.bun !== "undefined";
const EXECUTOR = IS_BUN ? "bunx" : "npx";

export async function runEslint(cwd: string, configPath: string, fix: boolean, files: string[] = ["."]) {
    logInfo("Running ESLint...");
    const args = [
        "eslint",
        ...files,
        "--config", configPath,
        ...(fix ? ["--fix"] : []),
    ];

    try {
        await runCommand(EXECUTOR, args, cwd);
    } catch (e) {
        logError("ESLint execution failed.", e);
        throw e;
    }
}

export async function runPrettier(cwd: string, configPath: string, fix: boolean, files: string[] = ["."]) {
    logInfo("Running Prettier...");
    const args = [
        "prettier",
        ...files,
        "--config", configPath,
        ...(fix ? ["--write"] : ["--check"]),
    ];

    try {
        await runCommand(EXECUTOR, args, cwd);
    } catch (e) {
        logError("Prettier execution failed.", e);
        throw e;
    }
}
