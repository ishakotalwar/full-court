import type { ReactNode } from "react";
import { LinePlayer } from "@/components/LinePlayer";
import { cn } from "@/lib/cn";
import { formatSeason } from "@/lib/season";
import type { LeagueInfo, LeagueKey } from "@/lib/api";

export type Mode = "stats" | "predictions";
/** Where an entry lands: a top-level tab, and the view inside it. */
export type Destination = { mode: Mode; tab: string; view?: string };

/**
 * Colour is carried by the three theme accents rather than by hex codes, so a
 * tile keeps its identity across all six palettes and both modes. Each tone is
 * a set of literal class strings because Tailwind reads the source, not the
 * runtime — `text-${tone}` would compile to nothing.
 */
const TONES = {
  accent: {
    text: "text-accent",
    chip: "bg-accent/10 text-accent ring-accent/25",
    bar: "bg-accent",
    edge: "hover:border-accent focus-visible:border-accent",
    glow: "hover:shadow-accent/25 focus-visible:shadow-accent/25",
  },
  accent2: {
    text: "text-accent2",
    chip: "bg-accent2/10 text-accent2 ring-accent2/25",
    bar: "bg-accent2",
    edge: "hover:border-accent2 focus-visible:border-accent2",
    glow: "hover:shadow-accent2/25 focus-visible:shadow-accent2/25",
  },
  good: {
    text: "text-good",
    chip: "bg-good/10 text-good ring-good/25",
    bar: "bg-good",
    edge: "hover:border-good focus-visible:border-good",
    glow: "hover:shadow-good/25 focus-visible:shadow-good/25",
  },
} as const;

type Tone = keyof typeof TONES;

/**
 * The first thing the app shows.
 *
 * It has one job: say what this is and what is behind it, using the data
 * itself rather than claims about it. The numbers across the hero are read
 * from `/api/leagues` — the real extent of what is on disk — and they change
 * when you change league, so the page's first move is to prove that both
 * leagues are real rather than to assert it.
 *
 * Every tile below is a door, not a description: each names a page and opens
 * it directly, so nothing here has to be read twice.
 */
