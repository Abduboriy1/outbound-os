/**
 * What we are actually offering, fed to the outreach and reply agents
 * (plan §15, §50).
 *
 * This is deliberately a constant rather than a settings row: the offer is
 * part of the product's positioning, and an offer that drifts per message is
 * how outreach stops sounding like a person. See NOTES-agent-c.md for the
 * schema request that would make it user-editable.
 */

export type Offer = {
  summary: string;
  entryPoint: string;
  constraints: string[];
};

export const DEFAULT_OFFER: Offer = {
  summary:
    "Custom business process automation and internal tools: removing repetitive manual work, connecting systems that do not talk to each other, and replacing spreadsheet-driven operations with something maintainable.",
  entryPoint:
    "A free workflow review - a short call to map one repetitive process end to end and say honestly whether it is worth automating.",
  constraints: [
    "Never promise a fixed price or timeline in a first message.",
    "Never claim experience in an industry that is not backed by a case study.",
    "Never imply the work is quick; it is worth doing only when the process is worth fixing.",
  ],
};

export function offerForUser(): Offer {
  return DEFAULT_OFFER;
}
