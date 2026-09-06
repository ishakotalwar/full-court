import { useEffect, useMemo, useState } from "react";
import { api, type Meta } from "@/lib/api";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Plot, pickColor } from "@/components/ui/Plot";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { BLANK } from "@/lib/labels";
import { useRowIndex } from "@/lib/rows";
import { useTheme } from "@/lib/theme";
import { formatSeason } from "@/lib/season";

// Same diverging scale the league table uses for net rating: blue and red
// through a neutral middle, so a lineup reads the same way a team does.
const DIVERGING: [number, string][] = [
  [0, "#d73027"],
  [0.5, "#6b7685"],
  [1, "#4dabff"],
];

// Picked fives are drawn in a color the scale above never uses. Orange or
// green would land inside it and read as a rating rather than a selection.

type Col = {
  key: string;
  label: string;
  title: string;
  fmt: (v: number) => string;
  lowerBetter?: boolean;
};

// Half the width means only the columns that earn it: games is empty for any
// group under five, and plus-minus says what net rating already says.
const COLS: Col[] = [
  { key: "min", label: "MP", title: "Minutes played together", fmt: (v) => (v == null ? "" : v.toFixed(0)) },
  { key: "share", label: "Share", title: "Share of the team's minutes",
    fmt: (v) => (v == null ? "" : `${(v * 100).toFixed(1)}%`) },
  { key: "ortg", label: "ORtg", title: "Points scored per 100 possessions",
    fmt: (v) => (v == null ? "" : v.toFixed(1)) },
  { key: "drtg", label: "DRtg", title: "Points allowed per 100 possessions",
    fmt: (v) => (v == null ? "" : v.toFixed(1)), lowerBetter: true },
  { key: "net", label: "Net", title: "ORtg − DRtg",
    fmt: (v) => (v == null ? "" : (v > 0 ? "+" : "") + v.toFixed(1)) },
];

const ALL_TEAMS = "";

/** "Shai Gilgeous-Alexander" -> "Gilgeous-Alexander", for the chart's labels. */
const surname = (name: string) => name.trim().split(/\s+/).slice(1).join(" ") || name;

/**
 * Which five played best together. ESPN publishes no lineup data, so these are
 * rebuilt from substitutions in `etl/lineup_etl.py`; the ratings are on the
 * same per-100-possessions scale as team ORtg and DRtg elsewhere.
 */
