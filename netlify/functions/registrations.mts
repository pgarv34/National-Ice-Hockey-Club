import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { db } from "../../db/index.js";
import { registrations } from "../../db/schema.js";
import {
  MAX_PHOTO_BYTES,
  newReference,
  parseRegistration,
} from "../lib/registration-input.js";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  const fields: Record<string, unknown> = {};
  let photo: File | null = null;

  try {
    if (contentType.includes("application/json")) {
      Object.assign(fields, await req.json());
    } else {
      const form = await req.formData();
      for (const [key, value] of form.entries()) {
        if (value instanceof File) {
          if (key === "photo" && value.size > 0) photo = value;
        } else {
          fields[key] = value;
        }
      }
    }
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  // Honeypot: accept quietly so bots get no signal, but store nothing.
  if (typeof fields["bot-field"] === "string" && fields["bot-field"].trim() !== "") {
    return Response.json({ reference: newReference() }, { status: 201 });
  }

  const { errors, value } = parseRegistration(fields);

  if (photo) {
    if (!PHOTO_TYPES.includes(photo.type)) {
      errors.photo = "Upload a JPEG, PNG or WebP image.";
    } else if (photo.size > MAX_PHOTO_BYTES) {
      errors.photo = "That image is larger than 5 MB.";
    }
  }

  if (Object.keys(errors).length > 0 || !value) {
    return Response.json({ error: "validation_failed", fields: errors }, { status: 422 });
  }

  let photoKey: string | null = null;
  if (photo) {
    try {
      const store = getStore("player-photos");
      const extension = photo.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      photoKey = `${value.reference}.${extension}`;
      await store.set(photoKey, await photo.arrayBuffer(), {
        metadata: { contentType: photo.type, uploadedAt: new Date().toISOString() },
      });
    } catch (error) {
      // A failed photo upload must not lose the registration itself.
      console.error("player photo upload failed", error);
      photoKey = null;
    }
  }

  try {
    const [row] = await db
      .insert(registrations)
      .values({ ...value, photoKey })
      .returning({ reference: registrations.reference });

    return Response.json(
      {
        reference: row.reference,
        message: "Registration received.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("registration insert failed", error);
    return Response.json(
      { error: "storage_failed", message: "We could not save that registration. Please try again." },
      { status: 500 },
    );
  }
};

export const config: Config = {
  path: "/api/registrations",
  method: ["POST"],
};
