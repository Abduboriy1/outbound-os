# Next.js 16 → Nuxt 4 migration contract

`/Users/bory/business/app` (Next 16, App Router, React 19) → `/Users/bory/business/app-vue` (Nuxt 4.5, Vue 3.5).

**This file is the contract.** Everything below is built and verified. The
source app is read-only — never edit anything under `/Users/bory/business/app`.

State of the whole app — foundation, every page, and the cross-cutting
integration pass:

| Command | Result |
| --- | --- |
| `npm run typecheck` (`nuxt typecheck`) | clean |
| `npx eslint .` | clean |
| `npm test` (`vitest run`) | 49 files, 785 tests, green |
| `npm run build` (`nuxt build`) | succeeds; 100 API method handlers + the catch-all |
| built server, seeded DB, real cookie jar | 47 authed routes hard-load 200 with real data |

**PrimeVue is pinned to the MIT 4.5.x line and must not be bumped to v5** —
see the boxed warning in §8 before touching those versions.

---

## 1. Project shape

```
app-vue/
├── app/                        # Nuxt srcDir (client + universal)
│   ├── app.vue                 # layout host + <Toast/>
│   ├── assets/css/main.css     # Tailwind v4 + the source's design tokens
│   ├── components/
│   │   ├── AppNav.vue          # port of src/components/nav.tsx
│   │   ├── charts/             # port of src/components/charts/index.tsx
│   │   ├── ui/                 # port of src/components/ui/index.tsx
│   │   └── {dashboard,leads,outreach,research,settings}/
│   │                           # ports of src/components/** + the actions.ts modules
│   ├── composables/            # useSession, useChartTokens
│   ├── layouts/                # default.vue (app shell), auth.vue
│   ├── middleware/             # auth.global.ts
│   ├── pages/                  # 49 routes — every page in the source (see §6)
│   ├── plugins/                # primevue-services.ts (universal — see §3.3)
│   └── utils/                  # cn, formatCurrency, formatRange, percent, relativeTime
├── server/
│   ├── api/                    # 101 files → 71 URLs / 100 method handlers (see §4)
│   ├── generated/prisma/       # `prisma generate` output (gitignored)
│   ├── lib/                    # port of src/lib/** + icps/ + intake/
│   ├── middleware/auth.ts      # port of src/middleware.ts
│   ├── tests/                  # harness.ts + the server/api suites
│   └── worker/index.ts         # port of src/worker/index.ts
├── shared/                     # importable from BOTH sides — see below
├── prisma/                     # schema, 2 migrations, seed (verbatim)
├── docker-compose.yml          # verbatim (postgres :55432, redis :56379)
└── .env.example                # verbatim
```

### Import aliases

| Alias | Points at | Use for |
| --- | --- | --- |
| `~` / `@` | `app/` | components, composables, utils |
| `~~` / `@@` | project root | `~~/server/lib/...`, `~~/shared/...` |
| `#shared` | `shared/` | equivalent to `~~/shared` |

**Never import `~~/server/lib/**` from a page or component** — it would pull
Prisma, BullMQ and the AI SDK into the browser bundle. The one exception is
`import type`, which is erased at compile time; `useSession()` does exactly that
for `SessionUser`, and `shared/leadsources/` does it for `DiscoveredLead`.

### `shared/` — one copy, both sides

Anything both halves need **at runtime** lives here, and `shared/` is its only
home. The alternative was a hand-maintained duplicate on the client of every
pure module in `server/lib/**`, which is what the port started with and what
this replaced: the CSV parser, the objection library, the scoring weights and
the stage tables were all being kept in step by hand.

```
shared/
├── stages.ts                 # ALL_STAGES, STAGE_LABELS, STAGE_TONES, STAGE_WIN_PROBABILITY, …
├── tone.ts                   # the `Tone` union
├── analytics/                # roi.ts (the ROI calculator's maths), trend.ts, lead-value.ts, sources.ts
├── goals/                    # periods.ts (periodRange, formatPeriodRange, …), metrics.ts
├── icps/interview.ts         # ICP interview questions + draft schema
├── leads/                    # due.ts (due-date buckets), enums.ts
├── leadsources/              # the whole CSV import library: normalize, fields, csv, dedupe, manual
├── outreach/                 # templates.ts, offer.ts, objections.ts, variants.ts, pause.ts
├── scoring/weights.ts        # factor lists, labels, defaults, parseWeights
└── settings/                 # automation-keys.ts, compliance.ts, providers.ts
```

**There are no re-export shims.** An earlier pass left thin alias modules under
`app/components/*/` and `server/lib/**` pointing at these, because the agent
that moved the code was not allowed to edit the pages importing it. Those 16
aliases are gone; both sides import `~~/shared/...` directly. If you find
yourself adding one back, move the importer instead.

Six of these modules carry their own vitest suites (`roi`, `periods`,
`weights`, and three under `leadsources/`), which is the other reason they are
here rather than behind a server-only path.

### Getting it running

```bash
npm install          # also runs prisma generate + nuxt prepare
cp .env.example .env
npm run db:up        # postgres + redis in docker
npm run db:migrate
npm run db:seed      # demo@example.com / demo12345
npm run dev
npm run worker       # second terminal; optional, jobs run inline without it
```

---

## 2. Decisions the port is built on

1. **PrimeVue is the component library**, in **styled** mode on a customised
   Aura preset. See §3.1 for why, and for the list of PrimeVue components that
   are auto-imported and usable directly.
2. **Use the `Ui*` wrappers for anything the React kit had** (`UiButton`,
   `UiCard`, ...). They preserve the source's prop names and exact Tailwind
   classes, so a ported page keeps pixel parity. Reach for a raw PrimeVue
   component only for things the React kit never had (`DataTable`, `Dialog`,
   `Menu`, `Toast`, `DatePicker`, ...).
