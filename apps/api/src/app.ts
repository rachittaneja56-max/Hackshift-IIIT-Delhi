import { randomUUID } from "node:crypto";
import express, { type Express, type RequestHandler } from "express";
import { z } from "zod";
import { CreateAttemptSchema, CreateCareerReviewSchema, SaveDraftSchema, SubmitSchema, EmptyRequestSchema } from "@trajectoryos/contracts";
import type { Pool } from "pg";
import type { ApiConfig } from "./config.js";
import { ApiError, databaseUnavailable, errorHandler, notFound } from "./errors.js";
import { clerkAuthentication, resolveUser } from "./auth/index.js";
import { AttemptService, historyQuerySchema } from "./attempts/service.js";
import { ContentService } from "./content/service.js";
import { schemasReady } from "./db/migrate.js";
import { EvaluationService } from "./evaluations/service.js";
import { EvidenceService } from "./evidence/service.js";
import { FeedbackService } from "./ai/service.js";
import type { FeedbackProvider } from "./ai/provider.js";
import { CareerReviewService } from "./career/service.js";
import type { CareerAnalysisProvider } from "./career/provider.js";
import { SandboxService } from "./sandbox/service.js";
import type { SandboxProvider } from "./sandbox/provider.js";
import type { SandboxAgentLike } from "./sandbox/agent.js";

