/** The URL shape, in one place.
 *
 * Every page is `/<league>/<section>[/<view>]`, and the panels' own selections
 * ride in the query string (see `lib/url.ts`). Nothing else in the app builds
 * a path by hand: a page is named by the tab strip's value plus the view
 * inside it, and this module is the only thing that knows how that reads as a
 * URL — including the one place the two disagree, which is predictions.
 */

export type Mode = "stats" | "predictions";

/** Sections, in tab order, with the views each one holds. */
export const SECTIONS = {
  players: {
    mode: "stats",
    views: ["overview", "compare", "impact", "similar", "shots"],
  },
  teams: {
    mode: "stats",
    views: ["league", "team", "compare", "lineups", "wowy", "leaders"],
  },
  explorer: { mode: "stats", views: [] },
  charts: { mode: "stats", views: [] },
  predictions: { mode: "predictions", views: ["games", "teams", "players"] },
} as const satisfies Record<string, { mode: Mode; views: readonly string[] }>;

export type Section = keyof typeof SECTIONS;

/** Predictions is three tabs inside the app and one section in the URL, so
 *  "/nba/predictions/games" reads as a page rather than as an internal id. */
const PREDICT_TAB: Record<string, string> = {
  games: "predict-calendar",
  teams: "predict-teams",
  players: "predict-players",
};
const PREDICT_VIEW: Record<string, string> = Object.fromEntries(
  Object.entries(PREDICT_TAB).map(([view, tab]) => [tab, view])
);

const isSection = (s: string | undefined): s is Section =>
  !!s && Object.prototype.hasOwnProperty.call(SECTIONS, s);

/** Where a page lives. `view` is ignored for sections that have none. */
export function pathTo(league: string, tab: string, view?: string): string {
  if (tab in PREDICT_VIEW) {
    return `/${league}/predictions/${PREDICT_VIEW[tab]}`;
  }
  if (!isSection(tab)) return `/${league}/players/overview`;
  const views: readonly string[] = SECTIONS[tab].views;
  if (!views.length) return `/${league}/${tab}`;
  return `/${league}/${tab}/${view && views.includes(view) ? view : views[0]}`;
}

/** What the app should render for a set of path params.
 *
 * `canonical` is the path these params *should* have had: a section with views
 * but no view named, a view that does not exist, or a league that is not one
 * of ours all resolve to something real, and the caller redirects to it rather
 * than rendering a page the URL did not ask for.
 */
export function resolve(
  params: { league?: string; section?: string; view?: string },
  leagues: string[]
): { league: string; mode: Mode; tab: string; view?: string; canonical: string } {
  const league =
    params.league && leagues.includes(params.league)
      ? params.league
      : leagues[0] ?? "nba";

  const section: Section = isSection(params.section) ? params.section : "players";
  const views: readonly string[] = SECTIONS[section].views;
  const view =
    views.length === 0
      ? undefined
      : params.view && views.includes(params.view)
      ? params.view
      : views[0];

  const tab =
    section === "predictions" ? PREDICT_TAB[view ?? "games"] : section;

  return {
    league,
    mode: SECTIONS[section].mode,
    tab,
    view,
    canonical: pathTo(league, tab, view),
  };
}
