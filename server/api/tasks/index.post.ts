import { getQuery } from "h3";
import { ok, parseBody, route } from "~~/server/lib/api";
import { createTask } from "~~/server/lib/leads/mutations";
import { taskInputSchema } from "~~/server/lib/leads/schemas";

/** Callers outside the UI (jobs, the coach) create AI-attributed tasks here. */
export default route(async (event, { user }) => {
  const input = await parseBody(event, taskInputSchema);
  const createdByAi = getQuery(event).actor === "ai";
  return ok(
    await createTask(
      { userId: user.id, actorType: createdByAi ? "AI" : "HUMAN" },
      input,
      createdByAi,
    ),
    { status: 201 },
  );
});