3. **Server actions do not exist.** Every `actions.ts` in the source becomes an
   HTTP call to an existing endpoint (§4) or, if no endpoint covers it, a new
   `server/api/**` file written in the style of §4.3.
4. **Icons: `lucide-vue-next`**, imported explicitly —
   `import { Search, Check } from 'lucide-vue-next'`. Not auto-imported. React
   `size={16}` becomes `:size="16"`.
5. **Server components have no equivalent.** A Next page that queried Prisma
   directly becomes a Vue page that `useFetch`es the matching API route (§5).
6. **Don't loosen TypeScript further.** `nuxt.config.ts` already turns off
   `noUncheckedIndexedAccess` and `noImplicitOverride` (Nuxt defaults that the
   Next tsconfig didn't have) so the ported library compiles unchanged. Nothing
   else is relaxed; keep `npm run typecheck` clean.
7. **Charts are `.client.vue`.** Chart.js needs a canvas. If you add more,
   follow the same pattern or wrap in `<ClientOnly>`.

---

## 3. UI component contract

### 3.1 Why styled PrimeVue rather than unstyled + a Tailwind PT preset

PrimeVue is pinned to **4.5.5**, the last MIT release — see §8 before changing
that. Everything below is verified on that line.

The brief allowed either approach. **Styled mode + a customised Aura preset** was
chosen:

- The source's look lives entirely in CSS custom properties
  (`--accent`, `--surface`, `--border`, ... in `app/assets/css/main.css`, copied
  verbatim from `src/app/globals.css`). `nuxt.config.ts` re-points Aura's
  semantic tokens at those same variables, so **every** PrimeVue component —
  including ones the React app never had, like `DataTable` and `Dialog` — is on
  the app's palette with no per-component work, and follows the
  `prefers-color-scheme: dark` flip for free (`darkModeSelector: 'system'`).
- A hand-written unstyled Tailwind passthrough preset is several hundred lines
  of per-component class maps that must be maintained forever, and it would have
  left every un-mapped component naked.
- Parity where it actually matters is not lost: the wrappers for primitives the
  React kit defined (`UiButton`, `UiInput`, `UiTextarea`, `UiSelect`, `UiBadge`,
  `UiProgressBar`) set `unstyled` **per component** and pass the source's exact
  Tailwind class string through `pt.root`. Those six render byte-identical
  classes to the React version while the rest of PrimeVue stays styled.

`tailwindcss-primeui` is installed, and PrimeVue's CSS is emitted into a
`primeui` cascade layer declared *before* `utilities`
(`@layer theme, base, primeui, components, utilities;` at the top of
`main.css`). That is what lets a Tailwind utility on a PrimeVue component win.

Confirmed in the production build on 4.5.5: `--p-primary-color: var(--accent)`,
`--p-content-background: var(--surface)`,
`--p-form-field-focus-border-color: var(--accent)`,
`--p-text-muted-color: var(--muted)`, the `primeui` layer present, and the dark
colour scheme emitted inside `@media (prefers-color-scheme: dark)`.

**Deviation from the brief:** Tailwind is wired through `@tailwindcss/vite`
rather than `@tailwindcss/postcss`. The CSS is identical (same
`@import "tailwindcss"`, same `@theme inline` block, no JS config), but Vite
resolves CSS `@import` itself before PostCSS runs, so the PostCSS plugin cannot
see `@import "tailwindcss"`. `@tailwindcss/vite` is the supported Vite entry
point.

### 3.2 The kit — `app/components/ui/`

Auto-imported by filename; no import statement needed. Every prop name matches
the React source. React `children` → default slot. React `ReactNode` props
(`action`, `value`, `sub`, `title`, `description`) → a **string prop** for the
common case plus a **named slot** of the same name for markup.

| Vue component | React source | Backed by | Props | Slots | Emits / events |
| --- | --- | --- | --- | --- | --- |
| `UiCard` | `Card` | PrimeVue `Card` (unstyled) | *(none; `class` falls through)* | default | — |
| `UiCardHeader` | `CardHeader` | plain SFC | `title?: string`, `description?: string`, `class?: string` | `title`, `description`, `action` | — |
| `UiCardBody` | `CardBody` | plain SFC | `class?: string` | default | — |
| `UiButton` | `Button` | PrimeVue `Button` (unstyled) | `variant?: 'primary'\|'secondary'\|'ghost'\|'danger'` (default `secondary`), `size?: 'sm'\|'md'` (default `md`) | default | all native button events fall through — `@click` replaces React `onClick`; `type`, `disabled`, `aria-*` also fall through |
| `UiInput` | `Input` | PrimeVue `InputText` (unstyled) | `v-model?: string` | — | `update:modelValue`; every other attr (`name`, `type`, `required`, `placeholder`, `autocomplete`) falls through |
| `UiTextarea` | `Textarea` | PrimeVue `Textarea` (unstyled) | `v-model?: string` | — | as above (`rows`, `placeholder`, ...) |
| `UiSelect` | `Select` | native `<select>`, or PrimeVue `Select` | `v-model?: unknown`, `options?: unknown[]`, `optionLabel?`, `optionValue?`, `placeholder?` | default (the `<option>`s, native mode only); PrimeVue's slots are forwarded in options mode | `update:modelValue` |
| `UiField` | `Field` | plain SFC | `label: string`, `hint?: string`, `error?: string` | default (the control) | — |
| `UiForm` | *(new)* | `@primevue/forms` `Form` + zod resolver | `schema?: ZodType`, `initialValues?: Record<string, unknown>` | default, scoped with `{ $form }` | `submit` → `{ valid, values, states, errors }` |
| `UiBadge` | `Badge` | PrimeVue `Tag` (unstyled) | `tone?: Tone` (default `neutral`) | default | — |
| `UiStatCard` | `StatCard` | `UiCard` | `label: string`, `value?: string\|number`, `sub?: string`, `tone?: Tone` | `value`, `sub` | — |
| `UiProgressBar` | `ProgressBar` | PrimeVue `ProgressBar` (unstyled) | `value: number`, `target: number`, `tone?: Tone` (default `accent`) | — | — |
| `UiEmptyState` | `EmptyState` | plain SFC | `title: string`, `description?: string` | `action` | — |
| `UiTable` | `Table` | plain `<table>` | `class?: string` | default | — |
| `UiTh` | `Th` | plain `<th>` | `class?: string` | default | — |
| `UiTd` | `Td` | plain `<td>` | `class?: string` | default | — |
| `UiPageHeader` | `PageHeader` | plain SFC | `title: string`, `description?: string` | `action` | — |

Notes that will bite you if you skip them:

- **`Tone`** (`'neutral' | 'accent' | 'positive' | 'warning' | 'danger'`) lives
  in `shared/tone.ts`: `import type { Tone } from '~~/shared/tone'`. It moved
  out of the component module because `server/lib/stages.ts` and
  `server/lib/outreach/followups.ts` both return a tone.
- **`UiSelect` defaults to a native `<select>`**, because that is what the React
  `Select` was and every source page passes `<option>` children. Pass an
  `options` array instead and you get PrimeVue's rich `Select` (filtering,
  templates, keyboard nav), styled to match. Same `v-model` either way.
