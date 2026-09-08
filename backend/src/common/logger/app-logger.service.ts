import { Injectable, LoggerService, Scope } from '@nestjs/common';
import pino, { Logger } from 'pino';
import { RequestContext } from '../middleware/request-context';

/**
 * Logs JSON (Pino) branches sur le logger Nest.
 *
 * Chaque ligne porte le requestId courant, ce qui permet de recoller une
 * trace complete depuis Grafana/Loki sans avoir a instrumenter chaque service.
 * Aucun secret n'est jamais logge : ni PIN, ni token, ni chemin /d/:token brut.
 */
@Injectable({ scope: Scope.DEFAULT })
export class AppLogger implements LoggerService {
  private readonly logger: Logger;

  constructor() {
    this.logger = pino({
      level: process.env.LOG_LEVEL ?? 'info',
      base: { service: 'div-depot-api' },
      redact: {
        paths: ['pin', '*.pin', 'token', '*.token', 'password', '*.password'],
        censor: '[redacted]',
      },
      formatters: {
        level: (label) => ({ level: label }),
      },
    });
  }

  /** Logger enfant a utiliser directement pour les evenements structures. */
  get raw(): Logger {
    return this.logger;
  }

  private bindings(context?: string): Record<string, unknown> {
    const store = RequestContext.current();
    return {
      ...(context ? { context } : {}),
      ...(store?.requestId ? { requestId: store.requestId } : {}),
    };
  }

  log(message: unknown, context?: string): void {
    this.logger.info(this.bindings(context), String(message));
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.logger.error({ ...this.bindings(context), stack }, String(message));
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn(this.bindings(context), String(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug(this.bindings(context), String(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace(this.bindings(context), String(message));
  }
}
