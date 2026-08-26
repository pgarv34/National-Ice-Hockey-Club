import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { registrations } from "../../db/schema.js";
import { guard } from "../lib/admin-auth.js";

export default async (req: Request, context: Context) => {
  const denied = guard(req);
  if (denied) return denied;

  const id = Number.parseInt(context.params.id ?? "", 10);
  if (!Number.isFinite(id)) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }

  const [row] = await db
    .select({ photoKey: registrations.photoKey })
    .from(registrations)
    .where(eq(registrations.id, id));

  if (!row?.photoKey) {
    return Response.json({ error: "no_photo" }, { status: 404 });
  }

  const store = getStore("player-photos");
  const result = await store.getWithMetadata(row.photoKey, { type: "arrayBuffer" });

  if (!result) {
    return Response.json({ error: "no_photo" }, { status: 404 });
  }

  const contentType =
    typeof result.metadata?.contentType === "string" ? result.metadata.contentType : "image/jpeg";

  return new Response(result.data, {
    headers: {
      "content-type": contentType,
      // Identity documents must never be cached by shared caches.
      "cache-control": "private, no-store",
    },
  });
};

export const config: Config = {
  path: "/api/admin/registrations/:id/photo",
  method: ["GET"],
};
