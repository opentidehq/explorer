import { OpentideMark } from "@/components/brand/opentide-mark";

const STAGE_LABEL = {
  fetching: "loading the catalogue",
  indexing: "indexing objects and links",
} as const;

/** First paint while the catalogue loads: the mark, a tide of dots, and what is happening. */
export function LoadingScreen({
  stage = "fetching",
}: {
  stage?: keyof typeof STAGE_LABEL;
}) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-band px-6">
      <div className="relative grid place-items-center">
        <span
          aria-hidden
          className="tide-ping absolute size-14 rounded-full bg-accent/25"
        />
        <OpentideMark size={56} className="relative" />
      </div>
      <div
        className="flex flex-col items-center gap-3"
        role="status"
        aria-live="polite"
      >
        <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          opentide library
        </p>
        <p className="flex items-center gap-2 font-mono text-[11px] text-subtle">
          <span aria-hidden className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="tide-wave size-1 rounded-full bg-accent"
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
          </span>
          {STAGE_LABEL[stage]}
        </p>
        <span
          aria-hidden
          className="relative block h-0.5 w-44 overflow-hidden rounded-full bg-line"
        >
          <span className="tide-shimmer absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent" />
        </span>
      </div>
    </div>
  );
}
