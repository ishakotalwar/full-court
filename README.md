# Full Court

NBA and WNBA analytics. Live at <https://full-court-six.vercel.app>

![Player overview](docs/screenshot.png)

Every page has its own address, and a link carries what you were looking at:
`/nba/players/shots?player=Nikola+Jokic&season=2024&mode=scatter`.

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
- Chart builder: any metric against any other
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

Ask reads the local Parquet either way. A question the rule parser can't place
falls back to Claude, which wants `ANTHROPIC_API_KEY` in the environment —
without one those questions say so rather than guess.

## Deploying

Vercel serves `frontend/dist` and runs the API as a single Python function.
Three things the setup depends on:

- A catch-all route to `index.html`. Without it every URL but `/` is a 404 at
  the edge, before the app that understands the path has loaded.
- `fastparquet` rather than `pyarrow` in `requirements.txt`. pyarrow is 112 MB
  against a 250 MB function bundle, so nothing may import it.
- Web Analytics switched on in the Vercel project, or `@vercel/analytics`
  records nothing.

Data is ESPN's via hoopR and wehoop, committed as Parquet in `data/`. The
per-possession defensive detail comes from [pbpstats](https://www.pbpstats.com).