export function Lineups({ meta }: { meta: Meta }) {
  const lineupSeasons = meta.lineup_seasons ?? [];
  const [season, setSeason] = useState(lineupSeasons.at(-1) ?? "");
  const [team, setTeam] = useState<string>(ALL_TEAMS);
  const [minMinutes, setMinMinutes] = useState(100);
  // How many players make a group. A five rolls up into the pairs, trios and
  // quartets inside it.
  const [size, setSize] = useState(5);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "min", dir: -1 });
  // Which fives are pinned onto the chart. Keyed by the five itself so the
  // selection survives re-sorting and re-fetching.
  const [picked, setPicked] = useState<string[]>([]);

  // A team's whole rotation is a few dozen lineups; the league's is thousands,
  // so the league view needs a higher bar to stay a list a person can read.
  useEffect(() => setMinMinutes(team ? 50 : 100), [team]);

  // A different season, team or floor is a different set of fives, so a
  // selection made against the old one would highlight nothing.
  useEffect(() => setPicked([]), [season, team, minMinutes, size, meta.league]);

  useEffect(() => {
    if (!season) return;
    setErr(null);
    api
      .teamLineups(season, meta.league, { team: team || undefined, minMinutes, size })
      .then(setData)
      .catch((e) => {
        setErr(e.message);
        setData(null);
      });
  }, [season, team, minMinutes, size, meta.league]);

  const rows = data?.rows ?? [];
  const keyOf = (r: any) =>
    `${r.team_abbr}-${r.players.map((p: any) => p.id).join("-")}`;
  const { register, reveal } = useRowIndex<string>();
  // Only to re-run the trace memo when the palette changes.
  const theme = useTheme();
  const togglePick = (r: any) => {
    const k = keyOf(r);
    setPicked((current) =>
      current.includes(k) ? current.filter((x) => x !== k) : [...current, k]
    );
    reveal(k);
  };

  const sorted = useMemo(() => {
    const r = [...rows];
    r.sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (x == null) return 1;
      if (y == null) return -1;
      return x === y ? 0 : (x < y ? -1 : 1) * sort.dir;
    });
    return r;
  }, [rows, sort]);

  // Split once, because the chart is drawn from these two and a click on it is
  // resolved back through them. Nothing is named until it is asked for, from
  // either side — pick a row in the table or click its bubble on the chart.
  // Eighty fives named at once is unreadable, and hover already covers
  // browsing.
  const chosen = useMemo(
    () => rows.filter((r: any) => picked.includes(keyOf(r))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, picked.join(",")]
  );
  const unpicked = useMemo(
    () => (picked.length ? rows.filter((r: any) => !picked.includes(keyOf(r))) : rows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, picked.join(",")]
  );

  const traces = useMemo(() => {
    if (!rows.length) return [];
    // Minutes drive the marker area, not its radius: at radius the biggest
    // lineup swallows the chart.
    const maxMin = Math.max(...rows.map((r: any) => r.min));
    const pick = pickColor();
    const rest = unpicked;
    const markerSize = (r: any) => 8 + 26 * Math.sqrt(r.min / maxMin);
    const hover =
      "<b>%{hovertext}</b><br>%{customdata[0]:.0f} min over %{customdata[2]} games<br>" +
      "ORtg %{x:.1f} · DRtg %{y:.1f} · Net %{customdata[1]:+.1f}<extra></extra>";
    const describe = (r: any) =>
      `${r.team_abbr} · ${r.players.map((p: any) => surname(p.name)).join(", ")}`;
    const facts = (r: any) => [r.min, r.net, r.games];

    const base = {
      type: "scatter",
      mode: "markers+text",
      textposition: "top center",
      // Five surnames beside a bubble at the edge would otherwise be clipped
      // away entirely rather than spilling into the margin.
      cliponaxis: false,
      hovertemplate: hover,
    };
    const out: any[] = [
      {
        ...base,
        x: rest.map((r: any) => r.ortg),
        y: rest.map((r: any) => r.drtg),
        text: rest.map(() => BLANK),
        textfont: { size: 11 },
        hovertext: rest.map(describe),
        customdata: rest.map(facts),
        marker: {
          size: rest.map(markerSize),
          color: rest.map((r: any) => r.net),
          colorscale: DIVERGING,
          cmid: 0,
          // Picked fives sit on top of a quieted field.
          opacity: picked.length ? 0.25 : 0.85,
          line: { color: "#111518", width: 1.5 },
          colorbar: {
            title: { text: "Net", side: "right" },
            thickness: 10,
            outlinewidth: 0,
            tickfont: { color: "#8a94a2", size: 10 },
          },
        },
      },
    ];
    if (chosen.length) {
      out.push({
        ...base,
        x: chosen.map((r: any) => r.ortg),
        y: chosen.map((r: any) => r.drtg),
        text: chosen.map((r: any) =>
          r.players.map((p: any) => surname(p.name)).join(" · ")
        ),
        textfont: { size: 11 },
        hovertext: chosen.map(describe),
        customdata: chosen.map(facts),
        marker: {
          size: chosen.map(markerSize),
          // Still colored by net, like the field it was picked out of — a
          // picked five that played badly should not look like a good one.
          // The ring and the full opacity are what mark it as picked.
          color: chosen.map((r: any) => r.net),
          colorscale: DIVERGING,
          cmid: 0,
          showscale: false,
          opacity: 1,
          line: { color: pick, width: 3 },
        },
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, team, picked.join(","), chosen, unpicked, theme]);

  const layout = useMemo(
    () => ({
      margin: { t: 16, r: 10, b: 48, l: 60 },
      showlegend: false,
      hovermode: "closest",
      xaxis: { title: "Offensive rating →", gridcolor: "#1f2630", zeroline: false },
      yaxis: {
        title: "← Defensive rating",
        gridcolor: "#1f2630",
        autorange: "reversed",
        zeroline: false,
      },
      annotations: [
        { xref: "paper", yref: "paper", x: 1, y: 1, xanchor: "right", yanchor: "top",
          text: "outscores everyone", showarrow: false,
          font: { color: "#6b7685", size: 10 } },
      ],
    }),
    []
  );

  const coverage =
    data?.team_minutes && data?.shown_minutes
      ? `${rows.length} lineups, ${Math.round(
          (data.shown_minutes / data.team_minutes) * 100
        )}% of the team's minutes`
      : rows.length
      ? `${rows.length} lineups`
      : "";

  if (!lineupSeasons.length) {
    return (
      <Card>
        <CardHeader title="Lineups" />
        <CardBody>
          <div className="text-sm text-mute">
            No {meta.league_label} lineup data on disk. Build it with{" "}
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
          title="Lineups"
        />
        <CardBody>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="label mb-1.5">Season</div>
              <Select
                value={season}
                onChange={setSeason}
                options={lineupSeasons.map((s) => ({
                  value: s,
                  label: formatSeason(s, meta.season_format),
                }))}
              />
            </div>
            <div>
              <div className="label mb-1.5">Team</div>
              <Select
                value={team}
                onChange={setTeam}
                options={meta.teams}
                placeholder="Every team"
              />
            </div>
            <div>
              <div className="label mb-1.5">Group size</div>
              <div className="flex gap-1.5">
                {[2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSize(n)}
                    className={cn(
                      "flex-1 border px-2 py-1.5 text-sm transition",
                      n === size
                        ? "border-accent bg-accent/10 text-ink"
                        : "border-border text-mute hover:text-ink"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label mb-1.5">
                Minutes together — at least {minMinutes}
              </div>
              <Slider
                value={minMinutes}
                onChange={setMinMinutes}
                min={5}
                max={400}
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
          <CardHeader
            title="Lineup table"
            subtitle={coverage}
            right={
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-mute">
                {COLS.map((c) => (
                  <button
                    key={c.key}
                    title={c.title}
                    onClick={() =>
                      setSort((s) =>
                        s.key === c.key
                          ? { key: c.key, dir: (s.dir * -1) as 1 | -1 }
                          : { key: c.key, dir: c.lowerBetter ? 1 : -1 }
                      )
                    }
                    className={cn(
                      "uppercase tracking-wider transition hover:text-ink",
                      sort.key === c.key && "text-accent"
                    )}
                  >
                    {c.label}
                    {sort.key === c.key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                  </button>
                ))}
              </div>
            }
          />
          <CardBody className="p-0">
            {sorted.length === 0 ? (
              <div className="py-10 text-center text-sm text-mute">
                No group of {size} played {minMinutes} minutes together.
              </div>
            ) : (
              /* Two lines rather than one wide row: at half the width a table
                 pushed the ratings off the edge, and five names need the room
                 more than the numbers do. */
              <ul className="max-h-[520px] overflow-y-auto">
                {sorted.map((r: any) => (
                  <li
                    key={keyOf(r)}
                    ref={register(keyOf(r))}
                    onClick={() => togglePick(r)}
                    title="Show this group on the chart"
                    className={cn(
                      "cursor-pointer border-t border-border/60 px-4 py-2.5 transition hover:bg-border/30",
                      picked.includes(keyOf(r)) && "bg-accent/10"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {!team && (
                        <span className="w-8 shrink-0 text-xs text-mute">{r.team_abbr}</span>
                      )}
                      <div className="flex shrink-0 gap-1">
                        {r.players.map((p: any) => (
                          <Avatar
                            key={p.id}
                            name={p.name}
                            id={p.id}
                            league={meta.league}
                            size={26}
                          />
                        ))}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {r.players.map((p: any) => surname(p.name)).join(" · ")}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs text-mute">
                      {COLS.map((c) => (
                        <span key={c.key} className="tabular-nums">
                          <span
                            className={cn(
                              "mr-1 uppercase tracking-wider",
                              sort.key === c.key && "text-accent"
                            )}
                          >
                            {c.label}
                          </span>
                          <span className="text-ink">{c.fmt(r[c.key])}</span>
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={team ? team : `Every group of ${size}`}
          />
          <CardBody>
            <Plot
              data={traces as any}
              layout={layout as any}
              height={430}
              placeholder="Nothing clears this minutes floor"
              // Trace 0 is the field, trace 1 the fives already picked, which
              // is the same split the traces are built on.
              onPointClick={(p) => {
                const from = p.curveNumber === 0 ? unpicked : chosen;
                const row = from[p.pointIndex];
                if (row) togglePick(row);
              }}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
