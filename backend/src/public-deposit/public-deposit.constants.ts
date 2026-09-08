/** Cookie de session de depot. Opaque, TTL court, SameSite=Strict. */
export const DEPOSIT_COOKIE = 'deposit_sid';

/** Cle sous laquelle le guard depose la session de depot resolue. */
export const DEPOSIT_SESSION_KEY = 'depositSession';

/** Nombre d'octets lus pour identifier le type reel d'un fichier. */
export const MAGIC_BYTES_WINDOW = 64 * 1024;
