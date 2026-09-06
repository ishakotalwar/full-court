import { cn } from "@/lib/cn";
import type { Meta } from "@/lib/api";

/**
 * The two possession bases are the same option asked at two sizes, so they
 * share one entry and the number is what you pick inside it. Spelling both out
 * side by side made a four-option row that read as four different questions.
 */
const PER_POSSESSION: Record<string, string> = { per75: "75", per100: "100" };

const SHORT: Record<string, string> = {
  game: "Per game",
  per36: "Per 36 minutes",
};

const TITLE: Record<string, string> = {
  game: "Counting stats as a per-game average",
  per36: "Counting stats scaled to 36 minutes of playing time",
  per75:
    "Counting stats per 75 possessions — roughly what a starter uses in a " +
    "game, so the numbers stay close to the per-game ones they replace",
  per100:
    "Counting stats per 100 possessions the player's team used while they " +
    "were on the floor — their minutes times their team's pace, since ESPN " +
    "publishes no possession data",
};

/**
 * Picks the basis counting stats are expressed on. It changes percentiles,
 * ranks and filters too, not just the number printed, because a player's
 * standing depends on what everyone else is measured by.
 */
export function RateToggle({
  meta,
  value,
  onChange,
  className,
}: {
  meta: Meta;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const bases = Object.keys(meta.rate_bases ?? { game: "Per game" });
  if (bases.length < 2) return null;

  const plain = bases.filter((b) => !(b in PER_POSSESSION));
  const possession = bases.filter((b) => b in PER_POSSESSION);
  const onPossessions = possession.includes(value);

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {plain.map((b) => (
        <button
          key={b}
          type="button"
          onClick={() => onChange(b)}
          title={TITLE[b] ?? meta.rate_bases[b]}
          className={cn(
            "whitespace-nowrap border-b-2 pb-0.5 text-sm transition",
            b === value
              ? "border-accent text-ink"
              : "border-transparent text-mute hover:text-ink"
          )}
        >
          {SHORT[b] ?? meta.rate_bases[b]}
        </button>
      ))}

      {possession.length > 0 && (
        <div
          className={cn(
            "flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-0.5 text-sm transition",
            onPossessions ? "border-accent text-ink" : "border-transparent text-mute"
          )}
        >
          <span>Per</span>
          {/* A switch rather than two buttons: it is one setting with two
              positions, and the thumb slides to whichever is on. */}
          <span className="relative inline-flex items-center rounded-full border border-border bg-border/40 p-0.5">
            <span
              aria-hidden
              className={cn(
                "absolute left-0.5 top-0.5 bottom-0.5 w-8 rounded-full bg-accent",
                "transition-[transform,opacity] duration-200 ease-out",
                onPossessions ? "opacity-100" : "opacity-0",
                value === "per100" && "translate-x-full"
              )}
            />
            {possession.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => onChange(b)}
                title={TITLE[b] ?? meta.rate_bases[b]}
                aria-pressed={b === value}
                className={cn(
                  "relative z-10 w-8 rounded-full py-px text-[11px] tabular-nums transition-colors",
                  b === value
                    ? "font-medium text-onAccent"
                    : "text-mute hover:text-ink"
                )}
              >
                {PER_POSSESSION[b]}
              </button>
            ))}
          </span>
          <span>possessions</span>
        </div>
      )}
    </div>
  );
}
