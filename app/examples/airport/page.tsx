import Image from "next/image";
import Link from "next/link";
import AirportNow from "../../../components/world/AirportNow";

/**
 * The working surface. Deliberately not the case study.
 *
 * `/cases/airport` argues for the shape; this page is the shape in use, with as little
 * chrome around it as the thing can stand. The coordinate lives in the address bar —
 * `?a=` picks the airport, `?w=` the world, `?t=` pins a seq — so a specific state is a
 * link, which is the point of content addressing being real rather than decorative.
 */
export const metadata = {
  title: "Checkpoint board — Trinisette example",
  description:
    "A worked example of the Trinisette substrate: fork a world, watch an irreversible action be refused outside primary, and trace any figure back to the bytes it came from.",
};

export default async function AirportNowPage({
  searchParams,
}: PageProps<"/examples/airport">) {
  const sp = await searchParams;

  const a = typeof sp.a === "string" ? sp.a.toUpperCase() : "ATL";
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
            <span className="text-fg">airport</span>
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
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <div className="flex items-baseline gap-4">
            <h1 className="text-h2 text-fg">Checkpoint board</h1>
            <span className="text-[12.5px] text-fg-3">
              A real domain with real coverage gaps, running on the substrate.
              Poke at it.
            </span>
          </div>
          <span className="font-mono text-[11px] text-fg-4">
            ?a= airport · ?w= world · ?t= seq — every state here is a link
          </span>
        </div>

        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 border-y border-line py-2 text-[11.5px] text-fg-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-fg-4">
            what to check
          </span>
          <span>
            <span className="text-fg-2">fork</span> is O(1) and shares the
            parent&rsquo;s root
          </span>
          <span>
            <span className="text-fg-2">publish</span> is refused outside
            primary by the runtime, not the UI
          </span>
          <span>
            <span className="text-fg-2">any posted number</span> traces back to
            a response hash
          </span>
          <span>
            <span className="text-fg-2">16 airports</span> have no queue feed —
            graft answers that
          </span>
        </div>

        <AirportNow initialAirport={a} initialWorld={w} initialSeq={t} />

        <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-line pt-4 text-[11.5px] text-fg-3">
          <span>
            Wait figures are <span className="text-fg-2">modelled</span>; the
            coverage map, tiers and upstream URLs are real, from the
            project&rsquo;s own source survey.
          </span>
          <span>
            One live upstream:{" "}
            <a
              href="https://nasstatus.faa.gov/api/airport-status-information"
              target="_blank"
              rel="noreferrer"
              className="text-fg-2 underline decoration-line underline-offset-2 hover:text-accent"
            >
              FAA NAS Status
            </a>
            .
          </span>
          <span>
            Product shape from{" "}
            <a
              href="https://github.com/mylee04/airport-now"
              target="_blank"
              rel="noreferrer"
              className="text-fg-2 underline decoration-line underline-offset-2 hover:text-accent"
            >
              mylee04/airport-now
            </a>{" "}
            — domain only, no code (that repo states no licence).
          </span>
          <span className="text-fg-4">
            Worlds live in memory, so a fork link resolves only in the session
            that forked it.
          </span>
        </div>
      </main>
    </>
  );
}
