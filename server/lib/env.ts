import { z } from "zod";

/**
 * Every environment value the app reads goes through this schema, so a
 * misconfigured deployment fails at boot instead of halfway through a
 * research job. Provider knobs default to "mock" — the whole app runs
 * end-to-end with no third-party keys.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:56379"),

  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex characters"),

  AI_PROVIDER: z.enum(["mock", "anthropic", "gemini"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.6-flash"),
  /** Requests-per-minute cap for Gemini. Per process — if the web app and a
   *  queue worker both call Gemini, give each a share of the real quota. */
  GEMINI_RPM: z.coerce.number().int().positive().default(8),

  /** Writes one debug_logs row per outbound third-party request. */
  DEBUG_API_LOGS: z.enum(["on", "off"]).default("on"),

  EMAIL_PROVIDER: z.enum(["mock", "gmail"]).default("mock"),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REDIRECT_URI: z
    .string()
    .default("http://localhost:3000/api/integrations/gmail/callback"),

  SEARCH_PROVIDER: z.enum(["mock", "http"]).default("mock"),
  /** Which vendor `search()` queries. Page fetching is vendor-independent. */
  SEARCH_VENDOR: z.enum(["brave", "serper"]).default("brave"),
  SEARCH_API_KEY: z.string().optional().default(""),

  INTAKE_API_TOKEN: z.string().min(1).default("dev-intake-token"),
  APP_URL: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper — forces the next env() call to re-read process.env. */
export function resetEnvCache() {
  cached = null;
}
