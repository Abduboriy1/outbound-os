import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it } from "vitest";
import ActivityList from "./ActivityList.vue";
import ScoreBadge from "./ScoreBadge.vue";
import StageBadge from "./StageBadge.vue";
import UiBadge from "../ui/UiBadge.vue";
import UiEmptyState from "../ui/UiEmptyState.vue";
import { formatDate, scoreTone, toDate, toDateInputValue } from "./display";
import type { ActivityRow } from "./types";

/**
 * Covers the port of `src/components/leads/display.tsx`.
 *
 * Nuxt's auto-imports are not available in a plain vitest run (MIGRATION.md §7),
 * so `UiBadge` / `UiEmptyState` are registered explicitly and the auto-imported
 * `relativeTime` helper is supplied through `global.mocks`.
 */
const plugins: [[typeof PrimeVue, { theme: string }]] = [[PrimeVue, { theme: "none" }]];

const global = {
  plugins,
  components: { UiBadge, UiEmptyState },
  mocks: { relativeTime: () => "2 days ago" },
};

describe("formatDate", () => {
  it("renders an em dash for a missing date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });

  it("formats a Date and an ISO string identically", () => {
    const iso = "2026-03-09T12:00:00.000Z";
    expect(formatDate(iso)).toBe("09 Mar 2026");
    expect(formatDate(new Date(iso))).toBe("09 Mar 2026");
  });
});

describe("toDateInputValue", () => {
  it("returns an empty string for a missing date", () => {
    expect(toDateInputValue(null)).toBe("");
  });

  it("returns yyyy-mm-dd", () => {
    expect(toDateInputValue(new Date("2026-03-09T12:00:00.000Z"))).toBe("2026-03-09");
  });
});

describe("toDate", () => {
  it("revives the ISO strings that arrive over JSON", () => {
    expect(toDate("2026-03-09T12:00:00.000Z")).toBeInstanceOf(Date);
    expect(toDate(null)).toBeNull();
  });
});

describe("scoreTone", () => {
  it("steps through the four bands", () => {
    expect(scoreTone(90)).toBe("positive");
    expect(scoreTone(75)).toBe("positive");
    expect(scoreTone(50)).toBe("accent");
    expect(scoreTone(25)).toBe("warning");
    expect(scoreTone(0)).toBe("neutral");
  });
});

describe("StageBadge", () => {
  it("renders the stage's label and tone", () => {
    const wrapper = mount(StageBadge, { props: { stage: "READY_FOR_OUTREACH" }, global });
    expect(wrapper.text()).toBe("Ready for outreach");
    expect(wrapper.html()).toContain("bg-accent-soft");
  });

  it("uses the danger tone for a lost lead", () => {
    const wrapper = mount(StageBadge, { props: { stage: "LOST" }, global });
    expect(wrapper.text()).toBe("Lost");
    expect(wrapper.html()).toContain("text-danger");
  });
});

describe("ScoreBadge", () => {
  it("says unscored when the score is null", () => {
    const wrapper = mount(ScoreBadge, { props: { score: null }, global });
    expect(wrapper.text()).toBe("unscored");
    expect(wrapper.html()).toContain("text-muted");
  });

  it("renders the number in its tone", () => {
    const wrapper = mount(ScoreBadge, { props: { score: 82 }, global });
    expect(wrapper.text()).toBe("82");
    expect(wrapper.html()).toContain("bg-positive-soft");
  });
});

describe("ActivityList", () => {
  const activity = (over: Partial<ActivityRow> = {}): ActivityRow => ({
    id: "a1",
    type: "NOTE",
    summary: "Called the ops lead",
    detail: null,
    actorType: "HUMAN",
    occurredAt: "2026-03-09T12:00:00.000Z",
    ...over,
  });

  it("shows the empty state with the caller's copy", () => {
    const wrapper = mount(ActivityList, {
      props: { activities: [], emptyTitle: "Nothing yet", emptyDescription: "Log a call." },
      global,
    });
    expect(wrapper.text()).toContain("Nothing yet");
    expect(wrapper.text()).toContain("Log a call.");
  });

  it("lists activities with an actor badge", () => {
    const wrapper = mount(ActivityList, {
      props: { activities: [activity(), activity({ id: "a2", actorType: "AI" })] },
      global,
    });
    expect(wrapper.findAll("li")).toHaveLength(2);
    expect(wrapper.text()).toContain("human");
    expect(wrapper.text()).toContain("ai");
  });

  it("hides a detail that only repeats the summary", () => {
    const same = mount(ActivityList, {
      props: { activities: [activity({ detail: "Called the ops lead" })] },
      global,
    });
    expect(same.findAll("p")).toHaveLength(2); // summary + relative time

    const different = mount(ActivityList, {
      props: { activities: [activity({ detail: "They asked for pricing" })] },
      global,
    });
    expect(different.text()).toContain("They asked for pricing");
  });
});
