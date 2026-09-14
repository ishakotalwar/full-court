import type { Meta } from "@/lib/api";
import { ViewTabs } from "@/components/ui/ViewTabs";
import { Players } from "./Players";
import { Similar } from "./Similar";
import { ShotAnalysis } from "./ShotAnalysis";
import { Ratings } from "./Ratings";
import { Compare } from "./Compare";

const VIEWS = [
  { v: "overview", label: "Overview" },
  { v: "compare", label: "Compare" },
  { v: "impact", label: "Impact" },
  { v: "similar", label: "Similarity" },
  { v: "shots", label: "Shot Analysis" },
] as const;

/** Everything about one player: the profile, who else played like them, and
 *  where they shot from. */
export function PlayersSection({
  meta,
  view,
  onView,
}: {
  meta: Meta;
  /** Which view is open — a segment of the URL, not state held here. */
  view?: string;
  onView: (view: string) => void;
}) {
  const active = view ?? "overview";

  return (
    <div className="space-y-4">
      <ViewTabs views={VIEWS} value={active} onChange={onView} />
      {active === "overview" && <Players meta={meta} />}
      {active === "compare" && <Compare meta={meta} />}
      {active === "impact" && <Ratings meta={meta} />}
      {active === "similar" && <Similar meta={meta} />}
      {active === "shots" && <ShotAnalysis meta={meta} />}
    </div>
  );
}
