import { Fragment, useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import { api, type LeagueInfo, type LeagueKey, type Meta } from "./lib/api";
import { cn } from "./lib/cn";
import { pathTo, resolve, type Mode } from "@/lib/routes";
import { PlayersSection } from "./components/panels/PlayersSection";
import { TeamsSection } from "./components/panels/TeamsSection";
import { Explorer } from "./components/panels/Explorer";
import { Charts } from "./components/panels/Charts";
import { AskFullCourt } from "@/components/AskFullCourt";
import { Landing } from "@/components/Landing";
import { Glossary } from "@/components/Glossary";
import { PredictCalendar } from "@/components/panels/PredictCalendar";
import { PredictTeams } from "@/components/panels/PredictTeams";
import { PredictPlayers } from "@/components/panels/PredictPlayers";
import {
  PALETTES,
  setPalette,
  toggleMode,
  useMode,
  usePalette,
  type Mode as ThemeMode,
  type Palette,
} from "@/lib/theme";

/** `group` only draws a separator — it is not a second click. */
const TABS = [
  { v: "players", label: "Players", group: "stats" },
  { v: "teams", label: "Teams", group: "stats" },
  { v: "explorer", label: "Explorer", group: "explorer" },
  { v: "charts", label: "Charts", group: "explorer" },
] as const;

const PREDICT_TABS = [
  { v: "predict-calendar", label: "Games", group: "predict" },
  { v: "predict-teams", label: "Teams", group: "predict" },
  { v: "predict-players", label: "Players", group: "predict" },
] as const;

/** Ask Full Court names pages after the feature it answered with. Each one
 *  lands on a tab and, inside it, on the view showing that answer. */
const PAGE_ROUTES: Record<string, { tab: string; view?: string }> = {
  similarity: { tab: "players", view: "similar" },
  shots: { tab: "players", view: "shots" },
  compare: { tab: "players", view: "compare" },
  impact: { tab: "players", view: "impact" },
  teams: { tab: "teams", view: "leaders" },
  lineups: { tab: "teams", view: "lineups" },
  wowy: { tab: "teams", view: "wowy" },
  explorer: { tab: "explorer" },
};

const DEFAULT_TAB: Record<Mode, string> = {
  stats: "players",
  predictions: "predict-calendar",
};

/**
 * League discovery, then the router.
 *
 * Which leagues exist is the one thing every page needs and no page can ask
 * for twice, so it is fetched here and handed down. Everything after it — the
 * league you are looking at, the page, and what that page is showing — is read
 * from the URL rather than held in state, so a link is the whole address.
 */
export default function App() {
  const [leagues, setLeagues] = useState<LeagueInfo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .leagues()
      .then(({ leagues }) => setLeagues(leagues))
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <Bootstrap state="error" msg={err} />;
  if (!leagues) return <Bootstrap state="loading" />;

  return (
    <Routes>
      <Route path="/" element={<LandingScreen leagues={leagues} />} />
      <Route path=":league/:section" element={<Shell leagues={leagues} />} />
      <Route path=":league/:section/:view" element={<Shell leagues={leagues} />} />
      {/* Anything else is a typo or a dead bookmark; the start page is the
          only honest answer, and it is one click from everywhere. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** The start page. Its league picker is local — nothing has been opened yet,
 *  so the choice only decides which numbers show and where a tile leads. */
function LandingScreen({ leagues }: { leagues: LeagueInfo[] }) {
  const navigate = useNavigate();
  const first = leagues.find((l) => l.available)?.key ?? leagues[0]?.key ?? "nba";
  const [league, setLeague] = useState<LeagueKey>(first);

  return (
    <div className="min-h-screen bg-bg">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <Landing
        leagues={leagues}
        league={league}
        onLeague={setLeague}
        onEnter={(key) => navigate(pathTo(key, DEFAULT_TAB.stats))}
        onPick={(dest) => navigate(pathTo(league, dest.tab, dest.view))}
      />
    </div>
  );
}

/** Everything behind the landing page: one league's data, one page of it. */
function Shell({ leagues }: { leagues: LeagueInfo[] }) {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const route = resolve(params, leagues.map((l) => l.key));

  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Explorer's answer is a whole filter stack rather than a handful of named
  // values, so that one page still takes its state in memory. Every other page
  // reads it out of the URL, which is what `searchFor` below writes.
  const [seed, setSeed] = useState<{ page: string; state: any } | null>(null);

  // Reload metadata whenever the league in the URL changes.
  useEffect(() => {
    setMeta(null);
    setErr(null);
    setSeed(null);
    api.meta(route.league).then(setMeta).catch((e) => setErr(e.message));
  }, [route.league]);

  // A URL naming a page or a league we don't have still resolved to a real
  // one; say so in the address bar rather than rendering something the URL
  // didn't ask for. The query string rides along — it belongs to the panel.
  if (location.pathname !== route.canonical) {
    return <Navigate to={route.canonical + location.search} replace />;
  }

  if (err) {
    return (
      <Bootstrap
        state="error"
        msg={err}
        leagues={leagues}
        league={route.league}
        onLeague={(key) => navigate(pathTo(key, route.tab, route.view))}
      />
    );
  }
  if (!meta) return <Bootstrap state="loading" />;

  const tabs = route.mode === "stats" ? TABS : PREDICT_TABS;
  /** Going somewhere else drops the query string: it described the page being
   *  left, and means nothing on the one being opened. */
  const go = (tab: string, view?: string) =>
    navigate(pathTo(route.league, tab, view));

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-left"
              title="Back to the start"
            >
              <div className="text-2xl font-bold leading-none tracking-tight">
                Full<span className="text-accent">Court</span>
              </div>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <ModeSwitch
              mode={route.mode}
              onSwitch={(next) => go(DEFAULT_TAB[next])}
            />
            <ThemeToggle />
            <LeagueToggle
              leagues={leagues}
              active={route.league}
              onChange={(key) => navigate(pathTo(key, route.tab, route.view))}
            />
            <Glossary />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <Tabs.Root value={route.tab} onValueChange={(v) => go(v)} key={route.league}>
          <Tabs.List className="no-scrollbar mb-6 flex items-center gap-5 overflow-x-auto border-b border-border">
            {tabs.map((t, i) => (
              <Fragment key={t.v}>
                {i > 0 && tabs[i - 1].group !== t.group && (
                  <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
                )}
                <Tabs.Trigger
                  value={t.v}
                  className={cn(
                    "-mb-px whitespace-nowrap border-b-2 border-transparent pb-2.5",
                    "text-[17px] font-medium tracking-tight text-mute transition",
                    "data-[state=active]:border-accent data-[state=active]:text-ink",
                    "hover:text-ink"
                  )}
                >
                  {t.label}
                </Tabs.Trigger>
              </Fragment>
            ))}
          </Tabs.List>

          <Tabs.Content value="players">
            <PlayersSection
              meta={meta}
              view={route.view}
              onView={(v) => go("players", v)}
            />
          </Tabs.Content>
          <Tabs.Content value="teams">
            <TeamsSection
              meta={meta}
              view={route.view}
              onView={(v) => go("teams", v)}
            />
          </Tabs.Content>
          <Tabs.Content value="explorer">
            <Explorer meta={meta} seed={seed?.page === "explorer" ? seed.state : undefined} />
          </Tabs.Content>
          <Tabs.Content value="charts">
            <Charts meta={meta} />
          </Tabs.Content>
          <Tabs.Content value="predict-calendar"><PredictCalendar meta={meta} /></Tabs.Content>
          <Tabs.Content value="predict-teams"><PredictTeams meta={meta} /></Tabs.Content>
          <Tabs.Content value="predict-players"><PredictPlayers meta={meta} /></Tabs.Content>
        </Tabs.Root>
      </main>

      <AskFullCourt
        meta={meta}
        onNavigate={(page, answer) => {
          const dest = PAGE_ROUTES[page];
          if (!dest) return;
          setSeed(answer ?? null);
          const search = searchFor(page, answer?.state);
          navigate(pathTo(route.league, dest.tab, dest.view) + search);
        }}
      />
    </div>
  );
}


/**
 * An answer's state, as the query string of the page that shows it.
 *
 * Ask Full Court used to hand the panel an object in memory; now it writes the
 * same thing into the URL, so "Open in Similarity" produces a link the visitor
 * can keep — and the panel needs no second way of being told what to show.
 */
function searchFor(page: string, state: any): string {
  if (!state) return "";
  const q = new URLSearchParams();
  const put = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== "") q.set(key, String(value));
  };
  switch (page) {
    case "similarity":
      put("player", state.player_name);
      put("season", state.season);
      put("preset", state.preset);
      put("k", state.k);
      put("minGp", state.min_gp);
      break;
    case "shots":
      put("player", state.player_name);
      put("season", state.season);
      break;
    case "compare":
      if (Array.isArray(state.players) && state.players.length) {
        put(
          "players",
          state.players
            .map((p: any) => `${p.player_name}~${p.season ?? ""}`)
            .join(",")
        );
      }
      break;
    case "impact":
      put("metric", state.metric);
      put("season", state.season);
      break;
    case "teams":
      put("metric", state.metric);
      break;
    case "lineups":
      put("season", state.season);
      put("team", state.team);
      put("size", state.size);
      break;
    case "wowy":
      put("season", state.season);
      put("team", state.team);
      if (Array.isArray(state.players) && state.players.length) {
        put("players", state.players.join(","));
      }
      break;
  }
  const search = q.toString();
  return search ? `?${search}` : "";
}

/** Moves between the stats half of the app and the predictions half. Present
 *  on every page of both, so neither is a dead end. */
function ModeSwitch({ mode, onSwitch }: { mode: Mode; onSwitch: (m: Mode) => void }) {
  const goingTo: Mode = mode === "stats" ? "predictions" : "stats";
  return (
    <button
      type="button"
      onClick={() => onSwitch(goingTo)}
      className="btn btn-ghost whitespace-nowrap px-3 py-1.5 text-sm"
      title={`Switch to ${goingTo}`}
    >
      {mode === "stats" ? "Predictions →" : "← Stats"}
    </button>
  );
}

/** Half background, half accent — enough of a palette to tell them apart in a
 *  list, and it works for a palette that is not the one currently applied. */
function Swatch({ palette, mode }: { palette: Palette; mode: ThemeMode }) {
  const found = PALETTES.find((p) => p.key === palette);
  const [bg, accent] = found ? found.swatch[mode] : ["#000", "#fff"];
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-border"
      style={{ background: `linear-gradient(135deg, ${bg} 0 50%, ${accent} 50% 100%)` }}
    />
  );
}

