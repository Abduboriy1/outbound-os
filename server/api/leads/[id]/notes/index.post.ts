import { z } from "zod";
import { ok, parseBody, route } from "~~/server/lib/api";
import { addLeadNote } from "~~/server/lib/leads/mutations";

/** The source trimmed the field and rejected an empty note with this message. */
const bodySchema = z.object({
  note: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, "A note cannot be empty"),
});

/**
 * Port of `addNoteAction` (`src/app/(app)/leads/actions.ts`). `addLeadNote`
 * writes the `NOTE` activity and bumps `lastActivityAt` in one transaction, and
 * throws `HttpError("Lead not found", 404)` for a lead that is not the
 * caller's.
 */
export default route(async (event, { user, params }) => {
  const { note } = await parseBody(event, bodySchema);
  await addLeadNote({ userId: user.id }, params.id, note);
  return ok({ ok: true }, { status: 201 });
});
