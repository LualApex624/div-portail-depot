import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

export interface LoginResult {
  sessionId: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}

/**
 * Authentification avocat par session opaque stockee en base.
 *
 * Pas de JWT, et c'est un choix : un JWT ne se revoque pas sans denylist, et
 * le stocker cote client expose au XSS. Une ligne AuthSession dans Postgres
 * coute un SELECT indexe par requete et se supprime instantanement.
 * `sessionVersion` permet en plus de revoquer d'un coup toutes les sessions
 * d'un avocat (changement de mot de passe, incident).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  async login(dto: LoginDto, request: Request): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });

    // Verification effectuee meme sans compte, contre une empreinte factice :
    // sinon le temps de reponse revele quels e-mails existent.
    const passwordHash = user?.passwordHash ?? (await this.dummyHash());
    const passwordValid = await this.crypto.verifyLowEntropySecret(passwordHash, dto.password);

    if (!user || !passwordValid) {
      await this.audit.log({
        action: 'LOGIN_FAILURE',
        result: 'FAILURE',
        request,
        userId: user?.id,
      });
      throw new UnauthorizedException('Identifiants invalides.');
    }

    const sessionId = this.crypto.generateSessionId();
    const ttlHours = this.config.get('AUTH_SESSION_TTL_HOURS');
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    await this.prisma.authSession.create({
      data: {
        idHash: this.crypto.hashHighEntropySecret(sessionId),
        userId: user.id,
        sessionVersion: user.sessionVersion,
        expiresAt,
      },
    });

    await this.audit.log({
      action: 'LOGIN_SUCCESS',
      result: 'SUCCESS',
      request,
      userId: user.id,
    });

    return {
      sessionId,
      expiresAt,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    };
  }

  /**
   * Resout une session. Retourne null (jamais une exception) pour laisser le
   * guard decider du statut HTTP.
   */
  async resolveSession(sessionId: string): Promise<AuthenticatedUser | null> {
    const session = await this.prisma.authSession.findUnique({
      where: { idHash: this.crypto.hashHighEntropySecret(sessionId) },
      include: { user: true },
    });

    if (!session || session.expiresAt <= new Date()) {
      return null;
    }

    // Session emise avant une revocation globale.
    if (session.sessionVersion !== session.user.sessionVersion) {
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
    };
  }

  async logout(sessionId: string, request: Request): Promise<void> {
    const idHash = this.crypto.hashHighEntropySecret(sessionId);
    const session = await this.prisma.authSession.findUnique({ where: { idHash } });

    if (session) {
      await this.prisma.authSession.delete({ where: { idHash } });
      await this.audit.log({
        action: 'LOGOUT',
        result: 'SUCCESS',
        request,
        userId: session.userId,
      });
    }
  }

  /** Empreinte jetable, uniquement pour egaliser le temps de reponse. */
  private async dummyHash(): Promise<string> {
    return this.crypto.hashLowEntropySecret('mot-de-passe-inexistant');
  }
}
