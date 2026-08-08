import { ok, route } from "~~/server/lib/api";
import { renderComplianceFooter } from "~~/server/lib/compliance";
import { complianceStatus } from "~~/server/lib/outreach/queries";

/**
 * The compliance panel on `src/app/(app)/outreach/approvals/page.tsx`: the
 * status row from `complianceStatus`, plus the rendered footer that page built
 * itself with `renderComplianceFooter`. Rendering it here keeps the preview and
 * the footer actually appended on send produced by the same function — the
 * point of that card is that they cannot differ.
 */
export default route(async (_event, { user }) => {
  const compliance = await complianceStatus(user.id);

  const footerPreview = compliance.configured
    ? renderComplianceFooter({
        senderName: compliance.senderName,
        senderEmail: compliance.senderEmail,
        physicalAddress: compliance.physicalAddress,
        unsubscribeText: compliance.unsubscribeText,
        dailySendLimit: compliance.dailySendLimit,
      })
    : null;

  return ok({ ...compliance, footerPreview });
});
