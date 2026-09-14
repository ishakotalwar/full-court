import type { ReactNode } from "react";
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
    chip: "bg-accent text-onAccent",
    bar: "bg-accent",
    edge: "hover:border-accent focus-visible:border-accent",
    glow: "hover:shadow-accent/25 focus-visible:shadow-accent/25",
    cta: "rounded-full border-black/10 bg-white text-neutral-900 shadow-sm group-hover:border-accent group-hover:bg-accent group-hover:text-onAccent group-active:border-accent group-active:bg-accent group-active:text-onAccent group-focus-visible:border-accent group-focus-visible:bg-accent group-focus-visible:text-onAccent",
  },
  accent2: {
    text: "text-accent2",
    chip: "bg-accent2 text-onAccent2",
    bar: "bg-accent2",
    edge: "hover:border-accent2 focus-visible:border-accent2",
    glow: "hover:shadow-accent2/25 focus-visible:shadow-accent2/25",
    cta: "rounded-full border-black/10 bg-white text-neutral-900 shadow-sm group-hover:border-accent2 group-hover:bg-accent2 group-hover:text-onAccent2 group-active:border-accent2 group-active:bg-accent2 group-active:text-onAccent2 group-focus-visible:border-accent2 group-focus-visible:bg-accent2 group-focus-visible:text-onAccent2",
  },
  good: {
    text: "text-good",
    chip: "bg-good text-bg",
    bar: "bg-good",
    edge: "hover:border-good focus-visible:border-good",
    glow: "hover:shadow-good/25 focus-visible:shadow-good/25",
    // No `onGood` token exists, and none is needed: every palette's good is
    // far enough from its background for the page ground to read on it.
    cta: "rounded-full border-black/10 bg-white text-neutral-900 shadow-sm group-hover:border-good group-hover:bg-good group-hover:text-bg group-active:border-good group-active:bg-good group-active:text-bg group-focus-visible:border-good group-focus-visible:bg-good group-focus-visible:text-bg",
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
  onEnter,
  onPick,
}: {
  leagues: LeagueInfo[];
  league: LeagueKey;
  /** Point the page at a league, without leaving it. */
  onLeague: (key: LeagueKey) => void;
  /** Open a league at its first page — Players, with the tabs above it. */
  onEnter: (key: LeagueKey) => void;
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
    <div className="mx-auto flex max-w-6xl flex-col px-6 pb-5 pt-5 lg:h-screen">
      <section className="card relative shrink-0 overflow-hidden shadow-2xl shadow-black/20">
        {/* The half court the app is named for, drawn to scale and sunk almost
            into the panel: at this opacity it reads as texture until you look
            for it, which is the most a background should ask. */}
        <HalfCourt
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-1/2 top-0 h-[340px] w-[567px]",
            "-translate-x-1/2 text-accent opacity-[0.12]",
            // The panel is shorter than the court is deep, so the lines are
            // faded out rather than sliced off at the edge of the card.
            "[mask-image:linear-gradient(to_bottom,black_45%,transparent_92%)]"
          )}
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

        {/* One row: what this is, and how much of it there is. Stacked, the
            numbers pushed the tiles below the fold — and the page is meant to
            be taken in without scrolling. */}
        <div className="relative flex flex-wrap items-center gap-x-8 gap-y-6 px-7 py-7">
          <div className="min-w-0 flex-1">
            <h1 className="text-5xl font-extrabold leading-none tracking-tighter">
              <span className="text-ink">Full</span>
              <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">
                Court
              </span>
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink">
              Historical <Hi>NBA</Hi> and <Hi tone="accent2">WNBA</Hi> analytics:
              player and team stats, shot locations, lineups and impact ratings,
              and forecasts for games not yet played.
            </p>

            {/* Two controls, two jobs. The toggle aims the page — the numbers
                beside it and the tiles below it both follow it — and the one
                button under it opens whichever league the toggle is on. */}
            <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-border bg-bg p-1">
              {leagues.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => onLeague(l.key)}
                  disabled={!l.available && l.key !== league}
                  className={cn(
                    "rounded-full px-5 py-1.5 text-sm font-semibold tracking-tight transition",
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

            {/* The ball is the button. It spins while the cursor is on it,
                the way one does on a finger — which is the whole trick: the
                thing you press is the thing the site is about. */}
            <button
              type="button"
              onClick={() => onEnter(league)}
              disabled={!active?.available}
              className={cn(
                "group/go mt-5 flex items-center gap-3.5 text-left",
                "focus-visible:outline-none",
                !active?.available && "cursor-not-allowed opacity-40"
              )}
            >
              {/* The scale lives on the wrapper and the spin on the ball.
                  Both on one element and they fight over `transform`: the
                  keyframe ends at `rotate(360deg)` with no scale in it, so the
                  browser interpolates between two different transforms and the
                  ball pulses instead of turning. */}
              <span
                className={cn(
                  "shrink-0 transition-transform duration-200",
                  "group-hover/go:scale-105 group-active/go:scale-95"
                )}
              >
                <Basketball
                  aria-hidden
                  className={cn(
                    "h-14 w-14 text-accent",
                    "group-hover/go:animate-ball-spin",
                    "group-focus-visible/go:animate-ball-spin"
                  )}
                />
              </span>
              <span>
                <span className="block text-[15px] font-semibold tracking-tight text-ink">
                  Go to {active?.label ?? league.toUpperCase()}
                  <span
                    aria-hidden
                    className="ml-1.5 inline-block text-accent transition-transform group-hover/go:translate-x-1"
                  >
                    →
                  </span>
                </span>
              </span>
            </button>
          </div>

          {/* The dribbling figure used to stand here. It is still in
              `components/LinePlayer.tsx` — drop it back in as
              `<LinePlayer className="hidden h-28 w-auto shrink-0 text-accent xl:block" />`
              if you want it again. */}
          <dl className="grid w-full shrink-0 grid-cols-2 gap-x-10 gap-y-5 sm:w-auto">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="label">{s.label}</dt>
                <dd
                  className={cn(
                    "mt-1 text-[1.9rem] font-extrabold leading-none tracking-tighter tabular-nums",
                    TONES[s.tone].text
                  )}
                >
                  {s.value}
                </dd>
                <dd className="mt-1 text-xs text-mute">{s.note}</dd>
              </div>
            ))}
            {!stats.length && (
              <div className="text-sm text-mute">No data on disk for this league yet.</div>
            )}
          </dl>
        </div>
      </section>

      <div
        className={cn(
          "mt-5 grid gap-3 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-3",
          // Two rows that share whatever the hero leaves — but never shrink
          // below what a card holds. Plain `grid-rows-2` divides the space
          // evenly whether or not the text fits, and the card, which clips to
          // draw its hover bar, would quietly cut its own button off.
          "lg:grid-rows-[repeat(2,minmax(min-content,1fr))]"
        )}
      >
        {ENTRIES.map((e) => (
          <Entry key={e.title} entry={e} onPick={onPick} />
        ))}
      </div>

      <footer className="mt-4 shrink-0 text-xs leading-relaxed text-mute">
        Data from ESPN, via hoopR and wehoop; per-possession defensive detail
        from pbpstats. Ratings, lineups and projections are computed here, each
        shown against its own backtest.
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
const g = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const IconPlayer = (
  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" {...g}>
    <circle cx="12" cy="7" r="3" />
    <path d="M5.5 20v-1.5A6.5 6.5 0 0 1 12 12a6.5 6.5 0 0 1 6.5 6.5V20" />
  </svg>
);
const IconCompare = (
  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" {...g}>
    <path d="M6 20V9M12 20V4M18 20v-7" />
    <path d="M3 20h18" />
  </svg>
);
const IconShots = (
  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" overflow="visible" {...g}>
    {/* A ball over a rim and net. The net is stated by its hem: three ridges
        of equal depth, which is what a net looks like from the side. The
        taper is gentle and the rim nearly the full box, because the ridges
        need the width to still be ridges at 22 pixels. The ball and hem
        overhang the box by a pixel or so; the chip around it has room. */}
    <circle cx="12" cy="2.6" r="3.5" />
    <path d="M2.5 9.6h19" />
    <path d="M5.4 9.6 6.9 20.6M18.6 9.6 17.1 20.6" />
    <path d="M6.9 20.6 8.6 23.2 10.3 20.6 12 23.2 13.7 20.6 15.4 23.2 17.1 20.6" />
  </svg>
);
const IconTeams = (
  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" {...g}>
    {/* Three: one in front and two behind it. A team is not a pair. */}
    <circle cx="12" cy="6.6" r="2.7" />
    <circle cx="5" cy="9" r="2" />
    <circle cx="19" cy="9" r="2" />
    <path d="M6.6 19.4a5.4 5.4 0 0 1 10.8 0" />
    <path d="M1.8 17.6a3.6 3.6 0 0 1 4.5-3.4M22.2 17.6a3.6 3.6 0 0 0-4.5-3.4" />
  </svg>
);
const IconExplorer = (
  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" {...g}>
    <circle cx="6" cy="17" r="1.5" />
    <circle cx="11" cy="11" r="1.5" />
    <circle cx="17" cy="13" r="1.5" />
    <circle cx="19" cy="6" r="1.5" />
    <path d="M3 21V3" />
  </svg>
);
const IconPredict = (
  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" {...g}>
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
      "Percentiles against the league, career trend, recent games, and five impact ratings.",
    tone: "accent",
    icon: IconPlayer,
    mode: "stats",
    tab: "players",
    view: "overview",
  },
  {
    title: "Comparisons",
    blurb:
      "Two players or two teams side by side: per game, per 36, or per 100 possessions.",
    tone: "accent2",
    icon: IconCompare,
    mode: "stats",
    tab: "players",
    view: "compare",
  },
  {
    title: "Shot analysis",
    blurb:
      "Where the shots came from and what they returned, by zone, season or playoffs.",
    tone: "good",
    icon: IconShots,
    mode: "stats",
    tab: "players",
    view: "shots",
  },
  {
    title: "Teams",
    blurb:
      "League table, team profiles, the best groups of two through five, and WOWY splits.",
    tone: "accent2",
    icon: IconTeams,
    mode: "stats",
    tab: "teams",
    view: "league",
  },
  {
    title: "Explorer",
    blurb:
      "Filter and sort every player-season, or plot any metric against any other.",
    tone: "good",
    icon: IconExplorer,
    mode: "stats",
    tab: "explorer",
  },
  {
    title: "Predictions",
    blurb:
      "Win probabilities, projected player lines, Elo team ratings and next-season projections.",
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
        "card group relative flex h-full flex-col items-start justify-center overflow-hidden p-5 text-left",
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
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center transition group-hover:scale-105",
            t.chip
          )}
        >
          {icon}
        </span>
        <h3 className="text-xl font-semibold tracking-tight text-ink">{title}</h3>
      </div>
      <p className="mb-4 mt-3 max-w-[34ch] text-[15px] leading-relaxed text-mute">{blurb}</p>
      {/* A span, because the whole card is already the button — but it has to
          look like the thing you press, which is what it is under the cursor. */}
      <span
        className={cn(
          "inline-flex items-center gap-1.5 border px-4 py-2 text-[13px] font-semibold",
          "tracking-wide transition",
          t.cta
        )}
      >
        Open
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </span>
    </button>
  );
}


/** A basketball: the ball itself, seams and all, drawn rather than imported so
 *  it follows the palette like everything else on the page. */
function Basketball(props: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" {...props} fill="none" stroke="currentColor"
         strokeWidth="4" strokeLinecap="round">
      <circle cx="50" cy="50" r="45" />
      <path d="M50 5v90M5 50h90" />
      {/* The two long seams, bowing away from the poles. */}
      <path d="M19 17C33 31 33 69 19 83" />
      <path d="M81 17C67 31 67 69 81 83" />
    </svg>
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
