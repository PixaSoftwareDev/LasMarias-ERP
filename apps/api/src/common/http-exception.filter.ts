import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

// Filtro global de excepciones. Estandariza el shape de error que recibe el front.
// CLAUDE.md §5.1 — "Errores que ayudan, no que culpan": el front lee `message`
// y lo muestra tal cual, así que la API tiene que devolver mensajes en español.

interface ErrorResponseBody {
  statusCode: number;
  message: string;
  errors?: Record<string, string[] | undefined>;
  path: string;
  timestamp: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Ocurrió un error inesperado. Probá de nuevo en un momento.';
    let errors: Record<string, string[] | undefined> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as { message?: unknown; errors?: Record<string, string[]> };
        if (typeof r.message === 'string') message = r.message;
        else if (Array.isArray(r.message)) message = r.message.join('. ');
        if (r.errors) errors = r.errors;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error('Excepción desconocida', JSON.stringify(exception));
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(errors ? { errors } : {}),
    };

    response.status(status).json(body);
  }
}
