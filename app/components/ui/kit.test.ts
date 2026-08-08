import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import UiBadge from "./UiBadge.vue";
import UiButton from "./UiButton.vue";
import UiCard from "./UiCard.vue";
import UiForm from "./UiForm.vue";
import UiInput from "./UiInput.vue";
import UiProgressBar from "./UiProgressBar.vue";
import UiSelect from "./UiSelect.vue";
import UiTextarea from "./UiTextarea.vue";

/**
 * Pins the six kit primitives that run PrimeVue in `unstyled` mode and hand it
 * the React source's Tailwind class string through `pt.root`.
 *
 * These assertions are copied character-for-character out of
 * `src/components/ui/index.tsx`. They exist because that passthrough is the one
 * thing that would break silently on a PrimeVue major bump: PT section names
 * are not part of the type surface, so a renamed section type-checks fine and
 * simply stops applying the class. If one of these fails after a version
 * change, the component is rendering unstyled and naked.
 *
 * PrimeVue is pinned to the MIT 4.5.5 line — see the warning in MIGRATION.md
 * §8 before changing it.
 */
// The tuple annotation matters: without it TypeScript widens
// `[PrimeVue, options]` to an array and @vue/test-utils rejects it.
const primevue = {
  global: { plugins: [[PrimeVue, { theme: "none" }] as [typeof PrimeVue, object]] },
};

