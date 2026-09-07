import { Fragment, useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { api, type LeagueInfo, type LeagueKey, type Meta } from "./lib/api";
import { cn } from "./lib/cn";
import { PlayersSection } from "./components/panels/PlayersSection";
import { TeamsSection } from "./components/panels/TeamsSection";
import { Explorer } from "./components/panels/Explorer";
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
type Mode = "stats" | "predictions";

/** Four subjects. Each one's pages switch inside it, not up here. */
const TABS = [
  { v: "players", label: "Players", group: "stats" },
  { v: "teams", label: "Teams", group: "stats" },
  { v: "explorer", label: "Explorer", group: "explorer" },
] as const;

/** Ask Full Court names pages after the feature it answered with. Each one
 *  lands on a tab and, inside it, on the view showing that answer. */
const PAGE_ROUTES: Record<string, { tab: string; view?: string }> = {
  similarity: { tab: "players", view: "similar" },
  shots: { tab: "players", view: "shots" },
  compare: { tab: "players", view: "compare" },
  teams: { tab: "teams", view: "leaders" },
  explorer: { tab: "explorer" },
};

const PREDICT_TABS = [
  { v: "predict-calendar", label: "Games", group: "predict" },
  { v: "predict-teams", label: "Teams", group: "predict" },
  { v: "predict-players", label: "Players", group: "predict" },
] as const;

const DEFAULT_TAB: Record<Mode, string> = {
  stats: "players",
  predictions: "predict-calendar",
};

export default function App() {
  // null until the visitor picks a side on the landing screen.
  const [mode, setMode] = useState<Mode | null>(null);
  const [tab, setTab] = useState<string>("players");
  // The structured query Ask Full Court last ran, handed to whichever panel it
  // points at so "Open in …" lands on the answer instead of an empty form.
  const [seed, setSeed] = useState<{ page: string; state: any } | null>(null);
  const [leagues, setLeagues] = useState<LeagueInfo[] | null>(null);
  const [league, setLeague] = useState<LeagueKey | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Which leagues exist, and which one to open on.
  useEffect(() => {
    api
      .leagues()
      .then(({ leagues, default: dflt }) => {
        setLeagues(leagues);
        const first = leagues.find((l) => l.available)?.key ?? dflt;
        setLeague(first);
      })
      .catch((e) => setErr(e.message));
  }, []);

  // Reload metadata whenever the league changes.
  useEffect(() => {
    if (!league) return;
    setMeta(null);
    setErr(null);
    api.meta(league).then(setMeta).catch((e) => setErr(e.message));
  }, [league]);

  const seedFor = (page: string) => (seed?.page === page ? seed.state : undefined);
  /** The view a section should open on, when Ask pointed at one of its pages. */
  const viewFor = (tabName: string) => {
    const route = seed ? PAGE_ROUTES[seed.page] : undefined;
    return route?.tab === tabName ? route.view : undefined;
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setTab(DEFAULT_TAB[next]);
    setSeed(null);
  };

  if (err) return <Bootstrap state="error" msg={err} leagues={leagues} league={league} onLeague={setLeague} />;
  if (!meta || !league) return <Bootstrap state="loading" />;

  if (mode === null) {
    return (
      <div className="min-h-screen bg-bg">
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>
        <Landing meta={meta} onPick={switchMode} />
      </div>
    );
  }

  const tabs = mode === "stats" ? TABS : PREDICT_TABS;


  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode(null)}
              className="text-left"
              title="Back to the start"
            >
              <div className="text-2xl font-bold leading-none tracking-tight">
                Full<span className="text-accent">Court</span>
              </div>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <ModeSwitch mode={mode} onSwitch={switchMode} />
            <ThemeToggle />
            <LeagueToggle leagues={leagues} active={league} onChange={setLeague} />
            <Glossary />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <Tabs.Root value={tab} onValueChange={setTab} key={league}>
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
            <PlayersSection meta={meta} view={viewFor("players")} seedFor={seedFor} />
          </Tabs.Content>
          <Tabs.Content value="teams">
            <TeamsSection meta={meta} view={viewFor("teams")} />
          </Tabs.Content>
          <Tabs.Content value="explorer">
            <Explorer meta={meta} seed={seedFor("explorer")} />
          </Tabs.Content>
          <Tabs.Content value="predict-calendar"><PredictCalendar meta={meta} /></Tabs.Content>
          <Tabs.Content value="predict-teams"><PredictTeams meta={meta} /></Tabs.Content>
          <Tabs.Content value="predict-players"><PredictPlayers meta={meta} /></Tabs.Content>
        </Tabs.Root>
      </main>

      <AskFullCourt
        meta={meta}
        onNavigate={(page, navigate) => {
          setTab(PAGE_ROUTES[page]?.tab ?? page);
          setSeed(navigate ?? null);
        }}
      />
    </div>
  );
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
