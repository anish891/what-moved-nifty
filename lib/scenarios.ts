import type { AppData } from "./types";

export interface Scenario {
  id: string;
  label: string;
  blurb: string;
  /** Event ids to cut; built from the data so it never references a missing event. */
  ids(d: AppData): string[];
}

const has = (d: AppData, id: string) => id in d.impacts && !d.impacts[id].context;
const pick = (d: AppData, ids: string[]) => ids.filter((i) => has(d, i));
const byPrefix = (d: AppData, p: string) => Object.keys(d.impacts).filter((i) => i.startsWith(p) && !d.impacts[i].context);

export const SCENARIOS: Scenario[] = [
  {
    id: "tariffs",
    label: "Cut the tariff shocks",
    blurb: "The 2025–26 US tariff and trade-policy moves aimed at India.",
    ids: (d) =>
      pick(d, [
        "global-tariff-crash-2025-04-07",
        "us-25pct-tariff-announced-2025-07-30",
        "us-50pct-tariff-india-2025-08-06",
        "us-india-trade-talks-called-off-2025-08-17",
        "h1b-fee-2025-09-19",
        "sanctioning-russia-iran-act-2026-09-18",
      ]),
  },
  {
    id: "hikes",
    label: "Cut the 2022 rate-hike cycle",
    blurb: "Every RBI hike plus the Fed's first hike, the 75 bp hike and Jackson Hole.",
    ids: (d) => [...byPrefix(d, "rbi-hike-"), ...pick(d, ["fed-first-hike-2022-03-16", "fed-75bp-2022-06-15", "jackson-hole-2022-08-26"])],
  },
  {
    id: "ai",
    label: "Cut the AI scare",
    blurb: "DeepSeek, the Claude-driven IT selloffs and the Accenture warning.",
    ids: (d) =>
      pick(d, [
        "deepseek-shock-2025-01-27",
        "nifty-it-ai-selloff-2026-02-04",
        "nifty-it-ai-second-leg-2026-02-24",
        "accenture-guidance-cut-2026-06-19",
      ]),
  },
  {
    id: "stt",
    label: "Cut the F&O and market-cost rules",
    blurb: "STT hikes, SEBI derivatives curbs, Jane Street and the expiry changes.",
    ids: (d) =>
      pick(d, [
        "budget-2024-stt-fno",
        "budget-2026-stt-hike",
        "sebi-fno-curbs-2024-10-01",
        "sebi-jane-street-2025-07-03",
        "sebi-expiry-day-swap-2025-09-01",
        "budget-2024-capital-gains",
        "budget-2024-buyback-tax",
      ]),
  },
  {
    id: "wars",
    label: "Cut the wars",
    blurb: "Ukraine, Gaza, Israel–Iran, the US–Iran war and the India–Pakistan crisis.",
    ids: (d) =>
      pick(d, [
        "russia-invades-ukraine-2022-02-24",
        "israel-hamas-war-2023-10-07",
        "pahalgam-attack-2025-04-22",
        "operation-sindoor-2025-05-07",
        "israel-iran-war-2025-06-13",
        "us-iran-war-shock-2026-03-02",
        "brent-above-100-2026-07-24",
      ]),
  },
  {
    id: "hurt",
    label: "Cut everything that hurt",
    blurb: "Every market-moving event with a negative abnormal return. What would NIFTY look like?",
    ids: (d) => Object.values(d.impacts).filter((i) => i.market_moving && !i.context && i.car_5d < 0).map((i) => i.id),
  },
  {
    id: "helped",
    label: "Cut everything that helped",
    blurb: "Every market-moving event with a positive abnormal return. The line should drop.",
    ids: (d) => Object.values(d.impacts).filter((i) => i.market_moving && !i.context && i.car_5d > 0).map((i) => i.id),
  },
];
