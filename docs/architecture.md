# Architecture

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Nuxt 4 (Vue 3, Nitro server), TypeScript strict |
| UI | PrimeVue 4.5 (pinned to the MIT line — do not bump to v5), Tailwind CSS 4, Lucide icons, Chart.js |
| State | Pinia, `useFetch` per page |
| Database | PostgreSQL 17 via Prisma 7 (`@prisma/adapter-pg`) |
| Queue | Redis 7 + BullMQ, with an inline fallback when Redis is absent |
| AI | `@anthropic-ai/sdk`, `@google/genai`, or a deterministic mock |
| Email | Gmail API via `googleapis`, or a mock |
| Auth | HS256 JWT in an `httpOnly` cookie (`jose`), bcrypt passwords |
| Tests | Vitest 4 + happy-dom + `@vue/test-utils` |

## Folder layout

```
app/                    Nuxt srcDir — client and universal code
  pages/                49 routes, one folder per sidebar section
  components/           ui/ (Ui* wrappers), leads/, outreach/, research/, settings/, dashboard/, charts/
  composables/          useSession, useChartTokens, useNavCollapsed
  layouts/              default.vue (app shell + sidebar), auth.vue
  middleware/           auth.global.ts — client-side redirect to /login
server/
  api/                  ~100 Nitro handlers; file path = URL, suffix = method
  lib/                  all domain logic: ai/, research/, outreach/, scoring/, analytics/, goals/, intake/, email/, compliance.ts, audit.ts, queue.ts
  middleware/auth.ts    server-side cookie gate for document loads
  worker/index.ts       BullMQ worker process
  tests/harness.ts      drives h3 handlers without a listener
shared/                 pure modules used by BOTH client and server (stages, scoring weights, CSV import, templates, objections, goal periods, ROI maths)
prisma/                 schema, migrations, seed
docs/                   these guides
```

Rule of thumb: nothing under `server/lib` may be imported by a page or component (it would pull Prisma and the AI SDKs into the browser bundle). Anything both sides need at runtime lives in `shared/`.

## Request flow

