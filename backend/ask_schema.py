"""The structured query language behind /api/ask.

A natural-language question is turned into one of these objects and nothing
else — every statistic in the answer comes from executing the object against
local Parquet, never from a model. Keeping the schema in its own module lets
both parsers (deterministic and LLM) and the executor share one definition.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

INTENTS = ("explorer", "similarity", "compare", "shot_analysis", "team_explorer",
           "impact", "lineups", "wowy")
OPERATORS = (">", ">=", "<", "<=", "=", "between")

# Natural language -> the canonical column names in backend/data.py. The values
# here must always be a subset of data.CANDIDATE_METRICS; ask.py asserts that.
METRIC_ALIASES: dict[str, str] = {
    "points": "pts", "ppg": "pts", "points per game": "pts",
    "scoring": "pts", "pts": "pts",
    "rebounds": "reb", "rebound": "reb", "rpg": "reb", "boards": "reb",
    "rebounds per game": "reb", "reb": "reb",
    "assists": "ast", "assist": "ast", "apg": "ast", "dimes": "ast",
    "assists per game": "ast", "ast": "ast",
    "steals": "stl", "steal": "stl", "spg": "stl", "stl": "stl",
    "blocks": "blk", "block": "blk", "bpg": "blk", "blk": "blk",
    "turnovers": "tov", "turnover": "tov", "tov": "tov",
    "field goal percentage": "fg_pct", "field goal %": "fg_pct", "fg%": "fg_pct",
    "fg pct": "fg_pct", "shooting percentage": "fg_pct", "fg_pct": "fg_pct",
    "three point percentage": "three_pct", "three-point percentage": "three_pct",
    "3 point percentage": "three_pct", "3-point percentage": "three_pct",
    "three point %": "three_pct", "3p%": "three_pct", "3pt%": "three_pct",
    "from three": "three_pct", "from deep": "three_pct", "three pct": "three_pct",
    "three point shooting": "three_pct", "three-point shooting": "three_pct",
    "3 point shooting": "three_pct", "three_pct": "three_pct",
    "free throw percentage": "ft_pct", "free throw %": "ft_pct", "ft%": "ft_pct",
    "from the line": "ft_pct", "ft_pct": "ft_pct",
    "true shooting": "ts_pct", "true shooting percentage": "ts_pct",
    "ts%": "ts_pct", "efficiency": "ts_pct", "ts_pct": "ts_pct",
    "usage": "usg_pct", "usage rate": "usg_pct", "usg%": "usg_pct",
    "usg_pct": "usg_pct",
    "offensive rating": "ortg", "ortg": "ortg",
    "defensive rating": "drtg", "drtg": "drtg",
    # Per-possession defence, from the play-by-play detail. These are rates
    # against possessions actually defended, which is what makes them
    # comparable between a starter and a reserve.
    "blocks per 100": "blk_100", "blocks per possession": "blk_100",
    "rim blocks": "blk_rim_100", "rim blocks per 100": "blk_rim_100",
    "blocks at the rim": "blk_rim_100",
    "steals per 100": "stl_100", "steals per possession": "stl_100",
    "fouls per 100": "foul_100", "fouls": "foul_100", "fouling": "foul_100",
    "on court defensive rating": "on_def_rtg", "on-court defensive rating": "on_def_rtg",
    "points allowed": "on_def_rtg",
    # How people describe a role rather than name a column. Rim protection and
    # ball pressure now reach the per-possession versions rather than the
    # per-game counts they used to settle for.
    "rim protector": "blk_rim_100", "rim protectors": "blk_rim_100",
    "rim protection": "blk_rim_100",
    "shot blocker": "blk_100", "shot blockers": "blk_100", "shot blocking": "blk_100",
    "floor general": "ast", "floor generals": "ast", "playmaker": "ast",
    "playmakers": "ast", "passer": "ast", "passers": "ast",
    "distributor": "ast", "distributors": "ast",
    "sharpshooter": "three_pct", "sharpshooters": "three_pct",
    "three point specialist": "three_pct", "3 point specialist": "three_pct",
    "three point shooter": "three_pct", "three point shooters": "three_pct",
    "3 point shooter": "three_pct", "3 point shooters": "three_pct",
    "three-point shooter": "three_pct", "three-point shooters": "three_pct",
    "scorer": "pts", "scorers": "pts", "bucket getter": "pts",
    "rebounder": "reb", "rebounders": "reb", "glass cleaner": "reb",
    "ball hawk": "stl_100", "ball hawks": "stl_100", "thief": "stl_100",
    "free throw shooter": "ft_pct", "free throw shooters": "ft_pct",
}

# Categories a superlative can name ("best defensive players"). These are
# deliberately kept out of METRIC_ALIASES: they are ambiguous, so they only
# resolve when the question is explicitly asking for a ranking, and the answer
# always says which single metric it ranked on.
SUPERLATIVE_CATEGORIES: dict[str, tuple[str, str | None]] = {
    # Defence used to fall back to blocks per game with an apology attached.
    # There is a defensive fit to rank on now, so these route to the impact
    # board instead — see IMPACT_WORDS in ask_parse.
    "defensive": ("blk_rim_100", None),
    "defense": ("blk_rim_100", None),
    "defenders": ("blk_rim_100", None),
    "offensive": ("pts", None),
    "scoring": ("pts", None),
    "shooting": ("ts_pct", None),
    "playmaking": ("ast", None),
    "passing": ("ast", None),
    "rebounding": ("reb", None),
    "efficient": ("ts_pct", None),
    "efficiency": ("ts_pct", None),
}

# Short prose names for summaries written server-side.
METRIC_LABELS: dict[str, str] = {
    "pts": "points per game", "reb": "rebounds", "ast": "assists",
    "stl": "steals", "blk": "blocks", "tov": "turnovers",
    "fg_pct": "field goal %", "three_pct": "three-point %", "ft_pct": "free throw %",
    "ts_pct": "true shooting %", "usg_pct": "usage rate",
    "ortg": "offensive rating", "drtg": "defensive rating",
}

# Team metrics live in teams.py's RANKABLE set, which uses display-style names.
TEAM_METRIC_ALIASES: dict[str, str] = {
    "efg": "eFG%", "efg%": "eFG%", "effective field goal": "eFG%",
    "effective field goal percentage": "eFG%", "efg pct": "eFG%",
    "turnover rate": "TOV%", "tov%": "TOV%", "turnover percentage": "TOV%",
    "offensive rebound rate": "ORB%", "orb%": "ORB%", "offensive rebounding": "ORB%",
    "free throw rate": "FT rate", "ft rate": "FT rate",
    "net rating": "net", "net": "net", "point differential": "net",
    "offensive rating": "ortg", "ortg": "ortg",
    "defensive rating": "drtg", "drtg": "drtg",
    "pace": "pace",
    "wins": "wins", "win percentage": "win_pct", "win pct": "win_pct",
    "record": "win_pct",
}

# Natural language -> a key in data.IMPACT_METRICS. "Impact" on its own means
# the single-season fit, which is what the Impact page opens on.
IMPACT_ALIASES: dict[str, str] = {
    "impact": "rapm", "rapm": "rapm", "plus minus": "rapm",
    "adjusted plus minus": "rapm", "value": "rapm",
    "three year rapm": "rapm_window", "3 year rapm": "rapm_window",
    "rolling rapm": "rapm_window", "multi year impact": "rapm_window",
    "box prior": "rapm_prior", "box-prior": "rapm_prior",
    "box prior rapm": "rapm_prior", "regressed impact": "rapm_prior",
    "per": "per", "player efficiency rating": "per", "hollinger": "per",
    "on off": "on_off", "on-off": "on_off", "on off split": "on_off",
    "defensive impact": "defense", "defensive rapm": "defense",
    "best defender": "defense", "best defenders": "defense",
    "defensive player": "defense", "defensive players": "defense",
}

# The similarity router keys its presets with capitals; users won't type them.
PRESET_ALIASES: dict[str, str] = {
    "overall": "Overall", "scoring": "Scoring", "shooting": "Shooting",
    "playmaking": "Playmaking", "passing": "Playmaking", "defense": "Defense",
    "defensive": "Defense",
}


class AskFilter(BaseModel):
    """One metric condition, e.g. pts >= 25."""
    metric: str = Field(description="Canonical metric key, e.g. 'pts' or 'three_pct'")
    op: Literal[">", ">=", "<", "<=", "=", "between"]
    value: float
    value2: float | None = Field(default=None, description="Upper bound, 'between' only")


class PlayerRef(BaseModel):
    """A player the user named, before resolution to an id."""
    player: str
    season: str | None = None


class AskQuery(BaseModel):
    """The validated request an /api/ask answer is computed from."""
    intent: Literal["explorer", "similarity", "compare", "shot_analysis",
                    "team_explorer", "impact", "lineups", "wowy"]
    league: str | None = None
    season_from: str | None = None
    season_to: str | None = None
    filters: list[AskFilter] = []
    players: list[PlayerRef] = []
    preset: str | None = None
    metric: str | None = Field(default=None, description="Metric to sort/rank on")
    sort: str | None = None
    dir: Literal["asc", "desc"] = "desc"
    limit: int = 20
    min_gp: int = Field(default=0, description="Games played floor, used by rankings")
    note: str | None = Field(default=None, description="Caveat to show with the answer")
    team: str | None = Field(default=None, description="Team name, for lineup and WOWY questions")
    group_size: int | None = Field(default=None, description="Players per lineup, 2-5")


class AskRequest(BaseModel):
    question: str
    league: str | None = Field(default=None, description="The UI's current league")
