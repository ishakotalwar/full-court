import { LinePlayer } from "@/components/LinePlayer";
import { cn } from "@/lib/cn";
import { formatSeason } from "@/lib/season";
import type { Meta } from "@/lib/api";

/**
 * The first thing the app shows: which of the two halves you want.
 *
 * Both are always one click away afterwards — the header keeps a switch — so
 * this is a starting point rather than a gate. Each side names the pages it
 * actually contains, so the choice is made on what is behind it.
 */
export function Landing({
  meta,
  onPick,
}: {
  meta: Meta;
  onPick: (mode: "stats" | "predictions") => void;
}) {
  const seasons = meta.seasons ?? [];
  const facts = [
    `${seasons.length} seasons`,
    seasons.length > 1
      ? `${formatSeason(seasons[0], meta.season_format)} to ${formatSeason(
          seasons.at(-1)!,
          meta.season_format
        )}`
      : "",
    `${(meta.players?.length ?? 0).toLocaleString()} players`,
  ].filter(Boolean);

  return (
    // Held a fixed distance from the top rather than centred. Centring is
    // re-solved whenever a card opens, which drags the wordmark and the rule
    // above it up the page; from here nothing above a card ever moves, and
    // the card opens down into space that was empty anyway.
    <div className="mx-auto min-h-screen max-w-5xl px-6 pb-20 pt-[7vh]">
      <header className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-5xl font-bold tracking-tight text-ink">
            Full<span className="text-accent">Court</span>
          </h1>
          <p className="mt-2 text-base text-ink">
            NBA and WNBA analytics, built from play-by-play.
          </p>
          <p className="mt-1 text-sm text-mute">{facts.join(" · ")}</p>
        </div>
        {/* Beside the title rather than above the page: a mark, not a hero. */}
        <LinePlayer className="hidden h-28 w-auto shrink-0 text-ink sm:block" />
      </header>

      {/* `items-start` so a card grows on its own without stretching the one
          beside it into matching dead space, and the sibling of whichever is
          hovered fades back — half of "popping out" is the rest receding. */}
      <div
        className={cn(
          // Stacked, and narrower than the header they sit under: a card this
          // wide with eight short lines in it would read as mostly empty.
          "mx-auto mt-16 grid max-w-2xl items-start gap-4",
          "[&>*]:transition-all [&:hover>*:not(:hover)]:opacity-25",
          "[&:hover>*:not(:hover)]:scale-[0.88]"
        )}
      >
        <Entry
          title="Stats"
          pages={[
            "Player overview and percentiles",
            "Compare players or teams",
            "Impact — five ways to rank it",
            "Season similarity",
            "Shot charts by zone",
            "League table and team profiles",
            "Lineups, and WOWY splits",
            "Explorer over every player-season",
          ]}
          cta="Open stats"
          onClick={() => onPick("stats")}
        />
        <Entry
          title="Predictions"
          tone="alt"
          pages={[
            "Game calendar with win probabilities",
            "Projected player lines for a scheduled game",
            "Elo team power ratings",
            "Next-season projection for any player",
            "Each model against its own backtest",
          ]}
          cta="Open predictions"
          onClick={() => onPick("predictions")}
        />
      </div>
    </div>
  );
}

/**
 * One of the two halves. Collapsed the two sit level; hovering or focusing one
 * pops it forward and opens the list of pages underneath it.
 *
 * The open state animates a grid row from `0fr` to `1fr`, which resolves to
 * the list's own height — so the card grows to exactly what it holds rather
 * than to a guessed pixel value, whatever is added to it later.
 */
function Entry({
  title,
  pages,
  cta,
  tone = "accent",
  onClick,
}: {
  title: string;
  pages: string[];
  cta: string;
  tone?: "accent" | "alt";
  onClick: () => void;
}) {
  const alt = tone === "alt";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "card group relative z-0 flex w-full flex-col items-start p-6 text-left",
        // Grown from its top edge, so the pop only ever expands downward. From
        // the centre it would climb into the lines above it as it scaled.
        "origin-top transition-all duration-200 ease-out will-change-transform",
        // Lifts toward the reader and above its neighbour, so the one being
        // considered is plainly the one in front.
        "hover:z-10 hover:-translate-y-6 hover:scale-[1.28] hover:shadow-2xl hover:shadow-black/60",
        "focus-visible:z-10 focus-visible:-translate-y-6 focus-visible:scale-[1.28] focus-visible:shadow-2xl",
        "focus-visible:outline-none",
        alt
          ? "hover:border-accent2 focus-visible:border-accent2"
          : "hover:border-accent focus-visible:border-accent"
      )}
    >
      <div className="flex w-full items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
        <span
          aria-hidden
          className={cn(
            "shrink-0 transition-transform duration-300 group-hover:rotate-180 group-focus-visible:rotate-180",
            alt ? "text-accent2" : "text-accent"
          )}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </span>
      </div>
      <div className="grid w-full grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr]">
        <ul className="min-h-0 overflow-hidden text-sm text-ink">
          {pages.map((p, i) => (
            <li key={p} className={cn("flex gap-2.5", i === 0 ? "pt-4" : "pt-1.5")}>
              <span aria-hidden className={alt ? "text-accent2" : "text-accent"}>
                ·
              </span>
              <span className="leading-snug">{p}</span>
            </li>
          ))}
        </ul>
      </div>

      <span
        className={cn(
          "btn mt-5",
          // Both filled. accent2 is a light blue in one palette and a dark
          // orange in another, so its text colour is a variable of its own
          // rather than a hardcoded white that would fail on half of them.
          alt ? "bg-accent2 text-onAccent2 hover:brightness-110" : "btn-primary"
        )}
      >
        {cta}
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </span>
    </button>
  );
}
