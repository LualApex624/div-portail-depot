import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLogger } from '../logger/app-logger.service';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
}

/**
 * Reponses d'erreur uniformes.
 *
 * Deux objectifs : ne jamais renvoyer de stack trace ni de detail interne au
 * client, et loguer l'erreur reelle cote serveur avec le requestId.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toErrorBody(exception);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.route?.path ?? request.path} -> ${body.statusCode}`,
        exception instanceof Error ? exception.stack : undefined,
        'ExceptionFilter',
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);

      return {
        statusCode: status,
        error: HttpStatus[status] ?? 'ERROR',
        message: Array.isArray(message) ? message.join(', ') : message,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Une erreur interne est survenue.',
    };
  }
}
