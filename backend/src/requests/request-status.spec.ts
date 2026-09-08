import { RequestStatus } from '@prisma/client';
import { effectiveStatus, isOpenForDeposit } from './request-status';

const at = (offsetMs: number): Date => new Date(Date.now() + offsetMs);

describe('Transitions et expiration', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');

  it('laisse PENDING tant que la demande n est pas echue', () => {
    const request = { status: RequestStatus.PENDING, expiresAt: at(3600_000) };
    expect(effectiveStatus(request)).toBe(RequestStatus.PENDING);
  });

  it('presente une demande echue comme EXPIRED avant meme le passage du reaper', () => {
    const request = { status: RequestStatus.PENDING, expiresAt: at(-1) };
    expect(effectiveStatus(request)).toBe(RequestStatus.EXPIRED);
  });

  it('expire aussi une demande deja COMPLETE', () => {
    const request = { status: RequestStatus.COMPLETE, expiresAt: at(-1000) };
    expect(effectiveStatus(request)).toBe(RequestStatus.EXPIRED);
  });

  it('traite l expiration exacte comme echue', () => {
    const request = { status: RequestStatus.PENDING, expiresAt: now };
    expect(effectiveStatus(request, now)).toBe(RequestStatus.EXPIRED);
  });

  it('reste valide une milliseconde avant l expiration', () => {
    const request = { status: RequestStatus.PENDING, expiresAt: new Date(now.getTime() + 1) };
    expect(effectiveStatus(request, now)).toBe(RequestStatus.PENDING);
  });

  it('ne ressuscite jamais une demande deja marquee EXPIRED', () => {
    const request = { status: RequestStatus.EXPIRED, expiresAt: at(3600_000) };
    expect(effectiveStatus(request)).toBe(RequestStatus.EXPIRED);
  });

  it('accepte le depot sur PENDING et COMPLETE, le refuse sinon', () => {
    expect(isOpenForDeposit({ status: RequestStatus.PENDING, expiresAt: at(1000) })).toBe(true);
    expect(isOpenForDeposit({ status: RequestStatus.COMPLETE, expiresAt: at(1000) })).toBe(true);
    expect(isOpenForDeposit({ status: RequestStatus.LOCKED, expiresAt: at(1000) })).toBe(false);
    expect(isOpenForDeposit({ status: RequestStatus.PENDING, expiresAt: at(-1000) })).toBe(false);
  });
});
