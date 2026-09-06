"""Individual defensive counting stats, per player-season, from pbpstats.

The rest of this project reads ESPN's play-by-play, which records two
defensive acts — a steal and a block — and nothing about where either
happened. That is why the defensive award boards lean so hard on a
plus-minus fit that cannot separate teammates.

pbpstats (Darryl Blackport's public API, https://www.pbpstats.com) parses the
same league play-by-play into far more of it: blocks split by the zone the
shot came from, steals split by whether the pass or the handle was taken,
fouls split by kind, defensive rebounds, and — the piece that makes any of it
comparable — `DefPoss`, the possessions a player actually defended.

    python etl/pbp_defense_etl.py --league nba
    python etl/pbp_defense_etl.py --league wnba --from 2020

Output is `data/defense_<league>.parquet`, one row per player-season, raw
counts plus the defensive possessions to divide them by. Rates are left to
the backend, the way every other table here stores what was counted rather
than what was computed from it.

Two joins to know about. pbpstats keys players by NBA.com's id and this
project keys them by ESPN's, so rows are matched on a normalized name within
a season — which currently resolves every qualified player in both leagues,
and reports whatever it cannot place. And pbpstats labels a season the way
`League.display_season` does, so that is what the season parameter is built
with.
"""
from __future__ import annotations

import argparse
import re
import sys
import time
import unicodedata
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.leagues import LEAGUES, League, get  # noqa: E402

DATA = ROOT / "data"
API = "https://api.pbpstats.com/get-totals/{league}"
TIMEOUT = 45
PAUSE = 1.5  # the API is one person's; do not hammer it

# Where the season starts differ from the lineup data: pbpstats parses the
# league's own play-by-play, which reaches further back than the substitution
# feed this project rebuilds lineups from.
FIRST_SEASON = {"nba": 2015, "wnba": 2020}

# What is worth keeping. Everything here is a count of something a person did
# on defense, except the last two, which are the team's rating while they were
# on the floor and the on-off gap — kept because they cost nothing extra and
# the fit already in the project has no on-court split of its own.
KEEP = [
    "DefPoss", "Minutes", "GamesPlayed",
    # `Blocked<zone>` is a block *by* this player on a shot from that zone.
    # Its near-namesake `AtRimPctBlocked` is the opposite — the share of the
    # player's own rim attempts that got swatted — so it is deliberately not
    # here. Guards lead that one.
    "Blocks", "BlockedAtRim", "BlockedShortMidRange", "BlockedLongMidRange",
    "BlockedArc3", "BlockedCorner3",
    "Steals", "BadPassSteals", "LostBallSteals",
    "DefRebounds",
    "Fouls", "ShootingFouls", "Charge Fouls", "Offensive Fouls Drawn",
    "Loose Ball Fouls",
    "OnDefRtg", "OnOffRtg",
]

# Column names the rest of the project can live with.
RENAME = {
    "DefPoss": "def_poss",
    "Minutes": "pbp_min",
    "GamesPlayed": "pbp_gp",
    "Blocks": "blocks",
    "BlockedAtRim": "blocks_rim",
    "BlockedShortMidRange": "blocks_short_mid",
    "BlockedLongMidRange": "blocks_long_mid",
    "BlockedArc3": "blocks_arc3",
    "BlockedCorner3": "blocks_corner3",
    "Steals": "steals",
    "BadPassSteals": "steals_pass",
    "LostBallSteals": "steals_handle",
    "DefRebounds": "def_rebounds",
    "Fouls": "fouls",
    "ShootingFouls": "shooting_fouls",
    "Charge Fouls": "charges",
    "Offensive Fouls Drawn": "off_fouls_drawn",
    "Loose Ball Fouls": "loose_ball_fouls",
    "OnDefRtg": "on_def_rtg",
    "OnOffRtg": "on_off_rtg",
}


def normalize(name: str) -> str:
    """A name in the one form both feeds agree on: no accents, no
    punctuation, no generational suffix."""
    plain = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode()
    plain = plain.lower().replace(".", "").replace("'", "").replace("-", " ")
    plain = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", plain)
    return re.sub(r"\s+", " ", plain).strip()


def fetch(league: League, season: str) -> list[dict] | None:
    """One season of player totals, or None where it isn't published."""
    params = {
        "Season": league.display_season(season),
        "SeasonType": "Regular Season",
        "Type": "Player",
    }
    r = requests.get(API.format(league=league.key), params=params, timeout=TIMEOUT,
                     headers={"User-Agent": "full-court/1.0 (personal analytics project)"})
    if r.status_code == 404:
        return None
    r.raise_for_status()
    rows = r.json().get("multi_row_table_data") or []
    return rows or None


def season_frame(league: League, season: str, roster: pd.DataFrame) -> pd.DataFrame | None:
    rows = fetch(league, season)
    if not rows:
        return None

    frame = pd.DataFrame(rows)
    present = [c for c in KEEP if c in frame.columns]
    out = frame[["Name", *present]].copy()
    # A sparse feed omits a field for a player who never did it, rather than
    # sending a zero, so a missing column is a zero and not a gap.
    for column in KEEP:
        if column not in out.columns:
            out[column] = 0.0
    out[KEEP] = out[KEEP].apply(pd.to_numeric, errors="coerce").fillna(0.0)

    out["key"] = out["Name"].map(normalize)
    ours = roster[roster["season"] == str(season)].copy()
    ours["key"] = ours["player_name"].map(normalize)
    # Two players in one season sharing a normalized name would make the join
    # ambiguous; drop both rather than guess which is which.
    ours = ours.drop_duplicates("key", keep=False)

    merged = ours[["key", "player_id", "player_name"]].merge(out, on="key", how="left")
    placed = merged[merged["DefPoss"].notna()].copy()
    missed = merged[merged["DefPoss"].isna()]

    placed = placed.rename(columns=RENAME)
    placed["season"] = str(season)
    kept = ["season", "player_id", "player_name", *RENAME.values()]
    print(f"  {league.display_season(season)}: {len(placed):,} matched"
          f"{f', {len(missed)} not in pbpstats' if len(missed) else ''}")
    return placed[kept]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--league", default="nba", choices=sorted(LEAGUES))
    ap.add_argument("--from", dest="first", type=int, default=None)
    ap.add_argument("--to", dest="last", type=int, default=None)
    args = ap.parse_args()

    league = get(args.league)
    first = args.first or FIRST_SEASON[league.key]
    last = args.last or pd.Timestamp.today().year + 1

    roster = pd.read_parquet(DATA / f"players{league.suffix}.parquet")
    roster["season"] = roster["season"].astype(str)

    print(f"{league.label} defensive detail from pbpstats, {first}-{last}")
    frames = []
    for season in range(first, last + 1):
        try:
            frame = season_frame(league, str(season), roster)
        except requests.HTTPError as exc:
            print(f"  {season}: {exc}")
            continue
        if frame is None:
            print(f"  {season}: not published")
        else:
            frames.append(frame)
        time.sleep(PAUSE)

    if not frames:
        raise SystemExit("No seasons fetched.")
    out = pd.concat(frames, ignore_index=True)
    path = DATA / f"defense{league.suffix}.parquet"
    out.to_parquet(path, index=False)
    print(f"wrote {path} ({len(out):,} rows)")


if __name__ == "__main__":
    main()
