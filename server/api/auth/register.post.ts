import { z } from "zod";
import { fail, ok, parseBody, publicRoute } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";
import { createSession, hashPassword } from "~~/server/lib/auth";

/** Replaces the Next server action `registerAction`. */
const credentials = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
});

export default publicRoute(async (event) => {
  const parsed = credentials.safeParse(await parseBody(event, z.unknown()));
  if (!parsed.success) return fail(parsed.error.issues[0].message, 422);

  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    return fail("An account with that email already exists", 409);
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });

  await createSession(event, user.id);
  await audit({ userId: user.id, action: "auth.register", entityType: "user", entityId: user.id });

  return ok({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tone: user.tone,
    timezone: user.timezone,
  }, { status: 201 });
});
