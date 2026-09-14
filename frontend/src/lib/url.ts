/** Panel state that lives in the query string.
 *
 * A page is `/<league>/<section>/<view>` (see `lib/routes.ts`); what the panel
 * on that page is *showing* — which player, which season, which metric — rides
 * in the query string, so a link carries the whole answer and not just the
 * form that produces it.
 *
 * These read like `useState`, with two differences worth knowing:
 *
 *  - Writes use `replace`, so dragging a slider leaves one history entry
 *    rather than forty. The back button steps between pages, not keystrokes.
 *  - A value equal to its fallback is dropped from the URL, so the common case
 *    stays `/nba/players/overview` instead of trailing a string of defaults.
 */
import { useCallback, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Meta, PlayerSeason } from "./api";

type Patch = Record<string, string | number | null | undefined>;

/** Writes from one tick are merged before they are applied. Two setters called
 *  together — a player and their season — would otherwise each start from the
 *  URL as it was before either ran, and the second would drop the first. */
let queued: Patch | null = null;

/** Set several params at once. Prefer this to calling setters in sequence when
 *  one user action changes more than one of them. */
export function useQueryPatch() {
  const navigate = useNavigate();
  const location = useLocation();
  // Read at flush time rather than captured at render time, so a patch always
  // merges into the newest URL this component has seen.
  const live = useRef({ navigate, location });
  live.current = { navigate, location };

  return useCallback((patch: Patch) => {
    const first = queued === null;
    queued = { ...(queued ?? {}), ...patch };
    if (!first) return;
    queueMicrotask(() => {
      const next = new URLSearchParams(live.current.location.search);
      for (const [key, value] of Object.entries(queued ?? {})) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      queued = null;
      const search = next.toString();
      const current = live.current.location.search.replace(/^\?/, "");
      if (search === current) return;
      live.current.navigate({ search: search ? `?${search}` : "" }, { replace: true });
    });
  }, []);
}

/** Either a new value or a function of the current one, as `useState` takes. */
type Update<T> = T | ((current: T) => T);
const apply = <T,>(update: Update<T>, current: T): T =>
  typeof update === "function" ? (update as (c: T) => T)(current) : update;

/** One string param. */
export function useQueryState(
  key: string,
  fallback = ""
): [string, (value: Update<string>) => void] {
  const [params] = useSearchParams();
  const patch = useQueryPatch();
  const value = params.get(key) ?? fallback;
  const set = useCallback(
    (update: Update<string>) => {
      const next = apply(update, value);
      patch({ [key]: next === fallback ? null : next });
    },
    [key, fallback, patch, value]
  );
  return [value, set];
}

/** One numeric param, falling back when it is missing or not a number. */
export function useQueryNumber(
  key: string,
  fallback: number
): [number, (value: Update<number>) => void] {
  const [params] = useSearchParams();
  const patch = useQueryPatch();
  const raw = params.get(key);
  const parsed = raw === null ? NaN : Number(raw);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  const set = useCallback(
    (update: Update<number>) => {
      const next = apply(update, value);
      patch({ [key]: next === fallback ? null : next });
    },
    [key, fallback, patch, value]
  );
  return [value, set];
}

/** A comma-separated list of ids, for the panels that select several players. */
export function useQueryIds(
  key: string
): [number[], (value: Update<number[]>) => void] {
  const [params] = useSearchParams();
  const patch = useQueryPatch();
  const raw = params.get(key);
  const value = raw
    ? raw.split(",").map(Number).filter((n) => Number.isFinite(n))
    : [];
  const set = useCallback(
    (update: Update<number[]>) => {
      const next = apply(update, value);
      patch({ [key]: next.length ? next.join(",") : null });
    },
    // `value` is rebuilt each render, so the join is what the effect compares.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, patch, value.join(",")]
  );
  return [value, set];
}

/** A boolean flag, present in the URL only when it is on. */
export function useQueryFlag(
  key: string
): [boolean, (value: Update<boolean>) => void] {
  const [params] = useSearchParams();
  const patch = useQueryPatch();
  const value = params.get(key) === "1";
  const set = useCallback(
    (update: Update<boolean>) => patch({ [key]: apply(update, value) ? "1" : null }),
    [key, patch, value]
  );
  return [value, set];
}

/**
 * A player-season, as `?player=Stephen+Curry&season=2022`.
 *
 * The name is what goes in the URL and the ESPN id is looked up from meta, so
 * a link is readable, survives an id change, and can be typed by hand.
 */
export function useQueryPlayer(
  meta: Meta,
  nameKey = "player",
  seasonKey = "season"
): [PlayerSeason, (value: PlayerSeason) => void] {
  const [params] = useSearchParams();
  const patch = useQueryPatch();
  const playerName = params.get(nameKey) ?? "";
  const value: PlayerSeason = {
    playerName,
    season: params.get(seasonKey) ?? "",
    playerId: playerName ? meta.player_ids?.[playerName] : undefined,
  };
  const set = useCallback(
    (next: PlayerSeason) =>
      patch({
        [nameKey]: next.playerName || null,
        [seasonKey]: next.season || null,
      }),
    [nameKey, seasonKey, patch]
  );
  return [value, set];
}

/**
 * A list of player-seasons, as `?players=Stephen+Curry~2016,Luka+Doncic~2024`.
 *
 * `~` separates a name from its season because no player has one in their
 * name; the comma between entries is what a reader expects a list to use.
 */
export function useQueryPlayers(
  meta: Meta,
  key = "players"
): [PlayerSeason[], (value: Update<PlayerSeason[]>) => void] {
  const [params] = useSearchParams();
  const patch = useQueryPatch();
  const raw = params.get(key);
  const value = (raw ? raw.split(",") : [])
    .map((entry) => {
      const [playerName, season = ""] = entry.split("~");
      return {
        playerName,
        season,
        playerId: playerName ? meta.player_ids?.[playerName] : undefined,
      };
    })
    .filter((p) => p.playerName);
  const set = useCallback(
    (update: Update<PlayerSeason[]>) => {
      const named = apply(update, value).filter((p) => p.playerName);
      patch({
        [key]: named.length
          ? named.map((p) => `${p.playerName}~${p.season ?? ""}`).join(",")
          : null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, patch, raw]
  );
  return [value, set];
}
