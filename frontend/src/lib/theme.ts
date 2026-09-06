/** The color theme, stored per browser.
 *
 * A theme is two independent choices: a palette (which family of colors) and
 * a mode (light or dark). Every palette exists in both, so switching one never
 * costs you the other. The palettes themselves live in index.css as CSS custom
 * properties keyed by `<palette>-<mode>`, so applying one is a single
 * attribute on <html> rather than a re-render of every component.
 *
 * This module owns only the choice: what it is, how to change it, and how to
 * subscribe so canvas-based things (Plotly) can redraw with new colors.
 */
import { useSyncExternalStore } from "react";

export type Mode = "light" | "dark";

/**
 * Every palette, in the order the picker lists them.
 *
 * `swatch` duplicates two colors per mode from the CSS as literals, because a
 * swatch has to show a palette that is not the one currently applied, and
 * custom properties only exist for the theme in force.
 */
export const PALETTES = [
  {
    key: "classic",
    label: "Classic",
    swatch: { light: ["#f7f8fa", "#d64a1e"], dark: ["#0b0d10", "#ff6a3d"] },
  },
  {
    key: "ocean",
    label: "Ocean",
    swatch: { light: ["#eef5f8", "#0e7490"], dark: ["#07141e", "#22d3ee"] },
  },
  {
    key: "frost",
    label: "Frost",
    swatch: { light: ["#f1f5f9", "#2563eb"], dark: ["#0d121c", "#60a5fa"] },
  },
] as const;

export type Palette = (typeof PALETTES)[number]["key"];

/** What goes on <html>, and what a chart keys its redraw on. */
export type Theme = `${Palette}-${Mode}`;

const STORAGE_KEY = "full-court-theme";

const palettes = new Set<string>(PALETTES.map((p) => p.key));

/** Accepts what is stored today ("ocean-dark") and what older builds stored
 *  ("dark"), which named a mode and implied the one palette there was. A
 *  palette that no longer exists parses as nothing, so a browser holding a
 *  retired one falls back to the default rather than to a blank page. */
function parse(saved: string | null): { palette: Palette; mode: Mode } | null {
  if (!saved) return null;
  if (saved === "light" || saved === "dark") return { palette: "classic", mode: saved };
  const cut = saved.lastIndexOf("-");
  const palette = saved.slice(0, cut);
  const mode = saved.slice(cut + 1);
  if (!palettes.has(palette) || (mode !== "light" && mode !== "dark")) return null;
  return { palette: palette as Palette, mode };
}

function systemMode(): Mode {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function readStoredTheme(): { palette: Palette; mode: Mode } {
  try {
    const saved = parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch {
    // Private mode or blocked storage — fall back to the system preference.
  }
  return { palette: "classic", mode: systemMode() };
}

let current = typeof document === "undefined"
  ? { palette: "classic" as Palette, mode: "dark" as Mode }
  : readStoredTheme();

const listeners = new Set<() => void>();

const themeOf = (c: typeof current): Theme => `${c.palette}-${c.mode}`;

function apply() {
  const root = document.documentElement;
  root.dataset.theme = themeOf(current);
  root.style.colorScheme = current.mode;
}

function commit() {
  apply();
  try {
    localStorage.setItem(STORAGE_KEY, themeOf(current));
  } catch {
    // Not being able to remember the choice shouldn't break the controls.
  }
  listeners.forEach((l) => l());
}

/** Change the color family, keeping whichever half of it you were reading. */
export function setPalette(palette: Palette) {
  current = { ...current, palette };
  commit();
}

export function setMode(mode: Mode) {
  current = { ...current, mode };
  commit();
}

export function toggleMode() {
  setMode(current.mode === "dark" ? "light" : "dark");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The applied theme, as the single key both halves resolve to. */
export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => themeOf(current),
    () => "classic-dark" as Theme,
  );
}

export function usePalette(): Palette {
  return useSyncExternalStore(
    subscribe,
    () => current.palette,
    () => "classic" as Palette,
  );
}

export function useMode(): Mode {
  return useSyncExternalStore(
    subscribe,
    () => current.mode,
    () => "dark" as Mode,
  );
}

/** Read one palette value as a CSS color, for canvas libraries that can't use
 *  CSS variables. Returns an rgb() string built from the "R G B" triplet. */
export function themeColor(name: string, fallback = "#888"): string {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(`--c-${name}`)
    .trim();
  return raw ? `rgb(${raw})` : fallback;
}

/** Applied once at startup; index.html also sets it before first paint so the
 *  page never flashes the wrong theme. */
export function initTheme() {
  apply();
}
