# Configuration

All configuration is by environment variables, read from `.env` in development. They are validated once at startup by a Zod schema; a bad value stops the server with `Invalid environment configuration:` and a per-field message.

## Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | **yes** | — | PostgreSQL connection string. `docker-compose.yml` exposes `postgresql://sales:sales@localhost:55432/sales_engine`. |
| `AUTH_SECRET` | **yes** | — | ≥16 chars. Signs session JWTs. Changing it logs everyone out. `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | **yes** | — | Exactly 64 hex chars. AES-256-GCM key for stored OAuth tokens. **Changing it orphans every stored Gmail credential**; you must reconnect. `openssl rand -hex 32` |
| `REDIS_URL` | no | `redis://localhost:56379` | If unreachable, queued jobs run inline instead. |
| `APP_URL` | prod | `http://localhost:3000` | Public origin. Used for the Gmail OAuth post-connect redirect. |
| `AI_PROVIDER` | no | `mock` | `mock` \| `anthropic` \| `gemini` |
| `ANTHROPIC_API_KEY` | if anthropic | — | |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-5` | |
| `GEMINI_API_KEY` | if gemini | — | https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | no | `gemini-3.6-flash` | |
| `GEMINI_RPM` | no | `8` | Requests per minute cap, **per process**. If the web app and the worker both call Gemini, give each a share of your real quota. |
| `EMAIL_PROVIDER` | no | `mock` | `mock` \| `gmail` |
| `GOOGLE_CLIENT_ID` | if gmail | — | OAuth 2.0 web client |
| `GOOGLE_CLIENT_SECRET` | if gmail | — | |
| `GOOGLE_REDIRECT_URI` | if gmail | `http://localhost:3000/api/integrations/gmail/callback` | Must match the Google console entry exactly. |
| `SEARCH_PROVIDER` | no | `mock` | `mock` \| `http` |
| `SEARCH_VENDOR` | no | `brave` | `brave` \| `serper` |
| `SEARCH_API_KEY` | no | — | Without it, `http` can fetch known URLs but cannot search. |
| `INTAKE_API_TOKEN` | **change in prod** | `dev-intake-token` | Bearer token for `POST /api/intake`. |
| `DEBUG_API_LOGS` | no | `on` | `on` \| `off`. One `debug_logs` row per outbound third-party request. |
| `PORT` | no | `3000` | Production listener port. |
| `NODE_ENV` | prod | — | `production` turns on the `secure` cookie flag (HTTPS required). |

## Providers

The app has three swappable providers. The **Settings → Integrations** page shows which are live, which variables are set or missing, and what it takes to switch.

![Settings integrations](images/settings-integrations.png)

### AI provider

Runs every agent: research, search planning, qualification (ICP interview), opportunity, outreach drafting, reply analysis, discovery prep, sales coach.

| `AI_PROVIDER` | Behaviour |
| --- | --- |
| `mock` | Deterministic. It reads the real retrieved documents, runs the real keyword rules, quotes real sentences, and never invents a source URL. Identical input gives identical output. Model id shown in the UI: `mock-deterministic-v1`. Drafts end with "(Draft written by the built-in mock model.)". |
| `anthropic` | Claude via `@anthropic-ai/sdk`. Structured JSON output, one retry on schema failure. **Cannot search the web**, so the AI lead finder needs `SEARCH_PROVIDER=http` + `SEARCH_API_KEY` on this provider. |
| `gemini` | Gemini via `@google/genai`. Retries on 429/500/503 with backoff. The only provider with built-in search grounding, used by the lead finder when no search key is configured. Rate-limited by `GEMINI_RPM`. |

Every call is recorded as an `AiRun` (input actually sent, output, tokens, latency, error). See them under **Settings → AI**.

### Email provider

| `EMAIL_PROVIDER` | Behaviour |
| --- | --- |
| `mock` | Never touches the network. Sends are written to the database and audited. **Check for replies** synthesises a reply for each unanswered outbound message, choosing deterministically between interested, price question, not now, out-of-office, unsubscribe, and bounce — so every inbox path can be exercised offline. |
| `gmail` | Real sending and reading via the Gmail API with OAuth 2.0. Requires the Google setup below, then connecting the mailbox from Settings → Integrations. |

