import { NextResponse } from "next/server";

/**
 * Live NIFTY 50 candles from Yahoo Finance's public chart endpoint (unofficial, no key).
 * Used only to extend the static series past its last build date; if it fails the client keeps the
 * static data. CDN-cached for 60 s so traffic cannot hammer Yahoo.
 */
const URL_ = "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=1mo&interval=1d";
const CACHE = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };

interface Chart {
  chart: {
    result?: {
      meta: {
        regularMarketPrice: number;
        regularMarketTime: number;
        gmtoffset: number;
        currentTradingPeriod?: { regular: { start: number; end: number } };
      };
      timestamp?: number[];
      indicators: { quote: { close: (number | null)[] }[] };
    }[];
  };
}

export async function GET() {
  try {
    const res = await fetch(URL_, { headers: { "User-Agent": "Mozilla/5.0 what-moved-nifty" }, next: { revalidate: 60 } });
    if (!res.ok) throw new Error(String(res.status));
    const r = ((await res.json()) as Chart).chart.result?.[0];
    if (!r?.timestamp) throw new Error("no data");
    const off = r.meta.gmtoffset * 1000;
    const closes = r.indicators.quote[0].close;
    const points = r.timestamp
      .map((t, i) => ({ d: new Date(t * 1000 + off).toISOString().slice(0, 10), c: closes[i] }))
      .filter((p): p is { d: string; c: number } => p.c != null)
      .map((p) => ({ d: p.d, c: Math.round(p.c * 100) / 100 }));
    const now = Date.now() / 1000;
    const reg = r.meta.currentTradingPeriod?.regular;
    const quote = {
      price: r.meta.regularMarketPrice,
      time: r.meta.regularMarketTime * 1000,
      live: !!reg && now >= reg.start && now <= reg.end + 60 && now - r.meta.regularMarketTime < 20 * 60,
    };
    return NextResponse.json({ points, quote }, { headers: CACHE });
  } catch {
    return NextResponse.json({ points: [], quote: null }, { headers: { "Cache-Control": "public, s-maxage=30" } });
  }
}
