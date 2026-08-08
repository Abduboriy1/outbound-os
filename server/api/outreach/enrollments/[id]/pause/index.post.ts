import { z } from "zod";
import { notFound, ok, parseBody, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";
import { pauseEnrollment } from "~~/server/lib/outreach/sequences";

const PAUSE_REASONS = [
  "REPLIED",
  "BOUNCED",
  "OPTED_OUT",
  "SUPPRESSED",
  "MANUAL",
  "UNCONTACTABLE_STAGE",
  "NO_CONTACT_EMAIL",
] as const;

const bodySchema = z.object({
  reason: z.enum(PAUSE_REASONS).default("MANUAL"),
});

/**
 * Port of `pauseEnrollmentAction` (`src/app/(app)/outreach/actions.ts`).
 *
 * Deviation, deliberate: `pauseEnrollment` updates by id without scoping to the
 * caller, which was safe behind a server action reachable only from the user's
 * own page but is not safe on an addressable URL. Ownership is checked here
 * first, so an enrolment belonging to somebody else answers 404 rather than
 * being paused. Everything written afterwards is unchanged.
 */
export default route(async (event, { user, params }) => {
  const { reason } = await parseBody(event, bodySchema);

  const enrollment = await prisma.sequenceEnrollment.findFirst({
    where: { id: params.id, sequence: { userId: user.id } },
    select: { id: true },
  });
  if (!enrollment) notFound("Enrolment");

  return ok(await pauseEnrollment(params.id, reason, user.id));
});
