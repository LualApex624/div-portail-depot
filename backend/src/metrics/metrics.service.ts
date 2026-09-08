import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Perimetre d'observabilite : volontairement court.
 *
 * On expose ce qui menace le parcours, pas un inventaire :
 *  - HTTP (taux, latence, 5xx) : sante technique et base de l'alerte ;
 *  - PIN echoues / lockouts : signal d'attaque sur le seul secret devinable ;
 *  - uploads echoues par motif : le point ou le parcours casse cote client ;
 *  - objets purges : preuve que l'expiration detruit vraiment les donnees.
 *
 * Aucun label a forte cardinalite (jamais de token, jamais d'id de demande).
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequests = new Counter({
    name: 'http_requests_total',
    help: 'Nombre de requetes HTTP traitees',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duree des requetes HTTP',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  readonly pinFailures = new Counter({
    name: 'pin_failures_total',
    help: 'Tentatives de deverrouillage avec un PIN invalide',
    registers: [this.registry],
  });

  readonly pinLockouts = new Counter({
    name: 'pin_lockouts_total',
    help: 'Demandes verrouillees apres depassement du nombre de tentatives',
    registers: [this.registry],
  });

  readonly uploadsCompleted = new Counter({
    name: 'uploads_completed_total',
    help: 'Pieces acceptees apres verification du type reel',
    registers: [this.registry],
  });

  readonly uploadsFailed = new Counter({
    name: 'uploads_failed_total',
    help: 'Pieces rejetees, par motif',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });

  readonly purgedObjects = new Counter({
    name: 'purge_deleted_objects_total',
    help: 'Objets physiquement supprimes du stockage par le reaper',
    registers: [this.registry],
  });

  readonly purgedRequests = new Counter({
    name: 'purge_expired_requests_total',
    help: 'Demandes passees a EXPIRED par le reaper',
    registers: [this.registry],
  });

  readonly requestsCreated = new Counter({
    name: 'deposit_requests_created_total',
    help: 'Demandes de depot creees par les avocats',
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'div_' });
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
