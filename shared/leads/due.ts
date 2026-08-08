/**
 * Due-date bucketing, moved out of `server/lib/leads/filters.ts` — which also
 * builds Prisma `where` clauses and cannot be shared — so the task list and the
 * lead workspace can group by due date without a copy (MIGRATION.md §1).
 * `filters.ts` re-exports all four names.
 *
 * `due` accepts a string as well as a Date because a timestamp that came back
 * through an endpoint is an ISO string at runtime whatever Prisma's types say.
 */
export type DueBucket = "overdue" | "today" | "upcoming" | "none";

export type DueGroups<T> = Record<DueBucket, T[]>;

export function dueBucket(
  due: Date | string | null | undefined,
  now: Date,
): DueBucket {
  if (!due) return "none";
  const at = new Date(due);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  if (at.getTime() < startOfToday.getTime()) return "overdue";
  if (at.getTime() <= endOfToday.getTime()) return "today";
  return "upcoming";
}

/**
 * Plan §22 — the follow-up list is only useful when it separates what is late
 * from what is merely scheduled.
 */
export function groupByDue<T>(
  items: T[],
  getDue: (item: T) => Date | string | null | undefined,
  now: Date = new Date(),
): DueGroups<T> {
  const groups: DueGroups<T> = { overdue: [], today: [], upcoming: [], none: [] };
  for (const item of items) groups[dueBucket(getDue(item), now)].push(item);
  return groups;
}

export const BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  none: "No due date",
};

export const BUCKET_ORDER: DueBucket[] = ["overdue", "today", "upcoming", "none"];
