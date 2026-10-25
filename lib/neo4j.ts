import neo4j, { Driver, isInt } from "neo4j-driver";

let driver: Driver | null = null;

export function neo4jConfigured(): boolean {
  return Boolean(process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD);
}

function getDriver(): Driver | null {
  if (!neo4jConfigured()) return null;
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!),
      { connectionTimeout: 5000, maxConnectionPoolSize: 5 },
    );
  }
  return driver;
}

/** Recursively turn Neo4j Integers into numbers so results are JSON-safe. */
function plain(v: unknown): unknown {
  if (isInt(v)) return (v as { toNumber(): number }).toNumber();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

/**
 * Read-only query with a 5s timeout. Returns null when Neo4j is unavailable or fails,
 * so callers can fall back to static JSON. Never throws.
 */
export async function readQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<T[] | null> {
  const d = getDriver();
  if (!d) return null;
  const session = d.session({
    database: process.env.NEO4J_DATABASE ?? "neo4j",
    defaultAccessMode: neo4j.session.READ,
  });
  try {
    const res = await session.executeRead((tx) => tx.run(cypher, params), { timeout: 5000 });
    return res.records.map((r) => plain(r.toObject()) as T);
  } catch {
    return null;
  } finally {
    await session.close();
  }
}
