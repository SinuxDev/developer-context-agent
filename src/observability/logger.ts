import pino from 'pino';
import type { AppConfig } from '../core/config.js';

export function createLogger(config: AppConfig) {
  const isDev = config.nodeEnv === 'development';

  return pino({
    level: config.logLevel,
    transport: isDev
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
