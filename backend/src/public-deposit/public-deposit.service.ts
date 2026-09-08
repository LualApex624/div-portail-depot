import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { Request } from 'express';
import { DepositRequest, FileStatus, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { ObjectStoreService } from '../object-store/object-store.service';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { detectMimeType, sanitizeFilename } from '../common/utils/magic-bytes';
import { effectiveStatus, isExpired, isOpenForDeposit } from '../requests/request-status';
import { UnlockDto } from './dto/unlock.dto';
import { InitUploadDto } from './dto/init-upload.dto';
import { MAGIC_BYTES_WINDOW } from './public-deposit.constants';

export type LinkAvailability = 'AVAILABLE' | 'LOCKED' | 'UNAVAILABLE';

export interface DepositView {
  title: string;
  expiresAt: Date;
  status: RequestStatus;
  maxFileSizeBytes: number;
  maxFiles: number;
  allowedMimeTypes: string[];
  files: Array<{
    id: string;
    filename: string;
    size: number;
    mimeType: string;
    status: FileStatus;
    rejectionReason: string | null;
  }>;
}

export interface DepositSessionContext {
  sessionId: string;
  requestId: string;
}

/**
 * Cote client anonyme : le coeur du "split-secret".
 *
 * Le token (dans l'URL, 256 bits) prouve qu'on detient le lien. Le PIN
 * (8 chiffres, transmis hors bande) prouve qu'on est bien le destinataire.
 * Ni l'un ni l'autre ne suffit seul, et aucun des deux n'ouvre directement
 * l'acces aux fichiers : le deverrouillage delivre une troisieme valeur, une
 * session opaque a duree courte, revocable en supprimant une ligne.
 */
@Injectable()
export class PublicDepositService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly objectStore: ObjectStoreService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
    private readonly logger: AppLogger,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Etat du lien avant saisie du PIN.
   *
   * "Inconnu" et "expire" sont volontairement confondus sous UNAVAILABLE :
   * repondre differemment ferait de l'endpoint un oracle d'existence. LOCKED
   * reste distinct car l'information n'a de valeur que pour quelqu'un qui
   * detient deja le token, et l'utilisateur doit savoir qu'il faut attendre.
   */
  async describeLink(token: string, request: Request): Promise<{ status: LinkAvailability }> {
    const depositRequest = await this.findByToken(token);

    await this.audit.log({
      action: 'LINK_OPENED',
      result: depositRequest ? 'SUCCESS' : 'FAILURE',
      request,
      requestId: depositRequest?.id,
    });

    if (!depositRequest || isExpired(depositRequest)) {
      return { status: 'UNAVAILABLE' };
    }

    // Le verrou est temporaire : une fois le delai passe, `isLocked` est faux
    // et le lien redevient disponible sans intervention.
    return { status: this.isLocked(depositRequest) ? 'LOCKED' : 'AVAILABLE' };
  }

  /**
   * Verification du PIN et ouverture de la session de depot.
   *
   * Le compteur d'echecs vit en base et non en memoire : un redemarrage de
   * l'API ne doit pas remettre le brute-force a zero.
   */
  async unlock(
    token: string,
    dto: UnlockDto,
    request: Request,
  ): Promise<{ sessionId: string; expiresAt: Date; view: DepositView }> {
    const depositRequest = await this.findByToken(token);

    // Seule l'expiration ferme le lien de facon opaque. Le verrouillage est
    // traite plus bas, apres avoir laisse une chance au delai de s'ecouler :
    // sinon une demande verrouillee ne se rouvrirait jamais.
    if (!depositRequest || isExpired(depositRequest)) {
      await this.audit.log({
        action: 'PIN_FAIL',
        result: 'FAILURE',
        request,
        requestId: depositRequest?.id,
        metadata: { reason: 'link_unavailable' },
      });
      throw new UnauthorizedException('Lien invalide ou expire.');
    }

    const unlocked = await this.releaseLockIfElapsed(depositRequest);

    if (this.isLocked(unlocked)) {
      throw new ForbiddenException('Trop de tentatives. Reessayez dans quelques minutes.');
    }

    const pinValid = await this.crypto.verifyLowEntropySecret(unlocked.pinHash, dto.pin);

    if (!pinValid) {
      await this.registerPinFailure(unlocked, request);
      throw new UnauthorizedException('Lien invalide ou expire.');
    }

    const sessionId = this.crypto.generateSessionId();
    const ttlMinutes = this.config.get('DEPOSIT_SESSION_TTL_MINUTES');
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.depositRequest.update({
        where: { id: unlocked.id },
        data: { failedPinAttempts: 0, lockedUntil: null },
      }),
      this.prisma.depositSession.create({
        data: {
          idHash: this.crypto.hashHighEntropySecret(sessionId),
          requestId: unlocked.id,
          expiresAt,
        },
      }),
    ]);

    await this.audit.log({
      action: 'UNLOCK_SUCCESS',
      result: 'SUCCESS',
      request,
      requestId: unlocked.id,
    });

    return { sessionId, expiresAt, view: await this.buildView(unlocked.id) };
  }

  /** Resout une session de depot. Utilise par DepositSessionGuard. */
  async resolveSession(sessionId: string, token: string): Promise<DepositSessionContext | null> {
    const session = await this.prisma.depositSession.findUnique({
      where: { idHash: this.crypto.hashHighEntropySecret(sessionId) },
      include: { request: true },
    });

    if (!session || session.consumed || session.expiresAt <= new Date()) {
      return null;
    }

    // La session est liee a une demande precise : on refuse de la rejouer sur
    // le lien d'une autre demande.
    if (session.request.tokenHash !== this.crypto.hashHighEntropySecret(token)) {
      return null;
    }

    if (!isOpenForDeposit(session.request)) {
      return null;
    }

    return { sessionId, requestId: session.requestId };
  }

  async getView(requestId: string): Promise<DepositView> {
    return this.buildView(requestId);
  }

  /**
   * Reserve une place et signe l'URL de depot.
   *
   * Les controles de taille, de nombre et de type declare sont faits ici, donc
   * avant que le moindre octet ne soit ecrit. Le type reel, lui, ne peut etre
   * verifie qu'apres : c'est le role de `complete`.
   */
  async initUpload(
    requestId: string,
    dto: InitUploadDto,
    request: Request,
  ): Promise<{ fileId: string; uploadUrl: string; expiresInSeconds: number }> {
    const maxSize = this.config.get('MAX_FILE_SIZE_BYTES');
    const maxFiles = this.config.get('MAX_FILES_PER_REQUEST');
    const allowed = this.config.get('ALLOWED_MIME_TYPES');

    if (dto.size > maxSize) {
      this.metrics.uploadsFailed.inc({ reason: 'size' });
      throw new BadRequestException(
        `Fichier trop volumineux (maximum ${Math.round(maxSize / 1024 / 1024)} Mo).`,
      );
    }

    if (!allowed.includes(dto.mimeType)) {
      this.metrics.uploadsFailed.inc({ reason: 'mime_declared' });
      throw new BadRequestException('Format non autorise. Formats acceptes : PDF, JPG, PNG.');
    }

    const existing = await this.prisma.uploadedFile.count({
      where: { requestId, status: { not: FileStatus.REJECTED } },
    });

    if (existing >= maxFiles) {
      this.metrics.uploadsFailed.inc({ reason: 'quota' });
      throw new BadRequestException(`Nombre maximum de pieces atteint (${maxFiles}).`);
    }

    const file = await this.prisma.uploadedFile.create({
      data: {
        requestId,
        filename: sanitizeFilename(dto.filename),
        objectKey: '',
        mimeType: dto.mimeType,
        size: dto.size,
        status: FileStatus.PENDING,
      },
    });

    // La cle est derivee de l'id genere, jamais du nom fourni par le client :
    // aucune traversee de chemin n'est possible.
    const quarantineKey = this.objectStore.quarantineKey(requestId, file.id);
    await this.prisma.uploadedFile.update({
      where: { id: file.id },
      data: { objectKey: quarantineKey },
    });

    const uploadUrl = await this.objectStore.presignPut(quarantineKey, dto.mimeType, dto.size);

    await this.audit.log({
      action: 'UPLOAD_INIT',
      result: 'SUCCESS',
      request,
      requestId,
      metadata: { fileId: file.id, size: dto.size, mimeType: dto.mimeType },
    });

    return {
      fileId: file.id,
      uploadUrl,
      expiresInSeconds: this.config.get('PRESIGN_PUT_TTL_SECONDS'),
    };
  }

  /**
   * Handshake de fin d'upload : c'est ici que le fichier devient une piece.
   *
   * On verifie la taille reellement ecrite puis le type reel sur les premiers
   * octets, avant de promouvoir l'objet de `quarantine/` vers `deposits/`.
   * Un fichier qui echoue n'est pas seulement marque rejete : il est efface.
   */
  async completeUpload(
    requestId: string,
    fileId: string,
    request: Request,
  ): Promise<{ file: DepositView['files'][number] }> {
    const file = await this.prisma.uploadedFile.findFirst({ where: { id: fileId, requestId } });

    if (!file) {
      throw new NotFoundException('Piece introuvable.');
    }

    if (file.status === FileStatus.ACCEPTED) {
      return { file: this.toFileView(file) };
    }

    const quarantineKey = this.objectStore.quarantineKey(requestId, file.id);
    const head = await this.objectStore.head(quarantineKey);

    if (!head) {
      return this.reject(file.id, requestId, 'missing_object', 'Aucun fichier recu.', request);
    }

    if (head.size !== file.size) {
      await this.objectStore.deleteKeys([quarantineKey]);
      return this.reject(
        file.id,
        requestId,
        'size_mismatch',
        'La taille recue ne correspond pas a la taille annoncee.',
        request,
      );
    }

    const window = Math.min(MAGIC_BYTES_WINDOW, head.size);
    const detected = detectMimeType(await this.objectStore.readHead(quarantineKey, window));
    const allowed = this.config.get('ALLOWED_MIME_TYPES');

    if (!detected || !allowed.includes(detected) || detected !== file.mimeType) {
      await this.objectStore.deleteKeys([quarantineKey]);
      return this.reject(
        file.id,
        requestId,
        'mime_real',
        'Le contenu du fichier ne correspond pas a son format annonce.',
        request,
      );
    }

    const depositKey = this.objectStore.depositKey(requestId, file.id);
    await this.objectStore.copy(quarantineKey, depositKey);
    await this.objectStore.deleteKeys([quarantineKey]);

    const accepted = await this.prisma.uploadedFile.update({
      where: { id: file.id },
      data: {
        status: FileStatus.ACCEPTED,
        objectKey: depositKey,
        completedAt: new Date(),
      },
    });

    // Regle metier : une demande est complete des la premiere piece acceptee.
    // L'avocat ne sait pas combien de pieces son client enverra.
    await this.prisma.depositRequest.updateMany({
      where: { id: requestId, status: RequestStatus.PENDING },
      data: { status: RequestStatus.COMPLETE },
    });

    this.metrics.uploadsCompleted.inc();
    await this.audit.log({
      action: 'UPLOAD_COMPLETE',
      result: 'SUCCESS',
      request,
      requestId,
      metadata: { fileId: file.id, size: accepted.size },
    });

    return { file: this.toFileView(accepted) };
  }

  private async reject(
    fileId: string,
    requestId: string,
    reason: string,
    message: string,
    request: Request,
  ): Promise<never> {
    await this.prisma.uploadedFile.update({
      where: { id: fileId },
      data: { status: FileStatus.REJECTED, rejectionReason: message },
    });

    this.metrics.uploadsFailed.inc({ reason });
    await this.audit.log({
      action: 'UPLOAD_REJECTED',
      result: 'FAILURE',
      request,
      requestId,
      metadata: { fileId, reason },
    });

    throw new BadRequestException(message);
  }

  private async findByToken(token: string): Promise<DepositRequest | null> {
    return this.prisma.depositRequest.findUnique({
      where: { tokenHash: this.crypto.hashHighEntropySecret(token) },
    });
  }

  private isLocked(depositRequest: DepositRequest | null): boolean {
    if (!depositRequest?.lockedUntil) {
      return false;
    }
    return depositRequest.lockedUntil > new Date();
  }

  /** Le verrou est temporaire : passe le delai, la demande redevient utilisable. */
  private async releaseLockIfElapsed(depositRequest: DepositRequest): Promise<DepositRequest> {
    if (!depositRequest.lockedUntil || depositRequest.lockedUntil > new Date()) {
      return depositRequest;
    }

    return this.prisma.depositRequest.update({
      where: { id: depositRequest.id },
      data: {
        failedPinAttempts: 0,
        lockedUntil: null,
        status:
          depositRequest.status === RequestStatus.LOCKED
            ? RequestStatus.PENDING
            : depositRequest.status,
      },
    });
  }

  private async registerPinFailure(
    depositRequest: DepositRequest,
    request: Request,
  ): Promise<void> {
    const maxAttempts = this.config.get('PIN_MAX_ATTEMPTS');
    const lockoutMinutes = this.config.get('PIN_LOCKOUT_MINUTES');
    const attempts = depositRequest.failedPinAttempts + 1;
    const shouldLock = attempts >= maxAttempts;

    await this.prisma.depositRequest.update({
      where: { id: depositRequest.id },
      data: {
        failedPinAttempts: attempts,
        ...(shouldLock
          ? {
              lockedUntil: new Date(Date.now() + lockoutMinutes * 60 * 1000),
              status: RequestStatus.LOCKED,
            }
          : {}),
      },
    });

    this.metrics.pinFailures.inc();
    await this.audit.log({
      action: 'PIN_FAIL',
      result: 'FAILURE',
      request,
      requestId: depositRequest.id,
      metadata: { attempts },
    });

    if (shouldLock) {
      this.metrics.pinLockouts.inc();
      // Les sessions ouvertes sur cette demande tombent avec le verrou.
      await this.prisma.depositSession.deleteMany({ where: { requestId: depositRequest.id } });
      this.logger.warn(
        `Demande ${depositRequest.id} verrouillee apres ${attempts} PIN invalides`,
        'PublicDeposit',
      );
      await this.audit.log({
        action: 'REQUEST_LOCKED',
        result: 'FAILURE',
        request,
        requestId: depositRequest.id,
        metadata: { attempts, lockoutMinutes },
      });
    }
  }

  private async buildView(requestId: string): Promise<DepositView> {
    const found = await this.prisma.depositRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { files: { orderBy: { createdAt: 'asc' } } },
    });

    return {
      title: found.title,
      expiresAt: found.expiresAt,
      status: effectiveStatus(found),
      maxFileSizeBytes: this.config.get('MAX_FILE_SIZE_BYTES'),
      maxFiles: this.config.get('MAX_FILES_PER_REQUEST'),
      allowedMimeTypes: this.config.get('ALLOWED_MIME_TYPES'),
      files: found.files
        .filter((file) => file.status !== FileStatus.PENDING)
        .map((file) => this.toFileView(file)),
    };
  }

  private toFileView(file: {
    id: string;
    filename: string;
    size: number;
    mimeType: string;
    status: FileStatus;
    rejectionReason: string | null;
  }): DepositView['files'][number] {
    return {
      id: file.id,
      filename: file.filename,
      size: file.size,
      mimeType: file.mimeType,
      status: file.status,
      rejectionReason: file.rejectionReason,
    };
  }
}
