# Known limitations

Honest notes on what is modelled but not yet wired up, and on behaviour that is easy to misread. Contributions welcome.

## Modelled, not yet surfaced

- **Proposals** — the `Proposal` / `ProposalVersion` tables, the proposal agent, and the *Proposal* approval mode exist, but there is no screen to generate, edit, version, or send a proposal. The Proposals page and the lead's Proposal tab are read-only lists.
- **Meetings** — meetings, notes, and AI summaries are displayed but cannot be created from the UI. Discovery questions are generated and stored per lead but no page lists them or lets you tick them off.
- **Case studies, testimonials, referrals** — tables exist. Case studies are read by the outreach and reply agents (as proof points) but can only be created by the seed script. Testimonials and the `Referral` table are unused.
- **AI feedback** — `POST /api/ai/feedback` accepts a −1 / 0 / +1 rating per AI run; nothing in the UI calls it yet.
- **Audit log** — written everywhere, readable only through Prisma Studio or SQL.

## Not enforced at runtime

- **ICP rules** — stored, edited, and counted on the ICP card, but the scorer does not evaluate them. The weighted score decides.
- **Automation approval modes** — stored and displayed; no generate or send path reads them. The guarantee that nothing reaches a prospect unattended comes from the structure of the code (the only send function is behind the explicit approve endpoint), not from this setting.

## Known bugs

- **Questions ready** on the Discovery page always shows `—` because the leads list API does not return the discovery-question count.
- **Seed automation key** — the seed writes `follow_up_task`, but the app's key is `follow_up_task_creation`, so that seeded row is orphaned and the default is used instead. Cosmetic.

## Scope and scale

- **Not user-scoped**: the suppression list (global, by email), debug logs, and inbound website leads (attached to the oldest account). Treat the app as one workspace per deployment.
- **Open registration** — anyone who can load `/register` can create an account. Put the app behind your own auth or network boundary if it is reachable publicly.
- **List caps** — lists return up to 200 rows (leads, companies, people, board), 300 tasks, 100 reports / opportunities / proposals, 50 inbox threads. There is no pagination UI. The Trend chart and the *Lead next actions* column are derived from the capped leads list.
- **Intake rate limit** is in-memory: per process, reset on restart.
- **Gemini rate limit** is per process: the web app and the worker each get their own `GEMINI_RPM` window.
- **No scheduled polling** — *Check for replies*, *Advance due steps*, and *Refresh next actions* are buttons. Hit the same endpoints from an external scheduler if you want them on a timer.

## Provider caveats

- **Anthropic cannot search the web.** The AI lead finder needs `SEARCH_PROVIDER=http` with a `SEARCH_API_KEY` on that provider, or `AI_PROVIDER=gemini`.
- **`SEARCH_PROVIDER=http` without a key** fetches real pages from the company's own site but never searches; research is limited to the site crawl and says so in its log.
- **Mock output is labelled** (`[SAMPLE DATA]`, `(sample data)`, *"Draft written by the built-in mock model."*, `.example` domains). If you see those labels, you are on mock.
- **Rotating `ENCRYPTION_KEY`** invalidates every stored Gmail credential; reconnect from Settings.
- **`NODE_ENV=production` requires HTTPS** because the session cookie becomes `secure`.

## Stale internal docs

`MIGRATION.md` is the contract from the Next.js → Nuxt port and is kept for history. Its counts (test files, migrations) are out of date.
