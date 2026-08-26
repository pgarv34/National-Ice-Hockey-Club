import type { Config, Context } from "@netlify/functions";
import {
  adminConfigured,
  expiredCookie,
  isAuthenticated,
  sessionCookie,
  verifyPassword,
} from "../lib/admin-auth.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async (req: Request, _context: Context) => {
  if (req.method === "GET") {
    return Response.json({
      configured: adminConfigured(),
      authenticated: isAuthenticated(req),
    });
  }

  if (req.method === "DELETE") {
    return new Response(null, { status: 204, headers: { "set-cookie": expiredCookie() } });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  if (!adminConfigured()) {
    return Response.json(
      {
        error: "admin_not_configured",
        message:
          "Set the ADMIN_PASSWORD environment variable on this site to enable the roster area.",
      },
      { status: 503 },
    );
  }

  let password: unknown;
  try {
    ({ password } = await req.json());
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!verifyPassword(password)) {
    // Small fixed delay to blunt rapid guessing.
    await sleep(400);
    return Response.json({ error: "invalid_password" }, { status: 401 });
  }

  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie() } });
};

export const config: Config = {
  path: "/api/admin/session",
};
