import express, { type Express } from "express";
import type { Pool } from "pg";
import type { ApiConfig } from "./config.js";

export function createApp(config: ApiConfig, pool: Pool | null): Express {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health/live", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/health/ready", async (_request, response) => {
    if (!config.DATABASE_URL || !pool) {
      response.status(503).json({
        status: "not_ready",
        missing: ["DATABASE_URL"],
      });
      return;
    }

    try {
      await pool.query("SELECT 1");
      response.status(200).json({
        status: "ready",
        dependencies: { database: "ok" },
      });
    } catch {
      response.status(503).json({
        status: "not_ready",
        dependencies: { database: "unavailable" },
      });
    }
  });

  return app;
}
