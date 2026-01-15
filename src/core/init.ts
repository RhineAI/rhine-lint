import path from "node:path";
import readline from "node:readline";
import fs from "fs-extra";
import { colors } from "consola/utils";
import {
    logInfo,
    logSuccess,
    logError,
    logBox,
    logDivider,
    logStep,
    logDetected,
    logSummaryItem,
    logHint,
} from "../utils/logger.js";

const { cyan, green, dim, bold } = colors;

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
    const hint = defaultYes
        ? `${green("Y")}${dim("/")}${dim("N")}`
        : `${dim("Y")}${dim("/")}${green("N")}`;

    return new Promise((resolve) => {
        rl.question(`  ${cyan("?")} ${question} ${dim("[")}${hint}${dim("]")} `, (answer) => {
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
async function askSelect(
    rl: readline.Interface,
    question: string,
    options: { value: string; label: string }[],
    defaultIndex: number = 0
): Promise<string> {
    console.log(`  ${cyan("?")} ${question}`);
    console.log();

    options.forEach((opt, i) => {
        const isDefault = i === defaultIndex;
        const marker = isDefault ? green("●") : dim("○");
        const defaultHint = isDefault ? dim(" (default)") : "";
        console.log(`    ${marker} ${dim(`${i + 1}.`)} ${opt.label}${defaultHint}`);
    });

    console.log();

    return new Promise((resolve) => {
        rl.question(`  ${dim("Enter number")} ${dim("[")}${green(String(defaultIndex + 1))}${dim("]:")} `, (answer) => {
            const trimmed = answer.trim();
            if (trimmed === "") {
                const result = options[defaultIndex];
                resolve(result !== undefined ? result.value : options[0]!.value);
            } else {
                const num = parseInt(trimmed, 10);
                if (num >= 1 && num <= options.length) {
                    const result = options[num - 1];
                    resolve(result !== undefined ? result.value : options[0]!.value);
                } else {
                    const result = options[defaultIndex];
                    resolve(result !== undefined ? result.value : options[0]!.value);
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
 * Generate rhine-lint.config content
 */
function generateConfigContent(options: InitOptions): string {
    const lines: string[] = [];

    if (options.typescript) {
        lines.push(`import { type Config } from 'rhine-lint';`);
        lines.push(``);
    }

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

    if (options.typescript) {
        lines.push(`} as Config;`);
    } else {
        lines.push(`};`);
    }

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
        logSuccess(`Added ${bold("lint")} and ${bold("lint:fix")} scripts to package.json`);
    } catch (e) {
        logError("Failed to update package.json", e);
    }
}

/**
 * Get level display label
 */
function getLevelLabel(level: "normal" | "react" | "next"): string {
    switch (level) {
        case "next":
            return "Next.js (includes React rules)";
        case "react":
            return "React";
        default:
            return "Normal (JavaScript/TypeScript only)";
    }
}

/**
 * Initialize rhine-lint configuration with interactive prompts
 */
export async function initConfig(cwd: string): Promise<void> {
    // Print welcome box
    console.log();
    logBox("Rhine Lint", "Zero-config linting solution");
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
            logHint("Remove the existing config file first if you want to reinitialize.");
            process.exit(1);
        }
    }

    // Detect features
    logStep(1, 4, "Detecting project features...");
    console.log();

    const features = await detectFeatures(cwd);
    const detectedLevel = determineLevel(features);

    logDetected("TypeScript", features.typescript);
    logDetected("React", features.react);
    logDetected("Next.js", features.next);
    logDetected("Sass/SCSS", features.sass);
    logDetected("Recommended level", getLevelLabel(detectedLevel));

    console.log();
    logDivider();
    console.log();

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

        // Step 2: Configure options
        logStep(2, 4, "Configure options");
        console.log();

        // 1. Ask about level
        const confirmLevel = await askConfirm(rl, `Use detected level ${bold(detectedLevel)}?`, true);

        if (!confirmLevel) {
            console.log();
            const levelOptions = [
                { value: "normal", label: "Normal - JavaScript/TypeScript only" },
                { value: "react", label: "React - Includes React/Hooks/JSX rules" },
                { value: "next", label: "Next.js - Includes React + Next.js rules" },
            ];
            const defaultIdx = detectedLevel === "next" ? 2 : detectedLevel === "react" ? 1 : 0;
            const selectedLevel = await askSelect(rl, "Select project level:", levelOptions, defaultIdx);
            options.level = selectedLevel as "normal" | "react" | "next";
        }

        console.log();

        // 2. Ask about TypeScript
        options.typescript = await askConfirm(
            rl,
            `Enable TypeScript support?`,
            features.typescript
        );

        // 3. Ask about projectTypeCheck (only if TypeScript is enabled)
        if (options.typescript) {
            console.log();
            logHint("Project-based type checking is more accurate but slower");
            options.projectTypeCheck = await askConfirm(rl, "Enable project-based type checking?", true);
        }

        console.log();

        // 4. Ask about adding scripts to package.json
        options.addScripts = await askConfirm(
            rl,
            `Add ${bold("lint")} and ${bold("lint:fix")} scripts to package.json?`,
            true
        );

        console.log();
        logDivider();
        console.log();

        // Close readline
        rl.close();

        // Step 3: Generate files
        logStep(3, 4, "Generating configuration files...");
        console.log();

        // Generate config content
        const configContent = generateConfigContent(options);

        // Determine output file extension based on TypeScript option
        const outputFile = options.typescript ? "rhine-lint.config.ts" : "rhine-lint.config.js";
        const outputPath = path.join(cwd, outputFile);

        // Write config file
        await fs.writeFile(outputPath, configContent, "utf-8");
        logSuccess(`Created ${bold(outputFile)}`);

        // Add scripts to package.json if requested
        if (options.addScripts) {
            await addScriptsToPackageJson(cwd);
        }

        console.log();
        logDivider();
        console.log();

        // Step 4: Summary
        logStep(4, 4, "Configuration complete!");
        console.log();

        logInfo("Configuration summary:");
        logSummaryItem("Level", options.level);
        logSummaryItem("TypeScript", options.typescript);
        if (options.typescript) {
            logSummaryItem("Project Type Check", options.projectTypeCheck);
        }
        logSummaryItem("Scripts added", options.addScripts);

        console.log();
        logInfo(`Run ${bold(cyan("rl"))} to lint your project.`);
        logInfo(`Run ${bold(cyan("rl --fix"))} to auto-fix issues.`);
        console.log();

    } catch (e) {
        rl.close();
        throw e;
    }
}
