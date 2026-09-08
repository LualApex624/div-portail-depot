import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStoreService } from '../object-store/object-store.service';

/**
 * Deux sondes distinctes, parce qu'elles repondent a deux questions
 * differentes : "le process tourne-t-il" et "peut-il servir du trafic".
 * install.sh attend la seconde avant d'afficher les URLs.
 */
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStore: ObjectStoreService,
  ) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: string; database: boolean; objectStore: boolean }> {
    const [database, objectStore] = await Promise.all([
      this.prisma
        .$queryRaw`SELECT 1`.then(() => true)
        .catch(() => false),
      this.objectStore.isReachable(),
    ]);

    if (!database || !objectStore) {
      throw new ServiceUnavailableException({ status: 'degraded', database, objectStore });
    }

    return { status: 'ready', database, objectStore };
  }
}