- **`UiField` is not `@primevue/forms`' `FormField`** — `FormField` only works
  inside a `<Form>` with a resolver, and the source uses `Field` standalone
  everywhere. Inside a `UiForm`, pass the resolver's message straight in:
  `<UiField label="Email" :error="$form.email?.error?.message">`.
- **`UiForm` only sees fields that register themselves**, which means the
  controls inside it must be `UiInput` / `UiTextarea` / `UiSelect` or a raw
  PrimeVue input. Those inject `$pcForm` and register by their `name` on mount;
  a bare `<input name="…">` does **not**, and will never appear on `$form`
  (PrimeVue 4 does not scan the DOM for fields). Do not work around it with
  `v-bind="$form.register('email')"` in the template either — `register()`
  mutates form state, so calling it during render loops until Vue throws
  *"Maximum recursive updates exceeded"*. For a form with hand-rolled
  validation, skip `UiForm` and use a plain `<form>` plus `UiField`'s `error`
  prop, which is what the login and register pages do.

  ```vue
  <UiForm :schema="leadSchema" @submit="onSubmit">
    <template #default="{ $form }">
      <UiField label="Email" :error="$form.email?.error?.message">
        <UiInput name="email" />
      </UiField>
      <UiButton type="submit" variant="primary">Save</UiButton>
    </template>
  </UiForm>
  ```
- **`UiTable` is a real `<table>`.** The source composes rows by hand. Use
  PrimeVue `DataTable` + `Column` when you want sorting/paging/virtual scroll —
  it is a different, data-driven API and is not a drop-in for `UiTable`.
- **`UiCard` renders two `display: contents` wrappers** (PrimeVue's Card has no
  default slot, so children go through its `content` slot). They add no layout,
  so `class="p-3"` or `class="flex"` on `UiCard` behaves as it did in React.

Example of the shape of a ported page:

```vue
<template>
  <div>
    <UiPageHeader title="Leads" description="Everything in flight.">
      <template #action>
        <UiButton variant="primary" @click="navigateTo('/leads/new')">New lead</UiButton>
      </template>
    </UiPageHeader>

    <UiCard>
      <UiCardHeader title="Open" :description="`${data?.total ?? 0} leads`" />
      <UiCardBody>
        <UiTable v-if="data?.leads.length">
          <thead><tr><UiTh>Company</UiTh><UiTh>Stage</UiTh></tr></thead>
          <tbody>
            <tr v-for="lead in data.leads" :key="lead.id">
              <UiTd>{{ lead.company.name }}</UiTd>
              <UiTd><UiBadge tone="accent">{{ lead.stage }}</UiBadge></UiTd>
            </tr>
          </tbody>
        </UiTable>
        <UiEmptyState v-else title="No leads yet" description="Import a list or add one by hand." />
      </UiCardBody>
    </UiCard>
  </div>
</template>
```

### 3.3 PrimeVue components available directly

Every PrimeVue component is auto-imported under its own name — `DataTable`,
`Column`, `Dialog`, `Menu`, `Menubar`, `Tabs`, `DatePicker`, `MultiSelect`,
`FileUpload`, `Message`, `Toast`, `ConfirmDialog`, `Panel`, `Divider`,
`Skeleton`, `Tooltip` … The only exception is **`Chart`**, which needs an
explicit `import Chart from 'primevue/chart'` (it is excluded from the resolver
because of its `chart.js` peer).

`useToast()` and `useConfirm()` work out of the box, **on both the server and
the client** — `app/plugins/primevue-services.ts` is a universal plugin (not
`.client`), so the injection keys exist during SSR and calling `useToast()` in a
`setup()` body is safe. `<Toast />` is already mounted once in `app.vue`; add
`<ConfirmDialog />` to any page that calls `useConfirm()`.

> This plugin was `.client`-only at first, which made `useToast()` throw
> `No PrimeVue Toast provided!` during server render and take the whole page
> down. **You do not need an SSR-safe toast shim — call `useToast()` directly.**
> The `useDashboardToast()` shim that worked around the old behaviour has been
> deleted and its six call sites now call `useToast()`; hard loads of all six
> pages were re-verified against the built server afterwards.
> Raising a toast is still a client-side act (the `<Toast />` listener only
> attaches after it mounts in the browser), so keep `toast.add()` in event
> handlers; that is where it belongs anyway.

### 3.4 Charts — `app/components/charts/`

recharts has no Vue port. The renderer is **PrimeVue `Chart` (Chart.js)** —
chosen over vue-chartjs and unovis because it ships with PrimeVue, so it is one
fewer dependency. Component names and prop signatures are unchanged from
`src/components/charts/index.tsx`.

