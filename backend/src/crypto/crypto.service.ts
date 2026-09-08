import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createHmac, createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hash as argon2Hash, verify as argon2Verify, Algorithm } from '@node-rs/argon2';

/**
 * Primitives cryptographiques du portail. Un seul endroit ou vivent le pepper
 * et les parametres Argon2id.
 *
 * Regle appliquee (cf. rapport Split-Secret) :
 *  - bas entropie (mot de passe, PIN 8 chiffres) -> Argon2id + lockout ;
 *  - haute entropie (token 256 bits, session id 256 bits) -> HMAC-SHA256 + pepper.
 *
 * Hasher un token de 256 bits avec Argon2 serait inutile (l'attaquant ne peut
 * pas l'enumerer) et couterait une passe memoire a chaque lookup.
 */
@Injectable()
export class CryptoService {
  /** Parametres OWASP 2026 pour Argon2id : 19 MiB, 2 iterations, 1 thread. */
  private static readonly ARGON2_OPTIONS = {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  private readonly pepper: string;
  private readonly ipSalt: string;

  constructor(config: AppConfigService) {
    this.pepper = config.get('SERVER_PEPPER');
    this.ipSalt = config.get('AUDIT_IP_SALT');
  }

  /** Token public du lien de depot : 256 bits, url-safe. */
  generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /** Identifiant de session opaque : 256 bits, url-safe. */
  generateSessionId(): string {
    return randomBytes(32).toString('base64url');
  }

  /** PIN a 8 chiffres, uniformement tire (pas de biais modulo). */
  generatePin(): string {
    return randomInt(0, 100_000_000).toString().padStart(8, '0');
  }

  /** Empreinte des secrets a haute entropie. Deterministe : indexable. */
  hashHighEntropySecret(secret: string): string {
    return createHmac('sha256', this.pepper).update(secret).digest('hex');
  }

  /** Empreinte des secrets a basse entropie (mot de passe, PIN). */
  async hashLowEntropySecret(secret: string): Promise<string> {
    return argon2Hash(secret, CryptoService.ARGON2_OPTIONS);
  }

  /**
   * Verification Argon2id. Retourne false plutot que de propager : une empreinte
   * corrompue en base ne doit pas devenir une 500 exploitable.
   */
  async verifyLowEntropySecret(digest: string, secret: string): Promise<boolean> {
    try {
      return await argon2Verify(digest, secret);
    } catch {
      return false;
    }
  }

  /** Comparaison a temps constant de deux empreintes hexadecimales. */
  safeCompare(a: string, b: string): boolean {
    const bufferA = Buffer.from(a, 'utf8');
    const bufferB = Buffer.from(b, 'utf8');
    if (bufferA.length !== bufferB.length) {
      return false;
    }
    return timingSafeEqual(bufferA, bufferB);
  }

  /**
   * Pseudonymisation d'une IP pour l'audit (RGPD art. 5-1-c) : on garde la
   * capacite de correler des tentatives, pas l'adresse elle-meme.
   */
  hashIp(ip: string | undefined): string {
    return createHash('sha256')
      .update(`${this.ipSalt}:${ip ?? 'unknown'}`)
      .digest('hex')
      .slice(0, 32);
  }
}