/**
 * The two halves of the theme, as two controls: which family of colors, and
 * which end of it. Every palette exists light and dark, so neither choice
 * costs you the other.
 */
function ThemeToggle() {
  const palette = usePalette();
  const mode = useMode();
  const [open, setOpen] = useState(false);

  // A menu that stays open behind you is worse than no menu.
  useEffect(() => {
    if (!open) return;
    const away = () => setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("click", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("click", away);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-1">
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="btn btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-sm"
          title="Color theme"
          aria-label="Color theme"
          aria-expanded={open}
        >
          <Swatch palette={palette} mode={mode} />
          <span aria-hidden className="text-[10px] leading-none text-mute">▾</span>
        </button>

        {open && (
          <div className="absolute right-0 top-full z-30 mt-1 min-w-[8.5rem] border border-border bg-panel py-1 shadow-lg shadow-black/20">
            {PALETTES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setPalette(p.key);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-border/50",
                  p.key === palette ? "text-ink" : "text-mute hover:text-ink"
                )}
              >
                <Swatch palette={p.key} mode={mode} />
                <span>{p.label}</span>
                {p.key === palette && <span className="ml-auto text-accent">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={toggleMode}
        className="btn btn-ghost px-2.5 py-1.5 text-sm"
        title={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
        aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      >
        {mode === "dark" ? "☀" : "☾"}
      </button>
    </div>
  );
}

function LeagueToggle({
  leagues,
  active,
  onChange,
}: {
  leagues: LeagueInfo[] | null;
  active: LeagueKey;
  onChange: (k: LeagueKey) => void;
}) {
  if (!leagues || leagues.length < 2) return null;
  return (
    <div className="flex items-center gap-4">
      {leagues.map((l) => (
        <button
          key={l.key}
          onClick={() => onChange(l.key)}
          disabled={!l.available && l.key !== active}
          title={l.available ? `Show ${l.label} data` : `No ${l.label} data yet — run the ETL for this league`}
          className={cn(
           "border-b-2 pb-0.5 text-sm font-medium transition",
            l.key === active
              ? "border-accent text-ink"
              : l.available
              ? "border-transparent text-mute hover:text-ink"
              : "cursor-not-allowed border-transparent text-mute/40"
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function Bootstrap({
  state,
  msg,
  leagues,
  league,
  onLeague,
}: {
  state: "loading" | "error";
  msg?: string;
  leagues?: LeagueInfo[] | null;
  league?: LeagueKey | null;
  onLeague?: (k: LeagueKey) => void;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-bg text-ink">
      <div className="card max-w-md p-6 text-center">
        {state === "loading" ? (
          <div className="text-lg font-semibold">Loading…</div>
        ) : (
          <>
            <div className="mb-2 text-lg font-semibold text-bad">Couldn't load data</div>
            <div className="text-sm text-mute">{msg}</div>
            <div className="mt-4 text-xs text-mute">
              If the API isn't running, start it with:{" "}
              <code className="rounded bg-border/60 px-1.5 py-0.5">uvicorn backend.main:app --reload</code>
            </div>
            {leagues && league && onLeague && (
              <div className="mt-4 flex justify-center">
                <LeagueToggle leagues={leagues} active={league} onChange={onLeague} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