### Search provider

Used by the research agent (to fetch a company's pages and search the web) and by the AI lead finder.

| `SEARCH_PROVIDER` | Behaviour |
| --- | --- |
| `mock` | Generates plausible sample pages, stable per domain. Every page is banner-labelled `[SAMPLE DATA]` and titles get a "(sample data)" suffix so mock research is never mistaken for real research. |
| `http` without `SEARCH_API_KEY` | Fetches real pages from the company's own website and follows its navigation. **Web search returns nothing** — a guessed URL in a report would be an invented source. |
| `http` with `SEARCH_API_KEY` | Also runs web searches through Brave (`SEARCH_VENDOR=brave`, https://api-dashboard.search.brave.com/) or Serper (`SEARCH_VENDOR=serper`, https://serper.dev/). |

The HTTP fetcher is SSRF-hardened: http/https only, DNS resolved and checked against private/loopback ranges on every redirect hop, 10 s timeout, 1.5 MB cap.

## Gmail OAuth setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and **enable the Gmail API**.
2. Configure the OAuth consent screen. Add these scopes:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`
3. Create an **OAuth 2.0 Client ID** of type **Web application**. Add an authorised redirect URI that exactly equals your `GOOGLE_REDIRECT_URI`:
   - dev: `http://localhost:3000/api/integrations/gmail/callback`
   - prod: `https://your-host/api/integrations/gmail/callback`
4. Put the client id and secret in `.env`, set `EMAIL_PROVIDER=gmail`, restart.
5. Sign in to the app, go to **Settings → Integrations**, and start the Gmail connection. You will be sent to Google's consent screen and back to `/settings?gmail=connected`.

Notes:

- `gmail.readonly` is a restricted scope. While your Google app is in **Testing** mode you must add your own account as a test user, and refresh tokens expire after 7 days. Publishing requires Google verification.
- Tokens are sealed with AES-256-GCM under `ENCRYPTION_KEY` before being stored. Plaintext never touches the database.
- Disconnecting from Settings disables the integration but keeps the sealed credential for the audit trail.
- Incoming mail is polled with the query `-in:chats -in:sent after:<last inbound>` when you press **Check for replies**. There is no push notification or scheduled poll built in.

## Website intake API

`POST /api/intake` is the only endpoint that does not require a login. Your public website posts form submissions to it and they arrive as `WEBSITE_FORM` leads at stage Prospect, queued for research.

```http
POST /api/intake
Authorization: Bearer <INTAKE_API_TOKEN>
Content-Type: application/json
```

```json
{
  "name": "Jo Rivera",
  "company": "Acme Logistics",
  "email": "jo@acme.com",
  "problemDescription": "Our dispatch team retypes every order from email into the ERP.",
  "companyWebsite": "https://acme.com",
  "frequency": "daily",
  "peopleInvolved": "3-5",
  "toolsInvolved": ["Outlook", "SAP"],
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "spring",
  "landing_page": "https://yoursite.com/automation",
  "referrer": "https://google.com"
}
```

| Field | Required | Rules |
| --- | --- | --- |
| `name` | yes | 1–120 chars |
| `company` | yes | 1–200 |
| `email` | yes | valid address, lowercased |
| `problemDescription` | yes | 10–5000 |
| `companyWebsite`, `frequency` | no | ≤500 / ≤200 |
| `peopleInvolved` | no | number or short string ("3", "3-5", "a whole team") |
| `toolsInvolved` | no | comma-separated string or array of up to 50 strings |
| `utm_source` / `utmSource`, `utm_medium`, `utm_campaign`, `landing_page`, `referrer` | no | ≤500 each; both snake and camel spellings accepted |

Unknown keys are rejected.

Responses: `202 {"data":{"ok":true}}` on success (deliberately opaque — the public site learns nothing about whether the company was already known). `401` bad token, `400` invalid JSON, `422` validation errors (field names only, input is never echoed), `429` over the in-memory limit of **10 requests per hour per IP**.

What happens: company → contact → lead are created or reused in one transaction (matched by domain, then company name, then contact email). The prospect's own description is stored as a research source and read by the research agent through the same untrusted-document path as scraped pages. Inbound leads are attached to the oldest user account in the database.
