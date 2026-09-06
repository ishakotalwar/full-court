import { useEffect, useMemo, useState } from "react";
import { api, type Meta } from "@/lib/api";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Plot } from "@/components/ui/Plot";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { formatSeason } from "@/lib/season";

const DIVERGING: [number, string][] = [
  [0, "#d73027"],
  [0.5, "#6b7685"],
  [1, "#4dabff"],
];

const signed = (v: number | null, digits = 1) =>
  v == null ? "" : (v > 0 ? "+" : "") + v.toFixed(digits);

/** Where a per-100 rating becomes a season total: the rate over the possessions. */
const asTotal = (rate: number | null, poss: number | null) =>
  rate == null || poss == null ? null : (rate * poss) / 100;

type Col = { key: string; label: string; title: string; strong?: boolean };

const LOAD: Col = {
  key: "share",
  label: "Load",
  title: "Share of the team's possessions this player was on the floor for",
};

// Offense and defense only exist for the fits that split a possession in two.
const SIDES: Col[] = [
  { key: "off_rating", label: "Off", title: "What this player adds on offense" },
  {
    key: "def_rating",
    label: "Def",
    title: "What this player prevents on defense — positive is good, as on offense",
  },
];

/** Metrics built by splitting each possession into an offensive and a
 *  defensive half, and so the only ones with parts to show. */
const SPLIT_METRICS = ["rapm"];

/**
 * What to plot beside each metric.
 *
 * Every one of these puts the metric against the thing it is built from, so
 * the chart shows what the metric did rather than restating its value: the
 * three-year and box-prior fits against the single season they adjust, PER
 * against the possession fit it cannot see, and on/off against its own two
 * halves. Where both axes are the same quantity a diagonal is drawn, and the
 * distance from it is the adjustment.
 */
type ChartSpec = {
  title: string;
  x: string;
  y: string;
  xTitle: string;
  yTitle: string;
  xLabel: string;
  yLabel: string;
  diagonal?: boolean;
};

const CHARTS: Record<string, ChartSpec> = {
  rapm: {
    title: "Offense and defense",
    x: "off_rating", y: "def_rating",
    xTitle: "Offense →", yTitle: "Defense →",
    xLabel: "offense", yLabel: "defense",
  },
  rapm_window: {
    title: "This season against three",
    x: "rapm", y: "rapm_window",
    xTitle: "This season →", yTitle: "Three-year fit →",
    xLabel: "this season", yLabel: "three-year",
    diagonal: true,
  },
  rapm_prior: {
    title: "Before and after the box prior",
    x: "rapm", y: "rapm_prior",
    xTitle: "Stints alone →", yTitle: "With box prior →",
    xLabel: "stints alone", yLabel: "with prior",
    diagonal: true,
  },
  per: {
    title: "PER against possession impact",
    x: "per", y: "rapm",
    xTitle: "PER →", yTitle: "RAPM →",
    xLabel: "PER", yLabel: "RAPM",
  },
  on_off: {
    title: "On the floor against off it",
    x: "on_net", y: "off_net",
    xTitle: "Net with them on →", yTitle: "Net with them off →",
    xLabel: "on", yLabel: "off",
    diagonal: true,
  },
};

/** One line of a metric's arithmetic, in the order the numbers arrive at it. */
type Step = {
  label: string;
  value: number | null;
  pct?: number | null;
  digits?: number;
  strong?: boolean;
  plain?: boolean;  // an index rather than a margin, so no leading sign
  rule?: boolean;   // ruled off from the lines above
};

/** PER is an index on its own scale; the rest are points per 100 possessions,
 *  which a season total is a straight multiple of. */
const isIndex = (key: string) => key === "per";

/** The parts each half breaks into, nested the way they add up. */
const PARTS = [
  { key: "turnovers", label: "Turnover value" },
  { key: "shot", label: "Shot value", children: ["field_goals", "free_throws"] },
  { key: "second_chance", label: "Second chance" },
] as const;

const PART_LABEL: Record<string, string> = {
  field_goals: "Field goals",
  free_throws: "Free throws",
};

const surname = (name: string) => name.trim().split(/\s+/).slice(1).join(" ") || name;

