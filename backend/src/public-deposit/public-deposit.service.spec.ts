import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { DepositRequest, RequestStatus } from '@prisma/client';
import { PublicDepositService } from './public-deposit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStoreService } from '../object-store/object-store.service';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import { CryptoService } from '../crypto/crypto.service';
import {
  auditStub,
  configStub,
  counterValue,
  cryptoStub,
  loggerStub,
  metricsStub,
  requestStub,
} from '../testing/test-doubles';

// Argon2id est volontairement lent (19 MiB, 2 passes) : c'est ce qui protege
// le PIN. Les tests qui le sollicitent ont donc besoin de plus de 5 s.
jest.setTimeout(30_000);

const VALID_PIN = '48160000';
const TOKEN = 'token-de-test';

function buildRequest(overrides: Partial<DepositRequest> = {}): DepositRequest {
  return {
    id: 'req_1',
    title: 'Dossier Martin, pieces 2026',
    tokenHash: '',
    pinHash: '',
    expiresAt: new Date(Date.now() + 3600_000),
    status: RequestStatus.PENDING,
    failedPinAttempts: 0,
    lockedUntil: null,
    purgedAt: null,
    userId: 'user_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

interface Harness {
  service: PublicDepositService;
  prisma: {
    depositRequest: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    depositSession: { create: jest.Mock; deleteMany: jest.Mock; findUnique: jest.Mock };
    uploadedFile: { count: jest.Mock; create: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  metrics: MetricsService;
  crypto: CryptoService;
  audit: ReturnType<typeof auditStub>;
}

function createHarness(depositRequest: DepositRequest): Harness {
  const crypto = cryptoStub();
  const metrics = metricsStub();
  const audit = auditStub();

  const stored = { ...depositRequest, tokenHash: crypto.hashHighEntropySecret(TOKEN) };

  const prisma = {
    depositRequest: {
      findUnique: jest.fn().mockResolvedValue(stored),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...stored, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...stored, files: [] }),
    },
    depositSession: {
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    uploadedFile: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };

  const service = new PublicDepositService(
    prisma as unknown as PrismaService,
    crypto,
    {} as ObjectStoreService,
    audit as unknown as AuditService,
    metrics,
    loggerStub(),
    configStub(),
  );

  return { service, prisma, metrics, crypto, audit };
}

describe('Verification du PIN', () => {
  it('ouvre une session de depot avec le bon PIN et remet le compteur a zero', async () => {
    const crypto = cryptoStub();
    const pinHash = await crypto.hashLowEntropySecret(VALID_PIN);
    const harness = createHarness(buildRequest({ pinHash, failedPinAttempts: 3 }));

    const result = await harness.service.unlock(TOKEN, { pin: VALID_PIN }, requestStub());

    expect(result.sessionId).toHaveLength(43); // 32 octets en base64url
    expect(result.view.title).toBe('Dossier Martin, pieces 2026');
    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(1);

    const [operations] = harness.prisma.$transaction.mock.calls[0];
    expect(operations).toHaveLength(2);
    expect(harness.prisma.depositRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { failedPinAttempts: 0, lockedUntil: null } }),
    );
  });

  it('refuse un PIN incorrect et incremente le compteur d echecs', async () => {
    const crypto = cryptoStub();
    const pinHash = await crypto.hashLowEntropySecret(VALID_PIN);
    const harness = createHarness(buildRequest({ pinHash, failedPinAttempts: 1 }));

    await expect(
      harness.service.unlock(TOKEN, { pin: '00000000' }, requestStub()),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(harness.prisma.depositRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failedPinAttempts: 2 }) }),
    );
    await expect(counterValue(harness.metrics, 'pin_failures_total')).resolves.toBe(1);
  });

  it('renvoie le meme message pour un PIN faux et un lien inconnu (pas d oracle)', async () => {
    const crypto = cryptoStub();
    const pinHash = await crypto.hashLowEntropySecret(VALID_PIN);
    const harness = createHarness(buildRequest({ pinHash }));

    const wrongPin = await harness.service
      .unlock(TOKEN, { pin: '00000000' }, requestStub())
      .catch((error: UnauthorizedException) => error.message);

    harness.prisma.depositRequest.findUnique.mockResolvedValueOnce(null);
    const unknownLink = await harness.service
      .unlock(TOKEN, { pin: VALID_PIN }, requestStub())
      .catch((error: UnauthorizedException) => error.message);

    expect(wrongPin).toBe(unknownLink);
  });
});

