import type { Category } from "./types";

export const CATEGORIES: Record<Category, { label: string; color: string }> = {
  govt_tax: { label: "Govt: tax", color: "#f97316" },
  govt_regulation: { label: "Govt: regulation", color: "#fb7185" },
  govt_trade: { label: "Govt: trade", color: "#facc15" },
  govt_fiscal: { label: "Govt: fiscal", color: "#a3e635" },
  rbi_monetary: { label: "RBI", color: "#34d399" },
  global_rates: { label: "Global rates", color: "#22d3ee" },
  global_trade: { label: "Global trade", color: "#60a5fa" },
  geopolitics: { label: "Geopolitics", color: "#c084fc" },
  commodities: { label: "Commodities", color: "#d97706" },
  ai_rotation: { label: "AI rotation", color: "#e879f9" },
  corporate_shock: { label: "Corporate", color: "#f472b6" },
  flows: { label: "Flows", color: "#94a3b8" },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

/** "Cut all global shocks" style group chips */
export const GROUPS: { label: string; cats: Category[] }[] = [
  { label: "All govt policy", cats: ["govt_tax", "govt_regulation", "govt_trade", "govt_fiscal"] },
  { label: "All global shocks", cats: ["global_rates", "global_trade", "geopolitics", "commodities"] },
];

export const pct = (x: number | null | undefined, d = 1) =>
  x == null ? "–" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;
