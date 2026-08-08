import { ok, route } from "~~/server/lib/api";
import { INTERVIEW_QUESTIONS } from "~~/shared/icps/interview";

export default route(async () => ok({ questions: INTERVIEW_QUESTIONS }));
