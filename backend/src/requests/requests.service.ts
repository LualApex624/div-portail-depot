import { Injectable, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { Request } from 'express';
import { FileStatus, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { ObjectStoreService } from '../object-store/object-store.service';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { effectiveStatus } from './request-status';

export interface CreatedRequest {
  id: string;
  title: string;
  /** Chemin public a transmettre au client. Affiche une seule fois. */
  url: string;
  /** PIN en clair. Affiche une seule fois, jamais reconstituable ensuite. */
  pin: string;
  expiresAt: Date;
}

export interface RequestSummary {
  id: string;
  title: string;
  status: RequestStatus;
  expiresAt: Date;
  createdAt: Date;
  fileCount: number;
  acceptedCount: number;
}

/**
 * Cote avocat : creation des demandes et lecture du dashboard.
 *
 * Toutes les requetes portent `where: { userId }`. C'est la garantie
 * d'isolation entre cabinets, et elle est testee : un avocat ne doit jamais
 * pouvoir atteindre la demande d'un confrere, meme en devinant un id.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly objectStore: ObjectStoreService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Genere le couple token/PIN.
   *
   * C'est le seul moment ou les deux secrets existent en clair. La reponse
   * n'est pas rejouable : seules les empreintes sont conservees.
   */
  async create(
    userId: string,
    dto: CreateRequestDto,
    request: Request,
  ): Promise<CreatedRequest> {
    const token = this.crypto.generateToken();
    const pin = this.crypto.generatePin();

    const created = await this.prisma.depositRequest.create({
      data: {
        title: dto.title,
        tokenHash: this.crypto.hashHighEntropySecret(token),
        pinHash: await this.crypto.hashLowEntropySecret(pin),
        expiresAt: new Date(Date.now() + dto.expiresInHours * 3600 * 1000),
        userId,
      },
    });

    this.metrics.requestsCreated.inc();
    await this.audit.log({
      action: 'REQUEST_CREATED',
      result: 'SUCCESS',
      request,
      userId,
      requestId: created.id,
      metadata: { expiresInHours: dto.expiresInHours },
    });

    return {
      id: created.id,
      title: created.title,
      url: `${this.config.get('APP_PUBLIC_URL')}/d/${token}`,
      pin,
      expiresAt: created.expiresAt,
    };
  }

  async list(
    userId: string,
    query: ListRequestsDto,
  ): Promise<{ items: RequestSummary[]; total: number; page: number; pageSize: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.depositRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { files: { select: { status: true } } },
      }),
      this.prisma.depositRequest.count({ where: { userId } }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: effectiveStatus(row),
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      fileCount: row.files.length,
      acceptedCount: row.files.filter((file) => file.status === FileStatus.ACCEPTED).length,
    }));

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(userId: string, id: string) {
    const found = await this.prisma.depositRequest.findFirst({
      where: { id, userId },
      include: {
        files: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            filename: true,
            mimeType: true,
            size: true,
            status: true,
            rejectionReason: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });

    if (!found) {
      throw new NotFoundException('Demande introuvable.');
    }

    return {
      id: found.id,
      title: found.title,
      status: effectiveStatus(found),
      expiresAt: found.expiresAt,
      createdAt: found.createdAt,
      purgedAt: found.purgedAt,
      // Les fiches PENDING sont des depots initialises jamais finalises :
      // du bruit cote avocat, pas des pieces.
      files: found.files.filter((file) => file.status !== FileStatus.PENDING),
    };
  }

  /**
   * URL de telechargement signee, valable 60 s.
   *
   * Le fichier ne transite pas par l'API : le navigateur de l'avocat va le
   * chercher directement dans Garage, comme le client l'y a depose.
   */
  async issueDownloadUrl(
    userId: string,
    requestId: string,
    fileId: string,
    request: Request,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const file = await this.prisma.uploadedFile.findFirst({
      where: { id: fileId, requestId, request: { userId }, status: FileStatus.ACCEPTED },
    });

    if (!file) {
      throw new NotFoundException('Piece introuvable.');
    }

    const url = await this.objectStore.presignGet(file.objectKey, file.filename);

    await this.audit.log({
      action: 'DOWNLOAD_URL_ISSUED',
      result: 'SUCCESS',
      request,
      userId,
      requestId,
      metadata: { fileId },
    });

    return {
      url,
      expiresInSeconds: this.config.get('PRESIGN_GET_TTL_SECONDS'),
    };
  }
}
