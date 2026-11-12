/**
 * Error codes returned by the API in the standard error envelope:
 * `{ error: { code, message, details? } }`
 */
export const errorCodes = [
  // generic
  'INTERNAL_ERROR',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',

  // domain
  'SERVER_NOT_FOUND',
  'APP_NOT_FOUND',
  'DEPLOYMENT_NOT_FOUND',
  'INCIDENT_NOT_FOUND',
  'POLICY_NOT_FOUND',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

/** Shape of the `error` field in every API error response. */
export type ApiError = {
  code: ErrorCode;
  message: string;
  details?: unknown;
};

/** Full error response envelope. */
export type ApiErrorResponse = { error: ApiError };
