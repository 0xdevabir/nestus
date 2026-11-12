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
  'USER_NOT_FOUND',
  'ORG_NOT_FOUND',
  'MEMBER_NOT_FOUND',
  'INVITATION_NOT_FOUND',
  'INVITATION_EXPIRED',
  'API_KEY_NOT_FOUND',
  'SESSION_REVOKED',
  'SERVER_NOT_FOUND',
  'CONTAINER_NOT_FOUND',
  'COMMAND_NOT_FOUND',
  'COMMAND_REJECTED',
  'ENROLLMENT_TOKEN_INVALID',
  'AGENT_OFFLINE',
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