const ordinal = (v: number) => {
  const n = Math.round(v);
  const suffix =
    n % 10 === 1 && n !== 11 ? "st"
    : n % 10 === 2 && n !== 12 ? "nd"
    : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${suffix}`;
};

/** Percentile within the qualified field, colored by how good it is. */
function Pct({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  return (
    <span
      className={cn(
        "tabular-nums text-[11px]",
        value >= 66 ? "text-good" : value <= 33 ? "text-bad" : "text-mute"
      )}
    >
      {ordinal(value)}
    </span>
  );
}

/**
 * Who was worth the most, in points per 100 possessions, and what that number
 * is made of. Rebuilt from substitutions in `etl/lineup_etl.py`: raw
 * plus-minus describes a player's teammates as much as the player, and the
 * regression is what pulls the two apart.
 */
export function Ratings({ meta }: { meta: Meta }) {
  const regularSeasons = meta.rating_seasons ?? [];
  const playoffSeasons = meta.rating_playoff_seasons ?? [];
  const [seasonType, setSeasonType] = useState("regular");
  const seasons = seasonType === "playoffs" ? playoffSeasons : regularSeasons;

  const [season, setSeason] = useState(regularSeasons.at(-1) ?? "");
  const [team, setTeam] = useState("");
  // Share of the team's possessions, so the bar means the same thing in either
  // league and in a postseason a fifth the length of a season.
  const [minShare, setMinShare] = useState(55);
  const [scale, setScale] = useState<"per100" | "total">("per100");
  const [metric, setMetric] = useState("rapm");
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "rapm", dir: -1 });
  const [picked, setPicked] = useState<number | null>(null);

  // A postseason too small for the ETL to fit has no season to offer, so the
  // selection follows whichever list is live.
  useEffect(() => {
    if (seasons.length && !seasons.includes(season)) setSeason(seasons.at(-1) ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonType, seasons.join(",")]);

  useEffect(() => {
    if (!season) return;
    setErr(null);
    api
      .playerRatings(season, meta.league, {
        team: team || undefined,
        minShare: minShare / 100,
        seasonType,
        metric,
        limit: 250,
      })
      .then((d) => {
        setData(d);
        setPicked(d.rows?.[0]?.player_id ?? null);
      })
      .catch((e) => {
        setErr(e.message);
        setData(null);
        setPicked(null);
      });
  }, [season, team, minShare, seasonType, metric, meta.league]);

  const rows = data?.rows ?? [];
  const metrics = meta.impact_metrics ?? {};
  const ranked = data?.metric_column ?? "rapm";
  const split = SPLIT_METRICS.includes(metric);
  const columns: Col[] = [
    LOAD,
    ...(split ? SIDES : []),
    {
      key: ranked,
      label: metrics[metric]?.label ?? "Impact",
      title: metrics[metric]?.blurb ?? "",
      strong: true,
    },
  ];
  // A metric change re-ranks the table, so the sort follows it rather than
  // leaving the arrow on a column that is no longer there.
  useEffect(() => setSort({ key: ranked, dir: -1 }), [ranked]);

  // Per 100 is what the model fits; total is that rate over the possessions
  // actually played, which rewards the durability the rate deliberately
  // ignores. A share and an index are neither, so both pass through.
  const value = (row: any, key: string) =>
    scale === "total" && key !== "share" && !isIndex(key)
      ? asTotal(row[key], row.poss)
      : row[key];

  const sorted = useMemo(() => {
    const r = [...rows];
    r.sort((a, b) => {
      const x = value(a, sort.key), y = value(b, sort.key);
      if (x == null) return 1;
      if (y == null) return -1;
      return x === y ? 0 : (x < y ? -1 : 1) * sort.dir;
    });
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, scale]);

  const selected = useMemo(
    () => rows.find((r: any) => r.player_id === picked) ?? rows[0] ?? null,
    [rows, picked]
  );

  const chart = CHARTS[metric] ?? CHARTS.rapm;

  const traces = useMemo(() => {
    if (!rows.length) return [];
    const xs = rows.map((r: any) => value(r, chart.x));
    const ys = rows.map((r: any) => value(r, chart.y));
    const top = new Set(
      [...rows]
        .sort((a: any, b: any) => (value(b, ranked) ?? 0) - (value(a, ranked) ?? 0))
        .slice(0, 4)
    );
    const digits = isIndex(chart.x) || scale === "total" ? 1 : 2;

    // Drawn first so the players sit on top of it. Both axes carry the same
    // quantity here, so the line is where the metric changed nothing.
    const finite = [...xs, ...ys].filter((v) => typeof v === "number" && isFinite(v));
    const guide =
      chart.diagonal && finite.length
        ? [
            {
              type: "scatter",
              mode: "lines",
              x: [Math.min(...finite), Math.max(...finite)],
              y: [Math.min(...finite), Math.max(...finite)],
              line: { color: "#3a4250", width: 1, dash: "dot" },
              hoverinfo: "skip",
            },
          ]
        : [];

    return [
      ...guide,
      {
        type: "scatter",
        mode: "markers+text",
        x: xs,
        y: ys,
        text: rows.map((r: any) => (top.has(r) ? surname(r.player_name) : "")),
        textposition: "top center",
        textfont: { size: 9, color: "#8a94a2" },
        hovertext: rows.map((r: any) => r.player_name),
        customdata: rows.map((r: any) => [r.team_abbr, r.poss]),
        hovertemplate:
          "<b>%{hovertext}</b> (%{customdata[0]})<br>" +
          `${chart.xLabel} %{x:.${digits}f} · ${chart.yLabel} %{y:.${digits}f}<br>` +
          "over %{customdata[1]:.0f} possessions<extra></extra>",
        marker: {
          size: 8,
          color: rows.map((r: any) => value(r, ranked)),
          colorscale: DIVERGING,
          // An index has no natural centre at zero, so only a margin is
          // coloured about it.
          ...(isIndex(ranked) ? {} : { cmid: 0 }),
          line: { color: "#111518", width: 1 },
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, scale, metric, ranked]);

  const layout = useMemo(
    () => ({
      margin: { t: 10, r: 10, b: 44, l: 50 },
      showlegend: false,
      hovermode: "closest",
      xaxis: {
        title: chart.xTitle,
        gridcolor: "#1f2630",
        zeroline: true,
        zerolinecolor: "#3a4250",
      },
      yaxis: {
        title: chart.yTitle,
        gridcolor: "#1f2630",
        zeroline: true,
        zerolinecolor: "#3a4250",
      },
    }),
    [chart]
  );


  if (!regularSeasons.length) {
    return (
      <Card>
        <CardHeader title="Impact" />
        <CardBody>
          <div className="text-sm text-mute">
            No {meta.league_label} rating data on disk. Build it with{" "}
            <code className="bg-border/60 px-1.5 py-0.5">
              python etl/lineup_etl.py --league {meta.league}
            </code>
            .
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Impact"
          right={
            <div className="flex items-center gap-5 text-sm">
              <Toggle
                options={[
                  { v: "per100", label: "Per 100" },
                  { v: "total", label: "Total" },
                ]}
                value={scale}
                onChange={(v) => setScale(v as "per100" | "total")}
              />
              <span aria-hidden className="h-4 w-px bg-border" />
              <Toggle
                options={Object.entries(meta.rating_season_types ?? {}).map(([v, label]) => ({
                  v,
                  label,
                  disabled: v === "playoffs" && !playoffSeasons.length,
                }))}
                value={seasonType}
                onChange={setSeasonType}
              />
            </div>
          }
        />
        <CardBody className="space-y-3">
          <div>
            <div className="label mb-1.5">Metric</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(metrics).map(([key, m]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMetric(key)}
                  title={m.blurb}
                  className={cn(
                    "border px-3 py-1.5 text-sm transition",
                    key === metric
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-border text-mute hover:text-ink"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="label mb-1.5">Season</div>
              <Select
                value={season}
                onChange={setSeason}
                options={seasons.map((s) => ({
                  value: s,
                  label: formatSeason(s, meta.season_format),
                }))}
              />
            </div>
            <div>
              <div className="label mb-1.5">Team</div>
              <Select value={team} onChange={setTeam} options={meta.teams} placeholder="Every team" />
            </div>
            <div>
              <div className="label mb-1.5">Minimum load — {minShare}%</div>
              <Slider
                value={minShare}
                onChange={setMinShare}
                min={5}
                max={90}
                step={5}
                className="mt-2.5"
              />
            </div>
          </div>
          {err && <div className="mt-3 text-sm text-bad">{err}</div>}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody className="p-0">
            {sorted.length === 0 ? (
              <div className="py-10 text-center text-sm text-mute">
                No player played {minShare}% of their team's possessions.
              </div>
            ) : (
              <div className="max-h-[620px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-bg">
                    <tr className="text-left text-xs uppercase tracking-wider text-mute">
                      <th className="px-3 py-2 font-medium">Player</th>
                      {columns.map((c) => (
                        <th key={c.key} className="px-2 py-2 text-right font-medium">
                          <button
                            title={c.title}
                            onClick={() =>
                              setSort((s) =>
                                s.key === c.key
                                  ? { key: c.key, dir: (s.dir * -1) as 1 | -1 }
                                  : { key: c.key, dir: -1 }
                              )
                            }
                            className={cn("hover:text-ink", sort.key === c.key && "text-accent")}
                          >
                            {c.label}
                            {sort.key === c.key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r: any, i: number) => (
                      <tr
                        key={r.player_id}
                        onClick={() => setPicked(r.player_id)}
                        className={cn(
                          "cursor-pointer border-t border-border/60 hover:bg-border/30",
                          r.player_id === selected?.player_id && "bg-border/40"
                        )}
                      >
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-mute">
                              {sort.key === ranked && sort.dir === -1 ? i + 1 : ""}
                            </span>
                            <Avatar
                              name={r.player_name}
                              id={r.player_id}
                              league={meta.league}
                              size={22}
                            />
                            <span className="truncate">{r.player_name}</span>
                            {!team && <span className="text-xs text-mute">{r.team_abbr}</span>}
                          </div>
                        </td>
                        {columns.map((c) => (
                          <td
                            key={c.key}
                            className={cn(
                              "whitespace-nowrap px-2 py-1.5 text-right tabular-nums",
                              c.strong && "font-medium"
                            )}
                          >
                            {c.key === "share"
                              ? `${((r.share ?? 0) * 100).toFixed(0)}%`
                              // PER is an index, not points, so it is neither
                              // signed nor convertible to a season total.
                              : c.key === "per"
                              ? (r.per ?? null) == null ? "" : r.per.toFixed(1)
                              : signed(value(r, c.key), scale === "total" ? 0 : 2)}
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

        <div className="space-y-4">
          <Card>
            <CardHeader title={chart.title} />
            <CardBody>
              <Plot
                data={traces as any}
                layout={layout as any}
                height={286}
                placeholder="No player clears this floor"
              />
            </CardBody>
          </Card>

          {selected && (
            <Card>
              <CardHeader
                lead={
                  <Avatar
                    name={selected.player_name}
                    id={selected.player_id}
                    league={meta.league}
                    size={40}
                  />
                }
                title={selected.player_name}
                subtitle={`${selected.team_abbr} · ${selected.games} games · ${selected.poss.toFixed(0)} possessions`}
                right={
                  <div className="text-right">
                    <div className="text-xl font-semibold tabular-nums">
                      {isIndex(ranked)
                        ? (selected[ranked] ?? 0).toFixed(1)
                        : signed(value(selected, ranked), scale === "total" ? 0 : 2)}
                    </div>
                    <Pct value={selected[`pct_${ranked}`]} />
                  </div>
                }
              />
              {/* The split fits are the only ones with parts underneath them;
                  the rest are shown as the arithmetic that produced them. */}
              {split ? (
                <CardBody className="grid gap-6 sm:grid-cols-2">
                  <Breakdown title="Offensive impact" side="off" row={selected} scale={scale} />
                  <Breakdown title="Defensive impact" side="def" row={selected} scale={scale} />
                </CardBody>
              ) : (
                <CardBody>
                  <Steps steps={stepsFor(metric, selected, scale)} />
                </CardBody>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The steps that produce a metric that has no offensive and defensive halves.
 *
 * Each of these is defined against a number the table already holds, so the
 * card can show where the metric started and what its adjustment did, rather
 * than repeating the single figure in the header.
 */
function stepsFor(metric: string, row: any, scale: "per100" | "total"): Step[] {
  const digits = scale === "total" ? 0 : 2;
  const at = (key: string) =>
    scale === "total" && !isIndex(key) ? asTotal(row[key], row.poss) : row[key];
  const gap = (a: string, b: string) => {
    const x = at(a);
    const y = at(b);
    return x == null || y == null ? null : x - y;
  };

  switch (metric) {
    case "rapm_window":
      return [
        { label: "This season", value: at("rapm"), pct: row.pct_rapm, digits },
        {
          label: "Three-year fit",
          value: at("rapm_window"),
          pct: row.pct_rapm_window,
          digits,
          strong: true,
        },
        { label: "Moved by", value: gap("rapm_window", "rapm"), digits, rule: true },
      ];
    case "rapm_prior":
      return [
        { label: "Stints alone", value: at("rapm"), pct: row.pct_rapm, digits },
        {
          label: "With box prior",
          value: at("rapm_prior"),
          pct: row.pct_rapm_prior,
          digits,
          strong: true,
        },
        { label: "Moved by", value: gap("rapm_prior", "rapm"), digits, rule: true },
      ];
    case "on_off":
      return [
        { label: "Net with them on", value: at("on_net"), digits },
        { label: "Net with them off", value: at("off_net"), digits },
        {
          label: "On/off",
          value: at("on_off"),
          pct: row.pct_on_off,
          digits,
          strong: true,
          rule: true,
        },
        // What survives once the other nine are regressed out.
        { label: "RAPM", value: at("rapm"), pct: row.pct_rapm, digits, rule: true },
      ];
    case "per":
      return [
        { label: "PER", value: row.per, pct: row.pct_per, digits: 1, strong: true, plain: true },
        { label: "League average", value: 15, digits: 1, plain: true },
        {
          label: "Above average",
          value: row.per == null ? null : row.per - 15,
          digits: 1,
          rule: true,
        },
        { label: "RAPM", value: at("rapm"), pct: row.pct_rapm, digits, rule: true },
      ];
    default:
      return [];
  }
}

function Steps({ steps }: { steps: Step[] }) {
  return (
    <dl className="space-y-1.5">
      {steps.map((step) => (
        <div key={step.label} className={cn(step.rule && "border-t border-border pt-1.5")}>
          <Line
            label={step.label}
            value={step.value}
            pct={step.pct}
            digits={step.digits ?? 2}
            strong={step.strong}
            plain={step.plain}
          />
        </div>
      ))}
    </dl>
  );
}

/** One side's parts, nested the way they sum into that side's total. */
function Breakdown({
  title,
  side,
  row,
  scale,
}: {
  title: string;
  side: "off" | "def";
  row: any;
  scale: "per100" | "total";
}) {
  const at = (key: string) => {
    const raw = row[`${side}_${key}`];
    return scale === "total" ? asTotal(raw, row.poss) : raw;
  };
  const digits = scale === "total" ? 0 : 2;
  const shot = (row[`${side}_field_goals`] ?? 0) + (row[`${side}_free_throws`] ?? 0);

  return (
    <div>
      <div className="mb-2.5 text-sm font-semibold">{title}</div>
      <dl className="space-y-1.5">
        {PARTS.map((part) =>
          part.key === "shot" ? (
            <div key="shot">
              <Line
                label="Shot value"
                value={scale === "total" ? asTotal(shot, row.poss) : shot}
                digits={digits}
              />
              <div className="mt-1 space-y-1 border-l border-border pl-3">
                {part.children.map((child) => (
                  <Line
                    key={child}
                    label={PART_LABEL[child]}
                    value={at(child)}
                    pct={row[`pct_${side}_${child}`]}
                    digits={digits}
                    muted
                  />
                ))}
              </div>
            </div>
          ) : (
            <Line
              key={part.key}
              label={part.label}
              value={at(part.key)}
              pct={row[`pct_${side}_${part.key}`]}
              digits={digits}
            />
          )
        )}
        <div className="border-t border-border pt-1.5">
          <Line
            label={side === "off" ? "Offense" : "Defense"}
            value={at("rating")}
            pct={row[`pct_${side}_rating`]}
            digits={digits}
            strong
          />
        </div>
      </dl>
    </div>
  );
}

function Line({
  label,
  value,
  pct,
  digits,
  strong,
  muted,
  plain,
}: {
  label: string;
  value: number | null;
  pct?: number | null;
  digits: number;
  strong?: boolean;
  muted?: boolean;
  plain?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn("truncate", muted ? "text-xs text-mute" : "text-sm")}>{label}</dt>
      <dd className="flex shrink-0 items-baseline gap-2">
        <Pct value={pct} />
        <span
          className={cn(
            "tabular-nums",
            strong && "font-semibold",
            muted ? "text-xs" : "text-sm"
          )}
        >
          {plain ? (value == null ? "" : value.toFixed(digits)) : signed(value, digits)}
        </span>
      </dd>
    </div>
  );
}

function Toggle({
  options,
  value,
  onChange,
}: {
  options: { v: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          disabled={o.disabled}
          title={
            o.disabled
              ? "A postseason this short can't hold a rating of its own — every " +
                "number would be pulled to nearly zero"
              : undefined
          }
          onClick={() => onChange(o.v)}
          className={cn(
            "border-b-2 pb-0.5 transition",
            o.v === value
              ? "border-accent text-ink"
              : o.disabled
              ? "cursor-not-allowed border-transparent text-mute/40"
              : "border-transparent text-mute hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
