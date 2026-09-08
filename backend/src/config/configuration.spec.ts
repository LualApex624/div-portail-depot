import { loadConfiguration } from './configuration';

/**
 * Ces tests gardent une regression reelle : la configuration etait auparavant
 * lue via ConfigService, qui renvoie `process.env` brut. `ALLOWED_MIME_TYPES`
 * arrivait alors en chaine CSV, et `allowlist.includes(mimeType)` devenait une
 * comparaison de sous-chaine — une allowlist qui accepte "pdf" ou "image/".
 */
const BASE_ENV = {
  DATABASE_URL: 'postgresql://div:secret@db:5432/div_depot',
  SERVER_PEPPER: 'a'.repeat(64),
  AUDIT_IP_SALT: 'b'.repeat(32),
  S3_ENDPOINT: 'http://garage:3900',
  S3_PUBLIC_ENDPOINT: 'http://localhost:3900',
  S3_BUCKET: 'div-deposits',
  S3_ACCESS_KEY: 'GK0123456789abcdef01234567',
  S3_SECRET_KEY: 'c'.repeat(64),
  APP_PUBLIC_URL: 'http://localhost:8080',
  CORS_ORIGINS: 'http://localhost:8080,http://localhost:3900',
};

describe('Chargement de la configuration', () => {
  const original = process.env;

  afterEach(() => {
    process.env = original;
  });

  const load = (overrides: Record<string, string> = {}) => {
    process.env = { ...BASE_ENV, ...overrides } as NodeJS.ProcessEnv;
    return loadConfiguration();
  };

  it('rend les listes sous forme de tableaux, pas de chaines CSV', () => {
    const config = load();

    expect(config.ALLOWED_MIME_TYPES).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
    ]);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:8080', 'http://localhost:3900']);

    // Le coeur de la regression : une allowlist doit comparer des elements.
    expect(config.ALLOWED_MIME_TYPES.includes('pdf')).toBe(false);
    expect(config.ALLOWED_MIME_TYPES.includes('application/pdf')).toBe(true);
  });

  it('rend les tailles et les durees sous forme de nombres', () => {
    const config = load({ MAX_FILE_SIZE_BYTES: '26214400', PIN_MAX_ATTEMPTS: '5' });

    expect(config.MAX_FILE_SIZE_BYTES).toBe(26_214_400);
    expect(typeof config.MAX_FILE_SIZE_BYTES).toBe('number');
    expect(config.PIN_MAX_ATTEMPTS).toBe(5);
    expect(config.PRESIGN_PUT_TTL_SECONDS).toBe(300);
  });

  it('rend les drapeaux sous forme de booleens', () => {
    expect(load({ COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
    expect(load({ COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
    expect(load().COOKIE_SECURE).toBe(false);
  });

  it('echoue au demarrage si un secret manque', () => {
    process.env = { ...BASE_ENV, SERVER_PEPPER: undefined } as NodeJS.ProcessEnv;
    expect(() => loadConfiguration()).toThrow(/SERVER_PEPPER/);
  });

  it('echoue au demarrage si un pepper est trop court', () => {
    process.env = { ...BASE_ENV, SERVER_PEPPER: 'trop-court' } as NodeJS.ProcessEnv;
    expect(() => loadConfiguration()).toThrow(/SERVER_PEPPER/);
  });

  it('echoue si une origine de stockage n est pas une URL', () => {
    process.env = { ...BASE_ENV, S3_PUBLIC_ENDPOINT: 'pas-une-url' } as NodeJS.ProcessEnv;
    expect(() => loadConfiguration()).toThrow(/S3_PUBLIC_ENDPOINT/);
  });
});
