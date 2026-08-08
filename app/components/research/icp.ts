/**
 * Values that `icp-editor.tsx` exported alongside the component. A Vue
 * `<script setup>` block cannot export anything besides the component, so
 * `EMPTY_ICP` and the operator list live here.
 */
import { DEFAULT_WEIGHTS } from "~~/shared/scoring/weights";
import type { IcpEditorValues } from "./types";

export const EMPTY_ICP: IcpEditorValues = {
  name: "",
  description: "",
  industries: [],
  geographies: [],
  problems: [],
  targetRoles: [],
  minEmployees: null,
  maxEmployees: null,
  minDealSize: null,
  maxDealSize: null,
  isDefault: false,
  weights: DEFAULT_WEIGHTS,
  rules: [],
};

export const RULE_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "gte",
  "lte",
  "exists",
];

export function numberOrNull(value: string) {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
