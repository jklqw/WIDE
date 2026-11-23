export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new AppError(400, code, message, details);
  }
  static unauthorized(code = "UNAUTHORIZED", message = "Authentication required") {
    return new AppError(401, code, message);
  }
  static forbidden(code = "FORBIDDEN", message = "Access denied") {
    return new AppError(403, code, message);
  }
  static notFound(code = "NOT_FOUND", message = "Resource not found") {
    return new AppError(404, code, message);
  }
  static conflict(code: string, message: string, details?: unknown) {
    return new AppError(409, code, message, details);
  }
  static tooMany(code = "RATE_LIMITED", message = "Too many requests") {
    return new AppError(429, code, message);
  }
  static internal(message = "Internal server error") {
    return new AppError(500, "INTERNAL", message);
  }
}
