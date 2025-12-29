import { spawn } from "node:child_process";
import { logger, logInfo, logError } from "../utils/logger.js";



const IS_BUN = typeof process.versions.bun !== "undefined";
const EXECUTOR = IS_BUN ? "bunx" : "npx";

// Helper to strip ANSI codes for easier regex matching
function stripAnsi(str: string) {
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

export async function runCommandWithOutput(command: string, args: string[], cwd: string): Promise<{ output: string, code: number }> {
    return new Promise((resolve, reject) => {
        logger.debug(`Executing: ${command} ${args.join(" ")}`);
        const proc = spawn(command, args, {
            cwd,
            stdio: ["inherit", "pipe", "pipe"], // Pipe stdout/stderr so we can read it
            shell: true,
        });

        let output = "";

        if (proc.stdout) {
            proc.stdout.on("data", (data) => {
                process.stdout.write(data); // Passthrough to console
                output += data.toString();
            });
        }

        if (proc.stderr) {
            proc.stderr.on("data", (data) => {
                process.stderr.write(data); // Passthrough to console
                output += data.toString();
            });
        }

        proc.on("close", (code) => {
            // Resolve all exit codes (even 1 or 2 or others) so we can parse output.
            // But we might want to differentiate "crash" vs "lint failure".
            // ESLint exit code 1 = user lint error. code 2 = config/crash error.
            if (code === null) code = 1; // Default to error if null
            resolve({ output, code });
        });

        proc.on("error", (err) => {
            reject(err);
        });
    });
}

// Return type: null means success (no errors), string means summary of errors/warnings
export async function runEslint(cwd: string, configPath: string, fix: boolean, files: string[] = ["."]): Promise<string | null> {
    logInfo("Running ESLint...");
    console.log();
    const args = [
        "eslint",
        ...files,
        "--config", configPath,
        ...(fix ? ["--fix"] : []),
    ];

    try {
        const { output, code } = await runCommandWithOutput(EXECUTOR, args, cwd);

        if (!output.endsWith('\n')) {
            console.log();
        }

        const cleanOutput = stripAnsi(output);

        // Try to match standard ESLint summary: "✖ 5 problems (5 errors, 0 warnings)"
        const match = cleanOutput.match(/✖ (\d+) problems? \((\d+) errors?, (\d+) warnings?\)/);
        if (match) {
            return `${match[1]} problems (${match[2]} errors, ${match[3]} warnings)`;
        }

        // Check if there are errors but no summary line
        if (cleanOutput.includes("error") || cleanOutput.includes("warning")) {
            // Maybe custom format or specific error
            // Try to count occurences of "error"
            const errorCount = (cleanOutput.match(/error/gi) || []).length;
            if (errorCount > 0) return `${errorCount} issues found`;

            return "Issues found";
        }

        // Key Fix: If exit code is non-zero and we haven't found a "summary" above, it's a crash or unparsed error.
        if (code !== 0) {
            return `Process failed with exit code ${code}`;
        }

        return null;
    } catch (e) {
        logError("ESLint execution failed.", e);
        throw e;
    }
}

export async function runPrettier(cwd: string, configPath: string, fix: boolean, files: string[] = ["."]): Promise<string | null> {
    logInfo("Running Prettier...");
    console.log();
    const args = [
        "prettier",
        ...files,
        "--config", configPath,
        ...(fix ? ["--write"] : ["--check"]),
    ];

    try {
        const { output, code } = await runCommandWithOutput(EXECUTOR, args, cwd);

        if (!output.endsWith('\n')) {
            console.log();
        }

        const cleanOutput = stripAnsi(output);

        if (!fix) {
            // In check mode with issues: "Code style issues found in 2 files"
            const match = cleanOutput.match(/Code style issues found in (\d+) files?/);
            if (match) {
                return `${match[1]} unformatted files`;
            }
            if (cleanOutput.includes("[warn]")) {
                return "Style issues found";
            }
        }

        // Prettier specific: exit code 2 usually means error/crash. code 1 (in check mode) means unformatted.
        if (code !== 0) {
            if (fix && code !== 0) return `Process failed with exit code ${code}`;
            // In check mode code 1 is covered above usually, but if fallback:
            return "Style issues found";
        }

        return null;
    } catch (e) {
        logError("Prettier execution failed.", e);
        throw e;
    }
}
