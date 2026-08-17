import Image from "next/image";
import Link from "next/link";
import { Label } from "../../../components/ui";
import WorldConsole from "../../../components/world/WorldConsole";

/**
 * The working surface. Deliberately not the case study.
 *
 * `/cases/airport` argues for the idea; this page is the idea in use, with as little
 * chrome around it as the thing can stand. The coordinate lives in the address bar —
 * `?w=` picks the world, `?t=` pins a seq — so a specific state is a link, which is the
 * whole point of content addressing being real rather than decorative.
 */
export const metadata = {
  title: "Airport Now — Trinisette example",
  description:
    "Fork a world, act inside it, and see what would have happened — without it happening.",
};

/** One terminal, for now. When there is a second, the route generalises to /a/:iata/:terminal. */
const IATA = "YYZ";
const TERMINAL = "T1";

export default async function AirportNow({
  searchParams,
}: PageProps<"/examples/airport-now">) {
  const sp = await searchParams;
  const iata = IATA;
  const terminal = TERMINAL;

  const w = typeof sp.w === "string" ? sp.w : "primary";
  const rawT = typeof sp.t === "string" ? Number(sp.t) : NaN;
  const t = Number.isInteger(rawT) && rawT >= 0 ? rawT : null;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1320px] items-center gap-6 px-6 py-3.5 md:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt=""
              width={20}
              height={20}
              priority
              className="opacity-90"
            />
            <span className="font-mono text-[12.5px] tracking-[0.16em] text-fg">
              TRINISETTE
            </span>
          </Link>

          <nav className="flex items-baseline gap-2 font-mono text-[12px]">
            <Link
              href="/examples"
              className="text-fg-3 transition-colors hover:text-fg"
            >
              examples
            </Link>
            <span className="text-fg-4">/</span>
            <span className="text-fg">airport-now</span>
            <span className="text-fg-4">·</span>
            <span className="text-fg-3">
              {iata} {terminal}
            </span>
          </nav>

          <Link
            href="/cases/airport"
            className="ml-auto text-[12.5px] text-fg-3 transition-colors hover:text-fg"
          >
            Why this shape ↗
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] px-6 py-8 md:px-8 md:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
            <Label className="text-fg-4">example · Airport Now</Label>
            <h1 className="mt-2 text-h2 text-fg">
              {iata.toUpperCase()} · {terminal.toUpperCase()}
            </h1>
          </div>
          <p className="max-w-[52ch] text-b1 text-fg-3">
            Fork this terminal into a world of your own, act inside it, and
            watch reality stay where it was. Objects and actions are how you
            work; the coordinate on the bar is what makes any state you reach a
            link you can send.
          </p>
        </div>

        <WorldConsole initialWorld={w} initialSeq={t} syncUrl />

        <div className="mt-8 grid gap-px border border-line bg-line md:grid-cols-3">
          {[
            [
              "?w=",
              "picks the world",
              "Absent means primary — reality. Anything else is a fork, and irreversible actions are refused there.",
            ],
            [
              "?t=",
              "pins a seq",
              "Look at an earlier state. Worlds are append-only, so the past is readable but not writable.",
            ],
            [
              "hash",
              "is the proof",
              "The root changes only when the state does. Same state, same address — that is what makes replay checkable.",
            ],
          ].map(([k, h, d]) => (
            <div key={k} className="bg-panel p-5">
              <code className="font-mono text-[12px] text-accent">{k}</code>
              <div className="mt-1.5 text-b2 text-fg">{h}</div>
              <p className="mt-2 text-b1 text-fg-3">{d}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-[80ch] text-b1 text-fg-3">
          Worlds are held in memory in this build, so a link to a forked world
          resolves only in the session that forked it. Persisting them is what
          turns these addresses from a demonstration into something you can put
          in a bug report.
        </p>
      </main>
    </>
  );
}
