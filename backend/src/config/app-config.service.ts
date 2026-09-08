import { Injectable } from '@nestjs/common';
import { AppConfig, loadConfiguration } from './configuration';

/**
 * Acces type a la configuration.
 *
 * Ecrit a la place de `ConfigService` de @nestjs/config, pour une raison
 * concrete : ConfigService relit `process.env`, donc renvoie toujours des
 * chaines et court-circuite la coercition du schema Zod. `ALLOWED_MIME_TYPES`
 * revenait ainsi en CSV brut au lieu d'un tableau, et `allowlist.includes()`
 * devenait une comparaison de sous-chaine — une allowlist qui accepte "pdf"
 * n'est plus une allowlist. Les tailles, elles, revenaient en chaines et ne
 * tenaient que par la coercition implicite de JavaScript.
 *
 * Ici, `get('CORS_ORIGINS')` rend un `string[]`, et le compilateur le sait.
 */
@Injectable()
export class AppConfigService {
  private readonly values: AppConfig;

  constructor() {
    this.values = loadConfiguration();
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.values[key];
  }
}
