import { createConsola } from "consola";
import { colors } from "consola/utils";

const { cyan, red, green, yellow, gray } = colors;

// Custom logger to satisfy "RL" prefix requirement
const rLine = (colorFn: (str: string) => string, type: string, msg: string) => {
    console.log(`${colorFn("RL")} ${msg}`);
}

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
