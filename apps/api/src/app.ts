import { randomUUID } from "node:crypto";
import express, { type Express, type RequestHandler } from "express";
import { z } from "zod";
import { CreateAttemptSchema, SaveDraftSchema } from "@trajectoryos/contracts";
import type { Pool } from "pg";
import type { ApiConfig } from "./config.js";
import { ApiError, databaseUnavailable, errorHandler, notFound } from "./errors.js";
import { clerkAuthentication, resolveUser } from "./auth/index.js";
import { AttemptService, historyQuerySchema } from "./attempts/service.js";
import { challenge, courses, lesson } from "./content/index.js";
import { schemasReady } from "./db/migrate.js";

// Dependency injection is programmatic only; no HTTP/header/environment auth bypass.
export type AppDependencies = { authentication?: RequestHandler };
export function createApp(config: ApiConfig, pool: Pool | null, dependencies: AppDependencies = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.locals.requestId = randomUUID();
    response.setHeader("X-Request-ID", response.locals.requestId);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  const origins = config.CORS_ORIGINS?.split(",").map(s => s.trim()) ?? [];
  app.use((request, response, next) => {
    const origin = request.headers.origin;
    response.vary("Origin");
    if (origin) {
      if (!origins.includes(origin)) return next(new ApiError(403, "ORIGIN_NOT_ALLOWED", "Origin not allowed."));
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
      response.setHeader("Access-Control-Expose-Headers", "X-Request-ID, Retry-After");
    }
    if (request.method === "OPTIONS") { response.sendStatus(204); return; }
    next();
  });
  app.get("/health/live", (_request, response) => { response.json({ status: "ok" }); });
  app.get("/health/ready", async (_request, response) => {
    if (!pool) { response.status(503).json({ status: "not_ready", missing: ["DATABASE_URL"] }); return; }
    try {
      if (!(await schemasReady(pool)) || !config.CLERK_SECRET_KEY || !config.CLERK_PUBLISHABLE_KEY) {
        response.status(503).json({ status: "not_ready", dependencies: { configuration: "incomplete" } }); return;
      }
      response.json({ status: "ready", dependencies: { database: "ok" } });
    } catch { response.status(503).json({ status: "not_ready", dependencies: { database: "unavailable" } }); }
  });
  app.use("/api/v1", dependencies.authentication ?? clerkAuthentication(config), resolveUser(pool), express.json({ limit: "1mb" }));
  const ok = (response: express.Response, data: unknown, status = 200) => response.status(status).json({ data,
    meta: { requestId: response.locals.requestId, isMock: false } });
  const attempts = pool ? new AttemptService(pool) : null;
  const service = () => { if (!attempts) throw databaseUnavailable(); return attempts; };
  const id = (value: unknown) => z.string().uuid().parse(value);
  app.get("/api/v1/courses", (_request, response) => { ok(response, courses); });
  app.get("/api/v1/lessons/:slug/versions/:version", (request, response) => {
    if (request.params.slug !== lesson.slug || request.params.version !== String(lesson.version)) throw notFound();
    ok(response, lesson);
  });
  app.get("/api/v1/challenges/:slug/versions/:version", (request, response) => {
    if (request.params.slug !== challenge.slug || request.params.version !== String(challenge.version)) throw notFound();
    ok(response, challenge);
  });
  app.post("/api/v1/attempts", async (request, response) => {
    const result = await service().create(response.locals.userId, CreateAttemptSchema.parse(request.body));
    ok(response, result.attempt, result.created ? 201 : 200);
  });
  app.get("/api/v1/attempts", async (request, response) => {
    ok(response, await service().history(response.locals.userId, historyQuerySchema.parse(request.query)));
  });
  app.get("/api/v1/attempts/:id", async (request, response) => { ok(response, await service().get(response.locals.userId, id(request.params.id))); });
  app.put("/api/v1/attempts/:id/draft", async (request, response) => {
    ok(response, await service().save(response.locals.userId, id(request.params.id), SaveDraftSchema.parse(request.body)));
  });
  app.use((_request, _response, next) => next(notFound()));
  app.use(errorHandler);
  return app;
}
