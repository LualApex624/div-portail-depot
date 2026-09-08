import { RequestStatus } from '@prisma/client';
import { ReaperService } from './reaper.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStoreService } from '../object-store/object-store.service';
import { AuditService } from '../audit/audit.service';
import {
  auditStub,
  configStub,
  counterValue,
  loggerStub,
  metricsStub,
} from '../testing/test-doubles';

function createHarness(expired: Array<{ id: string }>) {
  const metrics = metricsStub();
  const audit = auditStub();

  const prisma = {
    depositRequest: {
      findMany: jest.fn().mockResolvedValue(expired),
      update: jest.fn().mockResolvedValue({}),
    },
    depositSession: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    authSession: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    uploadedFile: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
  };

  const objectStore = { deletePrefix: jest.fn().mockResolvedValue(3) };

  const service = new ReaperService(
    prisma as unknown as PrismaService,
    objectStore as unknown as ObjectStoreService,
    audit as unknown as AuditService,
    metrics,
    loggerStub(),
    configStub({ REAPER_ENABLED: false, REAPER_CRON: '0 * * * * *' }),
  );

  return { service, prisma, objectStore, metrics, audit };
}

describe('Purge physique a l expiration', () => {
  it('supprime les objets des deux prefixes avant de marquer la demande', async () => {
    const { service, objectStore, prisma } = createHarness([{ id: 'req_1' }]);

    const report = await service.purgeExpired();

    expect(objectStore.deletePrefix).toHaveBeenCalledWith('quarantine/req_1/');
    expect(objectStore.deletePrefix).toHaveBeenCalledWith('deposits/req_1/');
    expect(report.objectsDeleted).toBe(6);

    // L ordre est un invariant : les objets partent avant le marquage, pour
    // qu un plantage laisse la demande a reprendre au passage suivant.
    const deleteOrder = objectStore.deletePrefix.mock.invocationCallOrder[0];
    const updateOrder = prisma.depositRequest.update.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(updateOrder);
  });

  it('revoque les sessions de depot encore ouvertes', async () => {
    const { service, prisma } = createHarness([{ id: 'req_1' }]);

    const report = await service.purgeExpired();

    expect(prisma.depositSession.deleteMany).toHaveBeenCalledWith({
      where: { requestId: 'req_1' },
    });
    expect(report.sessionsRevoked).toBe(2);
  });

  it('efface aussi les metadonnees des pieces, nom de fichier compris', async () => {
    // Un nom de fichier est une donnee personnelle a lui seul : effacer
    // l objet en gardant la fiche laisserait le plus parlant en base.
    const { service, prisma } = createHarness([{ id: 'req_1' }]);

    const report = await service.purgeExpired();

    expect(prisma.uploadedFile.deleteMany).toHaveBeenCalledWith({
      where: { requestId: 'req_1' },
    });
    expect(report.filesForgotten).toBe(3);
  });

  it('marque la demande EXPIRED et horodate la destruction', async () => {
    const { service, prisma } = createHarness([{ id: 'req_1' }]);

    await service.purgeExpired();

    const [{ data, where }] = prisma.depositRequest.update.mock.calls[0];
    expect(where).toEqual({ id: 'req_1' });
    expect(data.status).toBe(RequestStatus.EXPIRED);
    expect(data.purgedAt).toBeInstanceOf(Date);
  });

  it('ne reprend jamais une demande deja purgee', async () => {
    const { service, prisma } = createHarness([]);

    await service.purgeExpired();

    const [{ where }] = prisma.depositRequest.findMany.mock.calls[0];
    expect(where.purgedAt).toBeNull();
    expect(where.expiresAt.lt).toBeInstanceOf(Date);
  });

  it('compte les objets detruits dans les metriques', async () => {
    const { service, metrics } = createHarness([{ id: 'req_1' }, { id: 'req_2' }]);

    await service.purgeExpired();

    await expect(counterValue(metrics, 'purge_deleted_objects_total')).resolves.toBe(12);
    await expect(counterValue(metrics, 'purge_expired_requests_total')).resolves.toBe(2);
  });

  it('journalise une ligne d audit PURGE par demande', async () => {
    const { service, audit } = createHarness([{ id: 'req_1' }]);

    await service.purgeExpired();

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PURGE', result: 'SUCCESS', requestId: 'req_1' }),
    );
  });

  it('ne lance pas deux passages concurrents', async () => {
    const { service, prisma } = createHarness([{ id: 'req_1' }]);

    await Promise.all([service.runOnce(), service.runOnce()]);

    expect(prisma.depositRequest.update).toHaveBeenCalledTimes(1);
  });

  it('avale une erreur de stockage sans faire tomber le job', async () => {
    const { service, objectStore } = createHarness([{ id: 'req_1' }]);
    objectStore.deletePrefix.mockRejectedValueOnce(new Error('Garage injoignable'));

    await expect(service.runOnce()).resolves.toEqual({
      requestsPurged: 0,
      objectsDeleted: 0,
      sessionsRevoked: 0,
      filesForgotten: 0,
    });
  });
});
