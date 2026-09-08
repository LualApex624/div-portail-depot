import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { clientIp } from '../common/utils/client-ip';

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'REQUEST_CREATED'
  | 'LINK_OPENED'
  | 'UNLOCK_SUCCESS'
  | 'PIN_FAIL'
  | 'REQUEST_LOCKED'
  | 'UPLOAD_INIT'
  | 'UPLOAD_COMPLETE'
  | 'UPLOAD_REJECTED'
  | 'DOWNLOAD_URL_ISSUED'
  | 'PURGE';

export interface AuditEntry {
  action: AuditAction;
  result: 'SUCCESS' | 'FAILURE';
  request?: Request;
  requestId?: string;
  userId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Journal d'audit des acces.
 *
 * Ce que le CDC appelle "tracabilite" sans le modeliser. Un incident sur un
 * dossier juridique se raconte avec des lignes horodatees, pas avec un
 * dashboard. La table est append-only et ne contient jamais de secret :
 * ni PIN, ni token, ni nom de fichier de contenu, et l'IP est hachee.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly logger: AppLogger,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    const ipHash = this.crypto.hashIp(entry.request ? clientIp(entry.request) : undefined);
    const userAgent = entry.request?.headers['user-agent']?.slice(0, 255);

    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          result: entry.result,
          requestId: entry.requestId ?? null,
          userId: entry.userId ?? null,
          ipHash,
          userAgent: userAgent ?? null,
          metadata: entry.metadata,
        },
      });
    } catch (error) {
      // L'audit ne doit jamais casser le parcours metier : on le signale et
      // on continue. La perte est visible dans les logs.
      this.logger.error(
        `Ecriture du journal d'audit impossible (${entry.action})`,
        (error as Error).stack,
        'Audit',
      );
    }

    this.logger.raw.info(
      {
        event: 'audit',
        action: entry.action,
        result: entry.result,
        depositRequestId: entry.requestId,
        userId: entry.userId,
        ipHash,
      },
      'audit',
    );
  }
}
