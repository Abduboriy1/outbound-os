import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it, vi } from "vitest";
import CompanyForm from "./CompanyForm.vue";
import DeleteForm from "./DeleteForm.vue";
import QuickLeadForm from "./QuickLeadForm.vue";
import UiButton from "../ui/UiButton.vue";
import UiField from "../ui/UiField.vue";
import UiInput from "../ui/UiInput.vue";
import UiSelect from "../ui/UiSelect.vue";
import UiTextarea from "../ui/UiTextarea.vue";
import { pickPrefixed } from "./actions";
import { ALL_STAGES } from "./constants";
import { toFormError } from "./form-state";

/**
 * Covers the port of `src/components/leads/forms.tsx`.
 *
 * The interesting part of the port is the contract change: React's
 * `useActionState` + `FormData` became an `action(values)` prop over `v-model`
 * state. These tests pin the value object each form submits, since the
 * endpoints parse it with the source's own zod schemas.
 */
const plugins: [[typeof PrimeVue, { theme: string }]] = [[PrimeVue, { theme: "none" }]];

const global = {
  plugins,
  components: { UiButton, UiField, UiInput, UiSelect, UiTextarea },
  stubs: { NuxtLink: { template: "<a><slot /></a>" } },
};

describe("CompanyForm", () => {
  it("submits every field, with the id when editing", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    const wrapper = mount(CompanyForm, {
      props: {
        action,
        defaults: { id: "c1", name: "Acme", domain: "acme.com", employeeCount: "42" },
      },
      global,
    });

    await wrapper.find("form").trigger("submit");

    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0]![0]).toEqual({
      id: "c1",
      name: "Acme",
      domain: "acme.com",
      website: "",
      industry: "",
      location: "",
      employeeCount: "42",
      sizeLabel: "",
      linkedinUrl: "",
      phone: "",
      description: "",
    });
  });

  it("omits the id when creating, and uses the caller's submit label", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(CompanyForm, {
      props: { action, submitLabel: "Create company" },
      global,
    });

    expect(wrapper.text()).toContain("Create company");
    await wrapper.find("form").trigger("submit");
    expect(action.mock.calls[0]![0]).not.toHaveProperty("id");
  });

  it("renders the action's error message as an alert", async () => {
    const action = vi.fn().mockResolvedValue({ error: "A company with that domain already exists" });
    const wrapper = mount(CompanyForm, { props: { action }, global });

    await wrapper.find("form").trigger("submit");
    await wrapper.vm.$nextTick();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toBe("A company with that domain already exists");
  });

  it("shows a cancel link only when a href is given", () => {
    const bare = mount(CompanyForm, { props: { action: vi.fn() }, global });
    expect(bare.text()).not.toContain("Cancel");

    const withCancel = mount(CompanyForm, {
      props: { action: vi.fn(), cancelHref: "/companies" },
      global,
    });
    expect(withCancel.text()).toContain("Cancel");
  });
});

describe("QuickLeadForm", () => {
  it("prefixes the company and contact fields the action splits on", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    const wrapper = mount(QuickLeadForm, {
      props: { action, icps: [], stages: ALL_STAGES },
      global,
    });

    await wrapper.find("form").trigger("submit");

    const values = action.mock.calls[0]![0] as Record<string, string>;
    expect(values["company.name"]).toBe("");
    expect(values["contact.decisionRole"]).toBe("UNKNOWN");
    expect(values["contact.influenceScore"]).toBe("0");
    // Lead fields stay unprefixed so `leadInputSchema` reads them directly.
    expect(values.stage).toBe("PROSPECT");
    expect(values.sourceType).toBe("MANUAL");
  });
});

describe("pickPrefixed", () => {
  it("strips the prefix and drops everything else", () => {
    expect(
      pickPrefixed({ "company.name": "Acme", "contact.email": "a@b.c", stage: "WON" }, "company."),
    ).toEqual({ name: "Acme" });
  });
});

describe("DeleteForm", () => {
  it("does nothing when the confirm is declined", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));

    const wrapper = mount(DeleteForm, { props: { action, id: "x1" }, global });
    await wrapper.find("form").trigger("submit");

    expect(action).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("submits the id once confirmed", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

    const wrapper = mount(DeleteForm, {
      props: { action, id: "x1", label: "Archive" },
      global,
    });
    expect(wrapper.text()).toBe("Archive");
    await wrapper.find("form").trigger("submit");

    expect(action).toHaveBeenCalledWith({ id: "x1" });
    vi.unstubAllGlobals();
  });
});

describe("toFormError", () => {
  it("prefers the endpoint's first validation detail", () => {
    expect(
      toFormError({
        data: { error: "Validation failed", details: [{ message: "Name is too long" }] },
      }),
    ).toEqual({ error: "Name is too long" });
  });

  it("falls back to the endpoint's error string", () => {
    expect(toFormError({ data: { error: "Lead not found" } })).toEqual({
      error: "Lead not found",
    });
  });

  it("reads a raw zod error, then a plain Error, then gives up", () => {
    expect(toFormError({ issues: [{ message: "Required" }] })).toEqual({
      error: "Required",
    });
    expect(toFormError(new Error("boom"))).toEqual({ error: "boom" });
    expect(toFormError("nope")).toEqual({ error: "Something went wrong" });
  });
});
