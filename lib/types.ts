export type Category =
  | "govt_tax"
  | "govt_regulation"
  | "govt_trade"
  | "govt_fiscal"
  | "rbi_monetary"
  | "global_rates"
  | "global_trade"
  | "geopolitics"
  | "commodities"
  | "ai_rotation"
  | "corporate_shock"
  | "flows";

export interface MarketEvent {
  id: string;
  date: string; // ISO yyyy-mm-dd
  effective_date?: string;
  market_date?: string;
  title: string;
  category: Category;
  actor: string;
  description: string;
  expected_channel: string[];
  source_url: string;
  verified: boolean;
  source_quality: "primary" | "press" | "secondary";
  notes?: string;
  kind?: "event" | "context";
}

export interface SectorImpact {
  car: number;
  ci_low: number;
  ci_high: number;
  t?: number; // 5-day t-stat
  car_1d?: number | null;
  t_1d?: number | null;
}

/** CARs are simple returns (fractions): -0.021 = -2.1%. */
export interface EventImpact {
  id: string;
  t0: string; // first trading day of the reaction
  car_1d: number | null;
  car_5d: number;
  car_20d: number | null;
  car_60d: number | null;
  car_60d_partial: boolean;
  ci_low: number; // 95% CI for car_5d
  ci_high: number;
  tstat: number;
  significant: boolean; // |t| >= 1.96 on the [-1,+5] index CAR
  tstat_1d: number | null;
  significant_1d: boolean; // |t| >= 2.24 on the 1-day index AR
  sector_moving: string[]; // sectors with |t| >= 2.73 (1-day or 5-day)
  market_moving: boolean; // any of the three tests
  context: boolean; // aggregate/structural item: no measured impact is applied
  cluster_size: number;
  confounded_with: string[];
  sectors: Record<string, SectorImpact>;
}

export type LinkType =
  | "SAME_CHANNEL"
  | "CO_MOVED"
  | "PRECEDED"
  | "MOVED"
  | "CORRELATED_WITH"
  | "IMPACTED";

export interface GraphNode {
  id: string;
  kind: "event" | "driver" | "index";
  label: string;
  category?: Category;
  date?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  type: LinkType;
  weight: number;
  delta?: number;
  unit?: string;
  rho?: number;
  days?: number;
  channels?: string[];
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface NiftyPoint {
  d: string; // ISO date
  c: number; // close
}

export interface CounterfactualPoint {
  d: string;
  actual: number;
  cf: number;
  low: number;
  high: number;
}

export interface DriverStat {
  rho_60d_avg: number;
  by_year: Record<string, number>;
  latest: number;
}

export interface AppData {
  graph: GraphData;
  events: MarketEvent[];
  impacts: Record<string, EventImpact>;
  nifty: NiftyPoint[];
  drivers: Record<string, DriverStat>;
}
