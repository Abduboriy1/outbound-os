import type { InjectionKey, Ref } from "vue";

/**
 * Stands in for React's `useFormStatus()`: `ActionForm` provides its pending
 * ref and `SubmitButton` injects it, so a submit button anywhere inside the
 * form knows the action is in flight without being passed a prop.
 */
export const ACTION_FORM_PENDING: InjectionKey<Ref<boolean>> =
  Symbol("outreachActionFormPending");
