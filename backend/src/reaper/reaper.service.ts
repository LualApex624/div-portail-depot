import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { CronJob } from 'cron';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStoreService } from '../object-store/object-store.service';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import { AppLogger } from '../common/logger/app-logger.service';

export interface PurgeReport {
  requestsPurged: number;
  objectsDeleted: number;
  sessionsRevoked: number;
  filesForgotten: number;
}

/**
 * Purge physique des demandes echues.
 *
 * Le point de divergence le plus net avec le cahier des charges initial : une
 * ligne `status = EXPIRED` avec le PDF encore dans le bucket n'est pas une
 * expiration, c'est un booleen. Le RGPD (art. 5-1-e) parle de destruction.
 *
 * Le reaper est donc idempotent et fait quatre choses dans cet ordre :
 *   1. supprime les objets des deux prefixes (quarantine puis deposits) ;
 *   2. revoque les sessions de depot encore ouvertes ;
 *   3. supprime les metadonnees des pieces ;
 *   4. marque la demande EXPIRED et horodate `purgedAt`.
 *
 * L'etape 3 n'est pas cosmetique : un nom de fichier est lui-meme une donnee
 * personnelle ("passeport-jean-dupont.pdf"). Effacer l'objet en conservant sa
 * fiche laisserait la donnee la plus parlante en base. Le journal d'audit, lui,
 * garde le nombre de pieces et l'horodatage — jamais leur nom.
 *
 * L'ordre compte : si le job meurt au milieu, les objets sont deja partis et
 * le prochain passage reprendra la demande, encore non marquee.
 */
const EMPTY_REPORT: PurgeReport = {
  requestsPurged: 0,
  objectsDeleted: 0,
  sessionsRevoked: 0,
  filesForgotten: 0,
};

@Injectable()
export class ReaperService implements OnModuleInit, OnModuleDestroy {
  private running = false;
  private job?: CronJob;

  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStore: ObjectStoreService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
    private readonly logger: AppLogger,
    private readonly config: AppConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get('REAPER_ENABLED')) {
      this.logger.warn('Reaper desactive par configuration', 'Reaper');
      return;
    }

    const expression = this.config.get('REAPER_CRON');
    this.job = CronJob.from({
      cronTime: expression,
      onTick: () => {
        void this.runOnce();
      },
      start: true,
    });

    this.logger.log(`Reaper arme (${expression})`, 'Reaper');
  }

  onModuleDestroy(): void {
    this.job?.stop();
  }

  /**
   * Un seul passage a la fois : sur une purge longue, deux executions
   * concurrentes se marcheraient dessus sur les memes prefixes.
   */
  async runOnce(): Promise<PurgeReport> {
    if (this.running) {
      return EMPTY_REPORT;
    }

    this.running = true;
    try {
      return await this.purgeExpired();
    } catch (error) {
      this.logger.error('Passage du reaper en echec', (error as Error).stack, 'Reaper');
      return EMPTY_REPORT;
    } finally {
      this.running = false;
    }
  }

  async purgeExpired(): Promise<PurgeReport> {
    const now = new Date();
    const expired = await this.prisma.depositRequest.findMany({
      where: {
        expiresAt: { lt: now },
        purgedAt: null,
      },
      select: { id: true },
      take: 200,
    });

    const report: PurgeReport = {
      requestsPurged: 0,
      objectsDeleted: 0,
      sessionsRevoked: 0,
      filesForgotten: 0,
    };

    for (const { id } of expired) {
      const objectsDeleted =
        (await this.objectStore.deletePrefix(`${ObjectStoreService.QUARANTINE_PREFIX}/${id}/`)) +
        (await this.objectStore.deletePrefix(`${ObjectStoreService.DEPOSITS_PREFIX}/${id}/`));

      const revoked = await this.prisma.depositSession.deleteMany({ where: { requestId: id } });
      const forgotten = await this.prisma.uploadedFile.deleteMany({ where: { requestId: id } });

      await this.prisma.depositRequest.update({
        where: { id },
        data: { status: RequestStatus.EXPIRED, purgedAt: new Date() },
      });

      this.metrics.purgedObjects.inc(objectsDeleted);
      this.metrics.purgedRequests.inc();

      report.requestsPurged += 1;
      report.objectsDeleted += objectsDeleted;
      report.sessionsRevoked += revoked.count;
      report.filesForgotten += forgotten.count;

      await this.audit.log({
        action: 'PURGE',
        result: 'SUCCESS',
        requestId: id,
        metadata: {
          objectsDeleted,
          sessionsRevoked: revoked.count,
          filesForgotten: forgotten.count,
        },
      });
    }

    // Menage des sessions echues, sans lien avec l'expiration des demandes.
    await this.prisma.depositSession.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.prisma.authSession.deleteMany({ where: { expiresAt: { lt: now } } });

    if (report.requestsPurged > 0) {
      this.logger.log(
        `Purge : ${report.requestsPurged} demande(s), ${report.objectsDeleted} objet(s), ` +
          `${report.filesForgotten} fiche(s), ${report.sessionsRevoked} session(s)`,
        'Reaper',
      );
    }

    return report;
  }
}
