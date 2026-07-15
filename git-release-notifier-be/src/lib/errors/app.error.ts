export const ErrorCode = {
  ALREADY_SUBSCRIBED: 'ALREADY_SUBSCRIBED',
  REPOSITORY_NOT_FOUND: 'REPOSITORY_NOT_FOUND',
  INVALID_CONFIRM_TOKEN: 'INVALID_CONFIRM_TOKEN',
  INVALID_UNSUBSCRIBE_TOKEN: 'INVALID_UNSUBSCRIBE_TOKEN',
  EMAIL_REQUIRED: 'EMAIL_REQUIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  GITHUB_UNAVAILABLE: 'GITHUB_UNAVAILABLE',
  GITHUB_RATE_LIMITED: 'GITHUB_RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AppErrorOptions {
  isOperational?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;

  public readonly statusCode: number;

  public readonly isOperational: boolean;

  constructor(code: ErrorCode, statusCode = 500, options: AppErrorOptions = {}) {
    super(code, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = options.isOperational ?? true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(code: ErrorCode = ErrorCode.REPOSITORY_NOT_FOUND, options?: AppErrorOptions) {
    super(code, 404, options);
  }
}

export class ValidationError extends AppError {
  constructor(code: ErrorCode = ErrorCode.EMAIL_REQUIRED, options?: AppErrorOptions) {
    super(code, 400, options);
  }
}

export class ConflictError extends AppError {
  constructor(code: ErrorCode = ErrorCode.ALREADY_SUBSCRIBED, options?: AppErrorOptions) {
    super(code, 409, options);
  }
}

export class GithubError extends AppError {
  constructor(code: ErrorCode = ErrorCode.GITHUB_UNAVAILABLE, options?: AppErrorOptions) {
    super(code, 502, options);
  }
}

export class GithubRateLimitError extends AppError {
  constructor(options?: AppErrorOptions) {
    super(ErrorCode.GITHUB_RATE_LIMITED, 429, options);
  }
}

export class UnauthorizedError extends AppError {
  constructor(code: ErrorCode = ErrorCode.UNAUTHORIZED, options?: AppErrorOptions) {
    super(code, 401, options);
  }
}
