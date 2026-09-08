import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { auditStub, configStub, cryptoStub, requestStub } from '../testing/test-doubles';

jest.setTimeout(30_000);

const PASSWORD = 'DemoPass123!';

async function createHarness() {
  const crypto = cryptoStub();
  const audit = auditStub();

  const user = {
    id: 'user_1',
    email: 'demo@divprotocol.com',
    displayName: 'Maitre Demo',
    passwordHash: await crypto.hashLowEntropySecret(PASSWORD),
    sessionVersion: 0,
  };

  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    authSession: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
    },
  };

  const service = new AuthService(
    prisma as unknown as PrismaService,
    crypto,
    audit as unknown as AuditService,
    configStub(),
  );

  return { service, prisma, crypto, audit, user };
}

describe('Authentification avocat', () => {
  it('ouvre une session avec les bons identifiants', async () => {
    const { service, prisma } = await createHarness();

    const result = await service.login(
      { email: 'demo@divprotocol.com', password: PASSWORD },
      requestStub(),
    );

    expect(result.user.email).toBe('demo@divprotocol.com');
    expect(result.sessionId).toHaveLength(43);
    expect(prisma.authSession.create).toHaveBeenCalledTimes(1);

    // Seule l empreinte de la session part en base.
    const [{ data }] = prisma.authSession.create.mock.calls[0];
    expect(data.idHash).toHaveLength(64);
    expect(data.idHash).not.toBe(result.sessionId);
  });

  it('refuse un mot de passe invalide sans creer de session', async () => {
    const { service, prisma } = await createHarness();

    await expect(
      service.login({ email: 'demo@divprotocol.com', password: 'mauvais' }, requestStub()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it('renvoie le meme message pour un compte inconnu que pour un mot de passe faux', async () => {
    const { service, prisma } = await createHarness();

    const wrongPassword = await service
      .login({ email: 'demo@divprotocol.com', password: 'mauvais' }, requestStub())
      .catch((error: UnauthorizedException) => error.message);

    prisma.user.findUnique.mockResolvedValueOnce(null);
    const unknownAccount = await service
      .login({ email: 'inconnu@divprotocol.com', password: PASSWORD }, requestStub())
      .catch((error: UnauthorizedException) => error.message);

    expect(wrongPassword).toBe(unknownAccount);
  });

  it('resout une session valide', async () => {
    const { service, prisma, crypto, user } = await createHarness();

    prisma.authSession.findUnique.mockResolvedValueOnce({
      idHash: crypto.hashHighEntropySecret('sid'),
      userId: user.id,
      sessionVersion: 0,
      expiresAt: new Date(Date.now() + 3600_000),
      user,
    });

    await expect(service.resolveSession('sid')).resolves.toMatchObject({ id: 'user_1' });
  });

  it('refuse une session expiree', async () => {
    const { service, prisma, user } = await createHarness();

    prisma.authSession.findUnique.mockResolvedValueOnce({
      sessionVersion: 0,
      expiresAt: new Date(Date.now() - 1),
      user,
    });

    await expect(service.resolveSession('sid')).resolves.toBeNull();
  });

  it('revoque les sessions emises avant un changement de sessionVersion', async () => {
    const { service, prisma, user } = await createHarness();

    prisma.authSession.findUnique.mockResolvedValueOnce({
      sessionVersion: 0,
      expiresAt: new Date(Date.now() + 3600_000),
      user: { ...user, sessionVersion: 1 },
    });

    await expect(service.resolveSession('sid')).resolves.toBeNull();
  });
});
