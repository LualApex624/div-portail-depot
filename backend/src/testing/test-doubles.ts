import { AppConfigService } from '../config/app-config.service';
import { Request } from 'express';
import { CryptoService } from '../crypto/crypto.service';
import { MetricsService } from '../metrics/metrics.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { AuditService } from '../audit/audit.service';

/**
 * Doublures partagees par les tests unitaires.
 *
 * Choix assume : les tests portent sur la logique metier avec un Prisma et un
 * stockage objet simules, et n'exigent donc ni base ni conteneur. Ils tournent
 * en quelques secondes et sont utilisables en CI sans service externe. Le
 * chemin reel Postgres + Garage est couvert par le smoke test de `install.sh`.
 */

export const TEST_CONFIG: Record<string, unknown> = {
  SERVER_PEPPER: 'a'.repeat(64),
  AUDIT_IP_SALT: 'b'.repeat(32),
  APP_PUBLIC_URL: 'http://localhost:3000',
  AUTH_SESSION_TTL_HOURS: 8,
  DEPOSIT_SESSION_TTL_MINUTES: 30,
  PIN_MAX_ATTEMPTS: 5,
  PIN_LOCKOUT_MINUTES: 15,
  MAX_FILE_SIZE_BYTES: 26_214_400,
  MAX_FILES_PER_REQUEST: 10,
  ALLOWED_MIME_TYPES: ['application/pdf', 'image/jpeg', 'image/png'],
  PRESIGN_PUT_TTL_SECONDS: 300,
  PRESIGN_GET_TTL_SECONDS: 60,
  S3_BUCKET: 'div-deposits',
  CORS_ORIGINS: ['http://localhost:3000'],
};

export function configStub(overrides: Record<string, unknown> = {}): AppConfigService {
  const values = { ...TEST_CONFIG, ...overrides };
  return {
    get: (key: string) => {
      if (!(key in values)) {
        throw new Error(`Cle de configuration absente du stub : ${key}`);
      }
      return values[key];
    },
  } as unknown as AppConfigService;
}

export function cryptoStub(): CryptoService {
  return new CryptoService(configStub());
}

export function loggerStub(): AppLogger {
  const noop = (): void => undefined;
  return {
    log: noop,
    warn: noop,
    error: noop,
    debug: noop,
    verbose: noop,
    raw: { info: noop, warn: noop, error: noop },
  } as unknown as AppLogger;
}

export function auditStub(): jest.Mocked<Pick<AuditService, 'log'>> {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

/** Vraies metriques sur un registre neuf : les compteurs sont assertables. */
export function metricsStub(): MetricsService {
  return new MetricsService();
}

export function requestStub(ip = '203.0.113.10'): Request {
  return { ip, headers: { 'user-agent': 'jest' }, socket: { remoteAddress: ip } } as Request;
}

export async function counterValue(
  metrics: MetricsService,
  name: string,
  labels: Record<string, string> = {},
): Promise<number> {
  const metric = await metrics.registry.getSingleMetric(name)?.get();
  const match = metric?.values.find((value) =>
    Object.entries(labels).every(([key, expected]) => value.labels[key] === expected),
  );
  return match?.value ?? 0;
}
