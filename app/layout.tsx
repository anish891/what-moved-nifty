import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "What Moved NIFTY",
  description: "Cut an event. Watch NIFTY's counterfactual path redraw.",
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
