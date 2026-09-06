import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

/**
 * Live match data comes from GameSheet, the league's stats engine.
 *
 * GameSheet's supported integration is its browser embed, and its edge sits behind
 * bot protection that can reject server-to-server calls from cloud IP ranges. So this
 * endpoint is deliberately best-effort: when it can reach GameSheet it returns
 * normalised JSON the site renders as native scorecards, and when it cannot it says so
 * plainly and the pages fall back to the embed. It never fails the page.
 */

const SEASON_ID = () => process.env.GAMESHEET_SEASON_ID ?? "15760";
const API_BASE = () =>
  (process.env.GAMESHEET_API_BASE ?? "https://gamesheetstats.com/api").replace(/\/$/, "");
const CACHE_KEY = () => `season-${SEASON_ID()}.json`;
const FRESH_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 6_000;

type Json = Record<string, any>;

interface Team {
  name: string;
  score: number | null;
  logo: string | null;
}

interface Game {
  id: string;
  status: "final" | "live" | "scheduled";
  startsAt: string | null;
  venue: string | null;
  division: string | null;
  home: Team;
  away: Team;
}

interface StandingRow {
  rank: number | null;
  team: string;
  played: number | null;
  won: number | null;
  lost: number | null;
  tied: number | null;
  points: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

function pick(source: Json, keys: string[]): any {
  for (const key of keys) {
    if (source == null) return undefined;
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/** GameSheet responses nest their payload differently per view; find the first array of objects. */
function findRows(payload: unknown, depth = 0): Json[] {
  if (depth > 4 || payload == null) return [];
  if (Array.isArray(payload)) {
    return payload.filter((entry) => entry && typeof entry === "object");
  }
  if (typeof payload !== "object") return [];

  const preferred = ["data", "games", "schedule", "results", "standings", "teams", "rows", "items"];
  for (const key of preferred) {
    const found = findRows((payload as Json)[key], depth + 1);
    if (found.length > 0) return found;
  }
  for (const value of Object.values(payload as Json)) {
    const found = findRows(value, depth + 1);
    if (found.length > 0) return found;
  }
  return [];
}

function teamOf(row: Json, side: "home" | "away"): Team {
  const nested = pick(row, [side, `${side}Team`, `${side}_team`]);
  const container: Json = nested && typeof nested === "object" ? nested : row;

  const name =
    str(pick(container, ["title", "name", "teamName", "team_name", "shortName"])) ??
    str(pick(row, [`${side}Title`, `${side}TeamTitle`, `${side}_team_name`, `${side}Name`])) ??
    "TBC";

  const score =
    num(pick(container, ["score", "goals", "totalGoals"])) ??
    num(pick(row, [`${side}Score`, `${side}_score`, `${side}Goals`, `${side}TeamScore`]));

  const logo = str(pick(container, ["logo", "logoUrl", "image", "crest"]));

  return { name, score, logo };
}

function normaliseGame(row: Json, index: number): Game {
  const home = teamOf(row, "home");
  const away = teamOf(row, "away");

  const startsAtRaw =
    str(pick(row, ["startTime", "starts_at", "scheduledTime", "datetime", "dateTime"])) ??
    (() => {
      const date = str(pick(row, ["date", "gameDate", "day"]));
      const time = str(pick(row, ["time", "startTime", "faceoff"]));
      if (!date) return null;
      return time ? `${date}T${time.length === 5 ? `${time}:00` : time}` : date;
    })();

  const parsed = startsAtRaw ? Date.parse(startsAtRaw) : Number.NaN;
  const startsAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : startsAtRaw;

  const rawStatus = String(pick(row, ["status", "gameStatus", "state"]) ?? "").toLowerCase();
  const bothScored = home.score !== null && away.score !== null;

  let status: Game["status"];
  if (/final|complete|finish|ended|played/.test(rawStatus)) status = "final";
  else if (/live|progress|active|period/.test(rawStatus)) status = "live";
  else if (pick(row, ["isLive", "inProgress"]) === true) status = "live";
  else if (bothScored && Number.isFinite(parsed) && parsed < Date.now()) status = "final";
  else if (bothScored && rawStatus === "" && !startsAt) status = "final";
  else status = "scheduled";

  return {
    id: String(pick(row, ["id", "gameId", "game_id", "number"]) ?? `game-${index}`),
    status,
    startsAt,
    venue: str(pick(row, ["venue", "rink", "location", "arena", "facility"])),
    division: str(pick(row, ["division", "divisionTitle", "division_name", "tier", "category"])),
    home,
    away,
  };
}

function normaliseStanding(row: Json, index: number): StandingRow {
  const team = pick(row, ["team", "teamTitle"]);
  const container: Json = team && typeof team === "object" ? team : row;

  return {
    rank: num(pick(row, ["rank", "position", "place"])) ?? index + 1,
    team:
      str(pick(container, ["title", "name", "teamName", "team_name"])) ??
      str(pick(row, ["teamTitle", "team"])) ??
      "Unknown",
    played: num(pick(row, ["gamesPlayed", "gp", "played", "games"])),
    won: num(pick(row, ["wins", "w", "won"])),
    lost: num(pick(row, ["losses", "l", "lost"])),
    tied: num(pick(row, ["ties", "t", "tied", "otl", "overtimeLosses"])),
    points: num(pick(row, ["points", "pts"])),
    goalsFor: num(pick(row, ["goalsFor", "gf", "goals_for"])),
    goalsAgainst: num(pick(row, ["goalsAgainst", "ga", "goals_against"])),
  };
}

async function fetchJson(url: string): Promise<Json | Json[] | null> {
  const headers: Record<string, string> = { accept: "application/json" };
  const key = process.env.GAMESHEET_API_KEY;
  if (key) {
    headers.authorization = `Bearer ${key}`;
    headers["x-api-key"] = key;
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  if (!(response.headers.get("content-type") ?? "").includes("json")) {
    throw new Error("upstream did not return JSON");
  }
  return response.json();
}

async function firstSuccessful(paths: string[]): Promise<{ rows: Json[]; endpoint: string } | null> {
  for (const path of paths) {
    const url = `${API_BASE()}${path}`;
    try {
      const payload = await fetchJson(url);
      const rows = findRows(payload);
      if (rows.length > 0) return { rows, endpoint: path };
    } catch (error) {
      console.warn(`gamesheet fetch failed for ${path}: ${(error as Error).message}`);
    }
  }
  return null;
}

async function loadFromUpstream() {
  const season = SEASON_ID();

  const games = await firstSuccessful([
    `/useSeasonSchedule/getGames/${season}`,
    `/useScorekeeperSeasonSchedule/getGames/${season}`,
    `/seasons/${season}/games`,
    `/seasons/${season}/schedule`,
  ]);

  const standings = await firstSuccessful([
    `/useSeasonStandings/getStandings/${season}`,
    `/useScorekeeperStandings/getStandings/${season}`,
    `/seasons/${season}/standings`,
  ]);

  if (!games && !standings) return null;

  return {
    available: true as const,
    source: "gamesheet",
    seasonId: season,
    fetchedAt: new Date().toISOString(),
    games: (games?.rows ?? []).map(normaliseGame),
    standings: (standings?.rows ?? []).map(normaliseStanding),
    endpoints: {
      games: games?.endpoint ?? null,
      standings: standings?.endpoint ?? null,
    },
  };
}

export default async (_req: Request, _context: Context) => {
  const headers = {
    "content-type": "application/json",
    "cache-control": "public, max-age=30",
    "netlify-cdn-cache-control": "public, s-maxage=60, stale-while-revalidate=600",
  };

  let store: ReturnType<typeof getStore> | null = null;
  let cached: { fetchedAt: string; payload: Json } | null = null;

  try {
    store = getStore("stats-cache");
    cached = (await store.get(CACHE_KEY(), { type: "json" })) as typeof cached;
  } catch (error) {
    console.warn("stats cache unavailable", (error as Error).message);
  }

  if (cached && Date.now() - Date.parse(cached.fetchedAt) < FRESH_MS) {
    return new Response(JSON.stringify({ ...cached.payload, cached: true }), { headers });
  }

  try {
    const fresh = await loadFromUpstream();
    if (fresh) {
      if (store) {
        await store.setJSON(CACHE_KEY(), { fetchedAt: fresh.fetchedAt, payload: fresh });
      }
      return new Response(JSON.stringify(fresh), { headers });
    }
  } catch (error) {
    console.error("stats refresh failed", (error as Error).message);
  }

  // Upstream unreachable. Serve the last good payload if we have one.
  if (cached) {
    return new Response(JSON.stringify({ ...cached.payload, cached: true, stale: true }), {
      headers,
    });
  }

  return new Response(
    JSON.stringify({
      available: false,
      source: "gamesheet",
      seasonId: SEASON_ID(),
      reason:
        "GameSheet did not return JSON to this server. The embedded GameSheet views on this page remain live.",
      games: [],
      standings: [],
    }),
    { headers },
  );
};

export const config: Config = {
  path: "/api/stats",
  method: ["GET"],
};
