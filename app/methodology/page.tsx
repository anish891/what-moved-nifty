import Link from "next/link";

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-8 text-lg font-semibold">{children}</h2>;

export default function Methodology() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-sm leading-relaxed text-zinc-300">
      <Link href="/" className="text-cyan-400">← Nebula</Link>
      <h1 className="mt-3 text-2xl font-semibold text-zinc-100">Methodology</h1>
      <p className="mt-2 text-zinc-400">
        Everything here is an estimate with uncertainty, not proof that an event caused a market move.
      </p>

      <H>What is measured</H>
      <p className="mt-2">
        For each dated event we ask: how did NIFTY 50 behave compared with what a simple model of emerging-market moves
        predicted? The difference is the <b>abnormal return</b> (AR). Summed over a window it is the <b>cumulative
        abnormal return</b> (CAR). The headline window is <b>[-1, +5]</b> trading days around the first reaction day; the
        1-day AR, [-1,+20] and [0,+60] are shown alongside.
      </p>

      <H>The model</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>NIFTY daily log-returns are regressed on the iShares MSCI Emerging Markets ETF (EEM, converted to INR), same-day and lagged one day because the markets trade at different hours.</li>
        <li>The model is fitted on the 250 trading days ending 10 days before the event, and its residual volatility sets the 95% confidence interval.</li>
        <li>|t| &lt; 1.96 means the move is not distinguishable from normal noise. Those events are drawn smaller and dimmer.</li>
        <li>Sector CARs use the same model on NIFTY IT, Bank, Auto, FMCG, Metal, Pharma, Realty and PSU Bank.</li>
      </ul>

      <H>Overlapping events</H>
      <p className="mt-2">
        Events within 5 trading days of each other are chained into a <b>confounded cluster</b>. The cluster&apos;s CAR over
        the combined window is split <b>equally</b> between its members, so nothing is double counted. This is a disclosed
        simplification: it does not reveal which member mattered most.
      </p>

      <H>The counterfactual line</H>
      <p className="mt-2">
        When you cut an event, its CAR is divided out of NIFTY from the reaction day onward, and the 95% bands of all cut
        events are combined in quadrature. The calculation runs in your browser. It assumes the abnormal return was
        permanent, that cut events are independent, and that nothing else would have changed. Cutting many events, or events
        that are not significant, mostly adds noise, which is why the band widens.
      </p>

      <H>What this cannot tell you</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Causation. A model can only say a move was unusual, not why.</li>
        <li>The benchmark contains some India (about 15%), so India-specific shocks are partly absorbed. Estimates tend to be conservative.</li>
        <li>Estimation windows are not cleaned of earlier events, and the 2020 Covid period violates the model&apos;s assumption of stable volatility.</li>
        <li>Short windows can hide reversals: a crash that rebounded within a week can show a small CAR but a large 1-day AR.</li>
        <li>Yahoo Finance lacks two weekend Budget sessions; one was patched from a sourced close and one event was excluded.</li>
      </ul>

      <H>Data</H>
      <p className="mt-2">
        The published range is January 2021 to today (earlier data is used only to fit the model). The latest days come from a live Yahoo Finance feed (refreshed about once a minute while the market is open); if that is unavailable the page shows the static series. Events are curated by hand, so very recent news may not be listed yet. Prices: NSE indices, EEM, Brent, USD/INR, India VIX, S&amp;P 500, Nasdaq, SOX, TAIEX and KOSPI via Yahoo Finance; US 10Y yield from FRED.
        Events and facts come from the news and official pages linked on each event; most sources are press reports and a
        few are marked secondary. FPI and DII flow series are not yet included.
      </p>
      <p className="mt-8 text-xs text-zinc-500">Estimates, not proof. Not investment advice.</p>
    </main>
  );
}
