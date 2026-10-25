import { NextResponse } from "next/server";
import { neo4jConfigured, readQuery } from "@/lib/neo4j";
import { PRESETS, cleanParams, type PresetId } from "@/lib/presets";

// Cached at the CDN for an hour so viral traffic does not reach the database.
const CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

/**
 * GET /api/graph?q=<preset>&category=..&from=..&to=..
 * Only the fixed read-only presets in lib/presets.ts run; parameters are validated, never concatenated.
 * Responds { source: "neo4j", rows } or { source: "static", rows: [] } (the client then computes the
 * same answer from the static JSON). Never errors because of the database.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const preset = PRESETS[(sp.get("q") ?? "") as PresetId];
  if (!preset) return NextResponse.json({ error: "unknown preset" }, { status: 400 });
  const params = cleanParams(preset, sp);
  if (!params) return NextResponse.json({ error: "invalid parameters" }, { status: 400 });

  if (!neo4jConfigured()) return NextResponse.json({ source: "static", rows: [] }, { headers: CACHE });
  const rows = await readQuery(preset.cypher, params);
  if (!rows) return NextResponse.json({ source: "static", rows: [] });
  return NextResponse.json({ source: "neo4j", rows }, { headers: CACHE });
}
