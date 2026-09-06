"""Games started, per player-season.

The box-score feed marks who started each game, but nothing downstream has
needed it until now, so it was never kept: the season table records games
played and minutes and stops there. Sixth man of the year is the one award
that cannot be ranked without it — coming off the bench is the eligibility
rule, not a tiebreak — so this walks the same `player_box` files the lineup
ETL already reads and keeps two counts per player-season.

    python etl/starts_etl.py --league nba
    python etl/starts_etl.py --league wnba --from 2020

Output is `data/starts_<league>.parquet`, a few thousand rows: season,
player_id, games started, games played.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.leagues import LEAGUES, League, get  # noqa: E402
from etl.lineup_etl import DATA, FIRST_SEASON, fetch  # noqa: E402


def season_starts(league: League, season: int) -> pd.DataFrame | None:
    """One season's counts, or None where that season isn't published."""
    box = fetch(league, "player_box", "player_box", season)
    if box is None or box.empty:
        return None

    played = box
    # A name on the sheet is not an appearance. Where the feed says outright
    # that someone did not play, take it; otherwise fall back to minutes,
    # since a starter always logs some.
    if "did_not_play" in played.columns:
        played = played[~played["did_not_play"].fillna(False)]
    if "minutes" in played.columns:
        minutes = pd.to_numeric(played["minutes"], errors="coerce")
        played = played[minutes.fillna(0) > 0]
    if played.empty:
        return None

    starter = played["starter"].fillna(False).astype(bool)
    counts = (played.assign(started=starter)
              .groupby("athlete_id")
              .agg(gs=("started", "sum"), gp_box=("started", "size"))
              .reset_index()
              .rename(columns={"athlete_id": "player_id"}))
    counts["season"] = str(season)
    counts["player_id"] = pd.to_numeric(counts["player_id"], errors="coerce")
    return counts.dropna(subset=["player_id"]).astype({"player_id": "int64"})


def build(league: League, first: int, last: int) -> pd.DataFrame:
    out = []
    for season in range(first, last + 1):
        counts = season_starts(league, season)
        if counts is None:
            print(f"  {season}: not published")
            continue
        print(f"  {season}: {len(counts):,} players")
        out.append(counts)
    if not out:
        raise SystemExit("No seasons fetched.")
    return pd.concat(out, ignore_index=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--league", default="nba", choices=sorted(LEAGUES))
    ap.add_argument("--from", dest="first", type=int, default=None,
                    help="first season (default: where the lineup data starts)")
    ap.add_argument("--to", dest="last", type=int, default=None)
    args = ap.parse_args()

    league = get(args.league)
    first = args.first or FIRST_SEASON[league.key]
    last = args.last or pd.Timestamp.today().year + 1

    print(f"{league.label} games started, {first}-{last}")
    frame = build(league, first, last)
    path = DATA / f"starts{league.suffix}.parquet"
    frame.to_parquet(path, index=False)
    print(f"wrote {path} ({len(frame):,} rows)")


if __name__ == "__main__":
    main()
