import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string,
    public details?: Record<string, unknown>, public retryable = false) { super(message); }
}
export const notFound = () => new ApiError(404, "NOT_FOUND", "Resource unavailable.");
export const databaseUnavailable = () => new ApiError(503, "DATABASE_UNAVAILABLE", "Database unavailable.", undefined, true);

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (response.headersSent) return;
  let safe = error instanceof ApiError ? error : new ApiError(500, "INTERNAL_ERROR", "An internal error occurred.");
  if (error instanceof ZodError) safe = new ApiError(422, "VALIDATION_FAILED", "Check the request fields.", {
    issues: error.issues.map(({ path, message }) => ({ path, message })),
  });
  if (error?.type === "entity.too.large") safe = new ApiError(413, "PAYLOAD_TOO_LARGE", "JSON requests are limited to 1 MiB.");
  if (error?.type === "entity.parse.failed") safe = new ApiError(422, "VALIDATION_FAILED", "Malformed JSON.");
  if (["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "57P01", "53300", "08006", "08001"].includes(error?.code)) safe = databaseUnavailable();
  if (safe.status === 429) response.setHeader("Retry-After", "2");
  response.status(safe.status).json({ error: { code: safe.code, message: safe.message,
    ...(safe.details ? { details: safe.details } : {}), retryable: safe.retryable },
    meta: { requestId: response.locals.requestId, isMock: false } });
};
