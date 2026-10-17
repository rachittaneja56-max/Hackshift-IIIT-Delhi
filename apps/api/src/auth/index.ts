import { randomUUID } from "node:crypto";
import { clerkMiddleware, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import type { Pool } from "pg";
import type { ApiConfig } from "../config.js";
import { ApiError, databaseUnavailable } from "../errors.js";

export function clerkAuthentication(config: ApiConfig): RequestHandler {
  const unauthorized = () => new ApiError(401, "UNAUTHENTICATED", "Sign in with a valid Clerk bearer token.");
  const middleware = config.CLERK_SECRET_KEY && config.CLERK_PUBLISHABLE_KEY ? clerkMiddleware({
    secretKey: config.CLERK_SECRET_KEY, publishableKey: config.CLERK_PUBLISHABLE_KEY,
    authorizedParties: config.CLERK_AUTHORIZED_PARTIES?.split(",").map(s => s.trim()),
    jwtKey: config.CLERK_JWT_KEY,
  }) : null;
  return (request, response, next) => {
    if (!/^Bearer \S+$/i.test(request.headers.authorization ?? "") || !middleware) return next(unauthorized());
    const verified = (error?: unknown) => {
      if (error) return next(unauthorized());
      try {
        const auth = getAuth(request, { acceptsToken: "session_token" });
        if (!auth.userId) return next(unauthorized());
        response.locals.clerkSubject = auth.userId;
        next();
      } catch { next(unauthorized()); }
    };
    Promise.resolve(middleware(request, response, verified)).catch(() => next(unauthorized()));
  };
}

export function resolveUser(pool: Pool | null): RequestHandler {
  return async (_request, response, next) => {
    if (!pool) throw databaseUnavailable();
    const result = await pool.query(`INSERT INTO app.users(id,clerk_user_id) VALUES ($1,$2)
      ON CONFLICT (clerk_user_id) DO UPDATE SET clerk_user_id=EXCLUDED.clerk_user_id RETURNING id`,
      [randomUUID(), response.locals.clerkSubject]);
    response.locals.userId = result.rows[0].id;
    next();
  };
}
