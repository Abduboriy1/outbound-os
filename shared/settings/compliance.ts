/**
 * `ComplianceValues` from
 * `src/app/(app)/settings/compliance/compliance-form.tsx`.
 *
 * It lives here rather than beside the form because a `<script setup>` block
 * cannot export a type, and both the page (which receives it from
 * `/api/settings/compliance`) and the form (which takes it as a prop) need it.
 */
export type ComplianceValues = {
  senderName: string;
  senderEmail: string;
  physicalAddress: string;
  unsubscribeText: string;
  dailySendLimit: number;
};
