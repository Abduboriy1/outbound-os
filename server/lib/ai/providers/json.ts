/**
 * Shared by every real provider: turning a model's reply into an object.
 *
 * A structured-output request is not a guarantee, so the text is parsed
 * defensively rather than trusted. Kept out of any one provider file so a new
 * provider does not have to import from a sibling to get the same tolerance.
 */

/**
 * Tolerates the two failure shapes seen in practice: a fenced code block, and
 * prose wrapped around the object. Anything else is a genuine failure.
 */
export function parseJson(text: string): unknown {
  if (!text) throw new Error("empty response");

  const candidates = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // try the next candidate
    }
  }
  throw new Error("response was not valid JSON");
}

/** The follow-up turn shown to a model whose previous reply could not be used. */
export function retryInstruction(reason: string) {
  return [
    `That reply could not be used: ${reason}.`,
    "Reply again with a single JSON object matching the requested schema.",
    "No prose, no markdown fences, no trailing commentary.",
  ].join(" ");
}
