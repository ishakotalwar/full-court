import { useEffect, useMemo, useState } from "react";
import { api, type Meta } from "@/lib/api";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { RateToggle } from "@/components/ui/RateToggle";
import { Select } from "@/components/ui/Select";
import { Plot } from "@/components/ui/Plot";
import { playerAvatar } from "@/components/ui/Avatar";
import { formatValue, label, shortLabel, sortMetrics } from "@/lib/metrics";
import { cn } from "@/lib/cn";
import { BLANK } from "@/lib/labels";
import { themeAlpha, themeColor, useTheme } from "@/lib/theme";
import { formatSeason } from "@/lib/season";

type Filt = { metric: string; op: string; value: number; value2?: number };

// A rate divides by playing time, so a player with one minute on record posts
// 150 points per 100 possessions. Switching off per-game applies a rotation
// player's qualifier, unless the query already carries its own.
const RATE_QUALIFIER = { games: "20", minutes: "15" };

// Columns that are not metrics, so metrics.ts has no name for them.
const HEAD: Record<string, string> = {
  player_name: "Player",
  team_name: "Team",
  team_abbr: "Team",
  season: "Season",
};

const OPS = [
  { value: ">=", label: "≥" },
  { value: ">", label: ">" },
  { value: "<=", label: "≤" },
  { value: "<", label: "<" },
  { value: "=", label: "=" },
  { value: "between", label: "between" },
];