describe('Lockout apres tentatives repetees', () => {
  it('verrouille la demande au cinquieme echec et revoque les sessions ouvertes', async () => {
    const crypto = cryptoStub();
    const pinHash = await crypto.hashLowEntropySecret(VALID_PIN);
    const harness = createHarness(buildRequest({ pinHash, failedPinAttempts: 4 }));

    await expect(
      harness.service.unlock(TOKEN, { pin: '11111111' }, requestStub()),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const [[updateArgs]] = harness.prisma.depositRequest.update.mock.calls;
    expect(updateArgs.data.failedPinAttempts).toBe(5);
    expect(updateArgs.data.status).toBe(RequestStatus.LOCKED);
    expect(updateArgs.data.lockedUntil).toBeInstanceOf(Date);

    expect(harness.prisma.depositSession.deleteMany).toHaveBeenCalledWith({
      where: { requestId: 'req_1' },
    });
    await expect(counterValue(harness.metrics, 'pin_lockouts_total')).resolves.toBe(1);
  });

  it('refuse le deverrouillage tant que le verrou court, meme avec le bon PIN', async () => {
    const crypto = cryptoStub();
    const pinHash = await crypto.hashLowEntropySecret(VALID_PIN);
    const harness = createHarness(
      buildRequest({
        pinHash,
        failedPinAttempts: 5,
        status: RequestStatus.LOCKED,
        lockedUntil: new Date(Date.now() + 10 * 60_000),
      }),
    );

    await expect(
      harness.service.unlock(TOKEN, { pin: VALID_PIN }, requestStub()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rouvre la demande une fois le delai de verrouillage ecoule', async () => {
    const crypto = cryptoStub();
    const pinHash = await crypto.hashLowEntropySecret(VALID_PIN);
    const harness = createHarness(
      buildRequest({
        pinHash,
        failedPinAttempts: 5,
        status: RequestStatus.LOCKED,
        lockedUntil: new Date(Date.now() - 1000),
      }),
    );

    const result = await harness.service.unlock(TOKEN, { pin: VALID_PIN }, requestStub());
    expect(result.sessionId).toBeTruthy();
  });
});

describe('Etat du lien avant saisie du PIN', () => {
  it('confond lien inconnu et lien expire sous un statut unique', async () => {
    const harness = createHarness(buildRequest());

    harness.prisma.depositRequest.findUnique.mockResolvedValueOnce(null);
    await expect(harness.service.describeLink(TOKEN, requestStub())).resolves.toEqual({
      status: 'UNAVAILABLE',
    });

    harness.prisma.depositRequest.findUnique.mockResolvedValueOnce(
      buildRequest({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(harness.service.describeLink(TOKEN, requestStub())).resolves.toEqual({
      status: 'UNAVAILABLE',
    });
  });

  it('signale explicitement un lien verrouille', async () => {
    const harness = createHarness(buildRequest());
    harness.prisma.depositRequest.findUnique.mockResolvedValueOnce(
      buildRequest({ status: RequestStatus.LOCKED, lockedUntil: new Date(Date.now() + 60_000) }),
    );

    await expect(harness.service.describeLink(TOKEN, requestStub())).resolves.toEqual({
      status: 'LOCKED',
    });
  });

  it('expose un lien ouvert comme disponible', async () => {
    const harness = createHarness(buildRequest());
    await expect(harness.service.describeLink(TOKEN, requestStub())).resolves.toEqual({
      status: 'AVAILABLE',
    });
  });
});

describe('Session de depot', () => {
  it('refuse de rejouer une session valide sur le lien d une autre demande', async () => {
    const harness = createHarness(buildRequest());
    const sessionId = 'session-de-test';

    harness.prisma.depositSession.findUnique.mockResolvedValueOnce({
      idHash: harness.crypto.hashHighEntropySecret(sessionId),
      requestId: 'req_1',
      consumed: false,
      expiresAt: new Date(Date.now() + 60_000),
      request: buildRequest({ tokenHash: harness.crypto.hashHighEntropySecret('autre-token') }),
    });

    await expect(harness.service.resolveSession(sessionId, TOKEN)).resolves.toBeNull();
  });

  it('refuse une session dont la demande a expire entre-temps', async () => {
    const harness = createHarness(buildRequest());
    const sessionId = 'session-de-test';

    harness.prisma.depositSession.findUnique.mockResolvedValueOnce({
      idHash: harness.crypto.hashHighEntropySecret(sessionId),
      requestId: 'req_1',
      consumed: false,
      expiresAt: new Date(Date.now() + 60_000),
      request: buildRequest({
        tokenHash: harness.crypto.hashHighEntropySecret(TOKEN),
        expiresAt: new Date(Date.now() - 1),
      }),
    });

    await expect(harness.service.resolveSession(sessionId, TOKEN)).resolves.toBeNull();
  });

  it('refuse une session expiree', async () => {
    const harness = createHarness(buildRequest());
    const sessionId = 'session-de-test';

    harness.prisma.depositSession.findUnique.mockResolvedValueOnce({
      idHash: harness.crypto.hashHighEntropySecret(sessionId),
      requestId: 'req_1',
      consumed: false,
      expiresAt: new Date(Date.now() - 1),
      request: buildRequest({ tokenHash: harness.crypto.hashHighEntropySecret(TOKEN) }),
    });

    await expect(harness.service.resolveSession(sessionId, TOKEN)).resolves.toBeNull();
  });
});
