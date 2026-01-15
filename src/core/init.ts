import path from "node:path";
import readline from "node:readline";
import fs from "fs-extra";
import { logInfo, logSuccess, logError } from "../utils/logger.js";

interface DetectedFeatures {
    typescript: boolean;
    react: boolean;
    next: boolean;
    sass: boolean;
}

interface InitOptions {
    level: "normal" | "react" | "next";
    typescript: boolean;
    projectTypeCheck: boolean;
    addScripts: boolean;
}

/**
 * Create readline interface for interactive prompts
 */
function createReadline(): readline.Interface {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
}

/**
 * Ask a yes/no question with default value
 */
async function askConfirm(rl: readline.Interface, question: string, defaultYes: boolean = true): Promise<boolean> {
    const hint = defaultYes ? "[Y/n]" : "[y/N]";
    return new Promise((resolve) => {
        rl.question(`${question} ${hint} `, (answer) => {
            const trimmed = answer.trim().toLowerCase();
            if (trimmed === "") {
                resolve(defaultYes);
            } else if (trimmed === "y" || trimmed === "yes") {
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}

/**
 * Ask a single choice question
 */
async function askSelect(rl: readline.Interface, question: string, options: string[], defaultIndex: number = 0): Promise<string> {
    console.log(question);
    options.forEach((opt, i) => {
        const marker = i === defaultIndex ? ">" : " ";
        console.log(`  ${marker} ${i + 1}. ${opt}`);
    });

    return new Promise((resolve) => {
        rl.question(`Enter number [${defaultIndex + 1}]: `, (answer) => {
            const trimmed = answer.trim();
            if (trimmed === "") {
                const result = options[defaultIndex];
                resolve(result !== undefined ? result : options[0]!);
            } else {
                const num = parseInt(trimmed, 10);
                if (num >= 1 && num <= options.length) {
                    const result = options[num - 1];
                    resolve(result !== undefined ? result : options[0]!);
                } else {
                    const result = options[defaultIndex];
                    resolve(result !== undefined ? result : options[0]!);
                }
            }
        });
    });
}

/**
 * Detect project features from package.json
 */
async function detectFeatures(cwd: string): Promise<DetectedFeatures> {
    const pkgPath = path.join(cwd, "package.json");
    const features: DetectedFeatures = {
        typescript: false,
        react: false,
        next: false,
        sass: false,
    };

    if (!(await fs.pathExists(pkgPath))) {
        logError("package.json not found in current directory");
        process.exit(1);
    }

    try {
        const pkgJson = await fs.readJson(pkgPath);
        const allDeps = {
            ...pkgJson.dependencies,
            ...pkgJson.devDependencies,
            ...pkgJson.peerDependencies,
        };

        // Detect TypeScript
        if (allDeps["typescript"]) {
            features.typescript = true;
        }

        // Detect React
        if (allDeps["react"]) {
            features.react = true;
        }

        // Detect Next.js
        if (allDeps["next"]) {
            features.next = true;
        }

        // Detect Sass
        if (allDeps["sass"] || allDeps["node-sass"]) {
            features.sass = true;
        }

        return features;
    } catch (e) {
        logError("Failed to read package.json", e);
        process.exit(1);
    }
}

/**
 * Determine project level based on detected features
 */
function determineLevel(features: DetectedFeatures): "normal" | "react" | "next" {
    if (features.next) {
        return "next";
    }
    if (features.react) {
        return "react";
    }
    return "normal";
}

/**
 * Generate rhine-lint.config.ts content
 */
function generateConfigContent(options: InitOptions): string {
    const lines: string[] = [];

    lines.push(`import { type Config } from 'rhine-lint';`);
    lines.push(``);
    lines.push(`export default {`);

    // Level
    lines.push(`  // Project level: 'normal' | 'react' | 'next'`);
    lines.push(`  level: '${options.level}',`);
    lines.push(``);

    // TypeScript
    lines.push(`  // Enable TypeScript support`);
    lines.push(`  typescript: ${options.typescript},`);
    lines.push(``);

    // Project type check (only if TypeScript is enabled)
    if (options.typescript) {
        lines.push(`  // Enable project-based type checking`);
        lines.push(`  projectTypeCheck: ${options.projectTypeCheck},`);
        lines.push(``);
    }

    // Ignores
    lines.push(`  // Additional ignore patterns`);
    lines.push(`  ignores: [],`);
    lines.push(``);

    // ESLint config
    lines.push(`  // ESLint specific configuration`);
    lines.push(`  eslint: {`);
    lines.push(`    enable: true,`);
    lines.push(`    config: [`);
    lines.push(`      // Add custom ESLint rules here`);
    lines.push(`      // {`);
    lines.push(`      //   rules: {`);
    lines.push(`      //     'no-console': 'warn',`);
    lines.push(`      //   }`);
    lines.push(`      // }`);
    lines.push(`    ]`);
    lines.push(`  },`);
    lines.push(``);

    // Prettier config
    lines.push(`  // Prettier specific configuration`);
    lines.push(`  prettier: {`);
    lines.push(`    enable: true,`);
    lines.push(`    config: {`);
    lines.push(`      // Add custom Prettier options here`);
    lines.push(`      // printWidth: 100,`);
    lines.push(`      // semi: true,`);
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`} as Config;`);

    return lines.join("\n");
}

/**
 * Add scripts to package.json
 */
async function addScriptsToPackageJson(cwd: string): Promise<void> {
    const pkgPath = path.join(cwd, "package.json");
    try {
        const pkgJson = await fs.readJson(pkgPath);
        pkgJson.scripts = pkgJson.scripts || {};
        pkgJson.scripts["lint"] = "rl";
        pkgJson.scripts["lint:fix"] = "rl --fix";
        await fs.writeJson(pkgPath, pkgJson, { spaces: 2 });
        logSuccess("Added 'lint' and 'lint:fix' scripts to package.json");
    } catch (e) {
        logError("Failed to update package.json", e);
    }
}

/**
 * Initialize rhine-lint configuration with interactive prompts
 */
export async function initConfig(cwd: string): Promise<void> {
    logInfo("Initializing Rhine Lint configuration...");
    console.log();

    // Check if config already exists
    const configFiles = [
        "rhine-lint.config.ts",
        "rhine-lint.config.js",
        "rhine-lint.config.mjs",
        "rhine-lint.config.cjs",
        "rhine-lint.config.json",
    ];

    for (const configFile of configFiles) {
        const configPath = path.join(cwd, configFile);
        if (await fs.pathExists(configPath)) {
            logError(`Configuration file already exists: ${configFile}`);
            logInfo("Please remove the existing config file first if you want to reinitialize.");
            process.exit(1);
        }
    }

    // Detect features
    const features = await detectFeatures(cwd);
    const detectedLevel = determineLevel(features);

    // Create readline interface
    const rl = createReadline();

    try {
        // Initialize options with detected values
        const options: InitOptions = {
            level: detectedLevel,
            typescript: features.typescript,
            projectTypeCheck: true,
            addScripts: true,
        };

        // 1. Ask about level
        const levelDescription = detectedLevel === "next"
            ? "Next.js (includes React rules)"
            : detectedLevel === "react"
                ? "React"
                : "Normal (JavaScript/TypeScript only)";

        console.log(`Detected project level: ${detectedLevel} (${levelDescription})`);
        const confirmLevel = await askConfirm(rl, `Use level '${detectedLevel}'?`, true);

        if (!confirmLevel) {
            const selectedLevel = await askSelect(rl, "Select project level:", ["normal", "react", "next"],
                detectedLevel === "next" ? 2 : detectedLevel === "react" ? 1 : 0);
            options.level = selectedLevel as "normal" | "react" | "next";
        }
        console.log();

        // 2. Ask about TypeScript
        const tsDetected = features.typescript ? "detected" : "not detected";
        console.log(`TypeScript: ${tsDetected}`);
        options.typescript = await askConfirm(rl, "Enable TypeScript support?", features.typescript);
        console.log();

        // 3. Ask about projectTypeCheck (only if TypeScript is enabled)
        if (options.typescript) {
            console.log("Project-based type checking provides more accurate linting but is slower.");
            options.projectTypeCheck = await askConfirm(rl, "Enable project-based type checking?", true);
            console.log();
        }

        // 4. Ask about adding scripts to package.json
        options.addScripts = await askConfirm(rl, "Add 'lint' and 'lint:fix' scripts to package.json?", true);
        console.log();

        // Close readline
        rl.close();

        // Generate config content
        const configContent = generateConfigContent(options);

        // Determine output file extension based on TypeScript option
        const outputFile = options.typescript ? "rhine-lint.config.ts" : "rhine-lint.config.js";
        const outputPath = path.join(cwd, outputFile);

        // Write config file
        await fs.writeFile(outputPath, configContent, "utf-8");
        logSuccess(`Created ${outputFile}`);

        // Add scripts to package.json if requested
        if (options.addScripts) {
            await addScriptsToPackageJson(cwd);
        }

        console.log();
        logInfo("Configuration summary:");
        logInfo(`  Level: ${options.level}`);
        logInfo(`  TypeScript: ${options.typescript}`);
        if (options.typescript) {
            logInfo(`  Project Type Check: ${options.projectTypeCheck}`);
        }
        console.log();
        logInfo("You can now run 'rl' to lint your project.");

    } catch (e) {
        rl.close();
        throw e;
    }
}
