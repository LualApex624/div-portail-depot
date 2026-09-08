import { NotFoundException } from '@nestjs/common';
import { FileStatus, RequestStatus } from '@prisma/client';
import { RequestsService } from './requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStoreService } from '../object-store/object-store.service';
import { AuditService } from '../audit/audit.service';
import {
  auditStub,
  configStub,
  cryptoStub,
  metricsStub,
  requestStub,
} from '../testing/test-doubles';

jest.setTimeout(30_000);

function createHarness() {
  const crypto = cryptoStub();
  const audit = auditStub();

  const prisma = {
    depositRequest: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'req_1',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
      ),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    uploadedFile: { findFirst: jest.fn().mockResolvedValue(null) },
    // Le vrai $transaction execute les operations passees : on garde ce
    // comportement pour que les mocks de findMany/count soient effectifs.
    $transaction: jest.fn().mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };

  const objectStore = {
    presignGet: jest.fn().mockResolvedValue('https://storage.local/signed'),
  };

  const service = new RequestsService(
    prisma as unknown as PrismaService,
    crypto,
    objectStore as unknown as ObjectStoreService,
    audit as unknown as AuditService,
    metricsStub(),
    configStub(),
  );

  return { service, prisma, objectStore, crypto, audit };
}

describe('Creation d une demande', () => {
  it('renvoie le lien et le PIN une seule fois, et ne stocke que des empreintes', async () => {
    const { service, prisma, crypto } = createHarness();

    const created = await service.create(
      'user_1',
      { title: 'Dossier Martin, pieces 2026', expiresInHours: 72 },
      requestStub(),
    );

    expect(created.pin).toMatch(/^\d{8}$/);
    expect(created.url).toMatch(/^http:\/\/localhost:3000\/d\/[A-Za-z0-9_-]{43}$/);

    const [{ data }] = prisma.depositRequest.create.mock.calls[0];
    const token = created.url.split('/d/')[1];

    // Ni le token ni le PIN en clair ne doivent atteindre la base.
    expect(data.tokenHash).toBe(crypto.hashHighEntropySecret(token));
    expect(data.tokenHash).not.toBe(token);
    expect(data.pinHash.startsWith('$argon2id$')).toBe(true);
    expect(JSON.stringify(data)).not.toContain(created.pin);
  });

  it('positionne l expiration a la duree demandee', async () => {
    const { service, prisma } = createHarness();
    const before = Date.now();

    await service.create('user_1', { title: 'Dossier test', expiresInHours: 24 }, requestStub());

    const [{ data }] = prisma.depositRequest.create.mock.calls[0];
    const delta = data.expiresAt.getTime() - before;
    expect(delta).toBeGreaterThan(23.9 * 3600_000);
    expect(delta).toBeLessThan(24.1 * 3600_000);
  });
});

describe('Isolation entre avocats', () => {
  it('filtre le dashboard sur l avocat courant', async () => {
    const { service, prisma } = createHarness();

    await service.list('user_1', { page: 2, pageSize: 10 });

    expect(prisma.depositRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1' }, skip: 10, take: 10 }),
    );
    expect(prisma.depositRequest.count).toHaveBeenCalledWith({ where: { userId: 'user_1' } });
  });

  it('renvoie 404 quand la demande appartient a un confrere', async () => {
    const { service, prisma } = createHarness();
    prisma.depositRequest.findFirst.mockResolvedValueOnce(null);

    await expect(service.findOne('user_2', 'req_1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.depositRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'req_1', userId: 'user_2' } }),
    );
  });

  it('ne signe jamais une URL de telechargement pour la piece d un confrere', async () => {
    const { service, prisma, objectStore } = createHarness();
    prisma.uploadedFile.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.issueDownloadUrl('user_2', 'req_1', 'file_1', requestStub()),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(objectStore.presignGet).not.toHaveBeenCalled();
    expect(prisma.uploadedFile.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'file_1',
        requestId: 'req_1',
        request: { userId: 'user_2' },
        status: FileStatus.ACCEPTED,
      },
    });
  });

  it('signe une URL courte pour une piece acceptee du bon avocat', async () => {
    const { service, prisma, objectStore } = createHarness();
    prisma.uploadedFile.findFirst.mockResolvedValueOnce({
      id: 'file_1',
      objectKey: 'deposits/req_1/file_1',
      filename: 'contrat-signe.pdf',
    });

    const result = await service.issueDownloadUrl('user_1', 'req_1', 'file_1', requestStub());

    expect(result).toEqual({ url: 'https://storage.local/signed', expiresInSeconds: 60 });
    expect(objectStore.presignGet).toHaveBeenCalledWith(
      'deposits/req_1/file_1',
      'contrat-signe.pdf',
    );
  });
});

describe('Statut presente au dashboard', () => {
  it('affiche EXPIRED des que la date est passee, sans attendre le reaper', async () => {
    const { service, prisma } = createHarness();
    prisma.depositRequest.findMany.mockResolvedValueOnce([
      {
        id: 'req_1',
        title: 'Dossier echu',
        status: RequestStatus.PENDING,
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
        files: [{ status: FileStatus.ACCEPTED }],
      },
    ]);
    prisma.depositRequest.count.mockResolvedValueOnce(1);

    const result = await service.list('user_1', { page: 1, pageSize: 10 });

    expect(result.items[0].status).toBe(RequestStatus.EXPIRED);
    expect(result.items[0].acceptedCount).toBe(1);
  });
});
