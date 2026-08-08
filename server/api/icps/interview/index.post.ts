import { z } from "zod";
import { ok, parseBody, route, HttpError } from "~~/server/lib/api";
import { aiService } from "~~/server/lib/ai";
import { systemPrompt, userTurn } from "~~/server/lib/ai/prompt";
import { jsonSchemaOf } from "~~/server/lib/ai/schema";
import { INTERVIEW_QUESTIONS, icpDraftSchema } from "~~/shared/icps/interview";

/**
 * The AI-assisted ICP interview (plan §7: "AI should help construct an ICP by
 * interviewing the user").
 *
 * The answers are the operator's own words about their own business, so they
 * are first-party context rather than untrusted documents. The result is a
 * *draft*: this endpoint never writes an Icp row. The user edits and saves it
 * through /api/icps.
 */

const ROLE = `
You are helping a solo software consultant define an ideal customer profile.
Work only from the answers given. Where an answer is vague, put the gap in
open_questions rather than inventing a specific. Prefer concrete, checkable
attributes (industry names, headcount ranges, job titles) over adjectives.
Problems must be described as the operational symptom the buyer would recognise,
not as the solution you would sell.
`;

const requestSchema = z.object({
  answers: z.record(z.string().max(40), z.string().trim().max(4000)),
});

export default route(async (event, { user }) => {
  const { answers } = await parseBody(event, requestSchema);

  const answered = INTERVIEW_QUESTIONS.map((q) => ({
    question: q.question,
    answer: answers[q.id]?.trim() ?? "",
  })).filter((entry) => entry.answer !== "");

  if (answered.length === 0) {
    throw new HttpError("Answer at least one question before drafting", 400);
  }

  const result = await aiService().run({
    // There is no dedicated ICP agent name in the shared contract; qualification
    // is the closest fit, since defining and applying an ICP are the same job.
    agent: "qualification",
    userId: user.id,
    request: {
      system: systemPrompt(ROLE),
      instruction: userTurn({
        task: "Propose an ideal customer profile from these interview answers.",
        context: { answers: answered },
      }),
      responseSchema: jsonSchemaOf(icpDraftSchema),
      maxTokens: 2500,
    },
    schema: icpDraftSchema,
  });

  // Returned as a proposal only. Nothing is persisted until the user saves.
  return ok({ draft: result.data, runId: result.runId, saved: false });
});
