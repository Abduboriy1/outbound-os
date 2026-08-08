/**
 * The lead workspace's shared data.
 *
 * `src/app/(app)/leads/[id]/layout.tsx` and each tab both called `getLead()`
 * server-side. Nuxt's equivalent of that layout is the parent route
 * `app/pages/leads/[id].vue`, which fetches `/api/leads/:id` once and provides
 * the result here; the tabs inject it instead of re-fetching. Anything that
 * mutates the lead calls `refreshNuxtData()`, which re-runs the parent's
 * `useFetch` and updates every tab at once.
 */
import { inject, provide, type ComputedRef, type InjectionKey } from "vue";
import type { LeadDetailResponse } from "./api-types";

export type LeadWorkspace = ComputedRef<LeadDetailResponse>;

export const leadWorkspaceKey: InjectionKey<LeadWorkspace> = Symbol("leadWorkspace");

export function provideLeadWorkspace(workspace: LeadWorkspace) {
  provide(leadWorkspaceKey, workspace);
}

export function useLeadWorkspace(): LeadWorkspace {
  const workspace = inject(leadWorkspaceKey);
  if (!workspace)
    throw new Error("useLeadWorkspace() must be used inside the lead workspace route");
  return workspace;
}