| Component | Props | Notes |
| --- | --- | --- |
| `FunnelChart` | `data: FunnelDatum[]` | horizontal bars, last stage in the positive tone, tooltip `Leads: N (X% of previous)`, height `max(200, n × 38)` |
| `TrendChart` | `data: TrendDatum[]` | bars for `created`/`won` on the left axis, a line for `wonRevenue` on a right-hand compact-currency axis, 260px tall |

```ts
import type { FunnelDatum, TrendDatum } from '~/components/charts/types'
```

Both are `.client.vue`, so they are client-only automatically — no
`<ClientOnly>` needed. Chart.js paints to a canvas and cannot read
`var(--accent)`, so `useChartTokens()` resolves the design tokens from the
computed root style and re-reads them when the OS colour scheme flips. Use it
if you add a chart.

### 3.5 Utilities — `app/utils/format.ts`

Auto-imported: `cn`, `formatCurrency`, `formatRange`, `percent`,
`relativeTime`. Verbatim from `src/lib/utils.ts`. `server/lib/utils.ts` is the
same file for server-side use.

---

## 4. API route mapping

### 4.1 Mapping rules applied

- `route.ts` exporting `GET`/`POST`/`PATCH`/`DELETE` → one file per method,
  `index.<method>.ts` (or `[id].<method>.ts` where the segment had no children).
- Next `[id]` → Nuxt `[id]`; read it from the `params` argument, not
  `getRouterParam`.
- `NextRequest`/`NextResponse` → h3 `defineEventHandler` via the `route()`
  wrapper; `req.json()` → `parseBody(event, schema)`; `req.url` search params →
  `parseQuery(event, schema)`; `NextResponse.redirect` → `sendRedirect(…, 307)`.
- Non-route modules that lived under `src/app/api/**` moved out, because every
  file under `server/api/**` becomes an endpoint:
  `icps/schema.ts` → `server/lib/icps/schema.ts`,
  `intake/validate.ts` → `server/lib/intake/validate.ts`,
  the interview questions → `shared/icps/interview.ts`.

### 4.2 The table
**71 URLs, 100 method handlers**, plus the `/api/**` catch-all. URLs are
unchanged from the source wherever the source had one.

File-naming is mechanical: `index.<method>.ts` under the URL's directory, or
`[id].<method>.ts` where the dynamic segment has no children. Only the cases
worth knowing about are annotated below.

#### Ports of the 31 source `route.ts` files

| URL | Method |
| --- | --- |
| `/api/ai` | POST |
| `/api/ai/feedback` | GET, POST |
| `/api/ai/runs` | GET |
| `/api/analytics` | GET |
| `/api/companies` | GET, POST |
| `/api/companies/:id` | GET, PATCH, DELETE |
| `/api/contacts` | GET, POST |
| `/api/contacts/:id` | GET, PATCH, DELETE |
| `/api/email/ingest` | POST |
| `/api/email/suppressions` | GET, POST |
| `/api/goals` | GET, POST |
| `/api/goals/snapshot` | POST |
| `/api/icps` | GET, POST |
| `/api/icps/:id` | GET, PATCH, DELETE |
| `/api/icps/interview` | GET, POST |
| `/api/intake` | POST |
| `/api/integrations/gmail/callback` | GET |
| `/api/integrations/gmail/start` | GET |
| `/api/integrations/gmail/status` | GET, DELETE |
| `/api/leads` | GET, POST |
| `/api/leads/:id` | GET, PATCH, DELETE |
| `/api/leads/:id/stage` | GET, POST |
| `/api/outreach/drafts` | GET, POST |
| `/api/outreach/drafts/:id/approve` | POST |
| `/api/outreach/drafts/:id/reject` | POST |
| `/api/outreach/followups` | GET, POST |
| `/api/outreach/sequences/run` | POST |
| `/api/research` | GET, POST |
| `/api/research/:reportId` | GET, POST |
| `/api/tasks` | GET, POST |
| `/api/tasks/:id` | GET, PATCH, DELETE |

#### Auth — added, because Next used server actions

`src/app/(auth)/actions.ts` has no Nuxt equivalent:

| URL | Method | Replaces | Success body |
| --- | --- | --- | --- |
| `/api/auth/login` | POST | `loginAction` | `{ data: SessionUser }`, 200; `{ error }` 422 on a malformed field, 401 on bad credentials |
| `/api/auth/register` | POST | `registerAction` | `{ data: SessionUser }`, 201; 422 malformed, 409 email taken |
| `/api/auth/logout` | POST | `logoutAction` | `{ data: { signedOut: true } }` |
| `/api/auth/session` | GET | the `(app)` layout's `getCurrentUser()` | `{ data: SessionUser \| null }` |
| `/api/**` (unmatched) | any | — | `{ error: "Resource not found" }`, 404. Without it an unmatched API path fell through to the SSR renderer and 302'd to `/login`. Its handler is annotated `: unknown` on purpose — see below. |

#### Added — the 36 endpoints the pages needed

The source reached these through **server components querying Prisma directly**
and through **server actions**, neither of which survives the move (§2.3, §2.5).
Each one is the port of a named thing in the source, listed here so it is
obvious what it replaces rather than what it invents.

