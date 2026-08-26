import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

const COOKIE_NAME = "nihc_admin";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "";
}

/**
 * The admin area fails closed: with no ADMIN_PASSWORD configured there is no
 * password that can unlock it, rather than a blank password that unlocks it.
 */
export function adminConfigured(): boolean {
  return adminPassword().length > 0;
}

function sign(payload: string): string {
  return createHmac("sha256", `nihc-admin-v1:${adminPassword()}`)
    .update(payload)
    .digest("base64url");
}

function digest(value: string): Buffer {
  return createHmac("sha256", "nihc-compare").update(value).digest();
}

/** Constant-time comparison over fixed-length digests. */
function equal(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export function verifyPassword(supplied: unknown): boolean {
  if (!adminConfigured() || typeof supplied !== "string") return false;
  return equal(supplied, adminPassword());
}

export function sessionCookie(): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${expiresAt}.${randomBytes(8).toString("hex")}`;
  const token = `${payload}.${sign(payload)}`;
  return [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ].join("; ");
}

export function expiredCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export function isAuthenticated(req: Request): boolean {
  if (!adminConfigured()) return false;

  const cookies = req.headers.get("cookie") ?? "";
  const match = cookies.match(/(?:^|;\s*)nihc_admin=([^;]+)/);
  if (!match) return false;

  const parts = match[1].split(".");
  if (parts.length !== 3) return false;

  const [expiresAt, nonce, signature] = parts;
  if (!equal(signature, sign(`${expiresAt}.${nonce}`))) return false;

  return Number(expiresAt) > Date.now();
}

/** Shared guard: returns a Response to short-circuit with, or null when allowed. */
export function guard(req: Request): Response | null {
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
  if (!isAuthenticated(req)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  return null;
}
