import { z } from "zod";

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalText = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional(),
);

const apiEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.preprocess(
      emptyStringToUndefined,
      z.coerce.number().int().min(1).max(65535).default(3000),
    ),
    DATABASE_URL: z.preprocess(
      emptyStringToUndefined,
      z
        .string()
        .url()
        .refine((value) => /^postgres(?:ql)?:\/\//i.test(value), {
          message: "Expected a PostgreSQL connection URL",
        })
        .optional(),
    ),
    CLERK_PUBLISHABLE_KEY: optionalText,
    CLERK_SECRET_KEY: optionalText,
    CLERK_AUTHORIZED_PARTIES: optionalText,
    CORS_ORIGINS: optionalText,
    MISTRAL_API_KEY: optionalText,
    MISTRAL_MODEL: optionalText,
    AI_ENABLED: z
      .preprocess(
        emptyStringToUndefined,
        z.enum(["true", "false"]).default("false"),
      )
      .transform((value) => value === "true"),
    APP_COMMIT_SHA: optionalText,
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === "production" && !environment.DATABASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required in production.",
      });
    }
    if (environment.AI_ENABLED && !environment.MISTRAL_API_KEY) {
      context.addIssue({
        code: "custom",
        path: ["MISTRAL_API_KEY"],
        message: "MISTRAL_API_KEY is required when AI_ENABLED is true.",
      });
    }
    if (environment.AI_ENABLED && !environment.MISTRAL_MODEL) {
      context.addIssue({
        code: "custom",
        path: ["MISTRAL_MODEL"],
        message: "MISTRAL_MODEL is required when AI_ENABLED is true.",
      });
    }
  });

export type ApiConfig = z.infer<typeof apiEnvironmentSchema>;

export function readApiConfig(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = apiEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    const invalidNames = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`Invalid API configuration fields: ${invalidNames.join(", ")}`);
  }
  return parsed.data;
}
