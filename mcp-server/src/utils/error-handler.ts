export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends Error {
  public resetTime?: number;

  constructor(message: string, resetTime?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.resetTime = resetTime;
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  public errors: Record<string, string[]>;

  constructor(message: string, errors: Record<string, string[]> = {}) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class NetworkError extends Error {
  public statusCode?: number;
  public retryAfter?: number;

  constructor(message: string, statusCode?: number, retryAfter?: number) {
    super(message);
    this.name = 'NetworkError';
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}

export class TimeoutError extends Error {
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class MCPError extends Error {
  public code: string;
  public details?: any;

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.name = 'MCPError';
    this.code = code;
    this.details = details;
  }
}

export function isRetryableError(error: any): boolean {
  // Network errors that can be retried
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // HTTP status codes that can be retried
  if (error.response?.status) {
    const status = error.response.status;
    // Server errors (5xx) and some client errors
    return status >= 500 || status === 408 || status === 429;
  }

  return false;
}

export function getErrorMessage(error: any): string {
  if (error.response?.data?.message) {
    return error.response.data.message;
  }

  if (error.response?.data?.error) {
    return error.response.data.error;
  }

  if (error.message) {
    return error.message;
  }

  return 'An unknown error occurred';
}

export function getErrorCode(error: any): string {
  if (error.response?.status) {
    return `HTTP_${error.response.status}`;
  }

  if (error.code) {
    return error.code;
  }

  if (error.name) {
    return error.name;
  }

  return 'UNKNOWN_ERROR';
}

export function createMCPErrorResponse(error: any) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Error: ${getErrorMessage(error)}`
      }
    ],
    _meta: {
      error: {
        code: getErrorCode(error),
        message: getErrorMessage(error),
        retryable: isRetryableError(error)
      }
    }
  };
}

export function handleAsyncError<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  return operation().catch((error) => {
    // Add context to the error
    const contextualError = new Error(`${context}: ${getErrorMessage(error)}`);
    contextualError.name = error.name || 'Error';
    contextualError.stack = error.stack;
    throw contextualError;
  });
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new TimeoutError(timeoutMessage)),
        timeoutMs
      )
    )
  ]);
}

export function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 10000
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        resolve(result);
        return;
      } catch (error) {
        lastError = error;

        // Don't retry if it's not a retryable error
        if (!isRetryableError(error)) {
          reject(error);
          return;
        }

        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    reject(lastError);
  });
}