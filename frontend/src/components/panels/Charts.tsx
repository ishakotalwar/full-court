import { useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import { api, type Meta } from "@/lib/api";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { RateToggle } from "@/components/ui/RateToggle";
import { Select } from "@/components/ui/Select";
import { Plot } from "@/components/ui/Plot";
import { label, shortLabel, sortMetrics } from "@/lib/metrics";
import { cn } from "@/lib/cn";
import { BLANK } from "@/lib/labels";
import { themeAlpha, themeColor, useTheme } from "@/lib/theme";
import { formatSeason } from "@/lib/season";
import { useQueryState } from "@/lib/url";

/** How many of the extremes get named. Every point is still hoverable. */
const LABEL_CHOICES = ["0", "5", "10", "20"];

/** A rate needs a floor under it, or a player with four minutes on record
 *  posts 40 points per 36 and sits alone in a corner of every chart. */
const RATE_QUALIFIER = { games: "20", minutes: "15" };

const NONE = "__none__";

/**
 * Build a chart: pick what a point is, which seasons to draw from, and what
 * goes on each axis.
 *
 * The pool is fetched once per query and the encodings are applied to it in
 * the browser, so changing an axis redraws immediately instead of going back
 * to the server for the same rows.
 */
export function Charts({ meta }: { meta: Meta }) {
  const seasons = meta.seasons;
  const seasonOptions = seasons.map((s) => ({
    value: s,
    label: formatSeason(s, meta.season_format),
  }));
  const latest = seasons.at(-1) ?? "";

  const [subjectParam, setSubject] = useQueryState("subject", "players");
  const subject: "players" | "teams" = subjectParam === "teams" ? "teams" : "players";
  // One season by default. The whole archive on one scatter is a cloud with
  // no shape to it; widening the range is one click for someone who wants it.
  const [from, setFrom] = useQueryState("from", latest);
  const [to, setTo] = useQueryState("to", latest);
  const [team, setTeam] = useQueryState("team");
  const [minGp, setMinGp] = useQueryState("minGp", "20");
  const [minMin, setMinMin] = useQueryState("minMin", "0");
  const [per, setPer] = useQueryState("per", "game");

  const [x, setX] = useQueryState("x", "fg_pct");
  const [y, setY] = useQueryState("y", "pts");
  const [size, setSize] = useQueryState("size", NONE);
  const [labelCount, setLabelCount] = useQueryState("labels", "10");

  const [fields, setFields] = useState<{ metrics: string[]; teams: string[] } | null>(null);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  // Games and minutes are columns on a player row but not "metrics" — nothing
  // filters on them, so the explorer's field list leaves them out. On a chart
  // they are two of the most useful things to plot or to size a dot by, so
  // they are put back here.
  const metrics = subject === "teams"
    ? fields?.metrics ?? []
    : sortMetrics([...(fields?.metrics ?? meta.metrics), "gp", "min"]);

  useEffect(() => {
    let stale = false;
    api
      .explorerFields(meta.league, subject)
      .then((f) => {
        if (stale) return;
        setFields({ metrics: f.metrics ?? [], teams: f.teams ?? [] });
      })
      .catch(() => !stale && setFields({ metrics: [], teams: [] }));
    return () => {
      stale = true;
    };
  }, [meta.league, subject]);

  // Axes have to name columns the new frame actually has, so a subject switch
  // moves them to that frame's default pair rather than leaving them pointing
  // at a player column on a team row.
  const changeSubject = (next: "players" | "teams") => {
    if (next === subject) return;
    setSubject(next);
    setTeam("");
    setData(null);
    setErr(null);
    setSize(NONE);
    setX(next === "teams" ? "ortg" : "fg_pct");
    setY(next === "teams" ? "drtg" : "pts");
  };

  // Only ever raises a floor left at zero, so a number typed in is never
  // overwritten — including a deliberate zero.
  const changeBasis = (next: string) => {
    if (next !== "game") {
      if (minGp === "0") setMinGp(RATE_QUALIFIER.games);
      if (minMin === "0") setMinMin(RATE_QUALIFIER.minutes);
    }
    setPer(next);
  };

  const draw = () => {
    setErr(null);
    setLoading(true);
    api
      .chart({
        subject,
        league: meta.league,
        season_from: from || undefined,
        season_to: to || undefined,
        min_gp: Number(minGp) || 0,
        min_min: Number(minMin) || 0,
        team: team || undefined,
        per,
        x,
        y,
        size: size === NONE ? undefined : size,
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setErr(e.message);
        setData(null);
        setLoading(false);
      });
  };

  // Draw once the field list has arrived, and again whenever the query — not
  // the encoding — changes. Axes are applied to rows already in hand.
  useEffect(() => {
    if (!fields) return;
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, subject, from, to, team, minGp, minMin, per, x, y, size]);

  const rows: any[] = data?.rows ?? [];
  const name = (r: any) => r[data?.label ?? "player_name"];

  const fit = useMemo(() => {
    const n = rows.length;
    if (n < 3 || x === y) return null;
    const xs = rows.map((r) => r[x]);
    const ys = rows.map((r) => r[y]);
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
  }, [rows, x, y]);

  const mid = useMemo(() => {
    const middle = (vals: number[]) => {
      if (!vals.length) return null;
      const sorted = [...vals].sort((a, b) => a - b);
      const h = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[h] : (sorted[h - 1] + sorted[h]) / 2;
    };
    return { x: middle(rows.map((r) => r[x])), y: middle(rows.map((r) => r[y])) };
  }, [rows, x, y]);

  const traces = useMemo(() => {
    if (!rows.length) return [];

    // Named: the points furthest from the middle of the cloud, measured in
    // each axis's own spread so neither axis's units decide it. That picks
    // the corners a reader is looking for rather than the top of one column.
    const spread = (vals: number[]) => {
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
      return { m, sd: sd || 1 };
    };
    const sx = spread(rows.map((r) => r[x]));
    const sy = spread(rows.map((r) => r[y]));
    const far = (r: any) => ((r[x] - sx.m) / sx.sd) ** 2 + ((r[y] - sy.m) / sy.sd) ** 2;
    const named = new Set(
      Number(labelCount)
        ? [...rows].sort((a, b) => far(b) - far(a)).slice(0, Number(labelCount))
        : []
    );

    // Two seasons of one player look like one player labelled twice, so a
    // name is given its year only when the labelled set holds it more than
    // once.
    const seen = new Map<string, number>();
    for (const r of named) seen.set(name(r), (seen.get(name(r)) ?? 0) + 1);
    const year = (season: any) => {
      const shown = formatSeason(season, meta.season_format) ?? String(season ?? "");
      const digits = shown.match(/(\d{2})(?!.*\d)/);
      return digits ? `'${digits[1]}` : shown;
    };
    const labelFor = (r: any) =>
      (seen.get(name(r)) ?? 0) > 1 ? `${name(r)} ${year(r.season)}` : name(r);

    // Marker area, not radius, carries the third metric — a diameter scaled
    // by value exaggerates it by the square.
    const sizes = (() => {
      if (size === NONE) return rows.map((r) => (named.has(r) ? 12 : 8));
      const vals = rows.map((r) => Number(r[size]) || 0);
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      const span = hi - lo || 1;
      return vals.map((v) => 6 + 20 * Math.sqrt((v - lo) / span));
    })();

    const ink = themeColor("ink", "#cbd3de");
    const accent = themeColor("accent", "#ff6a3d");
    const accent2 = themeColor("accent2", "#4dabff");
    const panel = themeColor("panel", "#121619");
    // A dense cloud needs thinner rings and more transparency than a sparse
    // one, or the marks merge into a single mass.
    const dense = rows.length > 400;

    return [
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
        x: rows.map((r) => r[x]),
        y: rows.map((r) => r[y]),
        text: rows.map((r) => (named.has(r) ? labelFor(r) : BLANK)),
        textposition: "top center",
        textfont: { size: 11, color: ink },
        cliponaxis: false,
        hovertext: rows.map((r) => `${name(r)} · ${formatSeason(r.season, meta.season_format)}`),
        customdata: rows.map((r) => [r[x], r[y]]),
        hovertemplate:
          "<b>%{hovertext}</b><br>" +
          `${shortLabel(x)} %{customdata[0]}<br>${shortLabel(y)} %{customdata[1]}` +
          "<extra></extra>",
        marker: {
          size: sizes,
          // The app's own two accents, so the ramp follows the theme rather
          // than staying one palette's blue and orange.
          color: rows.map((r) => r[y]),
          colorscale: [[0, accent2], [1, accent]],
          opacity: dense ? 0.72 : 0.92,
          line: { color: panel, width: dense ? 0.5 : 1.5 },
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, x, y, size, labelCount, fit, theme]);

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
      // Room above for a label on the highest point, drawn unclipped.
      margin: { t: 28, r: 20, b: 48, l: 60 },
      showlegend: false,
      hovermode: "closest",
      xaxis: { title: `${label(x)} →`, zeroline: false },
      yaxis: { title: `${label(y)} →`, zeroline: false },
      shapes: [
        ...(mid.x != null ? [line("x", mid.x)] : []),
        ...(mid.y != null ? [line("y", mid.y)] : []),
      ],
    };
  }, [x, y, mid, theme]);

  // Held so the export can hand Plotly the node it drew into.
  const plotBox = useRef<HTMLDivElement>(null);

  const stem = () => {
    const span = from === to ? from : `${from}-${to}`;
    return `fullcourt-${x}-vs-${y}-${span}`;
  };

  const save = (blob: Blob, filename: string) => {
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
    // Revoked on the next tick: the click is synchronous but the fetch of the
    // object URL is not, and revoking too early cancels the download.
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  /** The plotted rows, in the columns that were plotted. */
  const exportCsv = () => {
    if (!rows.length) return;
    const cols = [data.label, "season", x, y, ...(size === NONE ? [] : [size])];
    const cell = (v: any) => {
      const text = v == null ? "" : String(v);
      // Quote anything that would otherwise split a row: a team name with a
      // comma in it, or a name carrying a quote.
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const head = cols.map((c) => (c === data.label ? (subject === "teams" ? "team" : "player") : c));
    const body = rows.map((r) => cols.map((c) => cell(r[c])).join(","));
    save(new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" }),
         `${stem()}.csv`);
  };

  /** The chart as drawn, at twice the pixel density it is displayed at. */
  const exportPng = () => {
    const el = plotBox.current?.querySelector(".js-plotly-plot") as any;
    if (!el) return;
    Plotly.downloadImage(el, {
      format: "png",
      filename: stem(),
      width: el.clientWidth * 2,
      height: el.clientHeight * 2,
      scale: 2,
    }).catch(() => {});
  };

  const metricOptions = metrics.map((m) => ({ value: m, label: label(m) }));
  const field = (
    title: string,
    node: React.ReactNode,
  ) => (
    <div>
      <div className="label mb-1">{title}</div>
      {node}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Chart builder"
          right={
            <div className="flex items-center gap-4">
              <Toggle
                value={subject}
                onChange={(v) => changeSubject(v as "players" | "teams")}
                options={[
                  { value: "players", label: "Players" },
                  { value: "teams", label: "Teams" },
                ]}
              />
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
          {/* What the pool is. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {field("Season from",
              <Select value={from} onChange={setFrom} options={seasonOptions} />)}
            {field("To",
              <Select value={to} onChange={setTo} options={seasonOptions} />)}
            {field("Team",
              <Select
                value={team}
                onChange={setTeam}
                options={[{ value: "", label: "Any" },
                          ...(fields?.teams ?? []).map((t) => ({ value: t, label: t }))]}
              />)}
            {subject === "players" && field("Min games",
              <input
                className="input"
                value={minGp}
                onChange={(e) => setMinGp(e.target.value)}
                inputMode="numeric"
              />)}
            {subject === "players" && field("Min minutes",
              <input
                className="input"
                value={minMin}
                onChange={(e) => setMinMin(e.target.value)}
                inputMode="numeric"
              />)}
          </div>

          {/* What is drawn. Separated by a rule because these change the
              picture without changing which rows are in it. */}
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {field("X axis",
              <Select value={x} onChange={setX} options={metricOptions} />)}
            {field("Y axis",
              <Select value={y} onChange={setY} options={metricOptions} />)}
            {field("Dot size",
              <Select
                value={size}
                onChange={setSize}
                options={[{ value: NONE, label: "Same size" }, ...metricOptions]}
              />)}
            {field("Names shown",
              <Select
                value={labelCount}
                onChange={setLabelCount}
                options={LABEL_CHOICES.map((n) => ({
                  value: n,
                  label: n === "0" ? "None" : `Furthest ${n}`,
                }))}
              />)}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          {err ? (
            <div className="py-8 text-center text-sm text-bad">{err}</div>
          ) : (
            <>
              <div ref={plotBox}>
                <Plot
                  data={traces as any}
                  layout={layout as any}
                  height={520}
                  placeholder={loading ? "Drawing…" : "Nothing matched those conditions"}
                />
              </div>
              {data && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-mute">
                    {data.shown === data.total
                      ? `${data.total.toLocaleString()} ${subject === "teams" ? "team" : "player"}-seasons`
                      : `${data.shown.toLocaleString()} of ${data.total.toLocaleString()} ` +
                        `${subject === "teams" ? "team" : "player"}-seasons, sampled evenly`}
                    {fit ? ` · r = ${fit.r.toFixed(2)}` : ""}
                    {" · dashed lines are the medians"}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn btn-ghost py-1 text-xs" onClick={exportCsv}>
                      Export CSV
                    </button>
                    <button type="button" className="btn btn-ghost py-1 text-xs" onClick={exportPng}>
                      Export PNG
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/** The same two-word switch the explorer uses for its subject. */
function Toggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "border-b-2 pb-0.5 transition",
            value === o.value
              ? "border-accent text-ink"
              : "border-transparent text-mute hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
