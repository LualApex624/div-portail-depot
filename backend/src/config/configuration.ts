import { z } from 'zod';

/**
 * Configuration applicative.
 *
 * Toute la config transite par ce fichier et est validee au demarrage : un
 * secret manquant fait echouer le boot plutot que de degrader silencieusement
 * la securite en production.
 */

const booleanFromString = z
  .string()
  .transform((value) => value === 'true' || value === '1')
  .pipe(z.boolean());

const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()).min(1));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1),

  // Secrets. Longueur minimale imposee : 32 hex = 16 octets d'entropie.
  SERVER_PEPPER: z.string().min(32),
  AUDIT_IP_SALT: z.string().min(16),

  // Stockage objet (Garage, S3-compatible).
  S3_ENDPOINT: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_REGION: z.string().default('garage'),

  // Origines autorisees (CORS API + CORS bucket pour le PUT direct navigateur).
  APP_PUBLIC_URL: z.string().url(),
  CORS_ORIGINS: csv,

  COOKIE_SECURE: booleanFromString.default('false'),

  AUTH_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(8),
  DEPOSIT_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  PIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  PIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(26_214_400),
  MAX_FILES_PER_REQUEST: z.coerce.number().int().positive().default(10),
  ALLOWED_MIME_TYPES: csv.default('application/pdf,image/jpeg,image/png'),

  PRESIGN_PUT_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  PRESIGN_GET_TTL_SECONDS: z.coerce.number().int().positive().default(60),

  /// Cron du reaper. Par defaut toutes les minutes.
  REAPER_CRON: z.string().default('0 * * * * *'),
  REAPER_ENABLED: booleanFromString.default('true'),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfiguration(): AppConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration invalide (.env) :\n${details}`);
  }

  return parsed.data;
}
