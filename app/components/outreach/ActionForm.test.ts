import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { defineComponent, h, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import ActionForm from "./ActionForm.vue";
import SubmitButton from "./SubmitButton.vue";
import type { ActionState } from "./actions";

/**
 * `ActionForm` + `SubmitButton` replace React's `useActionState` /
 * `useFormStatus` pair, so the behaviour worth pinning is: the button reports
 * pending while the action is in flight, the returned state is rendered, and
 * the result reaches the page so it can refresh its data.
 */
function mountForm(action: () => Promise<ActionState>) {
  const Host = defineComponent({
    setup(_, { emit }) {
      return () =>
        h(
          ActionForm,
          { action, onResult: (state: ActionState) => emit("result", state) },
          { default: () => h(SubmitButton, null, { default: () => "Send" }) },
        );
    },
  });

  return mount(Host, { global: { plugins: [[PrimeVue, { theme: "none" }]] } });
}

describe("ActionForm", () => {
  it("renders the action's success message", async () => {
    const wrapper = mountForm(async () => ({ message: "Sent (abc)." }));

    await wrapper.find("form").trigger("submit");
    await nextTick();

    expect(wrapper.find(".text-positive").text()).toBe("Sent (abc).");
    expect(wrapper.find(".text-danger").exists()).toBe(false);
  });

  it("renders the action's error message", async () => {
    const wrapper = mountForm(async () => ({
      error: "Blocked by compliance: suppressed",
    }));

    await wrapper.find("form").trigger("submit");
    await nextTick();

    expect(wrapper.find(".text-danger").text()).toBe(
      "Blocked by compliance: suppressed",
    );
  });

  it("emits the result so the page can refresh", async () => {
    const wrapper = mountForm(async () => ({ message: "Draft rejected." }));

    await wrapper.find("form").trigger("submit");
    await nextTick();

    expect(wrapper.emitted("result")).toEqual([[{ message: "Draft rejected." }]]);
  });

  it("emits nothing when the action returns no state", async () => {
    const wrapper = mountForm(async () => undefined);

    await wrapper.find("form").trigger("submit");
    await nextTick();

    expect(wrapper.emitted("result")).toBeUndefined();
  });

  it("puts the submit button in its pending state while the action runs", async () => {
    let release: (state: ActionState) => void = () => {};
    const action = () =>
      new Promise<ActionState>((resolve) => {
        release = resolve;
      });

    const wrapper = mountForm(action);
    const button = () => wrapper.find("button");

    expect(button().text()).toBe("Send");
    expect(button().attributes("disabled")).toBeUndefined();

    await wrapper.find("form").trigger("submit");
    await nextTick();

    expect(button().text()).toBe("Working...");
    expect(button().attributes("disabled")).toBeDefined();

    release({ message: "done" });
    await nextTick();
    await nextTick();

    expect(button().text()).toBe("Send");
    expect(button().attributes("disabled")).toBeUndefined();
  });

  it("ignores a second submit while one is already in flight", async () => {
    const action = vi.fn(
      () => new Promise<ActionState>(() => {}),
    );
    const wrapper = mountForm(action);

    await wrapper.find("form").trigger("submit");
    await nextTick();
    await wrapper.find("form").trigger("submit");

    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe("SubmitButton", () => {
  it("is a submit button and honours its own disabled prop", () => {
    const wrapper = mount(SubmitButton, {
      props: { disabled: true, title: "Resolve the blocks above before sending" },
      slots: { default: "Approve & Send" },
      global: { plugins: [[PrimeVue, { theme: "none" }]] },
    });

    expect(wrapper.attributes("type")).toBe("submit");
    expect(wrapper.attributes("disabled")).toBeDefined();
    expect(wrapper.attributes("title")).toBe(
      "Resolve the blocks above before sending",
    );
    expect(wrapper.text()).toBe("Approve & Send");
  });
});
