import { z } from "zod";
import { HttpError, ok, parseBody, route } from "~~/server/lib/api";
import { ComplianceError } from "~~/server/lib/compliance";
import { approveAndSend } from "~~/server/lib/outreach/send";

const body = z.object({
  /** Required, and must be literally true: approval is never implied. */
  approve: z.literal(true),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
});

/**
 * Approve and send (plan §16, §38). This is the only HTTP endpoint that can
 * cause a message to leave the system, it requires an authenticated human
 * session, and it delegates the compliance gate to `approveAndSend`.
 */
export default route(async (event, { user, params }) => {
  const input = await parseBody(event, body);
  try {
    const result = await approveAndSend({
      userId: user.id,
      draftId: params.id,
      subject: input.subject ?? null,
      body: input.bodyText ?? null,
    });
    return ok({
      draftId: result.draft.id,
      status: result.draft.status,
      messageId: result.messageId,
      providerMessageId: result.providerMessageId,
    });
  } catch (error) {
    if (error instanceof ComplianceError) {
      throw new HttpError(`Blocked by compliance: ${error.message}`, 422);
    }
    throw error;
  }
});
