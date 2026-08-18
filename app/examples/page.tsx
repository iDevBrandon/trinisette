import Image from "next/image";
import Link from "next/link";
import { EXAMPLES } from "../../lib/tri/domains";
import { Label } from "../../components/ui";

export const metadata = {
  title: "Examples — Trinisette",
  description: "Working demos built on the Trinisette substrate.",
};

/**
 * Four domains, one substrate.
 *
 * The list itself lives in `lib/tri/domains` and is read by the platform page too. It
 * used to be declared here as well, and the two copies had already drifted — the exact
 * failure the ontology exists to prevent, committed in the copy that describes it.
 */

export default function ExamplesIndex() {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-6 px-6 py-3.5 md:px-10">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={20} height={20} priority className="opacity-90" />
            <span className="font-mono text-[12.5px] tracking-[0.16em] text-fg">TRINISETTE</span>
          </Link>
          <Label className="text-fg-4">examples</Label>
          <Link href="/" className="ml-auto text-[12.5px] text-fg-3 transition-colors hover:text-fg">
            ← Platform
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-6 py-14 md:px-10 md:py-20">
        <Label className="text-fg-4">runnable</Label>
        <h1 className="hero mt-6 max-w-[16ch] text-[40px] leading-[1] text-fg md:text-[62px]">
          Examples
        </h1>
        <p className="mt-7 max-w-[60ch] text-b4 text-fg-2">
          Demos you can operate, not screenshots. Each one runs the real engine — forking,
          addressing and effect suppression behave here exactly as they do in the substrate.
        </p>
        <p className="mt-5 max-w-[68ch] text-b1 text-fg-3">
          One is built for real; three are sketches with invented figures. They are all here
          because each is a plain ontology declaration on the same runtime, and three of them
          have no interface code written for them at all — the console renders itself from the
          declaration. That is the part worth checking:{" "}
          <span className="text-fg-2">the irreversible action is different in every one</span>,
          and none of them needed the engine changed.
        </p>

        <div className="mt-12 grid gap-px border border-line bg-line">
          {EXAMPLES.map((e) => (
            <Link
              key={e.slug}
              href={`/examples/${e.slug}`}
              className="group bg-panel px-6 py-6 transition-colors hover:bg-panel-2"
            >
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
                <span className="text-b4 text-fg">{e.name}</span>
                <code className="font-mono text-[12px] text-fg-4">/examples/{e.slug}</code>
                <span className={`font-mono text-[9.5px] uppercase tracking-[0.14em] ${
                  e.status === "live" ? "text-ok" : "text-warn"
                }`}>{e.status}</span>
                <span className="ml-auto font-mono text-[12px] text-accent transition-transform group-hover:translate-x-0.5">
                  open →
                </span>
              </div>
              <p className="mt-3 max-w-[72ch] text-b1 text-fg-2">{e.blurb}</p>
              <div className="mt-3 grid gap-1.5 font-mono text-[10.5px] text-fg-4 sm:grid-cols-[110px_1fr]">
                <span className="text-fg-3">irreversible</span><span>{e.irreversible}</span>
                <span className="text-fg-3">coverage gap</span><span>{e.gap}</span>
                {e.feed && (<><span className="text-ok">feed</span><span>{e.feed}</span></>)}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {e.demonstrates.map((d) => (
                  <span key={d} className="border border-line px-2 py-0.5 font-mono text-[10.5px] text-fg-3">
                    {d}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
