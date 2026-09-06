# Full Court

NBA and WNBA analytics. Live at <https://full-court-six.vercel.app>

![Player overview](docs/screenshot.png)

## Stats

- Player pages with percentiles, career trends and recent games
- Compare players or teams side by side
- Season similarity
- Shot charts by zone, regular season or playoffs
- League table and team profiles
- Best lineups, in groups of two through five
- WOWY: what a team did with and without any group of players
- Impact ratings: RAPM, 3-year RAPM, box-prior RAPM, PER, on/off
- Explorer over every player-season
- Ask: questions in plain English

Counting stats read per game, per 36 minutes, or per 75 or 100 possessions.

## Predictions

- Game calendar with win probabilities
- Projected player lines for a scheduled game
- Elo team ratings
- Next-season projection for any player

## Running it

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements-local.txt
python etl/sdv_etl.py --league nba
python etl/sdv_etl.py --league wnba
python etl/schedule_etl.py
python etl/lineup_etl.py --league nba
python etl/lineup_etl.py --league wnba
python etl/starts_etl.py --league nba
python etl/starts_etl.py --league wnba
python etl/pbp_defense_etl.py --league nba
python etl/pbp_defense_etl.py --league wnba
cd frontend && npm install && cd ..

uvicorn backend.main:app --reload --port 8000   # one terminal
cd frontend && npm run dev                      # another, opens :5173
```

Data is ESPN's via hoopR and wehoop, committed as Parquet in `data/`. The
per-possession defensive detail comes from [pbpstats](https://www.pbpstats.com).
