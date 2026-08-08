import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it } from "vitest";
import UiBadge from "./UiBadge.vue";

/**
 * A worked example of testing a component from the UI kit.
 *
 * The only setup a UI-kit component needs is the PrimeVue plugin, because the
 * wrappers render real PrimeVue components underneath. Copy the `global.plugins`
 * line into any component test. Composables that Nuxt auto-imports
 * (`useRoute`, `useState`, `$fetch`, ...) are *not* available here — stub them
 * with `vi.mock` or test those components through their props instead.
 */
function mountBadge(props: Record<string, unknown>, slot = "Qualified") {
  return mount(UiBadge, {
    props,
    slots: { default: slot },
    global: { plugins: [[PrimeVue, { theme: "none" }]] },
  });
}

describe("UiBadge", () => {
  it("renders its slot", () => {
    expect(mountBadge({}).text()).toBe("Qualified");
  });

  it("defaults to the neutral tone", () => {
    expect(mountBadge({}).html()).toContain("bg-surface-muted");
  });

  it("applies the tone classes", () => {
    expect(mountBadge({ tone: "positive" }).html()).toContain("bg-positive-soft");
    expect(mountBadge({ tone: "danger" }).html()).toContain("text-danger");
  });

  it("merges a caller-supplied class rather than dropping it", () => {
    const html = mountBadge({ tone: "accent", class: "ml-2" }).html();
    expect(html).toContain("ml-2");
    expect(html).toContain("bg-accent-soft");
  });
});