1. A page calls `useFetch('/api/…')`.
2. The Nitro handler wraps the request with `route()`, which verifies the session JWT, re-reads the user from the database (a deactivated user's token stops working immediately), validates the body with Zod, and returns `{ data }` or `{ error }` with the right status.
3. Domain logic in `server/lib/**` runs inside Prisma transactions where several rows change together.
4. Mutations write an **audit** row and, where a person would care, an **activity** row on the lead.

## Auth

- `POST /api/auth/register`, `login`, `logout`, `GET /api/auth/session`.
- Cookie `ase_session`, 14-day expiry, `httpOnly`, `sameSite=lax`, `secure` in production.
- Login errors are identical for a wrong email and a wrong password (anti-enumeration).
- Registration is open. The register page describes the app as single-tenant — one workspace per operator — but nothing stops a second account being created. Most data is scoped by user; see [Known limitations](known-limitations.md) for what is not.

## Queue and worker

Four job types, each its own BullMQ queue under the `ase` prefix:

| Job | Runs |
| --- | --- |
| `research` | the full research pipeline on a lead, rewriting the given report |
| `research-refresh` | the same, but into a new report so the old one stays readable |
| `scoring` | recompute fit / opportunity / overall from existing evidence |
| `stale-leads` | flag reports older than 90 days and leads quiet for 14 days |

Default job options: 3 attempts, exponential backoff from 5 s, last 200 completed and failed kept.

**Inline fallback.** `enqueue()` probes Redis (re-probing at most every 30 s). If Redis is unreachable or the add fails, the job runs immediately inside the request and the caller gets `{ mode: "inline" }`. The app therefore works with no Redis at all; it is just slower and the request waits.

**The one gap** the fallback cannot cover: Redis up, jobs added, no worker running. Reports sit at PENDING. The Research Queue page detects this (waiting > 0, active = 0) and shows a red **no worker** badge telling you to run `npm run worker`.

The worker (`server/worker/index.ts`) starts one BullMQ Worker per job type with concurrency 2 on a long-lived connection, and shuts down gracefully on SIGINT / SIGTERM. If Redis is unreachable at start it prints an explanation and exits 1.

`GET /api/queue` returns `{ redis, counts }` for the Workers card.

## AI layer

`server/lib/ai/` — `service.ts` is the single entry point every agent goes through.

- **Providers** implement one interface: `generate(request)` returning text, plus optional `searchGrounded()` (Gemini and mock only).
- **Requests** carry `system` (operator instructions) and `data` (untrusted documents). Documents are rendered into the *user* turn, wrapped and labelled, never into the system prompt.
- **Sanitisation** strips instruction-shaped fragments from documents and returns findings that surface as report warnings.
- **Output** is parsed as JSON and validated with the agent's Zod schema. A failure marks the run FAILED and stores nothing downstream; the HTTP layer returns 502 with a readable message.
- **Every call** writes an `AiRun` (agent, provider, model, sanitised input, output, raw text, tokens, latency, error). `GET /api/ai/runs` lists them; `POST /api/ai/feedback` accepts a −1 / 0 / +1 rating per run (API only today).
- **Rate limiting** — a sliding-window limiter per process for Gemini (`GEMINI_RPM`), which also penalises the whole queue when the API returns 429 anyway.

Agents: `research`, `searchplan`, `qualification` (ICP interview), `opportunity`, `outreach`, `reply`, `discovery`, `proposal`, `salesCoach`, `prospecting` (lead finder).

`POST /api/ai` with `{ agent, leadId? }` runs one: `research` is enqueued; `salesCoach` runs inline; `qualification`, `opportunity`, and `discovery` run inline for a given lead.

## Email layer

`server/lib/email/provider.ts` selects mock or Gmail; both implement `send()` and `fetchIncoming(since)`. Bounce detection (`detect.ts`) is shared. The Gmail provider stores OAuth tokens sealed with AES-256-GCM (`server/lib/crypto.ts`) in `IntegrationCredential`, refreshes them 60 s before expiry, and preserves the refresh token across rotations.

## Audit log

`audit()` writes to `audit_logs` with actor type (HUMAN / AI / SYSTEM), action (`auth.login`, `outreach.send`, `intake.lead_created`, `settings.compliance.saved`, …), entity, and metadata. Failures are logged to the console only — auditing must never take down the operation it records. There is no UI for it; read it with `npm run db:studio` or SQL.

## Debug logs

With `DEBUG_API_LOGS=on` (default) every outbound third-party request — AI generate calls, grounded searches, Brave / Serper queries, page fetches — writes one row per attempt to `debug_logs`: provider, operation, URL, status, duration, attempt number, error, and small sanitised metadata (never keys or page bodies). Rows older than 7 days are pruned. Read with `GET /api/debug/logs?provider=gemini&errors=1&limit=100` while signed in.

## Tests

```bash
npm test
```

Vitest with happy-dom. No database or Redis is needed: unit tests cover the pure modules in `shared/` and `server/lib/`, API tests drive the h3 handlers through `server/tests/harness.ts` with a mocked Prisma and session, and component tests mount the `Ui*` kit and forms. `vitest.setup.ts` sets default environment variables so tests never depend on your `.env`. Test files must not live under `server/api/` because every file there becomes an endpoint.

## API surface

Everything is under `/api`, JSON, cookie-authenticated except `POST /api/intake` (bearer token). The main groups:

| Prefix | Resources |
| --- | --- |
| `/api/auth` | register, login, logout, session |
| `/api/leads` | CRUD, stage moves, next action, notes, contacts, tasks, emails, rescore |
| `/api/companies`, `/api/people` | CRUD |
| `/api/import` | CSV / manual / AI-finder commit, preview |
| `/api/research` | start, re-run, list; `/api/icps` incl. `interview` |
| `/api/outreach` | drafts (create, approve, approve-manual, reject, regenerate), inbox, sequences, enrollments, followups, compliance |
| `/api/email/ingest` | check for replies |
| `/api/opportunities` | list, status, ROI |
| `/api/meetings`, `/api/proposals`, `/api/tasks`, `/api/goals` | list / create / update |
| `/api/analytics` | all dashboard and analytics figures (`?period=WEEKLY|MONTHLY|QUARTERLY|ALL`) |
| `/api/ai` | run an agent; `/api/ai/runs`, `/api/ai/feedback` |
| `/api/settings` | overview, providers, ai, automation, compliance, suppressions |
| `/api/integrations/gmail` | start, callback, status |
| `/api/queue`, `/api/debug/logs` | operations |
| `/api/intake` | public website form |

Responses are `{ data: … }` on success and `{ error: "message", details?: [...] }` on failure.
