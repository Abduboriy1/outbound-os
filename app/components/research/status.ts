/**
 * Research status presentation, shared by the queue page and the report view so
 * one status can never render in two different colours.
 *
 * PENDING is `warning` rather than `neutral` on purpose: a pending report is a
 * job sitting in Redis that nothing has picked up yet. That is a state someone
 * has to act on — usually by starting `npm run worker` — not a resting state,
 * and a grey chip read as "fine, still going".
 */
import type { Tone } from "~~/shared/tone";

export type ResearchStatusName = "PENDING" | "RUNNING" | "COMPLETE" | "FAILED";

export const RESEARCH_STATUS_TONES: Record<string, Tone> = {
  PENDING: "warning",
  RUNNING: "accent",
  COMPLETE: "positive",
  FAILED: "danger",
};

/** Shown on hover, because "pending" alone does not say what is being waited on. */
export const RESEARCH_STATUS_HINTS: Record<string, string> = {
  PENDING: "Queued. A worker has not picked this up yet.",
  RUNNING: "A worker is fetching sources and running the analysis.",
  COMPLETE: "Finished. Sources, claims and signals are attached.",
  FAILED: "The run stopped with an error; re-run it once the cause is fixed.",
};

/** Ordered so the things needing attention sit at the top. */
export const RESEARCH_STATUS_ORDER: ResearchStatusName[] = [
  "FAILED",
  "RUNNING",
  "PENDING",
  "COMPLETE",
];

export function statusTone(status: string): Tone {
  return RESEARCH_STATUS_TONES[status] ?? "neutral";
}