describe("UiButton", () => {
  it("renders the source base + size + variant classes", () => {
    const html = mount(UiButton, {
      props: { variant: "primary" },
      slots: { default: "Save" },
      ...primevue,
    }).html();

    expect(html).toContain(
      "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    );
    expect(html).toContain("h-9 px-3.5 text-sm");
    expect(html).toContain("bg-accent text-white hover:opacity-90");
    expect(html).toContain("Save");
  });

  it("defaults to the secondary variant at md size", () => {
    const html = mount(UiButton, { slots: { default: "x" }, ...primevue }).html();
    expect(html).toContain("border border-border bg-surface hover:bg-surface-muted");
    expect(html).toContain("h-9 px-3.5 text-sm");
  });

  it("applies the sm size", () => {
    const html = mount(UiButton, {
      props: { size: "sm", variant: "danger" },
      slots: { default: "x" },
      ...primevue,
    }).html();
    expect(html).toContain("h-7 px-2.5 text-xs");
    expect(html).toContain("bg-danger-soft text-danger");
  });

  it("passes native attributes and click through to the button element", async () => {
    const wrapper = mount(UiButton, {
      attrs: { type: "submit" },
      slots: { default: "Go" },
      ...primevue,
    });
    expect(wrapper.find("button").attributes("type")).toBe("submit");

    await wrapper.find("button").trigger("click");
    expect(wrapper.emitted("click")).toHaveLength(1);
  });
});

describe("UiInput", () => {
  it("renders the source class string", () => {
    expect(mount(UiInput, primevue).html()).toContain(
      "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-accent",
    );
  });

  it("supports v-model and lets attributes fall through", async () => {
    const wrapper = mount(UiInput, {
      props: { modelValue: "", "onUpdate:modelValue": (v: string | undefined) => wrapper.setProps({ modelValue: v }) },
      attrs: { name: "email", type: "email", required: true },
      ...primevue,
    });
    const input = wrapper.find("input");
    expect(input.attributes("name")).toBe("email");
    expect(input.attributes("type")).toBe("email");

    await input.setValue("a@b.com");
    expect(wrapper.props("modelValue")).toBe("a@b.com");
  });
});

describe("UiTextarea", () => {
  it("renders the source class string", () => {
    expect(mount(UiTextarea, primevue).html()).toContain(
      "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent",
    );
  });
});

describe("UiSelect", () => {
  it("renders a native select with slotted options by default", () => {
    const wrapper = mount(UiSelect, {
      slots: { default: '<option value="a">A</option>' },
      ...primevue,
    });
    expect(wrapper.find("select").exists()).toBe(true);
    expect(wrapper.find("option").text()).toBe("A");
    expect(wrapper.html()).toContain(
      "h-9 w-full rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-accent",
    );
  });

  it("switches to PrimeVue's Select when given options", () => {
    const wrapper = mount(UiSelect, {
      props: {
        options: [{ label: "A", value: "a" }],
        optionLabel: "label",
        optionValue: "value",
        placeholder: "Pick one",
      },
      ...primevue,
    });
    expect(wrapper.find("select").exists()).toBe(false);
    expect(wrapper.text()).toContain("Pick one");
  });
});

describe("UiBadge", () => {
  it("renders the source class string and tone map", () => {
    const html = mount(UiBadge, {
      props: { tone: "positive" },
      slots: { default: "Won" },
      ...primevue,
    }).html();
    expect(html).toContain(
      "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
    );
    expect(html).toContain("bg-positive-soft text-positive");
    expect(html).toContain("Won");
  });
});

describe("UiProgressBar", () => {
  it("renders the track and fill classes and the value/target caption", () => {
    const html = mount(UiProgressBar, {
      props: { value: 3, target: 10, tone: "warning" },
      ...primevue,
    }).html();
    expect(html).toContain("h-2 w-full overflow-hidden rounded-full bg-surface-muted");
    expect(html).toContain("h-full rounded-full bg-warning");
    expect(html).toContain("3 / 10");
  });

  it("reports the source ARIA range rather than a 0-100 one", () => {
    const root = mount(UiProgressBar, { props: { value: 3, target: 10 }, ...primevue })
      .find('[role="progressbar"]');
    expect(root.attributes("aria-valuenow")).toBe("3");
    expect(root.attributes("aria-valuemax")).toBe("10");
  });

  it("treats a zero target as 0% instead of dividing by zero", () => {
    const html = mount(UiProgressBar, { props: { value: 5, target: 0 }, ...primevue }).html();
    expect(html).toContain("width: 0%");
    expect(html).toContain("5 / 0");
  });
});

describe("UiCard", () => {
  it("renders the source class string and merges a caller class", () => {
    const html = mount(UiCard, {
      attrs: { class: "w-full max-w-sm" },
      slots: { default: "<p>body</p>" },
      ...primevue,
    }).html();
    expect(html).toContain(
      "rounded-lg border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
    );
    expect(html).toContain("w-full max-w-sm");
    expect(html).toContain("<p>body</p>");
  });

  it("keeps its inner wrappers layout-neutral", () => {
    // PrimeVue's Card has no default slot, so children go through `content`.
    // Both wrappers must stay `display: contents` or utilities such as `p-3`
    // and `flex` on the root would stop reaching the children.
    const html = mount(UiCard, { slots: { default: "x" }, ...primevue }).html();
    expect(html.match(/class="contents"/g)).toHaveLength(2);
  });
});

describe("UiForm", () => {
  it("validates through the zod resolver and exposes messages on $form", async () => {
    const schema = z.object({ email: z.string().email("Enter a valid email address") });

    const wrapper = mount(UiForm, {
      attachTo: document.body,
      props: { schema, initialValues: { email: "nope" } },
      slots: {
        default: `
          <template #default="{ $form }">
            <UiInput name="email" />
            <span class="err">{{ $form.email?.error?.message }}</span>
            <button type="submit">Go</button>
          </template>
        `,
      },
      global: {
        plugins: [[PrimeVue, { theme: "none" }]],
        // Fields register themselves by \`name\`, which only PrimeVue-backed
        // inputs can do. A bare <input> would never reach $form — see the note
        // in UiForm.vue.
        components: { UiInput },
      },
    });

    await wrapper.find("button").trigger("submit");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".err").text()).toBe("Enter a valid email address");

    const emitted = wrapper.emitted("submit");
    expect(emitted).toBeTruthy();
    const [event] = emitted![0] as [{ valid: boolean }];
    expect(event.valid).toBe(false);
  });
});
