import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as crypto from 'crypto';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorId = crypto.randomUUID();
    const isProduction = process.env.NODE_ENV === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorResponse: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        errorResponse = res;
        message = (res as any).message || exception.message;
      }
    } else if (exception instanceof Error) {
      if (!isProduction) {
        message = exception.message;
      }
    }

    // Server-side structured audit logging (never logs passwords or tokens)
    const logDetails = {
      errorId,
      path: request.url,
      method: request.method,
      status,
      timestamp: new Date().toISOString(),
      clientIp: request.ip,
      error: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    };

    if (status >= 500) {
      this.logger.error(`[${errorId}] 500 Internal Error on ${request.method} ${request.url}: ${logDetails.error}`, logDetails.stack);
    } else {
      this.logger.warn(`[${errorId}] ${status} ${request.method} ${request.url}: ${message}`);
    }

    // Hardened client payload: Never expose stack traces or DB details in production
    const payload: Record<string, any> = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      errorId,
      message,
    };

    if (errorResponse && typeof errorResponse === 'object') {
      if (errorResponse.errors) {
        payload.errors = errorResponse.errors;
      }
      if (errorResponse.validationErrors) {
        payload.validationErrors = errorResponse.validationErrors;
      }
    }

    response.status(status).json(payload);
  }
}
