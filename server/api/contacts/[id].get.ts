import { notFound, ok, route } from "~~/server/lib/api";
import { getContact } from "~~/server/lib/leads/queries";

export default route(async (_event, { user, params }) => {
  const contact = await getContact(user.id, params.id);
  if (!contact) notFound("Contact");
  return ok(contact);
});