| URL | Method | Ports |
| --- | --- | --- |
| `/api/companies/industries` | GET | `companyIndustries()` — the company list's Industry filter |
| `/api/goals/archived` | GET | the goals page's archived list |
| `/api/goals/history` | GET | the goals page's progress history |
| `/api/import` | POST | `commitImportAction` + the commit half of `createManualLeadAction` |
| `/api/leads/:id/activities` | GET | `listLeadActivities` (200 rows) + `listLeadStageHistory` |
| `/api/leads/:id/contact-log` | POST | `logContactAction` |
| `/api/leads/:id/emails` | GET | the emails tab's `emailThread` + `outreachDraft` reads |
| `/api/leads/:id/meetings` | GET | the meetings tab's read |
| `/api/leads/:id/next-action` | POST | `setNextActionAction` + `clearNextActionAction` → `setNextAction()` |
| `/api/leads/:id/notes` | POST | `addNoteAction` → `addLeadNote()` |
| `/api/leads/:id/opportunities` | GET | the opportunities tab's read |
| `/api/leads/:id/proposals` | GET | the proposal tab's read |
| `/api/leads/:id/rescore` | POST | the `scoring` job the source enqueued directly |
| `/api/meetings` | GET | `/deals/discovery`'s two queries + `loadDailyQueue`'s meeting count |
| `/api/opportunities` | GET | `/opportunities`' list query |
| `/api/opportunities/:id` | GET, PATCH | the opportunity detail query + `setOpportunityStatusAction` |
| `/api/opportunities/:id/roi` | PUT | `saveRoiAction` |
| `/api/outreach/compliance` | GET | `complianceStatus()` |
| `/api/outreach/drafts/:id/approve-manual` | POST | `approveForManualSend` |
| `/api/outreach/drafts/:id/regenerate` | POST | `regenerateDraftAction`, hint and all |
| `/api/outreach/enrollments/:id/pause` | POST | `pauseEnrollment` |
| `/api/outreach/inbox` | GET | `inboxThreads()` |
| `/api/outreach/inbox/:threadId` | GET | `threadDetail()` |
| `/api/outreach/sequences` | GET, POST | `sequencesOverview()` + `createSequenceAction` |
| `/api/outreach/sequences/enrol` | POST | `enrolLead` |
| `/api/proposals` | GET | `/deals/proposals`' query |
| `/api/queue` | GET | `queueStatus()` |
| `/api/settings/ai` | GET | the AI settings tab's read |
| `/api/settings/automation` | GET, POST | the automation tab's read + `saveAutomationAction` |
| `/api/settings/compliance` | GET, POST | the compliance tab's read + `saveComplianceAction` |
| `/api/settings/email` | GET | the email settings tab's read |
| `/api/settings/integrations` | GET | the integrations tab's read |
| `/api/settings/overview` | GET | the settings overview's read |
| `/api/settings/providers` | GET | the provider-status read |
| `/api/settings/suppressions` | POST | `addSuppressionAction` |
| `/api/settings/suppressions/:id` | DELETE | `removeSuppressionAction` |

⚠️ **If you fetch an endpoint that has not been written yet**, Nitro types it
from the `/api/**` catch-all. That handler is annotated `(event): unknown` so
the response infers as `unknown`, which casts cleanly to whatever you expect:

```ts
transform: (res) => (res as { data: Foo[] }).data
```

Do not "fix" that annotation by letting the object type be inferred — doing so
types every unwritten endpoint as `{ error: string }`, and any page fetching one
gets `TS2352: Conversion of type '{ error: string }' to type '{ data: Foo[] }'
may be a mistake` until the real route lands.

### 4.3 Response contract — unchanged from Next

Every endpoint answers with exactly one of:

```jsonc
{ "data": ... }                                  // success
{ "error": "message", "details": ... }           // failure; `details` omitted when absent
```

Status codes, zod schemas and error strings are byte-identical to the source.
Smoke-tested against the built server: `401 {"error":"Not authenticated"}`,
`422 {"error":"Validation failed","details":[…]}`,
`400 {"error":"Request body must be valid JSON"}`.

`server/lib/api.ts` is the port of `src/lib/api.ts`. h3's `createError` is
**not** used, because it emits `{ statusCode, statusMessage, … }` and would
break that shape. Instead:

```ts
import { HttpError, notFound, ok, parseBody, parseQuery, route } from "~~/server/lib/api";

export default route(async (event, { user, params }) => {
  const input = await parseBody(event, someSchema);   // 400 on bad JSON, 422 on zod failure
  const filters = parseQuery(event, filtersSchema);   // 422 on zod failure
  if (!thing) notFound("Thing");                      // 404 "Thing not found"
  throw new HttpError("Conflict", 409);               // any other status
  return ok(payload, { status: 201 });                // → { data: payload }
});
```

`route()` authenticates first and throws `UnauthorizedError` → 401. Use
`publicRoute()` only for endpoints that authenticate some other way.

### 4.4 Auth

Identical to Next: **`jose` HS256 over `{ sub: userId }`, cookie `ase_session`,
14-day expiry, httpOnly + sameSite lax + secure in production.** A token minted
by the Next app still validates here.

`src/lib/auth.ts` → `server/lib/auth.ts`. Next's ambient `cookies()` became an
explicit `H3Event` argument; React's per-request `cache()` became a memo on
`event.context.sessionUser`.

`src/middleware.ts` → **two** pieces, because Nuxt splits document loads from
client-side navigation:

- `server/middleware/auth.ts` — document loads. Same cookie-presence rule, same
  `/login` + `?next=` redirect, same exclusions (`/api`, Nitro assets,
  `favicon.ico`, anything with a file extension). `/api` staying excluded
  matters: `/api/intake` authenticates with a bearer token, not a session.
- `app/middleware/auth.global.ts` — client-side navigation. Same rule, driven by
  `useSession()`.

Neither is a security boundary. Every API route re-verifies the JWT.

---

## 5. Data fetching

### 5.1 Which helper

| Situation | Use |
| --- | --- |
| Page needs data to render (SSR + hydration, dedup, `pending`/`error`) | `useFetch` |
| Data depends on reactive state (filters, pagination) | `useFetch` with a computed URL/`query` and `watch` |
| Inside an event handler (submit, approve, delete) | `$fetch` |
| Manual control over when it runs | `useAsyncData` + `$fetch` |

**Never call plain `$fetch` in a setup body, a layout, or route middleware.**
Two things go wrong, and the second one is silent:

