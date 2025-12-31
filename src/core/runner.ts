import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "fs-extra";
import { logger, logInfo, logError } from "../utils/logger.js";

const require = createRequire(import.meta.url);

function stripAnsi(str: string) {
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

/**
 * Robustly resolve a binary path from a package, handling exports restrictions.
 */
function resolveBin(pkgName: string, binPathRelative: string): string {
    // 1. Try strict resolve (fastest, but might be blocked by exports)
    try {
        return require.resolve(`${pkgName}/${binPathRelative}`);
    } catch (e: unknown) {
        if (e instanceof Error && (e as NodeJS.ErrnoException).code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' && (e as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
            logger.debug(`Resolve error for ${pkgName}/${binPathRelative}:`, e);
        }
    }

    // 2. Fallback: Resolve main entry point, then traverse up to find package root
    try {
        const mainPath = require.resolve(pkgName);
        let currentDir = path.dirname(mainPath);

        // Traverse up (max 5 levels) to find package.json
        for (let i = 0; i < 5; i++) {
            const pkgJsonPath = path.join(currentDir, "package.json");
            if (fs.existsSync(pkgJsonPath)) {
                try {
                    const pkg = fs.readJsonSync(pkgJsonPath);
                    if (pkg.name === pkgName) {
                        // Found it! Construct bin path
                        const binPath = path.join(currentDir, binPathRelative);
                        if (fs.existsSync(binPath)) {
                            return binPath;
                        }
                    }
                } catch {
                    // Ignore parsing errors
                }
            }
            if (currentDir === path.dirname(currentDir)) break; // Root reached
            currentDir = path.dirname(currentDir);
        }
    } catch (e: unknown) {
        logger.debug(`Deep resolve failed for ${pkgName}:`, e);
    }

    // 3. Fallback to system PATH (bare command)
    return pkgName;
}


export async function runCommandWithOutput(command: string, args: string[], cwd: string): Promise<{ output: string, code: number }> {
    return new Promise((resolve, reject) => {
        logger.debug(`Executing: ${command} ${args.join(" ")}`);
        const proc = spawn(command, args, {
            cwd,
            stdio: ["inherit", "pipe", "pipe"],
            shell: false,
        });

        let output = "";

        if (proc.stdout) {
            proc.stdout.on("data", (data) => {
                process.stdout.write(data);
                output += data.toString();
            });
        }

        if (proc.stderr) {
            proc.stderr.on("data", (data) => {
                process.stderr.write(data);
                output += data.toString();
            });
        }

        proc.on("close", (code) => {
            if (code === null) code = 1;
            resolve({ output, code });
        });

        proc.on("error", (err) => {
            reject(err);
        });
    });
}

export async function runEslint(cwd: string, configPath: string, fix: boolean, files: string[] = ["."]): Promise<string | null> {
    logInfo("Running ESLint...");
    console.log();

    const eslintBin = resolveBin("eslint", "bin/eslint.js");

    const args = [
        eslintBin,
        ...files,
        "--config", configPath,
        ...(fix ? ["--fix"] : []),
    ];

    try {
        const { output, code } = await runCommandWithOutput(process.execPath, args, cwd);

        if (code !== 0 && code !== 1) {
            return `Process failed with exit code ${code}`;
        }

        const cleanOutput = stripAnsi(output);
        const problemMatch = cleanOutput.match(/(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/);
        if (problemMatch) {
            return problemMatch[0];
        }
        const errorMatch = cleanOutput.match(/(\d+) error/);
        if (errorMatch) {
            return `${errorMatch[0]} found`;
        }
        if (code === 0) return null;
        return "Issues found";

    } catch (e: unknown) {
        logError("Failed to run ESLint", e);
        return e instanceof Error ? e.message : "Unknown error";
    }
}

export async function runPrettier(cwd: string, configPath: string, fix: boolean, files: string[] = ["."]): Promise<string | null> {
    logInfo("Running Prettier...");

    // Try Prettier v3 path first, then fallback (v3: bin/prettier.cjs, v2: bin-prettier.js)
    let prettierBin = resolveBin("prettier", "bin/prettier.cjs");
    // If resolved to "prettier" (PATH) or logic failed, check if file exists, if not try legacy
    // Actually resolveBin returns bare "prettier" if not found.
    // If it is just "prettier", we might want to try legacy path too before giving up.
    if (prettierBin === "prettier" || !fs.existsSync(prettierBin)) {
        const legacy = resolveBin("prettier", "bin-prettier.js");
        if (legacy !== "prettier" && fs.existsSync(legacy)) {
            prettierBin = legacy;
        }
    }

    const args = [
        prettierBin,
        ...(fix ? ["--write"] : ["--check"]),
        "--config", configPath,
        "--ignore-path", ".gitignore",
        ...files
    ];

    try {
        const { output, code } = await runCommandWithOutput(process.execPath, args, cwd);

        if (code !== 0) {
            if (!fix) {
                if (stripAnsi(output).includes("Code style issues found")) {
                    return "Code style issues found";
                }
                if (code === 1) return "Formatting issues found";
            }

            return `Process failed with exit code ${code}`;
        }

        return null;

    } catch (e: unknown) {
        logError("Failed to run Prettier", e);
        return e instanceof Error ? e.message : "Unknown error";
    }
}