// Dependency injection is programmatic only; no HTTP/header/environment auth bypass.
export type AppDependencies = {
  authentication?: RequestHandler;
  feedbackProvider?: FeedbackProvider | null;
  careerProvider?: CareerAnalysisProvider | null;
  careerDeadlineMs?: number;
  sandboxProvider?: SandboxProvider;
  sandboxAgent?: SandboxAgentLike;
};
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
  const origins = (config.CORS_ORIGINS ?? config.CLERK_AUTHORIZED_PARTIES ?? "http://127.0.0.1:5173").split(",").map(s => s.trim());
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
  const evaluations = pool ? new EvaluationService(pool) : null;
  const evidence = pool ? new EvidenceService(pool) : null;
  const feedback = pool ? new FeedbackService(pool, config, dependencies.feedbackProvider) : null;
  const career = pool ? new CareerReviewService(pool, config, dependencies.careerProvider, dependencies.careerDeadlineMs) : null;
  const content = pool ? new ContentService(pool) : null;
  const sandbox = pool ? new SandboxService(pool, config, dependencies.sandboxProvider, dependencies.sandboxAgent) : null;
  const sandboxService = () => { if (!sandbox) throw databaseUnavailable(); return sandbox; };
  const sandboxRequest = z.object({ clientRequestId: z.string().uuid() }).strict();
  const sandboxTurn = sandboxRequest.extend({ prompt: z.string().trim().min(1).max(4000) }).strict();
  const service = () => { if (!attempts) throw databaseUnavailable(); return attempts; };
  const id = (value: unknown) => z.string().uuid().parse(value);
  app.get("/api/v1/courses", async (_request, response) => {
    if (!content) throw databaseUnavailable(); ok(response, await content.courses());
  });
  app.get("/api/v1/lessons/:slug/versions/:version", async (request, response) => {
    if (!content) throw databaseUnavailable();
    ok(response, await content.lesson(z.string().parse(request.params.slug), z.string().parse(request.params.version)));
  });
  app.get("/api/v1/challenges/:slug/versions/:version", async (request, response) => {
    if (!content) throw databaseUnavailable();
    ok(response, await content.challenge(z.string().parse(request.params.slug), z.coerce.number().int().positive().parse(request.params.version)));
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
  app.post("/api/v1/attempts/:id/submit", async (request, response) => {
    if (!evaluations) throw databaseUnavailable();
    const result = await evaluations.submit(response.locals.userId, id(request.params.id), SubmitSchema.parse(request.body).expectedRevision);
    ok(response, result, ["completed", "error"].includes(result.status) ? 200 : 202);
  });
  app.get("/api/v1/evaluations/:id", async (request, response) => {
    if (!evaluations) throw databaseUnavailable();
    ok(response, await evaluations.get(response.locals.userId, id(request.params.id)));
  });
  app.post("/api/v1/evaluations/:id/retry", async (request, response) => {
    if (!evaluations) throw databaseUnavailable();
    EmptyRequestSchema.parse(request.body);
    ok(response, await evaluations.retry(response.locals.userId, id(request.params.id)), 202);
  });
  app.get("/api/v1/evidence/:id", async (request, response) => {
    if (!evidence) throw databaseUnavailable();
    ok(response, await evidence.get(response.locals.userId, id(request.params.id)));
  });
  app.get("/api/v1/evidence/:id/feedback", async (request, response) => {
    if (!feedback) throw databaseUnavailable();
    ok(response, await feedback.get(response.locals.userId, id(request.params.id)));
  });
  app.post("/api/v1/evidence/:id/feedback", async (request, response) => {
    if (!feedback) throw databaseUnavailable();
    EmptyRequestSchema.parse(request.body);
    const result = await feedback.request(response.locals.userId, id(request.params.id));
    ok(response, result, result.status === "generating" ? 202 : 200);
  });
  app.post("/api/v1/career/reviews", async (request, response) => {
    if (!career) throw databaseUnavailable();
    const result = await career.create(response.locals.userId, CreateCareerReviewSchema.parse(request.body));
    ok(response, result.review, result.statusCode);
  });
  app.get("/api/v1/career/reviews/:id", async (request, response) => {
    if (!career) throw databaseUnavailable();
    ok(response, await career.get(response.locals.userId, id(request.params.id)));
  });
  app.post("/api/v1/career/reviews/:id/resume", async (request, response) => {
    if (!career) throw databaseUnavailable();
    EmptyRequestSchema.parse(request.body);
    ok(response, await career.resume(response.locals.userId, id(request.params.id)));
  });
  app.post("/api/v1/sandbox/sessions", async (request, response) => {
    const body = sandboxRequest.parse(request.body);
    const result = await sandboxService().create(response.locals.userId, body.clientRequestId);
    ok(response, result.session, result.created ? 202 : 200);
  });
  app.get("/api/v1/sandbox/availability", (_request, response) => {
    ok(response, { available: sandbox?.available() ?? false, challengeSlug: "rate-limiter-debugging", challengeVersion: 1 });
  });
  app.get("/api/v1/sandbox/sessions/:id", async (request, response) => {
    ok(response, await sandboxService().get(response.locals.userId, id(request.params.id)));
  });
  app.get("/api/v1/sandbox/sessions/:id/files", async (request, response) => {
    ok(response, await sandboxService().files(response.locals.userId, id(request.params.id)));
  });
  app.post("/api/v1/sandbox/sessions/:id/turns", async (request, response) => {
    const body = sandboxTurn.parse(request.body);
    const result = await sandboxService().acceptTurn(response.locals.userId, id(request.params.id), body.clientRequestId, body.prompt);
    ok(response, result.turn, result.accepted ? 202 : 200);
  });
  app.get("/api/v1/sandbox/sessions/:id/turns/:turnId", async (request, response) => {
    ok(response, await sandboxService().turn(response.locals.userId, id(request.params.id), id(request.params.turnId)));
  });
  app.post("/api/v1/sandbox/sessions/:id/visible-tests", async (request, response) => {
    const body = sandboxRequest.parse(request.body);
    const result = await sandboxService().visibleTests(response.locals.userId, id(request.params.id), body.clientRequestId);
    ok(response, result.run, result.started ? 202 : 200);
  });
  app.post("/api/v1/sandbox/sessions/:id/submit", async (request, response) => {
    const body = sandboxRequest.parse(request.body);
    const result = await sandboxService().submit(response.locals.userId, id(request.params.id), body.clientRequestId);
    ok(response, result, result.status === "submitted" ? 200 : 202);
  });
  app.get("/api/v1/sandbox/sessions/:id/report", async (request, response) => {
    ok(response, await sandboxService().report(response.locals.userId, id(request.params.id)));
  });
  app.use((_request, _response, next) => next(notFound()));
  app.use(errorHandler);
  return app;
}
