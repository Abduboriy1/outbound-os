/**
 * Live step log for a research run.
 *
 * The pipeline runs in a worker process, so the only way the UI can show what
 * the agent is doing is to persist each step as it happens. Events are appended
 * to `ResearchReport.progress` and the report view polls them; after the run
 * the same array reads as the run's history.
 *
 * Split into two sections because the run genuinely has two subjects: the
 * company (pages, analysis, signals, opportunities) and its people (names,
 * emails, contacts created). The UI renders them as separate timelines.
 */

import { prisma } from "~~/server/lib/db";
import type { Prisma } from "~~/server/generated/prisma/client";

export type ProgressSection = "company" | "people";

export type ProgressStatus = "started" | "done" | "warning" | "failed";

export type ResearchProgressEvent = {
  at: string;
  section: ProgressSection;
  /** Stable key so a "started" line can be replaced by its "done" line. */
  stage: string;
  status: ProgressStatus;
  label: string;
  /** What was found — counts, names, URLs. Shown under the label. */
  detail?: string;
};

/**
 * Collects events in memory and mirrors them onto the report row after each
 * change. A `done` for a stage replaces that stage's `started` entry, so the
 * log reads as results, not as start/stop chatter. Persistence failures are
 * swallowed: a progress write must never kill the run it is describing.
 */
export function createProgressLog(reportId: string) {
  const events: ResearchProgressEvent[] = [];

  async function flush() {
    try {
      await prisma.researchReport.update({
        where: { id: reportId },
        data: { progress: events as unknown as Prisma.InputJsonValue },
      });
    } catch (error) {
      console.warn(`[research] progress write failed for ${reportId}`, error);
    }
  }

  async function record(
    section: ProgressSection,
    stage: string,
    status: ProgressStatus,
    label: string,
    detail?: string,
  ) {
    const event: ResearchProgressEvent = {
      at: new Date().toISOString(),
      section,
      stage,
      status,
      label,
      ...(detail ? { detail } : {}),
    };
    const index = events.findIndex((e) => e.section === section && e.stage === stage);
    if (index >= 0 && status !== "warning") events.splice(index, 1, event);
    else events.push(event);
    await flush();
  }

  return {
    events,
    start: (section: ProgressSection, stage: string, label: string) =>
      record(section, stage, "started", label),
    done: (section: ProgressSection, stage: string, label: string, detail?: string) =>
      record(section, stage, "done", label, detail),
    warn: (section: ProgressSection, stage: string, label: string, detail?: string) =>
      record(section, stage, "warning", label, detail),
    fail: (section: ProgressSection, stage: string, label: string, detail?: string) =>
      record(section, stage, "failed", label, detail),
  };
}

export type ProgressLog = ReturnType<typeof createProgressLog>;

/** Safe reader for the JSON column; unusable entries are dropped, not thrown. */
export function readResearchProgress(value: unknown): ResearchProgressEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ResearchProgressEvent =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as ResearchProgressEvent).label === "string" &&
      ((entry as ResearchProgressEvent).section === "company" ||
        (entry as ResearchProgressEvent).section === "people"),
  );
}
