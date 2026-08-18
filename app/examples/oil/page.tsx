import Image from "next/image";
import Link from "next/link";
import DomainConsole from "../../../components/world/DomainConsole";
import { DOMAIN_META } from "../../../lib/tri/domains";
import { Label } from "../../../components/ui";

/**
 * Crude book — a sketch domain.
 *
 * There is no bespoke product surface here, on purpose. The console below is generic:
 * it renders itself from the declaration in `lib/tri/domains/oil.ts` and contains no
 * oil code at all. That an ontology written in an afternoon gets forking, addressing,
 * effect suppression and lineage for free is the thing this page is evidence for.
 */
export const metadata = {
  title: "Crude book — Trinisette example",
  description: DOMAIN_META.oil.blurb,
};

export default async function OilPage({ searchParams }: PageProps<"/examples/oil">) {
  const sp = await searchParams;
  const w = typeof sp.w === "string" ? sp.w : "primary";
  const rawT = typeof sp.t === "string" ? Number(sp.t) : NaN;
  const t = Number.isInteger(rawT) && rawT >= 0 ? rawT : null;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1320px] items-center gap-6 px-6 py-3.5 md:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={20} height={20} priority className="opacity-90" />
            <span className="font-mono text-[12.5px] tracking-[0.16em] text-fg">TRINISETTE</span>
          </Link>
          <nav className="flex items-baseline gap-2 font-mono text-[12px]">
            <Link href="/examples" className="text-fg-3 transition-colors hover:text-fg">examples</Link>
            <span className="text-fg-4">/</span>
            <span className="text-fg">oil</span>
          </nav>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-warn">sketch</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] px-6 py-8 md:px-8 md:py-10">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <div className="flex items-baseline gap-4">
            <h1 className="text-h2 text-fg">Crude book</h1>
            <span className="max-w-[62ch] text-[12.5px] text-fg-3">{DOMAIN_META.oil.blurb}</span>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 border-y border-line py-2 text-[11.5px] text-fg-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-fg-4">what to check</span>
          <span><span className="text-fg-2">fork</span>, then act — primary stays where it was</span>
          <span><span className="text-fg-2">{DOMAIN_META.oil.irreversible.split(" — ")[0]}</span> is refused outside primary</span>
          <span><span className="text-fg-2">graft</span> answers: {DOMAIN_META.oil.gap}</span>
        </div>

        <DomainConsole domain="oil" initialWorld={w} initialSeq={t} />

        <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-line pt-4 text-[11.5px] text-fg-3">
          <span>
            <span className="text-fg-2">Figures are invented.</span> This is a sketch: no feed is wired
            and the numbers are there to make the actions do something visible.
          </span>
          <span>
            What is not invented is the structure — same <code className="font-mono text-fg-2">Ontology</code> type,
            same <code className="font-mono text-fg-2">invoke()</code>, same addresses as{" "}
            <Link href="/examples/airport" className="text-fg-2 underline decoration-line underline-offset-2 hover:text-accent">airport</Link>.
          </span>
        </div>
      </main>
    </>
  );
}
