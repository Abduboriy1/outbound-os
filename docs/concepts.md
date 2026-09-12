# Core concepts

## The data model in one paragraph

A **Company** is the anchor record. **People** (contacts) belong to a company. A **Lead** is one pipeline entry for a company, with an optional primary contact, a stage, an ICP, scores, an estimated value, and a next action. Everything else hangs off the lead: research reports, opportunities, drafts, email threads, meetings, proposals, tasks, activity, and stage history. All records are user-scoped and soft-deleted.

## Pipeline stages

The forward pipeline, in order, with the win probability used for the *weighted pipeline* number:

| Stage | Probability | Meaning |
| --- | --- | --- |
| Prospect | — | Just added; needs research |
| Researching | — | A research job is running or has run |
| Qualified | 5% | Scored and worth contacting |
| Ready for outreach | 5% | Contact identified, waiting for a first draft |
| Contacted | 10% | A message was sent |
| Responded | 20% | The prospect replied |
| Discovery | 35% | A call is booked or held |
| Opportunity | 50% | A concrete problem worth solving is agreed |
| Proposal sent | 60% | |
| Negotiation | 75% | |
| Won | 100% | |
| Customer | — | Post-sale |

Off-pipeline stages: **Lost**, **Not a fit**, **Do not contact**, **Cold**, **Follow up later**, **Referral**, **Upsell**.

Probabilities are starting assumptions, not measured rates; the Analytics page reports the measured funnel separately.

Rules enforced when moving a lead:

- Moving to **Lost** or **Do not contact** requires a reason.
- A lead in **Do not contact** cannot be moved back into a contactable stage from the stage form. This is deliberate friction.
- Every move records who, when, and why in the stage history.
- Sending an approved message auto-advances a pre-contact lead to **Contacted**; a genuine reply advances it to **Responded**; an opt-out moves it to **Do not contact**.

## The human-approval rule

**Nothing reaches a prospect without a person approving that exact message.** This is structural, not a setting:

- AI agents, sequences, and reply handling can only create drafts with status `PENDING_APPROVAL`.
- There is one function that sends email, reachable only from the approve endpoint, which requires an authenticated session and an explicit `approve: true`.
- The approval is written to the database *before* the provider is called, so an authorised attempt is provable even if the send fails.
- Every send passes the compliance gate first (see [Outreach › Compliance](outreach.md#compliance-gate)).

## Ideal customer profile (ICP)

An ICP describes who you sell to: industries, geographies, problems you solve, target roles, employee range, deal-size range. It has three jobs:

1. **Scoring** — the fit factors compare a lead against it.
2. **Steering research** — its problems, industries, and roles are passed to the research agent.
3. **Driving the AI lead finder** — searches are planned from it.

One ICP is the **default**, used for leads with no ICP assigned. The AI **interview** can draft one from seven plain-language questions about your business. See [Research › ICPs](research.md#icps).

## Lead scoring

Two 0–100 scores blended into an overall score. Scoring is **deterministic** — computed from recorded evidence, never asked of a model — and every factor carries its own one-line rationale, shown as *Why this score* on the lead.

| Fit factor | Default weight | | Opportunity factor | Default weight |
| --- | --- | --- | --- | --- |
| Industry | 25 | | Pain signals | 30 |
| Company size | 20 | | Manual workflows | 20 |
| Geography | 15 | | Hiring signals | 15 |
| Technology | 10 | | Growth | 10 |
| Role availability | 10 | | Urgency | 10 |
| Expected budget | 10 | | Decision maker found | 10 |
| Business model | 10 | | Trigger event | 5 |

- Weights are relative and live on the ICP; the blend defaults to 50 / 50.
- A factor with **no evidence** scores 35% of its weight. An unresearched company is unknown, not bad.
- A factor the ICP places **no constraint on** scores 60%.
- Scores are recomputed after research, when contacts change, and on demand via **Rescore**. Each computation is kept as history; a *Score moved 61 to 74* activity is logged only when the number changes.
- Badge colours: ≥75 green, ≥50 blue, ≥25 amber, below that grey; no score shows *unscored*.

## Research claims

Every statement in a research report is typed:

| Type | Meaning | How to use it |
| --- | --- | --- |
| **FACT** | Stated in a retrieved source, with a link | Safe to reference in conversation |
| **INFERENCE** | Concluded from a source | Ask about it; do not assert it |
| **UNKNOWN** | Not answered by the sources | Worth asking on a call |

Guardrails applied after the model answers: a FACT without a source is demoted to INFERENCE; a source URL that was not among the retrieved pages is dropped; an UNKNOWN's confidence is capped at 30%.

## Signals

A **signal** is evidence of a solvable problem, and it is only worth acting on if you can show the sentence it came from and the page it was on. Sixteen types across four families — **pain** (manual process, spreadsheet dependency, reconciliation, data entry, duplicate entry, CSV shuffling, recurring reporting, compliance burden, admin processing, disconnected systems, legacy software, fragmented workflow), **hiring**, **growth**, **trigger** (acquisition, expansion). Detected by keyword rules and merged with what the research agent proposes; a rule hit wins on collision because its provenance is exact.

## Provenance labelling

The app never presents an estimate as a fact:

- AI-generated plans and reviews carry an **AI suggestion** badge.
- Opportunities say *"Generated by the opportunity agent — treat it as an argument to verify, not a finding."*
- ROI figures are badged **Our estimate** (amber) until you tick that they came from the prospect, then **Prospect-supplied** (green).
- Tasks created by an agent carry a small **ai** badge.
- Mock research sources are labelled `[SAMPLE DATA]` and mock drafts end with "(Draft written by the built-in mock model.)".

## Untrusted data

Scraped pages, prospect emails, and website-form submissions are **untrusted documents**. They travel in the user turn of every AI request, never in the system prompt. Instruction-shaped fragments found in them are stripped and surfaced as a warning on the report: *"N instruction-shaped fragment(s) were removed from the retrieved pages before analysis."* The reply agent is told explicitly to ignore any command inside a prospect's email and to note it in the summary.

## Mock mode

With all three providers on `mock` the whole product works offline and deterministically:

- Research reads generated sample pages (labelled) and produces real claims, signals, and opportunities from them.
- Drafts are written by the mock model with a visible footer.
- Sends are recorded but not delivered; **Check for replies** produces synthetic replies covering every intent, including bounces and opt-outs.
- The AI lead finder returns fictional `.example` companies with the note *"No search was performed and none of these companies exist."*

This is the mode the screenshots in these docs were taken in.
