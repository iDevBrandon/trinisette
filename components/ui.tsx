import { Rainbow, Shell, Waves } from "lucide-react";
import type { ReactNode } from "react";

/** Small-caps mono label. The workhorse of this design language. */
export function Label({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.18em] text-fg-3 ${className}`}
    >
      {children}
    </span>
  );
}

/** Hairline-ruled section with a numbered mono heading. */
export function Section({
  index,
  title,
  lede,
  children,
  id,
}: {
  index: string;
  title: string;
  lede?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="border-t border-line">
      <div className="mx-auto max-w-[1180px] px-6 py-16 md:px-10 md:py-24">
        <div className="mb-8 flex items-baseline gap-4 border-b border-line-soft pb-4">
          <Label className="text-fg-4">{index}</Label>
          <h2 className="text-h2 text-fg">{title}</h2>
        </div>
        {lede && <p className="mb-10 max-w-[60ch] text-b2 text-fg-2">{lede}</p>}
        {children}
      </div>
    </section>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-line bg-panel ${className}`}>{children}</div>
  );
}

/** A dense spec row: label left, monospace value right. */
export function Row({
  k,
  v,
  note,
  tone = "default",
}: {
  k: string;
  v: ReactNode;
  note?: string;
  tone?: "default" | "ok" | "accent";
}) {
  const toneCls =
    tone === "ok" ? "text-ok" : tone === "accent" ? "text-accent" : "text-fg";
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line-soft px-4 py-2.5 last:border-b-0">
      <span className="text-b1 text-fg-2">{k}</span>
      <span className="flex items-baseline gap-2 text-right">
        {note && <span className="text-[10.5px] text-fg-4">{note}</span>}
        <span className={`nums font-mono text-b1 ${toneCls}`}>{v}</span>
      </span>
    </div>
  );
}

/*
  The triad, as icons. Each axis keeps the glyph its name comes from — sea, shell,
  rainbow — so the source metaphor stays legible without ever being spelled out.

  Stroke weight is 1.5, matching the hairline rules elsewhere: anything heavier reads as
  an app icon rather than as part of the ruling. Colour is from the qualitative palette
  and is the ONLY place colour identifies rather than signals state.
*/
const TRIAD = {
  mare: { Icon: Waves, cls: "text-mare", label: "Mare" },
  vongola: { Icon: Shell, cls: "text-vongola", label: "Vongola" },
  arcobaleno: { Icon: Rainbow, cls: "text-arcobaleno", label: "Arcobaleno" },
} as const;

export type AxisKey = keyof typeof TRIAD;

export function Axis({ of, size = 16 }: { of: AxisKey; size?: number }) {
  const { Icon, cls, label } = TRIAD[of];
  return (
    <Icon
      size={size}
      strokeWidth={1.5}
      className={`${cls} shrink-0`}
      aria-label={label}
    />
  );
}

/** All three, for marks and footers. */
export function Triad({ size = 15 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <Axis of="mare" size={size} />
      <Axis of="vongola" size={size} />
      <Axis of="arcobaleno" size={size} />
    </span>
  );
}
