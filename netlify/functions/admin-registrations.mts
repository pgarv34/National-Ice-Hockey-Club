import type { Config, Context } from "@netlify/functions";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { registrations } from "../../db/schema.js";
import { guard } from "../lib/admin-auth.js";

const STATUSES = ["pending", "approved", "waitlisted", "declined"];

const CSV_COLUMNS: Array<[string, keyof typeof registrations.$inferSelect]> = [
  ["Reference", "reference"],
  ["Submitted", "createdAt"],
  ["Status", "status"],
  ["First name", "firstName"],
  ["Last name", "lastName"],
  ["Date of birth", "dateOfBirth"],
  ["Email", "email"],
  ["Phone", "phone"],
  ["Tier", "tier"],
  ["Position", "position"],
  ["Handedness", "handedness"],
  ["Height (cm)", "heightCm"],
  ["Weight (kg)", "weightKg"],
  ["Preferred number", "preferredNumber"],
  ["Jersey size", "jerseySize"],
  ["Current club", "currentClub"],
  ["Seasons played", "seasonsPlayed"],
  ["Town", "town"],
  ["County", "county"],
  ["Guardian name", "guardianName"],
  ["Guardian email", "guardianEmail"],
  ["Guardian phone", "guardianPhone"],
  ["Emergency name", "emergencyName"],
  ["Emergency phone", "emergencyPhone"],
  ["Photo consent", "photoConsent"],
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function buildFilters(url: URL) {
  const conditions = [];

  const status = url.searchParams.get("status");
  if (status && STATUSES.includes(status)) conditions.push(eq(registrations.status, status));

  const tier = url.searchParams.get("tier");
  if (tier) conditions.push(eq(registrations.tier, tier));

  const position = url.searchParams.get("position");
  if (position) conditions.push(eq(registrations.position, position));

  const query = url.searchParams.get("q")?.trim();
  if (query) {
    const like = `%${query}%`;
    conditions.push(
      or(
        ilike(registrations.firstName, like),
        ilike(registrations.lastName, like),
        ilike(registrations.email, like),
        ilike(registrations.reference, like),
        ilike(registrations.currentClub, like),
      ),
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export default async (req: Request, context: Context) => {
  const denied = guard(req);
  if (denied) return denied;

  const url = new URL(req.url);

  if (req.method === "PATCH") {
    const id = Number.parseInt(context.params.id ?? "", 10);
    if (!Number.isFinite(id)) {
      return Response.json({ error: "invalid_id" }, { status: 400 });
    }

    let body: { status?: unknown; reviewNote?: unknown };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid_body" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.status === "string") {
      if (!STATUSES.includes(body.status)) {
        return Response.json({ error: "invalid_status" }, { status: 422 });
      }
      patch.status = body.status;
    }
    if (typeof body.reviewNote === "string") {
      patch.reviewNote = body.reviewNote.trim().slice(0, 1000) || null;
    }
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "nothing_to_update" }, { status: 422 });
    }

    const [updated] = await db
      .update(registrations)
      .set(patch)
      .where(eq(registrations.id, id))
      .returning();

    if (!updated) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ registration: updated });
  }

  if (req.method !== "GET") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const where = buildFilters(url);

  if (url.pathname.endsWith(".csv")) {
    const rows = await db
      .select()
      .from(registrations)
      .where(where)
      .orderBy(desc(registrations.createdAt));

    const header = CSV_COLUMNS.map(([label]) => label).join(",");
    const body = rows
      .map((row) => CSV_COLUMNS.map(([, key]) => csvCell(row[key])).join(","))
      .join("\r\n");

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(`${header}\r\n${body}\r\n`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="nihc-registrations-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  const [rows, [totals], byStatus, byTier] = await Promise.all([
    db
      .select()
      .from(registrations)
      .where(where)
      .orderBy(desc(registrations.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(registrations).where(where),
    db
      .select({ status: registrations.status, total: count() })
      .from(registrations)
      .groupBy(registrations.status),
    db
      .select({ tier: registrations.tier, total: count() })
      .from(registrations)
      .groupBy(registrations.tier),
  ]);

  const [minors] = await db
    .select({ total: count() })
    .from(registrations)
    .where(sql`${registrations.dateOfBirth} > (CURRENT_DATE - INTERVAL '18 years')`);

  return new Response(
    JSON.stringify({
      registrations: rows,
      matched: totals?.total ?? 0,
      limit,
      offset,
      summary: {
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.total])),
        byTier: Object.fromEntries(byTier.map((r) => [r.tier, r.total])),
        underEighteen: minors?.total ?? 0,
      },
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
};

export const config: Config = {
  path: [
    "/api/admin/registrations",
    "/api/admin/registrations.csv",
    "/api/admin/registrations/:id",
  ],
};
