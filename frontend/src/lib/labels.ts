/**
 * Keeps point labels legible on a crowded scatter.
 *
 * Plotly draws a point's text wherever `textposition` says and never checks
 * whether something is already there, so on any chart dense enough to be worth
 * plotting the names land on top of each other and on top of the dots. This
 * runs after a chart is drawn, when the axes know their pixel geometry, and
 * gives every label the cheapest position from a ranked list, counting the
 * dots it would cover and whether it would run off the plot. A label that can
 * only be drawn on top of another label is dropped instead — hover still names
 * that point, and two names on the same pixels leaves neither readable.
 */

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Marker = { trace: number; point: number; px: number; py: number; r: number };

/** Tried in order, so a label only moves as far as it has to. */
const POSITIONS = [
  "top center",
  "bottom center",
  "middle right",
  "middle left",
  "top right",
  "top left",
  "bottom right",
  "bottom left",
] as const;

const GAP = 3; // clear air between a label and whatever it sits beside

/**
 * What an unlabeled point carries instead of an empty string.
 *
 * Plotly only creates a point's `<text>` node when it first draws that point
 * with text in it. A point drawn blank never gets one, so giving it a label
 * later updates the data and changes nothing on screen. A space is blank to
 * look at and still gets the node made.
 */
export const BLANK = " ";

const overlaps = (a: Rect, b: Rect) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

let scratch: CanvasRenderingContext2D | null = null;

/** Text width in pixels, measured in the font the chart actually draws. */
function measure(text: string, font: string): number {
  if (!scratch) scratch = document.createElement("canvas").getContext("2d");
  if (!scratch) return text.length * 6;
  scratch.font = font;
  return scratch.measureText(text).width;
}

const isScatter = (t: any) =>
  t?.type === "scatter" || t?.type === "scattergl" || t?.type === undefined;

/** Where a label sits relative to its own point, in pixels. */
function rectFor(pos: string, m: Marker, w: number, h: number): Rect {
  const [vertical, horizontal] = pos.split(" ");
  // A corner label tucks in against the marker; an edge one clears it fully.
  const corner = vertical !== "middle" && horizontal !== "center";
  const offset = corner ? m.r * 0.6 : m.r + GAP;

  const x0 =
    horizontal === "center" ? m.px - w / 2
    : horizontal === "right" ? m.px + offset
    : m.px - offset - w;
  const y0 =
    vertical === "middle" ? m.py - h / 2
    : vertical === "top" ? m.py - offset - h
    : m.py + offset;

  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

/** What to hand Plotly.restyle, or null when there is nothing to place. */
export type LabelPlacement = {
  indices: number[];
  text: string[][];
  textposition: string[][];
};

/**
 * Work out where the labels on `el` should go, reading the wanted text from
 * `source` — the data the chart was handed, not what is on it now, so a label
 * dropped by an earlier pass comes back when a resize opens up the room.
 */
export function placeLabels(el: any, source: any[]): LabelPlacement | null {
  const full = el?._fullLayout;
  const traces = el?._fullData;
  if (!full || !traces?.length) return null;

  const xa = full.xaxis;
  const ya = full.yaxis;
  const size = full._size;
  if (!xa?.d2p || !ya?.d2p || !size) return null;

  const at = (trace: any, i: number) => {
    const px = xa.d2p(trace.x?.[i]);
    const py = ya.d2p(trace.y?.[i]);
    return Number.isFinite(px) && Number.isFinite(py) ? { px, py } : null;
  };

  // Every drawn dot is something a label has to miss, including the dots of
  // traces that carry no labels themselves.
  const markers: Marker[] = [];
  traces.forEach((trace: any, t: number) => {
    if (!isScatter(trace) || !String(trace.mode ?? "").includes("markers")) return;
    const sizes = trace.marker?.size;
    const n = trace.x?.length ?? 0;
    for (let i = 0; i < n; i++) {
      const p = at(trace, i);
      if (!p) continue;
      const s = (Array.isArray(sizes) ? sizes[i] : sizes) ?? 6;
      markers.push({ trace: t, point: i, px: p.px, py: p.py, r: s / 2 + 1 });
    }
  });

  // Corner notes and any other layout annotation are fixed furniture: a label
  // has to work around them the same way it works around a dot.
  const placed: Rect[] = (full.annotations ?? []).flatMap((note: any) => {
    if (!note?.text || note.visible === false) return [];
    const fontSize = note.font?.size ?? full.font?.size ?? 12;
    const w = measure(String(note.text), `${fontSize}px ${note.font?.family ?? full.font?.family ?? "sans-serif"}`);
    const h = fontSize * 1.15;
    const px = note.xref === "paper" ? note.x * size.w : xa.d2p(note.x);
    const py = note.yref === "paper" ? (1 - note.y) * size.h : ya.d2p(note.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return [];
    const x0 =
      note.xanchor === "right" ? px - w
      : note.xanchor === "center" ? px - w / 2
      : px;
    const y0 =
      note.yanchor === "bottom" ? py - h
      : note.yanchor === "middle" ? py - h / 2
      : py;
    return [{ x0, y0, x1: x0 + w, y1: y0 + h }];
  });
  const text: Record<number, string[]> = {};
  const positions: Record<number, string[]> = {};

  // Later traces are drawn on top and are usually the emphasized ones, so they
  // choose their spot first.
  for (let t = traces.length - 1; t >= 0; t--) {
    const trace = traces[t];
    const wanted = source?.[t]?.text;
    if (!isScatter(trace) || !String(trace.mode ?? "").includes("text")) continue;
    if (!Array.isArray(wanted)) continue;

    const fontSize = trace.textfont?.size ?? full.font?.size ?? 12;
    const font = `${fontSize}px ${trace.textfont?.family ?? full.font?.family ?? "sans-serif"}`;
    const height = fontSize * 1.15;

    const outText = wanted.map((v: any) => (v == null ? BLANK : String(v)));
    const outPos = outText.map(() => POSITIONS[0] as string);

    outText.forEach((label, i) => {
      if (!label.trim()) return;
      const self = markers.find((m) => m.trace === t && m.point === i);
      if (!self) {
        outText[i] = BLANK;
        return;
      }
      const width = measure(label, font);

      // Costed rather than pass/fail, because a long label — five surnames on
      // a picked lineup — can be too wide for any position to be perfectly
      // clear, and showing it slightly crowded beats not showing it at all.
      // Landing on another label is the one thing never worth doing: two
      // names on the same pixels leaves both unreadable.
      let best: { pos: string; rect: Rect; cost: number } | null = null;
      for (const pos of POSITIONS) {
        const rect = rectFor(pos, self, width, height);
        if (placed.some((p) => overlaps(rect, p))) continue;
        const spill =
          rect.x0 < 0 || rect.y0 < 0 || rect.x1 > size.w || rect.y1 > size.h ? 1 : 0;
        const hits = markers.filter(
          (m) => m !== self && overlaps(rect, {
            x0: m.px - m.r, y0: m.py - m.r, x1: m.px + m.r, y1: m.py + m.r,
          })
        ).length;
        const cost = spill * 20 + hits;
        if (!best || cost < best.cost) best = { pos, rect, cost };
        if (cost === 0) break; // nothing beats a clear spot found early
      }

      if (!best) {
        outText[i] = BLANK;
        return;
      }
      outPos[i] = best.pos;
      placed.push(best.rect);
    });

    text[t] = outText;
    positions[t] = outPos;
  }

  const indices = Object.keys(text).map(Number);
  if (!indices.length) return null;
  return {
    indices,
    text: indices.map((i) => text[i]),
    textposition: indices.map((i) => positions[i]),
  };
}
