import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import type { Response } from 'express';
import type { ApiError, ErrorCode } from '@nestus/shared';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, body } = this.toEnvelope(exception);
    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }
    response.status(status).json({ error: body });
  }

  private toEnvelope(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof ZodValidationException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: exception.getZodError().issues,
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : typeof payload === 'object' && payload !== null && 'message' in payload
            ? Array.isArray((payload as { message: unknown }).message)
              ? (payload as { message: string[] }).message.join(', ')
              : String((payload as { message: unknown }).message)
            : exception.message;

      const code =
        typeof payload === 'object' &&
        payload !== null &&
        'code' in payload &&
        typeof (payload as { code: unknown }).code === 'string'
          ? (payload as { code: ErrorCode }).code
          : this.statusToCode(status);

      const details =
        typeof payload === 'object' && payload !== null && 'details' in payload
          ? (payload as { details: unknown }).details
          : undefined;

      return { status, body: { code, message, details } };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }

  private statusToCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
