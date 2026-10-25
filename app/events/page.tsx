import Link from "next/link";
import EventsTable from "@/components/EventsTable";

export default function Events() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <Link href="/" className="text-sm text-cyan-400">← Nebula</Link>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-zinc-400">
        Every event has a source link. Abnormal returns are estimates from an event study; see the{" "}
        <Link href="/methodology" className="text-cyan-400 underline">methodology</Link>.
      </p>
      <EventsTable />
    </main>
  );
}
