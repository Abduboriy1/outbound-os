// Unit tests exercise pure logic (scoring, prompts, parsers, compliance rules)
// and must not depend on a developer's local .env.
process.env.DATABASE_URL ??=
  "postgresql://sales:sales@localhost:55432/sales_engine?schema=public";
process.env.AUTH_SECRET ??= "test-secret-value-at-least-16-chars";
process.env.ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.AI_PROVIDER ??= "mock";
process.env.EMAIL_PROVIDER ??= "mock";
process.env.SEARCH_PROVIDER ??= "mock";
process.env.INTAKE_API_TOKEN ??= "test-intake-token";