export function Landing({
  leagues,
  league,
  onLeague,
  onPick,
}: {
  leagues: LeagueInfo[];
  league: LeagueKey;
  onLeague: (key: LeagueKey) => void;
  onPick: (dest: Destination) => void;
}) {
  const active = leagues.find((l) => l.key === league);
  const cov = active?.coverage ?? null;
  const fmt = cov?.season_format;

  // Four numbers, every one of them countable in the Parquet on disk. A league
  // missing a dataset drops the tile rather than printing a zero.
  const stats: { label: string; value: string; note: string; tone: Tone }[] = cov
    ? [
        {
          label: "Seasons",
          value: String(cov.seasons),
          // Spaced rather than a tight dash: "2002-03" is already hyphenated,
          // and the two run together without the air.
          note:
            cov.first_season && cov.last_season
              ? `${formatSeason(cov.first_season, fmt)} – ${formatSeason(cov.last_season, fmt)}`
              : "",
          tone: "accent",
        },
        {
          label: "Players",
          value: cov.players.toLocaleString(),
          note: "with a season on record",
          tone: "accent2",
        },
        {
          label: "Player-seasons",
          value: cov.player_seasons.toLocaleString(),
          note: "every one queryable",
          tone: "good",
        },
        ...(cov.shots
          ? [
              {
                label: "Shots",
                value: compact(cov.shots),
                note: "located on the floor",
                tone: "accent" as Tone,
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 pb-16 pt-[6vh]">
      <section className="card relative overflow-hidden shadow-2xl shadow-black/20">
        {/* The half court the app is named for, drawn to scale and sunk almost
            into the panel: at this opacity it reads as texture until you look
            for it, which is the most a background should ask. */}
        <HalfCourt
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[340px] w-[567px] -translate-x-1/2 text-accent opacity-[0.12]"
        />
        {/* Two washes of accent light, which is what keeps a flat panel from
            reading as a spreadsheet. Both sit under the content. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-accent2/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-24 h-80 w-80 rounded-full bg-accent/20 blur-3xl"
        />

        <div className="relative flex flex-wrap items-start justify-between gap-8 px-8 pb-9 pt-10">
          <div className="min-w-0">
            <h1 className="text-6xl font-extrabold leading-none tracking-tighter">
              <span className="text-ink">Full</span>
              <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">
                Court
              </span>
            </h1>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink">
              Historical <Hi>NBA</Hi> and <Hi tone="accent2">WNBA</Hi> analytics
              — player and team stats, shot locations, lineups and impact
              ratings, and forecasts for games that have not been played yet.
            </p>

            <div className="mt-6 inline-flex items-center gap-1 border border-border bg-bg p-1">
              {leagues.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => onLeague(l.key)}
                  disabled={!l.available && l.key !== league}
                  title={
                    l.available
                      ? `Show ${l.label} data`
                      : `No ${l.label} data yet — run the ETL for this league`
                  }
                  className={cn(
                    "px-5 py-1.5 text-sm font-semibold tracking-tight transition",
                    l.key === league
                      ? "bg-accent text-onAccent shadow-lg shadow-accent/30"
                      : "text-mute hover:text-ink",
                    !l.available && l.key !== league && "cursor-not-allowed opacity-40"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* A mark, not a hero — but in accent it carries colour rather than
              just outline, which is most of what it is here to do. */}
          <LinePlayer className="hidden h-40 w-auto shrink-0 text-accent sm:block" />
        </div>

        <dl className="relative grid grid-cols-2 border-t border-border bg-bg/50 backdrop-blur sm:grid-cols-4">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={cn(
                "px-6 py-5",
                // Hairlines only where the row actually is a row: at two
                // columns a rule on the third cell would fall down the middle
                // of the block instead of between two numbers.
                i > 0 && "sm:border-l sm:border-border"
              )}
            >
              <dt className="label">{s.label}</dt>
              <dd
                className={cn(
                  "mt-1.5 text-[2.6rem] font-extrabold leading-none tracking-tighter tabular-nums",
                  TONES[s.tone].text
                )}
              >
                {s.value}
              </dd>
              <dd className="mt-2 text-xs text-mute">{s.note}</dd>
            </div>
          ))}
          {!stats.length && (
            <div className="px-6 py-5 text-sm text-mute">
              No data on disk for this league yet.
            </div>
          )}
        </dl>
      </section>

      <div className="mt-12 flex items-center gap-3">
        <span aria-hidden className="h-4 w-1 bg-accent" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink">
          Pages
        </h2>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ENTRIES.map((e) => (
          <Entry key={e.title} entry={e} onPick={onPick} />
        ))}
      </div>

      <footer className="mt-10 text-xs leading-relaxed text-mute">
        Data from ESPN, via hoopR and wehoop; per-possession defensive detail
        from pbpstats. Ratings, lineups and projections are computed here, and
        every model is shown against its own backtest.
      </footer>
    </div>
  );
}

/** A league name in the tagline, tinted to the colour it carries elsewhere. */
function Hi({ children, tone = "accent" }: { children: ReactNode; tone?: Tone }) {
  return <span className={cn("font-semibold", TONES[tone].text)}>{children}</span>;
}

