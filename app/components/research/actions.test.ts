import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createIcpAction,
  deleteIcpAction,
  makeDefaultIcpAction,
  rerunResearchAction,
  startResearchAction,
  updateIcpAction,
} from "./actions";
import { EMPTY_ICP } from "./icp";
import type { IcpEditorValues } from "./types";

/**
 * Ports of the ICP and research-queue server actions. What matters is that the
 * body sent matches `icpSchema`, that empty rule rows are dropped the way the
 * action's `readRules` dropped them, and that a 422's first issue is the
 * message shown — the server action surfaced `error.issues[0].message`.
 */
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ data: { id: "icp-1" } });
  vi.stubGlobal("$fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function values(overrides: Partial<IcpEditorValues> = {}): IcpEditorValues {
  return {
    ...EMPTY_ICP,
    name: "Logistics Automation ICP",
    description: "Mid-market carriers",
    industries: ["Logistics", "Trucking"],
    ...overrides,
  };
}

describe("createIcpAction", () => {
  it("posts the profile and returns the new id for the redirect", async () => {
    const result = await createIcpAction(values());

    expect(fetchMock).toHaveBeenCalledWith("/api/icps", {
      method: "POST",
      body: expect.objectContaining({
        name: "Logistics Automation ICP",
        industries: ["Logistics", "Trucking"],
        isDefault: false,
        weights: EMPTY_ICP.weights,
      }),
    });
    expect(result).toEqual({ id: "icp-1" });
  });

  it("drops half-filled rule rows, as `readRules` did", async () => {
    await createIcpAction(
      values({
        rules: [
          { field: "industry", operator: "equals", value: "Logistics", weight: 20 },
          { field: "", operator: "equals", value: "", weight: 10 },
          { field: "size", operator: "gte", value: "  ", weight: 10 },
        ],
      }),
    );

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: {
        rules: [
          { field: "industry", operator: "equals", value: "Logistics", weight: 20 },
        ],
      },
    });
  });

  it("surfaces the first validation issue", async () => {
    fetchMock.mockRejectedValue({
      data: {
        error: "Validation failed",
        details: [{ message: "Name is required" }],
      },
    });

    expect(await createIcpAction(values({ name: "" }))).toEqual({
      error: "Name is required",
    });
  });

  it("falls back to the endpoint's error when there are no details", async () => {
    fetchMock.mockRejectedValue({ data: { error: "Not authenticated" } });

    expect(await createIcpAction(values())).toEqual({
      error: "Not authenticated",
    });
  });
});

describe("updateIcpAction", () => {
  it("patches the profile in place", async () => {
    expect(await updateIcpAction("icp-1", values({ id: "icp-1" }))).toEqual({});
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/icps/icp-1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH" });
  });

  it("refuses to patch without an id", async () => {
    expect(await updateIcpAction("", values())).toEqual({ error: "ICP not found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("makeDefaultIcpAction", () => {
  it("resends the whole profile with isDefault set, rules included", async () => {
    await makeDefaultIcpAction(
      values({
        id: "icp-1",
        rules: [{ field: "industry", operator: "equals", value: "X", weight: 10 }],
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith("/api/icps/icp-1", {
      method: "PATCH",
      body: expect.objectContaining({
        isDefault: true,
        rules: [{ field: "industry", operator: "equals", value: "X", weight: 10 }],
      }),
    });
  });

  it("does nothing for an unsaved profile", async () => {
    expect(await makeDefaultIcpAction(values())).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("deleteIcpAction / rerunResearchAction", () => {
  it("deletes by id", async () => {
    await deleteIcpAction("icp-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/icps/icp-1", {
      method: "DELETE",
    });
  });

  it("re-runs a report in place", async () => {
    await rerunResearchAction("r1");
    expect(fetchMock).toHaveBeenCalledWith("/api/research/r1", { method: "POST" });
  });

  it("reports a refused re-run rather than swallowing it", async () => {
    fetchMock.mockRejectedValue({
      data: { error: "This report is already running" },
    });

    expect(await rerunResearchAction("r1")).toEqual({
      error: "This report is already running",
    });
  });
});

describe("startResearchAction", () => {
  it("starts the first run for a lead and returns the report id", async () => {
    fetchMock.mockResolvedValue({ data: { reportId: "r1", mode: "queued" } });

    expect(await startResearchAction("lead-1")).toEqual({ reportId: "r1" });
    expect(fetchMock).toHaveBeenCalledWith("/api/research", {
      method: "POST",
      body: { leadId: "lead-1" },
    });
  });

  it("surfaces a failed inline run instead of looking like it worked", async () => {
    fetchMock.mockRejectedValue({
      data: { error: "Research failed: no AI provider configured" },
    });

    expect(await startResearchAction("lead-1")).toEqual({
      error: "Research failed: no AI provider configured",
    });
  });

  it("does nothing without a lead", async () => {
    expect(await startResearchAction("")).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
