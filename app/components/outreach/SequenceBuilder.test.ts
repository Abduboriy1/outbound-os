import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import SequenceBuilder from "./SequenceBuilder.vue";
import type { ActionState } from "./actions";
import type { SequenceDraftStep } from "./types";

type BuilderAction = (input: {
  name: string;
  description?: string;
  steps: SequenceDraftStep[];
}) => Promise<ActionState>;

/** Plan §23 — the starter sequence is day 0, 4, 10, 20. */
function mountBuilder(action = vi.fn<BuilderAction>(async () => ({}))) {
  const wrapper = mount(SequenceBuilder, {
    props: { action },
    global: { plugins: [[PrimeVue, { theme: "none" }]] },
  });
  return { wrapper, action };
}

describe("SequenceBuilder", () => {
  it("starts from the plan's four steps", () => {
    const { wrapper } = mountBuilder();
    const days = wrapper
      .findAll('input[type="number"]')
      .map((input) => (input.element as HTMLInputElement).value);

    expect(days).toEqual(["0", "4", "10", "20"]);
  });

  it("adds a step five days after the last one", async () => {
    const { wrapper } = mountBuilder();

    await wrapper.findAll("button").find((b) => b.text() === "Add step")!.trigger("click");
    await nextTick();

    const days = wrapper
      .findAll('input[type="number"]')
      .map((input) => (input.element as HTMLInputElement).value);
    expect(days).toEqual(["0", "4", "10", "20", "25"]);
  });

  it("removes the step that was clicked", async () => {
    const { wrapper } = mountBuilder();

    await wrapper.findAll("button").filter((b) => b.text() === "Remove")[1]!.trigger("click");
    await nextTick();

    const days = wrapper
      .findAll('input[type="number"]')
      .map((input) => (input.element as HTMLInputElement).value);
    expect(days).toEqual(["0", "10", "20"]);
  });

  it("hands the edited steps to the action", async () => {
    const { wrapper, action } = mountBuilder();

    await wrapper.find('input[name="name"]').setValue("Cold outbound");
    await wrapper.find('textarea[name="description"]').setValue("First touch");
    await wrapper.findAll('input[type="number"]')[0]!.setValue("2");
    await wrapper.find("form").trigger("submit");
    await nextTick();

    expect(action).toHaveBeenCalledTimes(1);
    const input = action.mock.calls[0][0];
    expect(input.name).toBe("Cold outbound");
    expect(input.description).toBe("First touch");
    expect(input.steps[0]).toEqual({
      dayOffset: 2,
      purpose: "Initial personalised message",
      channel: "EMAIL",
    });
    expect(input.steps).toHaveLength(4);
  });
});
