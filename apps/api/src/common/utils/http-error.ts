import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@nestus/shared';

export function httpError(
  status: HttpStatus,
  code: ErrorCode,
  message: string,
  details?: unknown,
): HttpException {
  return new HttpException({ code, message, details }, status);
}
