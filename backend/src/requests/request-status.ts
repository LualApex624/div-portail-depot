import { RequestStatus } from '@prisma/client';

export interface ExpirableRequest {
  status: RequestStatus;
  expiresAt: Date;
}

/**
 * Statut reellement opposable, calcule a la lecture.
 *
 * Le reaper passe les demandes a EXPIRED toutes les minutes ; entre deux
 * passages, une demande peut etre echue sans que la colonne le dise encore.
 * Toute decision d'acces s'appuie donc sur cette fonction, jamais sur la
 * seule valeur stockee. Le stockage suit, il ne fait pas autorite.
 */
export function effectiveStatus(request: ExpirableRequest, now: Date = new Date()): RequestStatus {
  if (request.status === RequestStatus.EXPIRED) {
    return RequestStatus.EXPIRED;
  }
  if (request.expiresAt <= now) {
    return RequestStatus.EXPIRED;
  }
  return request.status;
}

/**
 * Une demande echue est definitivement close. C'est un etat different du
 * verrouillage, qui est temporaire : ne pas les confondre est ce qui permet
 * de repondre 403 "reessayez plus tard" plutot que 401 "lien invalide".
 */
export function isExpired(request: ExpirableRequest, now: Date = new Date()): boolean {
  return effectiveStatus(request, now) === RequestStatus.EXPIRED;
}

/** Une demande echue ou verrouillee n'accepte plus aucun depot. */
export function isOpenForDeposit(request: ExpirableRequest, now: Date = new Date()): boolean {
  const status = effectiveStatus(request, now);
  return status === RequestStatus.PENDING || status === RequestStatus.COMPLETE;
}
