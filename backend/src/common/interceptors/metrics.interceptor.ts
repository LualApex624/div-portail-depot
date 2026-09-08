import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { MetricsService } from '../../metrics/metrics.service';

/**
 * Instrumente toutes les routes HTTP.
 *
 * La mesure est prise sur l'evenement `finish` de la reponse, et non a la
 * sortie du handler : sinon les requetes traitees par le filtre d'exception
 * seraient comptees avec le statut 200 encore present sur la reponse.
 *
 * Le label `route` utilise le motif de route (/public/:token/unlock) et non
 * l'URL brute : sinon chaque token creerait une serie temporelle.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const stopTimer = this.metrics.httpDuration.startTimer();

    response.once('finish', () => {
      const labels = {
        method: request.method,
        route: request.route?.path ?? 'unmatched',
        status: String(response.statusCode),
      };
      stopTimer(labels);
      this.metrics.httpRequests.inc(labels);
    });

    return next.handle();
  }
}
