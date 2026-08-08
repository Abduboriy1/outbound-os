import { z } from "zod";
import { fail, ok, parseBody, publicRoute } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";
import { createSession, verifyPassword } from "~~/server/lib/auth";

/**
 * Replaces the Next server action `loginAction` in `src/app/(auth)/actions.ts`.
 * Server actions have no Nuxt equivalent, so the two auth forms post here
 * instead. The credential rules, the deliberately identical failure message and
 * the audit entry are unchanged; only the transport differs.
 */
const credentials = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export default publicRoute(async (event) => {
  const parsed = credentials.safeParse(await parseBody(event, z.unknown()));
  if (!parsed.success) return fail(parsed.error.issues[0].message, 422);

  const user = await prisma.user.findFirst({
    where: { email: parsed.data.email.toLowerCase(), deletedAt: null },
  });
  // Same message either way so the form cannot be used to enumerate accounts.
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return fail("Incorrect email or password", 401);
  }

  await createSession(event, user.id);
  await audit({ userId: user.id, action: "auth.login", entityType: "user", entityId: user.id });

  return ok({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tone: user.tone,
    timezone: user.timezone,
  });
});
