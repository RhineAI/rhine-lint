import { createConsola } from "consola";

export const logger = createConsola({
    level: 3, // Info
    formatOptions: {
        columns: 80,
        colors: true,
        compact: false,
        date: false,
    },
});

export function logInfo(message: string) {
    logger.info(message);
}

export function logSuccess(message: string) {
    logger.success(message);
}

export function logWarn(message: string) {
    logger.warn(message);
}

export function logError(message: string, error?: unknown) {
    logger.error(message, error);
}
