"""Health, league discovery, and per-league metadata."""
from __future__ import annotations

from fastapi import APIRouter

from .. import data, leagues
from . import shots

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
def health():
    return {"ok": True}


def _coverage(lg: leagues.League) -> dict | None:
    """How much of a league is on disk, in the terms the landing page states it.

    Everything here is either already cached by the availability check above or
    read from a Parquet footer, so describing both leagues costs no more than
    discovering them.
    """
    # Everything, inside the try: this endpoint is how the app discovers that
    # it can run at all, so a number it cannot work out has to cost that
    # number and not the page. The landing page drops any tile it is not given.
    try:
        seasons = data.seasons(lg)
        return {
            "seasons": len(seasons),
            "first_season": seasons[0] if seasons else None,
            "last_season": seasons[-1] if seasons else None,
            "season_format": lg.season_format,
            "players": len(data.player_names(lg)),
            # A row of the players table is one player-season, which is also
            # one row of the Explorer — the number the visitor pages through.
            "player_seasons": len(data.players(lg)),
            # None for a league with no shot file, or no engine able to read
            # the footer; the tile drops out rather than reading zero.
            "shots": data.row_count("shots", lg),
        }
    except Exception:
        return None


@router.get("/leagues")
def league_list():
    """Which leagues exist, which have Parquet on disk, and how much of it."""
    out = []
    for lg in leagues.LEAGUES.values():
        available = data.has_data(lg)
        out.append({
            "key": lg.key,
            "label": lg.label,
            "available": available,
            "coverage": _coverage(lg) if available else None,
        })
    return {"leagues": out, "default": leagues.DEFAULT.key}


@router.get("/meta")
def meta(league: str | None = None):
    lg = leagues.get(league)
    return {
        "league": lg.key,
        "league_label": lg.label,
        "season_format": lg.season_format,
        "players": data.player_names(lg),
        "player_ids": data.player_ids(lg),
        "teams": data.team_names(lg),
        "seasons": data.seasons(lg),
        # Lineups start later than the rest: they need play-by-play, and the
        # early substitution logs are too sparse to rebuild a five from.
        "lineup_seasons": data.lineup_seasons(lg),
        "rating_seasons": data.rating_seasons(lg),
        "rating_playoff_seasons": data.rating_seasons(lg, "playoffs"),
        "rating_season_types": data.RATING_SEASON_TYPES,
        # How impact can be measured; the page's picker is built from this.
        "impact_metrics": data.IMPACT_METRICS,
        "metrics": data.available_metrics(lg),
        # How a counting stat can be expressed: per game, per 36, per 100 poss.
        "rate_bases": data.RATE_BASES,
        # Which games a shot chart can draw from.
        "shot_season_types": shots.SEASON_TYPES,
        "invert_metrics": sorted(data.INVERT_METRICS),
        # Everything the shot chart needs to redraw the same zones the
        # backend classifies shots into.
        "court": {"arc": lg.three_point_arc, "corner": lg.three_point_corner,
                  "rim": shots.RESTRICTED_RADIUS, "paint_width": shots.PAINT_HALF_WIDTH,
                  "paint_depth": shots.PAINT_DEPTH, "paint_near": shots.PAINT_NEAR_RADIUS,
                  "wing_angle": shots.WING_ANGLE},
    }