1. It runs twice (server and client) and skips the payload transfer.
2. **On the server it sends no headers**, so an internal call to an
   authenticated endpoint arrives with no `ase_session` cookie and comes back as
   if you were signed out. This cost us a real bug: `useSession()` used `$fetch`,
   so every authenticated *hard page load* server-rendered as signed-out and
   `auth.global.ts` bounced it to `/login`. Client-side navigation was fine,
   which is what made it easy to miss.

**This is not a theoretical footgun — it bit five components a second time.**
`leads/[id]/{emails,meetings,opportunities,proposal}.vue` and
`components/research/ResearchReportView.vue` each wrapped a bare `$fetch` in
`useAsyncData` with a `catch` that returned an empty list. On the server the
call arrived unauthenticated, 401'd, the `catch` swallowed it, and the tab
rendered its **empty state on every hard load** even when the lead had threads,
meetings, opportunities or a completed research report. Client-side navigation
looked fine, and the empty state is a legitimate UI, so nothing looked broken.
The four page tabs are now `useFetch`; `ResearchReportView` needs two chained
requests so it keeps `useAsyncData` but issues them with `useRequestFetch()`.

Two rules follow: **wrap a fetch in `useAsyncData` only when you genuinely need
imperative control, and never `catch` a fetch into an empty value** — an
authentication failure and "there is nothing here" must not render the same.

`useFetch` forwards the incoming request's headers already, so it is safe. When
you genuinely need an imperative call during SSR, use `useRequestFetch()` —
identical to `$fetch` in the browser, header-forwarding on the server:

```ts
const request = useRequestFetch()          // resolve in setup, not in the handler
const { data } = await request<{ data: Foo }>('/api/foo')
```

`app/composables/useSession.ts` is the worked example.

### 5.2 Unwrapping `{ data }`

Every endpoint wraps its payload, so a `useFetch` result is *doubly* wrapped:
`result.data.value.data`. Flatten it at the call site with `transform` and keep
pages readable:

```vue
<script setup lang="ts">
const { data: leads, pending, error, refresh } = await useFetch('/api/leads', {
  transform: (res: { data: { leads: Lead[]; total: number } }) => res.data,
})
</script>
```

```ts
// event handler
async function approve(draftId: string) {
  await $fetch(`/api/outreach/drafts/${draftId}/approve`, {
    method: 'POST',
    body: { approve: true },
  })
  await refresh()
}
```

Reactive query:

```ts
const stage = ref<string | undefined>()
const { data } = await useFetch('/api/leads', {
  query: { stage },                       // refetches when `stage` changes
  transform: (res: { data: { leads: Lead[]; total: number } }) => res.data,
})
```

### 5.3 Error handling

A non-2xx response makes `$fetch` throw a `FetchError` whose `data` is the
endpoint's body, so the server's message is what you show:

```ts
try {
  await $fetch('/api/leads', { method: 'POST', body: input })
} catch (e) {
  const err = e as { data?: { error?: string; details?: unknown } }
  message.value = err.data?.error ?? 'Something went wrong'
}
```

With `useFetch`, `error.value.data.error` holds the same string.

### 5.4 Typing responses

The Prisma types are the source of truth. Import them **as types only**:

```ts
import type { Lead, Company, Contact } from '~~/server/generated/prisma/client'
```

That is erased at build time and pulls nothing into the client bundle. Do not
import values from there.

### 5.5 Session

```ts
const { user, login, register, logout, fetchSession } = useSession()
```

`user` is a `useState` ref: `undefined` before the first fetch, `null` when
signed out, the `SessionUser` otherwise. The global middleware populates it, so
in a page it is already there.

### 5.6 Pinia

`@pinia/nuxt` is installed and configured. Stores go in `app/stores/` and are
auto-imported. Use it for state that genuinely spans pages (filter sets, a
selection carried between views). For plain server data, `useFetch` already
caches and dedupes — a store would only add a second copy that can go stale.

---

## 6. Layouts and pages

| Nuxt | Source | Notes |
| --- | --- | --- |
| `app/app.vue` | `src/app/layout.tsx` | `<html>`/`<body>` classes and title/description moved to `app.head` in `nuxt.config.ts`. Hosts `<NuxtLayout>` and the single `<Toast/>`. |
| `app/layouts/default.vue` | `src/app/(app)/layout.tsx` | The authed shell: 56-unit sidebar, `AppNav`, user name, sign out. **The default layout — authed pages need no `definePageMeta`.** |
| `app/layouts/auth.vue` | *(the `(auth)` group had no layout)* | The `flex min-h-screen items-center justify-center p-6` wrapper that `login/page.tsx` and `register/page.tsx` each repeated. Opt in with `definePageMeta({ layout: 'auth' })`. |

Route-group → path mapping: `(app)/leads/page.tsx` → `app/pages/leads/index.vue`,
`(app)/leads/[id]/page.tsx` → `app/pages/leads/[id]/index.vue`,
`(auth)/login/page.tsx` → `app/pages/login.vue`.

Nested layouts such as `(app)/leads/[id]/layout.tsx` and
`(app)/settings/layout.tsx` have **no** Nuxt layout equivalent at that depth.
Both are implemented, and differently, because the two cases are not the same:

- **`leads/[id]`** is a **parent route** — `app/pages/leads/[id].vue` fetches
  `/api/leads/:id` once, renders the header and the nine tab links around a
  `<NuxtPage />`, and hands the result to the tabs through
  `provideLeadWorkspace()` / `useLeadWorkspace()`. A tab that mutates the lead
  calls `refreshNuxtData()`, which re-runs the parent's `useFetch` and every
  tab's own.
- **`settings`** is a **wrapper component** (`SettingsShell.vue`) that each of
  the six settings pages renders. Consequence worth knowing: the shell remounts
  on every tab change, so the nav re-renders rather than persisting. A parent
  route would fix it and was not worth the churn.