/** `seed` is the ExplorerRequest that Ask Full Court just executed. */
export function Explorer({ meta, seed }: { meta: Meta; seed?: any }) {
  const avatar = playerAvatar(meta);
  const seasons = meta.seasons;
  const seasonOptions = seasons.map((s) => ({ value: s, label: formatSeason(s, meta.season_format) }));
  const [from, setFrom] = useState(seasons[0] ?? "");
  const [to, setTo] = useState(seasons.at(-1) ?? "");
  const [minGp, setMinGp] = useState("0");
  const [minMin, setMinMin] = useState("0");
  const [team, setTeam] = useState("");
  const [player, setPlayer] = useState("");
  const [filters, setFilters] = useState<Filt[]>([
    { metric: "pts", op: ">=", value: 25 },
  ]);
  const [sort, setSort] = useState("pts");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [per, setPer] = useState("game");
  const [teams, setTeams] = useState<string[]>([]);
  // What a row is. Teams are the same query machinery over a different frame,
  // so everything below reads `subject` rather than branching on two panels.
  const [subject, setSubject] = useState<"players" | "teams">("players");
  const [fieldMetrics, setFieldMetrics] = useState<string[] | null>(null);

  // Player metrics have a display order worth keeping; team metrics arrive
  // from the API already in the order a table should show them.
  const metricKeys = (fieldMetrics && subject === "teams")
    ? fieldMetrics
    : sortMetrics(fieldMetrics ?? meta.metrics);
  useEffect(() => {
    if (!seed) return;
    if (seed.season_from) setFrom(String(seed.season_from));
    if (seed.season_to) setTo(String(seed.season_to));
    if (Array.isArray(seed.filters) && seed.filters.length) {
      setFilters(
        seed.filters.map((f: any) => ({
          metric: f.metric,
          op: f.op,
          value: f.value,
          value2: f.value2 ?? undefined,
        })),
      );
    }
    if (seed.sort) setSort(seed.sort);
    if (seed.dir) setDir(seed.dir);
    setPage(1);
    setSeedPending(true);
  }, [seed]);

  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  // Set when a seed lands, cleared once the query it implies has been run.
  const [seedPending, setSeedPending] = useState(false);

  useEffect(() => {
    let stale = false;
    api
      .explorerFields(meta.league, subject)
      .then((f) => {
        if (stale) return;
        setTeams(f.teams ?? []);
        setFieldMetrics(f.metrics ?? null);
      })
      .catch(() => !stale && setTeams([]));
    return () => {
      stale = true;
    };
  }, [meta.league, subject]);

  // Switching subject invalidates every column named in the form, so the
  // conditions and the sort are reset to something the new frame has.
  const changeSubject = (next: "players" | "teams") => {
    if (next === subject) return;
    setSubject(next);
    setTeam("");
    setPlayer("");
    setData(null);
    setErr(null);
    setFilters(next === "teams"
      ? [{ metric: "net", op: ">=", value: 5 }]
      : [{ metric: "pts", op: ">=", value: 25 }]);
    setSort(next === "teams" ? "net" : "pts");
  };

  // Runs on the render *after* the seed setters land, so `run` reads the
  // seeded values rather than the previous ones.
  useEffect(() => {
    if (!seedPending) return;
    setSeedPending(false);
    run(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPending, from, to, filters, sort, dir]);

  const run = (toPage = 1) => {
    setErr(null);
    setPage(toPage);
    api
      .explorer({
        subject,
        league: meta.league,
        season_from: from || undefined,
        season_to: to || undefined,
        min_gp: Number(minGp) || 0,
        min_min: Number(minMin) || 0,
        team: team || undefined,
        player: player || undefined,
        filters: filters.filter((f) => f.metric && !Number.isNaN(f.value)),
        per,
        sort,
        dir,
        page: toPage,
        page_size: 25,
      })
      .then(setData)
      .catch((e) => {
        setErr(e.message);
        setData(null);
      });
  };

  // Re-run on sort or rate-basis changes once results exist. The basis moves
  // every counting stat in the table, so leaving stale rows on screen under a
  // new label would misreport them.
  useEffect(() => {
    if (data) run(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, dir, per]);

  // Only ever raises floors left at zero, so a qualifier the user typed —
  // including a deliberate zero they set afterwards — is never overwritten.
  const changeBasis = (next: string) => {
    if (next !== "game") {
      if (minGp === "0") setMinGp(RATE_QUALIFIER.games);
      if (minMin === "0") setMinMin(RATE_QUALIFIER.minutes);
    }
    setPer(next);
  };

  const setFilter = (i: number, patch: Partial<Filt>) =>
    setFilters((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const columns: string[] = data?.columns ?? [];
  // Which columns hold text. Teams are keyed by full name and have no
  // abbreviation column, so the two subjects do not share one label column
  // and formatValue must not be handed either of them.
  const isText = (c: string) =>
    ["player_name", "team_name", "team_abbr", "season"].includes(c);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Stat explorer"
          right={
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-4 text-sm">
                {(["players", "teams"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => changeSubject(s)}
                    className={cn(
                      "border-b-2 pb-0.5 capitalize transition",
                      s === subject
                        ? "border-accent text-ink"
                        : "border-transparent text-mute hover:text-ink"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {/* A team's totals are what they are — there is no per-36 team. */}
              {subject === "players" && (
                <>
                  <span aria-hidden className="h-4 w-px bg-border" />
                  <RateToggle meta={meta} value={per} onChange={changeBasis} />
                </>
              )}
            </div>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div>
              <div className="label mb-1.5">Season from</div>
              <Select value={from} onChange={setFrom} options={seasonOptions} />
            </div>
            <div>
              <div className="label mb-1.5">to</div>
              <Select value={to} onChange={setTo} options={seasonOptions} />
            </div>
            {subject === "players" && (
              <>
                <div>
                  <div className="label mb-1.5">Min games</div>
                  <input className="input" value={minGp} onChange={(e) => setMinGp(e.target.value)} inputMode="numeric" />
                </div>
                <div>
                  <div className="label mb-1.5">Min minutes</div>
                  <input className="input" value={minMin} onChange={(e) => setMinMin(e.target.value)} inputMode="numeric" />
                </div>
              </>
            )}
            <div>
              <div className="label mb-1.5">Team</div>
              <Select value={team} onChange={setTeam} options={teams} placeholder="Any" />
            </div>
            {subject === "players" && (
              <div>
                <div className="label mb-1.5">Player contains</div>
                <input className="input" value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="Any" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="label">Conditions</div>
            {filters.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <div className="w-52">
                  <Select
                    value={f.metric}
                    onChange={(v) => setFilter(i, { metric: v })}
                    options={metricKeys.map((k) => ({ value: k, label: label(k) }))}
                  />
                </div>
                <div className="w-32">
                  <Select value={f.op} onChange={(v) => setFilter(i, { op: v })} options={OPS} />
                </div>
                <input
                  className="input w-28"
                  value={String(f.value)}
                  onChange={(e) => setFilter(i, { value: Number(e.target.value) })}
                  inputMode="decimal"
                />
                {f.op === "between" && (
                  <input
                    className="input w-28"
                    value={String(f.value2 ?? "")}
                    onChange={(e) => setFilter(i, { value2: Number(e.target.value) })}
                    inputMode="decimal"
                    placeholder="upper"
                  />
                )}
                <button
                  onClick={() => setFilters((fs) => fs.filter((_, idx) => idx !== i))}
                  className="border border-border px-3 py-2 text-mute transition hover:text-ink"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button
                className="btn btn-ghost"
                onClick={() => setFilters((fs) => [...fs, { metric: "ts_pct", op: ">=", value: 0.55 }])}
              >
                + Add condition
              </button>
              <button className="btn btn-primary" onClick={() => run(1)}>
                Run query
              </button>
              <span className="text-xs text-mute">
                Percentages are rates: 38% is 0.38.
              </span>
            </div>
          </div>
          {err && <div className="text-sm text-bad">{err}</div>}
        </CardBody>
      </Card>

      {data && data.rows?.length > 0 && (
        <ExplorerChart rows={data.rows} subject={subject} sort={sort} metrics={metricKeys} />
      )}

      <Card>
        <CardHeader
          title={data
            ? `${data.total.toLocaleString()} ${subject === "teams" ? "team" : "player"}-seasons`
            : "Results"}
          subtitle={data ? `Page ${data.page} of ${data.pages}` : undefined}
          right={
            data && data.pages > 1 ? (
              <div className="flex items-center gap-2 text-sm">
                <button
                  className="btn btn-ghost disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => run(page - 1)}
                >
                  ‹ Prev
                </button>
                <button
                  className="btn btn-ghost disabled:opacity-40"
                  disabled={page >= data.pages}
                  onClick={() => run(page + 1)}
                >
                  Next ›
                </button>
              </div>
            ) : undefined
          }
        />
        <CardBody className="p-0">
          {!data ? (
            <div className="px-5 py-8 text-sm text-mute">No results yet.</div>
          ) : data.rows.length === 0 ? (
            <div className="px-5 py-8 text-sm text-mute">Nothing matched those conditions.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-mute">
                    {columns.map((c) => (
                      <th
                        key={c}
                        className={cn(
                          "px-3 py-2 font-medium",
                          isText(c) ? "text-left" : "text-right"
                        )}
                      >
                        <button
                          onClick={() => {
                            if (sort === c) setDir((d) => (d === "desc" ? "asc" : "desc"));
                            else {
                              setSort(c);
                              setDir("desc");
                            }
                          }}
                          className={cn("hover:text-ink", sort === c && "text-accent")}
                        >
                          {HEAD[c] ?? shortLabel(c)}
                          {sort === c ? (dir === "desc" ? " ↓" : " ↑") : ""}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r: any) => (
                    <tr key={`${r.player_name ?? r.team_name}-${r.season}`} className="border-t border-border/60">
                      {columns.map((c) => (
                        <td
                          key={c}
                          className={cn(
                            "px-3 py-2",
                            isText(c) ? "whitespace-nowrap" : "text-right tabular-nums"
                          )}
                        >
                          {c === "player_name" ? (
                            <span className="flex items-center gap-2">
                              {avatar(r.player_name, 24)}
                              {r.player_name}
                            </span>
                          ) : c === "season" ? (
                            formatSeason(r[c], meta.season_format) || "—"
                          ) : c === "team_name" || c === "team_abbr" ? (
                            r[c] ?? "—"
                          ) : (
                            formatValue(c, r[c])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}


/**
 * The page of results, plotted.
 *
 * A table answers "which rows matched"; a chart answers "what does the field
 * look like", which is the question a filter stack is usually a proxy for.
 * Both axes are pickable, defaulting to the column the query sorted on
 * against the first condition it filtered on — the two the user already said
 * they cared about.
 */
function ExplorerChart({
  rows,
  subject,
  sort,
  metrics,
}: {
  rows: any[];
  subject: "players" | "teams";
  sort: string;
  metrics: string[];
}) {
  const numeric = metrics.filter((m) => rows.some((r) => typeof r[m] === "number"));
  // Plotly cannot read CSS variables, so the colors below are sampled at
  // render time and this re-runs them when the palette changes.
  const theme = useTheme();
  const [x, setX] = useState<string>("");
  const [y, setY] = useState<string>("");

  // Re-seeded whenever the field changes shape, so a subject switch does not
  // leave an axis pointing at a column the new rows do not have.
  useEffect(() => {
    if (!numeric.length) return;
    setY((cur) => (numeric.includes(cur) ? cur : (numeric.includes(sort) ? sort : numeric[0])));
    setX((cur) =>
      numeric.includes(cur) && cur !== (numeric.includes(sort) ? sort : numeric[0])
        ? cur
        : numeric.find((m) => m !== (numeric.includes(sort) ? sort : numeric[0])) ?? numeric[0]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeric.join(","), sort]);

  const name = (r: any) =>
    subject === "teams" ? r.team_name : r.player_name;

  // A short year, for telling two seasons of the same team or player apart.
  const year = (season: any) => {
    const shown = formatSeason(season, undefined) ?? String(season ?? "");
    const digits = shown.match(/(\d{2})(?!.*\d)/);
    return digits ? `'${digits[1]}` : shown;
  };

  const plotted = useMemo(
    () => rows.filter((r) => typeof r[x] === "number" && typeof r[y] === "number"),
    [rows, x, y]
  );

  // The middle of each axis, drawn as a crosshair so a point can be read as
  // above or below the field on both at once rather than against the ticks.
  const mid = useMemo(() => {
    const middle = (vals: number[]) => {
      if (!vals.length) return null;
      const sorted = [...vals].sort((a, b) => a - b);
      const h = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[h] : (sorted[h - 1] + sorted[h]) / 2;
    };
    return { x: middle(plotted.map((r) => r[x])), y: middle(plotted.map((r) => r[y])) };
  }, [plotted, x, y]);

  // Least squares through the cloud, plus how much of it the line accounts
  // for. Two metrics on a scatter are usually being asked how related they
  // are, and a fit answers that where reading the drift by eye does not.
  const fit = useMemo(() => {
    const n = plotted.length;
    if (n < 3 || x === y) return null;
    const xs = plotted.map((r) => r[x]);
    const ys = plotted.map((r) => r[y]);
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
      syy += (ys[i] - my) ** 2;
    }
    if (!sxx || !syy) return null;
    const slope = sxy / sxx;
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    return {
      x: [lo, hi],
      y: [my + slope * (lo - mx), my + slope * (hi - mx)],
      r: sxy / Math.sqrt(sxx * syy),
    };
  }, [plotted, x, y]);

  const traces = useMemo(() => {
    if (!x || !y || !plotted.length) return [];

    // Labelled: the points furthest from the middle of the cloud, measured in
    // each axis's own spread so neither axis's units decide it. That picks the
    // corners a reader is actually looking for — a 73-win season, a defense
    // nobody else matched — rather than the top of one column.
    const spread = (vals: number[]) => {
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
      return { m, sd: sd || 1 };
    };
    const sx = spread(plotted.map((r) => r[x]));
    const sy = spread(plotted.map((r) => r[y]));
    const far = (r: any) =>
      ((r[x] - sx.m) / sx.sd) ** 2 + ((r[y] - sy.m) / sy.sd) ** 2;
    const named = new Set([...plotted].sort((a, b) => far(b) - far(a)).slice(0, 6));

    // Two seasons of one team look like one team labelled twice, so a name is
    // given its year only when the labelled set holds it more than once.
    const seen = new Map<string, number>();
    for (const r of named) seen.set(name(r), (seen.get(name(r)) ?? 0) + 1);
    const labelFor = (r: any) =>
      (seen.get(name(r)) ?? 0) > 1 ? `${name(r)} ${year(r.season)}` : name(r);

    const ink = themeColor("ink", "#cbd3de");
    const accent = themeColor("accent", "#ff6a3d");
    const accent2 = themeColor("accent2", "#4dabff");
    const panel = themeColor("panel", "#121619");

    return [
      // Under the points: a reference, not a result.
      ...(fit
        ? [{
            type: "scatter",
            mode: "lines",
            x: fit.x,
            y: fit.y,
            hoverinfo: "skip",
            line: { color: themeColor("mute", "#6b7685"), width: 1, dash: "dot" },
          }]
        : []),
      {
        type: "scatter",
        mode: "markers+text",
        x: plotted.map((r) => r[x]),
        y: plotted.map((r) => r[y]),
        text: plotted.map((r) => (named.has(r) ? labelFor(r) : BLANK)),
        textposition: "top center",
        textfont: { size: 11, color: ink },
        cliponaxis: false,
        hovertext: plotted.map((r) => `${name(r)} · ${formatSeason(r.season, undefined)}`),
        customdata: plotted.map((r) => [r[x], r[y]]),
        hovertemplate:
          "<b>%{hovertext}</b><br>" +
          `${shortLabel(x)} %{customdata[0]}<br>${shortLabel(y)} %{customdata[1]}` +
          "<extra></extra>",
        marker: {
          size: plotted.map((r) => (named.has(r) ? 12 : 9)),
          // The app's own two accents, so the ramp changes with the theme
          // instead of staying the default palette's blue and orange.
          color: plotted.map((r) => r[y]),
          colorscale: [[0, accent2], [1, accent]],
          opacity: 0.92,
          line: { color: panel, width: 1.5 },
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotted, x, y, subject, fit, theme]);

  const layout = useMemo(() => {
    const faint = themeAlpha("mute", 0.28, "rgba(120,130,145,0.28)");
    const line = (axis: "x" | "y", at: number) => ({
      type: "line",
      xref: axis === "x" ? "x" : "paper",
      yref: axis === "x" ? "paper" : "y",
      x0: axis === "x" ? at : 0,
      x1: axis === "x" ? at : 1,
      y0: axis === "x" ? 0 : at,
      y1: axis === "x" ? 1 : at,
      line: { color: faint, width: 1, dash: "dash" },
      layer: "below",
    });
    return {
      // Room at the top for a label on the highest point, which sits above its
      // dot and is drawn unclipped.
      margin: { t: 28, r: 16, b: 44, l: 56 },
      showlegend: false,
      hovermode: "closest",
      xaxis: { title: `${label(x)} →`, zeroline: false },
      yaxis: { title: `${label(y)} →`, zeroline: false },
      shapes: [
        ...(mid.x != null ? [line("x", mid.x)] : []),
        ...(mid.y != null ? [line("y", mid.y)] : []),
      ],
    };
  }, [x, y, mid, fit, theme]);

  if (numeric.length < 2) return null;

  const axis = (value: string, onChange: (v: string) => void) => (
    <div className="w-44">
      <Select
        value={value}
        onChange={onChange}
        options={numeric.map((m) => ({ value: m, label: label(m) }))}
      />
    </div>
  );

  return (
    <Card>
      <CardHeader
        title="This page, plotted"
        subtitle={
          fit
            ? `${plotted.length} rows · r = ${fit.r.toFixed(2)} · dashed lines are the medians`
            : `${plotted.length} rows`
        }
        right={
          <div className="flex items-center gap-2 text-xs text-mute">
            {axis(x, setX)}
            <span>against</span>
            {axis(y, setY)}
          </div>
        }
      />
      <CardBody>
        <Plot data={traces as any} layout={layout as any} height={380} />
      </CardBody>
    </Card>
  );
}
