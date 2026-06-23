import pino, { type LoggerOptions } from 'pino';
import type { AppConfig } from '../core/config.js';

export function getPinoConfig(config: AppConfig): LoggerOptions {
  const isDev = config.nodeEnv === 'development';

  return {
    level: config.logLevel,
    transport: isDev
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  };
}

export function createLogger(config: AppConfig) {
  return pino(getPinoConfig(config));
}

export type Logger = ReturnType<typeof createLogger>;
