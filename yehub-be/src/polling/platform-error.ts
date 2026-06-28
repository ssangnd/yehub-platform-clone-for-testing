export enum PlatformErrorCode {
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_FOUND = 'NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  BAD_RESPONSE = 'BAD_RESPONSE',
  PROXY_ERROR = 'PROXY_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export class PlatformError extends Error {
  constructor(
    public readonly code: PlatformErrorCode,
    message: string,
    public readonly retryAfterMs?: number,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}