/** Compact for the one number large enough to need it; exact below 10,000. */
function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3).toLocaleString()}K`;
  return n.toLocaleString();
}

type EntrySpec = Destination & {
  title: string;
  blurb: string;
  tone: Tone;
  icon: ReactNode;
};

/* Glyphs. Each is one idea in six strokes or fewer — a figure, two bars, a
   shot arc — drawn in the tile's own colour. */
const g = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const IconPlayer = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...g}>
    <circle cx="12" cy="7" r="3" />
    <path d="M5.5 20v-1.5A6.5 6.5 0 0 1 12 12a6.5 6.5 0 0 1 6.5 6.5V20" />
  </svg>
);
const IconCompare = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...g}>
    <path d="M6 20V9M12 20V4M18 20v-7" />
    <path d="M3 20h18" />
  </svg>
);
const IconShots = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...g}>
    <path d="M3 20c0-8 5.5-13 10-13" />
    <circle cx="18" cy="8" r="3" />
    <path d="M15.5 11.5 18 20" />
  </svg>
);
const IconTeams = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...g}>
    <circle cx="8" cy="8" r="2.5" />
    <circle cx="16.5" cy="9.5" r="2" />
    <path d="M3 18.5v-1a5 5 0 0 1 10 0v1M14 18.5v-.8a4 4 0 0 1 7-2.6" />
  </svg>
);
const IconExplorer = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...g}>
    <circle cx="6" cy="17" r="1.5" />
    <circle cx="11" cy="11" r="1.5" />
    <circle cx="17" cy="13" r="1.5" />
    <circle cx="19" cy="6" r="1.5" />
    <path d="M3 21V3" />
  </svg>
);
const IconPredict = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...g}>
    <path d="M3 16.5 8.5 11l3.5 3.5L21 6" />
    <path d="M15 6h6v6" />
  </svg>
);

/**
 * The six subjects, in the order someone works through them: one player, two
 * players, where they shot from, then teams, then everything at once, then
 * what happens next. Colour alternates so the grid reads as a set rather than
 * a table.
 */
const ENTRIES: EntrySpec[] = [
  {
    title: "Players",
    blurb:
      "One player's season: percentiles against the league, career trend, recent games, and five ways of rating impact.",
    tone: "accent",
    icon: IconPlayer,
    mode: "stats",
    tab: "players",
    view: "overview",
  },
  {
    title: "Comparisons",
    blurb:
      "Two players or two teams side by side, on any basis — per game, per 36, or per 100 possessions.",
    tone: "accent2",
    icon: IconCompare,
    mode: "stats",
    tab: "players",
    view: "compare",
  },
  {
    title: "Shot analysis",
    blurb:
      "Where the shots came from and what they returned, by zone, regular season or playoffs.",
    tone: "good",
    icon: IconShots,
    mode: "stats",
    tab: "players",
    view: "shots",
  },
  {
    title: "Teams",
    blurb:
      "League table and team profiles, the best lineups from two players to five, and what a team did with and without any group.",
    tone: "accent2",
    icon: IconTeams,
    mode: "stats",
    tab: "teams",
    view: "league",
  },
  {
    title: "Explorer",
    blurb:
      "Filter and sort every player-season in the database, or plot any metric against any other.",
    tone: "good",
    icon: IconExplorer,
    mode: "stats",
    tab: "explorer",
  },
  {
    title: "Predictions",
    blurb:
      "Win probabilities for scheduled games, projected player lines, Elo team ratings, and next-season projections.",
    tone: "accent",
    icon: IconPredict,
    mode: "predictions",
    tab: "predict-calendar",
  },
];

/** One page, as a door into it: flat in the grid, lifted and lit when pointed
 *  at, so hovering tells you the whole card is the click target. */
function Entry({
  entry,
  onPick,
}: {
  entry: EntrySpec;
  onPick: (dest: Destination) => void;
}) {
  const { title, blurb, tone, icon, ...dest } = entry;
  const t = TONES[tone];
  return (
    <button
      type="button"
      onClick={() => onPick(dest)}
      className={cn(
        "card group relative flex flex-col items-start overflow-hidden p-5 text-left",
        "transition duration-200 ease-out focus-visible:outline-none",
        "hover:-translate-y-1 hover:shadow-xl focus-visible:-translate-y-1 focus-visible:shadow-xl",
        t.edge,
        t.glow
      )}
    >
      {/* Wipes in from the left on hover: the card's colour, stated. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 ease-out",
          "group-hover:scale-x-100 group-focus-visible:scale-x-100",
          t.bar
        )}
      />
      <span
        aria-hidden
        className={cn(
          "flex h-10 w-10 items-center justify-center ring-1 transition group-hover:scale-105",
          t.chip
        )}
      >
        {icon}
      </span>
      <h3 className="mt-4 text-base font-semibold tracking-tight text-ink">
        {title}
      </h3>
      <p className="mt-1.5 text-sm leading-snug text-mute">{blurb}</p>
      <span
        className={cn(
          "mt-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider",
          t.text
        )}
      >
        Open
        <span aria-hidden className="transition-transform group-hover:translate-x-1">
          →
        </span>
      </span>
    </button>
  );
}

/**
 * Half a court, to scale: 50 feet across at ten pixels a foot, hoop 5.25 feet
 * off the baseline, the arc a true 23.75-foot radius meeting the corner lines
 * where it actually meets them. Purely a background — the one on the shot
 * chart is drawn from the league's own geometry in `lib/court.ts`.
 */
function HalfCourt(props: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <svg viewBox="0 0 500 300" {...props}
         fill="none" stroke="currentColor" strokeWidth="2.5">
      {/* Backboard and rim. */}
      <path d="M220 30h60" />
      <circle cx="250" cy="45" r="9" />
      {/* Paint, free-throw circle, restricted area. */}
      <path d="M190 0v190h120V0" />
      <circle cx="250" cy="190" r="60" />
      <path d="M210 45a40 40 0 0 1 80 0" />
      {/* Three-point line: corners, then the arc about the rim. */}
      <path d="M30 0v142a237.5 237.5 0 0 1 440 0V0" />
    </svg>
  );
}
