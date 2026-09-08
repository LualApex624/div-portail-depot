import { Request } from 'express';

/**
 * IP du client derriere le reverse proxy.
 *
 * `trust proxy` est active sur l'application, donc `req.ip` tient deja compte
 * de X-Forwarded-For. Cette fonction ne sert qu'a garantir une valeur non
 * nulle en entree du hachage d'audit.
 */
export function clientIp(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}
