import { BadRequestException } from '@nestjs/common';
import { FileStatus, RequestStatus } from '@prisma/client';
import { PublicDepositService } from './public-deposit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStoreService } from '../object-store/object-store.service';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import {
  auditStub,
  configStub,
  counterValue,
  cryptoStub,
  loggerStub,
  metricsStub,
  requestStub,
} from '../testing/test-doubles';

const PDF_HEAD = Buffer.from('%PDF-1.7 contenu du contrat');
const EXE_HEAD = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);

function createHarness() {
  const metrics = metricsStub();
  const audit = auditStub();

  const prisma = {
    uploadedFile: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'file_1' }),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'file_1',
          filename: 'contrat-signe.pdf',
          size: 1024,
          mimeType: 'application/pdf',
          rejectionReason: null,
          status: FileStatus.PENDING,
          ...data,
        }),
      ),
      findFirst: jest.fn().mockResolvedValue({
        id: 'file_1',
        requestId: 'req_1',
        filename: 'contrat-signe.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        status: FileStatus.PENDING,
        objectKey: 'quarantine/req_1/file_1',
        rejectionReason: null,
      }),
    },
    depositRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };

  const objectStore = {
    quarantineKey: (requestId: string, fileId: string) => `quarantine/${requestId}/${fileId}`,
    depositKey: (requestId: string, fileId: string) => `deposits/${requestId}/${fileId}`,
    presignPut: jest.fn().mockResolvedValue('https://storage.local/put'),
    head: jest.fn().mockResolvedValue({ size: 1024, etag: 'abc' }),
    readHead: jest.fn().mockResolvedValue(PDF_HEAD),
    copy: jest.fn().mockResolvedValue(undefined),
    deleteKeys: jest.fn().mockResolvedValue(1),
  };

  const service = new PublicDepositService(
    prisma as unknown as PrismaService,
    cryptoStub(),
    objectStore as unknown as ObjectStoreService,
    audit as unknown as AuditService,
    metrics as MetricsService,
    loggerStub(),
    configStub(),
  );

  return { service, prisma, objectStore, metrics, audit };
}