**All 49 pages exist**, including `/login` and `/register`
(`definePageMeta({ layout: "auth" })`). Every authed route has been hard-loaded
against the built server with a real session cookie and returns 200 with data
in the SSR HTML.

---

## 7. Testing

`vitest` + `@vue/test-utils` + `happy-dom`. `npm test` runs
`server/**/*.test.ts`, `shared/**/*.test.ts` and `app/**/*.test.ts`.

**49 files, 785 tests, green.** Three kinds:

- **The library suites** — all 29 came across from the source and pass. Six of
  them moved with their module into `shared/` (§1). `src/app/api/intake/route.test.ts`
  became `server/lib/intake/handler.test.ts`: the endpoint's logic was extracted
  into `server/lib/intake/handler.ts`, which speaks plain `Request`/`Response`,
  so the test kept its 300 lines of in-memory Prisma stand-in with only the mock
  paths changed.
- **Endpoint suites** — `server/tests/api/*.test.ts`, driven by
  `server/tests/harness.ts`, which calls a route's `defineEventHandler` through
  h3's `mockEvent` with Prisma and `requireUser` mocked. They assert the §4.3
  envelope, the status code, and — for endpoints ported from a server component
  — the exact Prisma arguments, because the ordering, `take` and `include` are
  what a page silently depends on. They live under `server/tests/` rather than
  beside the routes because **every file under `server/api/**` becomes an
  endpoint**; a `*.test.ts` there would be served at its own URL.
- **Component and action suites** — `app/**/*.test.ts`, covering the UI kit's
  class passthrough, the login/register pages, and the `actions.ts` modules
  (which endpoint each action calls, with what body, and that the server's own
  error string comes back unchanged).

Component tests need the PrimeVue plugin —
`app/components/ui/UiBadge.test.ts` is a worked example:

```ts
mount(UiBadge, {
  global: {
    // Annotate the tuple, or TS widens it to an array and test-utils rejects it.
    plugins: [[PrimeVue, { theme: 'none' }] as [typeof PrimeVue, object]],
  },
})
```

**Do not reach for `as const` here.** It is the obvious fix for the widening
error and it produces a *different* one: `as const` makes the tuple `readonly`,
and `GlobalMountOptions.plugins` is a mutable array, so you get
`The type 'readonly [readonly [Plugin, …]]' is 'readonly' and cannot be assigned
to the mutable type '(Plugin | [Plugin, ...any[]])[]'`. Annotate the inner tuple
as above instead. If you hoist the options into a shared constant, annotate it
too — a bare `const opts = { global: { plugins: [[PrimeVue, …]] } }` re-widens.

`app/components/ui/kit.test.ts` is the **regression pin for the design system**.
It asserts the exact Tailwind class strings that the six `unstyled` primitives
emit through `pt.root`, straight out of `src/components/ui/index.tsx`. That
passthrough is the one thing a PrimeVue major bump breaks silently — PT section
names are not in the type surface, so a renamed section still type-checks and
just stops applying the class. **If those tests fail, the kit is rendering
naked; do not "fix" them by relaxing the assertions.**

Nuxt auto-imports (`useRoute`, `useState`, `$fetch`, and project composables
like `useChartTokens`) are **not** available in a plain vitest run; stub them
with `vi.mock`, or test through props. This is why the two chart SFCs have no
unit test — they call `useChartTokens()` in setup. `primevue/chart` itself is
covered by the build.

---

## 8. Backend port — what changed, and what didn't

`src/lib/**` → `server/lib/**`, **byte-identical apart from import paths**
(`@/lib/…` → `~~/server/lib/…`, `@/generated/…` → `~~/server/generated/…`) and
the removal of Next's `server-only` marker import. Two files changed
substantively, both because they were Next-coupled: `auth.ts` (§4.4) and
`api.ts` (§4.3).

Nine of those modules **moved to `shared/`** rather than staying under
`server/lib/**`, because the browser needs them at runtime too (§1):
`stages.ts`, `goals/periods.ts`, `scoring/weights.ts`, `analytics/roi.ts`,
`outreach/{templates,offer,objections}.ts` and the whole of `leadsources/`.
Their contents are unchanged; only the path moved, and every server-side
importer was rewritten to `~~/shared/...`.

Also ported: `prisma/` (schema, both migrations, seed — the generator output
path is now `../server/generated/prisma`), `src/worker/` → `server/worker/`,
`docker-compose.yml`, `.env.example`, `prisma.config.ts`.

Scripts carried over: `db:up`, `db:down`, `db:migrate`, `db:deploy`,
`db:studio`, `db:seed`, `db:reset`, `worker`, `test`, `test:watch`, `typecheck`,
`lint`. `worker` and `db:seed` run under `tsx --tsconfig tsconfig.node.json`,
which exists solely to teach `tsx` the `~~/*` alias outside Nuxt.

### Dependencies

> ## ⛔ Do not bump PrimeVue to v5
>
> **PrimeVue 4.5.5 is the last MIT release. The 5.x line is commercially
> licensed.** These four packages are pinned to **exact versions with no `^`
> range**, deliberately, so that `npm update` cannot drift onto v5:
>
> ```jsonc
> "primevue":              "4.5.5",   // MIT
> "@primevue/forms":       "4.5.5",   // MIT
> "@primevue/nuxt-module": "4.5.5",   // MIT
> "@primeuix/themes":      "2.0.3"    // MIT — the themes line 4.5.x requires
> ```
>
> **What happens if you bump them.** v5 ships
> `@primevue/core/license/licenseBanner`. With no purchased licence key it
> injects a fixed-position red **"Invalid PrimeUI License"** banner into *every
> page* through a closed shadow root (`#p-license-host`,
> `z-index: 2147483647`), and logs `[PrimeUI] PrimeUI license is not
> configured.` on every server render. The closed shadow root means it cannot be
> hidden with CSS or removed from application code. It is not a dev-only nag —
> it renders in production builds.
>
> `@primeuix/themes` is versioned separately and must move with the line:
> the 4.5.x line needs `@primeuix/styled@^0.7.4`, which is `@primeuix/themes@2.x`.
> `@primeuix/themes@3.x` peers `@primeuix/styled@^1.0.0` and belongs to v5.
>
> **How to verify a change is safe.** After any install touching these:
>
> ```bash
> ls node_modules/@primevue/core/license          # must be "No such file or directory"
> grep -rl "p-license-host" node_modules/@primevue node_modules/primevue   # must be empty
> npm run build && grep -rl "p-license-host" .output/                      # must be empty
> ```
>
> `app/components/ui/kit.test.ts` additionally pins the rendered class strings of
> the six `unstyled` primitives, which is what would break silently if a PrimeVue
> major renamed a passthrough section.

