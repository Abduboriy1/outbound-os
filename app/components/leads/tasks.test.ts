import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it, vi } from "vitest";
import TaskGroups from "./TaskGroups.vue";
import UiBadge from "../ui/UiBadge.vue";
import UiButton from "../ui/UiButton.vue";
import UiCard from "../ui/UiCard.vue";
import UiCardHeader from "../ui/UiCardHeader.vue";
import UiEmptyState from "../ui/UiEmptyState.vue";
import { dueBucket, groupByDue } from "~~/shared/leads/due";
import type { TaskRow } from "./types";

/** Covers the port of `src/components/leads/tasks.tsx` and its due grouping. */
const plugins: [[typeof PrimeVue, { theme: string }]] = [[PrimeVue, { theme: "none" }]];

const global = {
  plugins,
  components: { UiBadge, UiButton, UiCard, UiCardHeader, UiEmptyState },
  stubs: { NuxtLink: { template: "<a><slot /></a>" } },
  mocks: { relativeTime: () => "in 2 days" },
};

/** Local time: `dueBucket` compares against the operator's own day boundary. */
const NOW = new Date(2026, 2, 9, 12, 0);

function task(over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "t1",
    title: "Prepare proposal",
    detail: null,
    dueAt: null,
    status: "OPEN",
    createdByAi: false,
    ...over,
  };
}

describe("dueBucket", () => {
  it("splits late work from scheduled work", () => {
    expect(dueBucket(null, NOW)).toBe("none");
    expect(dueBucket(new Date(2026, 2, 8, 23, 59), NOW)).toBe("overdue");
    expect(dueBucket(new Date(2026, 2, 9, 0, 0), NOW)).toBe("today");
    expect(dueBucket(new Date(2026, 2, 9, 23, 59), NOW)).toBe("today");
    expect(dueBucket(new Date(2026, 2, 10, 0, 30), NOW)).toBe("upcoming");
  });
});

describe("groupByDue", () => {
  it("returns every bucket, empty ones included", () => {
    const groups = groupByDue([1], () => null, NOW);
    expect(Object.keys(groups).sort()).toEqual(["none", "overdue", "today", "upcoming"]);
    expect(groups.none).toEqual([1]);
  });
});

describe("TaskGroups", () => {
  it("renders the empty state with the caller's copy", () => {
    const wrapper = mount(TaskGroups, {
      props: {
        tasks: [],
        action: vi.fn(),
        emptyTitle: "No tasks on this lead",
        emptyDescription: "Add the next concrete step.",
      },
      global,
    });
    expect(wrapper.text()).toContain("No tasks on this lead");
  });

  it("groups tasks and labels each bucket with its count", () => {
    const wrapper = mount(TaskGroups, {
      props: {
        tasks: [
          task({ id: "a", dueAt: "2026-03-01T09:00:00.000Z" }),
          task({ id: "b", dueAt: "2026-03-02T09:00:00.000Z" }),
          task({ id: "c" }),
        ],
        action: vi.fn(),
        showLead: false,
        now: NOW,
      },
      global,
    });

    const text = wrapper.text();
    expect(text).toContain("Overdue");
    expect(text).toContain("No due date");
    expect(text).not.toContain("Today");
    expect(wrapper.findAll("li")).toHaveLength(3);
  });

  it("submits the status the button stands for, with the lead id", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(TaskGroups, {
      props: { tasks: [task()], action, leadId: "lead-1", showLead: false, now: NOW },
      global,
    });

    const forms = wrapper.findAll("form");
    expect(forms).toHaveLength(2); // Done and Cancel

    await forms[0]!.trigger("submit");
    expect(action).toHaveBeenCalledWith({ id: "t1", leadId: "lead-1", status: "DONE" });

    await forms[1]!.trigger("submit");
    expect(action).toHaveBeenCalledWith({
      id: "t1",
      leadId: "lead-1",
      status: "CANCELLED",
    });
  });

  it("offers a single reopen action once a task is closed", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(TaskGroups, {
      props: { tasks: [task({ status: "DONE" })], action, showLead: false, now: NOW },
      global,
    });

    expect(wrapper.text()).toContain("done");
    const forms = wrapper.findAll("form");
    expect(forms).toHaveLength(1);
    await forms[0]!.trigger("submit");
    expect(action).toHaveBeenCalledWith({ id: "t1", status: "OPEN" });
  });

  it("marks AI-created tasks", () => {
    const wrapper = mount(TaskGroups, {
      props: { tasks: [task({ createdByAi: true })], action: vi.fn(), now: NOW },
      global,
    });
    expect(wrapper.text()).toContain("ai");
  });
});
