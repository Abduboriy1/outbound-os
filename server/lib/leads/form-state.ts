/**
 * Shared shape for the CRM server actions. Kept out of the `"use server"`
 * modules because those may only export async functions.
 */
export type FormState = { error?: string; ok?: boolean } | undefined;

export type FormAction = (
  state: FormState,
  formData: FormData,
) => Promise<FormState>;

/** Actions used with a plain `<form action={...}>`, with no returned state. */
export type SimpleAction = (formData: FormData) => Promise<void>;

/** Turns a thrown HttpError/ZodError into a message the form can render. */
export function toFormError(error: unknown): FormState {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: { message: string }[] }).issues;
    return { error: issues[0]?.message ?? "Validation failed" };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Something went wrong" };
}