Added: `nuxt`, `vue`, `vue-router`, `primevue@4.5.5`,
`@primevue/nuxt-module@4.5.5`, `@primevue/forms@4.5.5`, `@primeuix/themes@2.0.3`,
`tailwindcss-primeui`, `chart.js`, `lucide-vue-next`, `pinia`, `@pinia/nuxt`,
`@nuxt/eslint`, `@vue/test-utils`, `@vitejs/plugin-vue`, `happy-dom`, `vue-tsc`,
`@tailwindcss/vite`.

Dropped: `next`, `react`, `react-dom`, `@types/react*`, `eslint-config-next`,
`lucide-react`, `recharts`, `@testing-library/*`, `@vitejs/plugin-react`,
`jsdom`, `@tailwindcss/postcss`.

Unchanged: `@anthropic-ai/sdk`, `@prisma/client`, `@prisma/adapter-pg`,
`prisma`, `bullmq`, `ioredis`, `pg`, `jose`, `bcryptjs`, `zod`, `googleapis`,
`papaparse`, `date-fns`, `dotenv`, `clsx`, `tailwind-merge`, `tailwindcss`.

---

## 9. Known gaps and deferred work

Kept honest: what is closed is not listed, and what is open says so plainly.
The full end-to-end verification record is in `../MIGRATION-STATUS.md`.

### Behavioural gaps against the React original

1. **`weeklyReview` cannot succeed under `AI_PROVIDER=mock`.** The mock
   provider's only `salesCoach` fixture is the daily-plan shape, so a weekly
   review returns a daily plan, the analytics page's shape guard rejects it, and
   the card keeps saying "Not generated for this week yet". **Pre-existing in the
   React app**, which failed the same way and equally silently. Needs a real
   provider or a `weeklyReview` fixture in
   `server/lib/ai/mocks/`. Everything else about the run is correct — the
   `AiRun` row is written with `status: SUCCESS`.
2. **`listNextActions` has no endpoint.** `/tasks` derives the next-action list
   from `/api/leads`, whose 200-row cap is below the source's 300. Identical
   below 200 leads.
3. **`loadDailyQueue`'s "leads need research" count** cannot express
   `researchReports: { none: { status: COMPLETE } }` through `/api/leads`, so
   the dashboard counts every lead still at PROSPECT or RESEARCHING. It
   over-counts by the number of researched leads still in those two stages.
4. **`listLeadPeople` scope** — see the note at the top of
   `app/pages/leads/[id]/people.vue`.
5. **`/deals` has no index page.** Neither does the source; `/deals/closed`,
   `/deals/discovery` and `/deals/proposals` are the real routes.

### Structural deviations

6. **The settings shell remounts on tab change** (§6) — it is a wrapper
   component, not a parent route, so the nav re-renders rather than persisting.
7. **`nuxt.config.ts` relaxes two TS flags** (`noUncheckedIndexedAccess`,
   `noImplicitOverride`) to match the Next tsconfig the library was written
   against. Tightening them means auditing ~100 ported files; not worth it now,
   but it is the one place the port is looser than Nuxt's default.
8. **Two ESLint rules are off for `server/lib/**`** (`no-irregular-whitespace`,
   `no-useless-assignment`) — both flag deliberate code in verbatim ports. See
   the comment in `eslint.config.mjs`.
9. **`h3` is v2** in Nuxt 4.5, so `toWebRequest` is gone and `event.req` under
   the Node preset is a lazy proxy whose `headers` is a plain object, not a
   `Headers`. `server/api/intake/index.post.ts` rebuilds a real `Request`; do
   the same if you ever need Web `Request` semantics in a route.
10. **Redirect status is 307** everywhere (`NextResponse.redirect`'s default),
    including the Gmail OAuth start/callback.
11. **Fonts:** `next/font` supplied `--font-geist-sans` / `--font-geist-mono`.
    `main.css` now hard-codes them to `"Geist", ui-sans-serif, system-ui, …`.
    Geist is not self-hosted, so the system stack is what renders. Add the font
    files if exact typographic parity matters.

### Dependency constraint

12. **PrimeVue is capped at 4.5.5, the last MIT release.** The 5.x line is
    commercially licensed and injects an un-hideable "Invalid PrimeUI License"
    banner without a key. All four PrimeVue packages are pinned to exact
    versions, and `website-vue` is pinned to the same line. Full detail and the
    verification commands are in §8 — read that box before any dependency bump.
    Practical consequence: PrimeVue components added in v5 are not available,
    and `npm audit fix` / `npm update` must not be allowed to move these four.

### Inherited from the source, deliberately not "fixed"

13. **`POST /api/import` wraps each lead in its own transaction, not the
    batch.** A failure part-way through leaves earlier leads committed, skips
    the rest, and answers 500 with no per-row report. This is exactly what
    `commitImportAction` did — the loop and the transaction boundary are the
    source's. The per-lead guarantee does hold and is tested: a failure after
    the company insert leaves no orphan company, contact or lead.
14. **The opportunity detail page renders non-string evidence entries as raw
    JSON.** `readEvidence()` is a byte-identical port of the source's, including
    its `JSON.stringify` fallback.
