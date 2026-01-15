import { createConsola } from "consola";
import { colors } from "consola/utils";

const { cyan, red, green, yellow, gray, bold, dim, magenta } = colors;

export const logger = createConsola({
    level: 3,
});

export function logInfo(message: string) {
    // Manually format to match requested style: "RL <message>"
    console.log(`${cyan("RL")} ${message}`);
}

export function logSuccess(message: string) {
    console.log(`${green("RL")} ${message}`);
}

export function logWarn(message: string) {
    console.log(`${yellow("RL")} ${message}`);
}

export function logError(message: string, error?: unknown) {
    // For errors, we want red "RL"
    if (error) {
        console.error(`${red("RL")} ${message}`, error);
    } else {
        console.error(`${red("RL")} ${message}`);
    }
}

/**
 * 输出灰色的时间信息
 * @param phase - 阶段名称
 * @param elapsedMs - 耗时（毫秒）
 */
export function logTime(phase: string, elapsedMs: number) {
    const formatted = elapsedMs >= 1000
        ? `${(elapsedMs / 1000).toFixed(2)}s`
        : `${elapsedMs}ms`;
    console.log(gray(`[Time] ${phase}: ${formatted}`));
}

// ============ Init command specific utilities ============

/**
 * 打印带边框的标题框
 * 使用 ASCII 字符确保跨平台兼容性
 */
export function logBox(title: string, subtitle?: string) {
    const width = 50;
    const top = `+${"-".repeat(width - 2)}+`;
    const bottom = `+${"-".repeat(width - 2)}+`;
    const empty = `|${" ".repeat(width - 2)}|`;

    // 先计算纯文本的 padding，再应用样式
    const padLine = (text: string, styleFn: (s: string) => string) => {
        const padding = width - 4 - text.length;
        const left = Math.floor(padding / 2);
        const right = padding - left;
        return `| ${" ".repeat(left)}${styleFn(text)}${" ".repeat(right)} |`;
    };

    console.log(cyan(top));
    console.log(cyan(empty));
    console.log(cyan(padLine(title, bold)));
    if (subtitle) {
        console.log(cyan(padLine(subtitle, dim)));
    }
    console.log(cyan(empty));
    console.log(cyan(bottom));
}

/**
 * 打印分隔线
 */
export function logDivider() {
    console.log(dim("-".repeat(50)));
}

/**
 * 打印步骤指示器
 */
export function logStep(step: number, total: number, message: string) {
    console.log(`${cyan(`[${step}/${total}]`)} ${message}`);
}

/**
 * 打印检测到的特性
 */
export function logDetected(label: string, value: boolean | string) {
    const status = typeof value === "boolean"
        ? (value ? green("✓") : dim("✗"))
        : green(value);
    console.log(`  ${dim("•")} ${label}: ${status}`);
}

/**
 * 打印配置摘要项
 */
export function logSummaryItem(label: string, value: string | boolean) {
    const displayValue = typeof value === "boolean"
        ? (value ? green("enabled") : dim("disabled"))
        : magenta(value);
    console.log(`  ${dim("•")} ${label}: ${displayValue}`);
}

/**
 * 打印提示信息
 */
export function logHint(message: string) {
    console.log(dim(`  ${message}`));
}
