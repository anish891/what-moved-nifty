import type { Metadata } from "next";
import "./globals.css";

const SITE = "https://what-moved-nifty.vercel.app";
const TITLE = "What Moved NIFTY";
const DESC =
  "A 3D map of 70 market shocks since 2021. Cut an event and watch NIFTY's counterfactual path redraw. Estimates, not proof.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESC,
  openGraph: { title: TITLE, description: DESC, url: SITE, siteName: TITLE, type: "website", locale: "en_IN" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="flex h-[100dvh] flex-col">
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
          <footer className="shrink-0 border-t border-zinc-900 px-3 py-1 text-[11px] text-zinc-500">
            Estimates, not proof. Not investment advice. Data: NSE, NSDL, Yahoo Finance, FRED.
          </footer>
        </div>
      </body>
    </html>
  );
}