describe('Ouverture d un depot (init)', () => {
  it('signe une URL de depot direct vers la quarantaine', async () => {
    const { service, objectStore } = createHarness();

    const result = await service.initUpload(
      'req_1',
      { filename: 'contrat-signe.pdf', mimeType: 'application/pdf', size: 1024 },
      requestStub(),
    );

    expect(result).toEqual({
      fileId: 'file_1',
      uploadUrl: 'https://storage.local/put',
      expiresInSeconds: 300,
    });
    // Le binaire ne traverse jamais l API : elle ne fait que signer.
    expect(objectStore.presignPut).toHaveBeenCalledWith(
      'quarantine/req_1/file_1',
      'application/pdf',
      1024,
    );
  });

  it('derive la cle objet de l id genere, jamais du nom fourni', async () => {
    const { service, prisma, objectStore } = createHarness();

    await service.initUpload(
      'req_1',
      { filename: '../../etc/passwd', mimeType: 'application/pdf', size: 10 },
      requestStub(),
    );

    const [{ data }] = prisma.uploadedFile.create.mock.calls[0];
    expect(data.filename).toBe('._._etc_passwd');
    expect(objectStore.presignPut).toHaveBeenCalledWith(
      'quarantine/req_1/file_1',
      expect.anything(),
      expect.anything(),
    );
  });

  it('refuse un fichier au-dela de la taille maximale', async () => {
    const { service, objectStore, metrics } = createHarness();

    await expect(
      service.initUpload(
        'req_1',
        { filename: 'gros.pdf', mimeType: 'application/pdf', size: 26_214_401 },
        requestStub(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(objectStore.presignPut).not.toHaveBeenCalled();
    await expect(counterValue(metrics, 'uploads_failed_total', { reason: 'size' })).resolves.toBe(
      1,
    );
  });

  it('refuse un type declare hors allowlist', async () => {
    const { service, objectStore } = createHarness();

    await expect(
      service.initUpload(
        'req_1',
        { filename: 'script.sh', mimeType: 'application/x-sh', size: 10 },
        requestStub(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(objectStore.presignPut).not.toHaveBeenCalled();
  });

  it('refuse au-dela du quota de pieces', async () => {
    const { service, prisma, objectStore } = createHarness();
    prisma.uploadedFile.count.mockResolvedValueOnce(10);

    await expect(
      service.initUpload(
        'req_1',
        { filename: 'onzieme.pdf', mimeType: 'application/pdf', size: 10 },
        requestStub(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(objectStore.presignPut).not.toHaveBeenCalled();
  });
});

describe('Finalisation d un depot (complete)', () => {
  it('promeut la piece de la quarantaine vers le prefixe definitif', async () => {
    const { service, objectStore, prisma, metrics } = createHarness();

    const result = await service.completeUpload('req_1', 'file_1', requestStub());

    expect(objectStore.copy).toHaveBeenCalledWith(
      'quarantine/req_1/file_1',
      'deposits/req_1/file_1',
    );
    expect(objectStore.deleteKeys).toHaveBeenCalledWith(['quarantine/req_1/file_1']);
    expect(result.file.status).toBe(FileStatus.ACCEPTED);
    await expect(counterValue(metrics, 'uploads_completed_total')).resolves.toBe(1);

    // Premiere piece acceptee : la demande passe a COMPLETE.
    expect(prisma.depositRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req_1', status: RequestStatus.PENDING },
      data: { status: RequestStatus.COMPLETE },
    });
  });

  it('rejette et efface un executable maquille en PDF', async () => {
    const { service, objectStore, prisma, metrics } = createHarness();
    objectStore.readHead.mockResolvedValueOnce(EXE_HEAD);

    await expect(
      service.completeUpload('req_1', 'file_1', requestStub()),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Rejete ne suffit pas : l objet est detruit.
    expect(objectStore.deleteKeys).toHaveBeenCalledWith(['quarantine/req_1/file_1']);
    expect(objectStore.copy).not.toHaveBeenCalled();

    const [{ data }] = prisma.uploadedFile.update.mock.calls.at(-1)!;
    expect(data.status).toBe(FileStatus.REJECTED);
    await expect(
      counterValue(metrics, 'uploads_failed_total', { reason: 'mime_real' }),
    ).resolves.toBe(1);
  });

  it('rejette un PNG televerse a la place du PDF annonce', async () => {
    const { service, objectStore } = createHarness();
    objectStore.readHead.mockResolvedValueOnce(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );

    await expect(
      service.completeUpload('req_1', 'file_1', requestStub()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(objectStore.copy).not.toHaveBeenCalled();
  });

  it('rejette une taille reelle differente de la taille annoncee', async () => {
    const { service, objectStore, metrics } = createHarness();
    objectStore.head.mockResolvedValueOnce({ size: 999_999, etag: 'abc' });

    await expect(
      service.completeUpload('req_1', 'file_1', requestStub()),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(objectStore.readHead).not.toHaveBeenCalled();
    await expect(
      counterValue(metrics, 'uploads_failed_total', { reason: 'size_mismatch' }),
    ).resolves.toBe(1);
  });

  it('rejette une finalisation sans objet reellement televerse', async () => {
    const { service, objectStore } = createHarness();
    objectStore.head.mockResolvedValueOnce(null);

    await expect(
      service.completeUpload('req_1', 'file_1', requestStub()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(objectStore.copy).not.toHaveBeenCalled();
  });

  it('est idempotent sur une piece deja acceptee', async () => {
    const { service, prisma, objectStore } = createHarness();
    prisma.uploadedFile.findFirst.mockResolvedValueOnce({
      id: 'file_1',
      requestId: 'req_1',
      filename: 'contrat-signe.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      status: FileStatus.ACCEPTED,
      objectKey: 'deposits/req_1/file_1',
      rejectionReason: null,
    });

    const result = await service.completeUpload('req_1', 'file_1', requestStub());

    expect(result.file.status).toBe(FileStatus.ACCEPTED);
    expect(objectStore.copy).not.toHaveBeenCalled();
  });
});
