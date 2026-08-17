import Image from "next/image";
import Link from "next/link";
import { Label } from "../../components/ui";

export const metadata = {
  title: "Examples — Trinisette",
  description: "Working demos built on the Trinisette substrate.",
};

const EXAMPLES = [
  {
    slug: "airport-now",
    name: "Airport Now",
    blurb: "Checkpoint queues you can fork. Try a staffing change in a world of your own, and watch reality stay untouched.",
    demonstrates: ["fork isolation", "irreversible suppression", "append-only history"],
    status: "live",
  },
];

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
        <p className="mt-7 max-w-[54ch] text-b4 text-fg-2">
          Demos you can operate, not screenshots. Each one runs the real engine — forking,
          addressing and effect suppression behave here exactly as they do in the substrate.
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
                <span className="ml-auto font-mono text-[12px] text-accent transition-transform group-hover:translate-x-0.5">
                  open →
                </span>
              </div>
              <p className="mt-3 max-w-[62ch] text-b1 text-fg-2">{e.blurb}</p>
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
