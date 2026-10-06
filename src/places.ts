import type { Coord } from './mapbox';
import { parseLatLng, type Place } from './search';

/** Home and Work always get a row in the Saved places list; any other name is a "saved" place. */
export const HOME = 'Home';
export const WORK = 'Work';
export const MY_LOCATION = 'My location';
/** Saved places by name. Each keeps the address it was saved from, for the hint under the field. */
export type SavedPlaces = Record<string, Place>;
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export const SAVED_KEY = 'no-traffic.places';

const isCoord = (c: unknown): c is Coord =>
  Array.isArray(c) && c.length === 2 && c.every((n) => Number.isFinite(n)) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;

/** Reads saved places, dropping anything malformed. Never throws. */
export function loadSaved(store: KeyValueStore): SavedPlaces {
  let raw: unknown;
  try {
    raw = JSON.parse(store.getItem(SAVED_KEY) ?? '{}');
  } catch {
    return {};
  }
  const out: SavedPlaces = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    const p = value as Partial<Place> | null;
    if (name === name.trim() && !nameProblem(name) && p && typeof p.label === 'string' && isCoord(p.coord)) out[name] = { label: p.label, coord: [p.coord[0], p.coord[1]] };
  }
  return out;
}

/** Writes saved places. Returns false if storage is unavailable. */
export function storeSaved(store: KeyValueStore, places: SavedPlaces): boolean {
  try {
    store.setItem(SAVED_KEY, JSON.stringify(places));
    return true;
  } catch {
    return false;
  }
}

/** Names in display order: Home, Work, then the rest alphabetically. */
export function savedNames(places: SavedPlaces): string[] {
  const rank = (n: string) => (n === HOME ? 0 : n === WORK ? 1 : 2);
  return Object.keys(places).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Saved names to offer for a field's text: all of them when it's empty, else those whose name or address contains it. */
export function savedMatches(places: SavedPlaces, text: string): string[] {
  const t = text.trim().toLowerCase();
  return savedNames(places).filter((n) => n.toLowerCase().includes(t) || places[n].label.toLowerCase().includes(t));
}

/** Why `name` can't be used for a saved place, or null if it can. */
export function nameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Give the place a name.';
  if (n.length > 40) return 'Keep the name to 40 characters or fewer.';
  if (n.toLowerCase() === MY_LOCATION.toLowerCase()) return `"${MY_LOCATION}" is used by Use my location. Pick another name.`;
  if (parseLatLng(n)) return "A name can't look like coordinates.";
  return null;
}

/** The saved name a field's text refers to ("home" counts as "Home"), or null. */
export function savedNameOf(places: SavedPlaces, text: string): string | null {
  const t = text.trim().toLowerCase();
  return Object.keys(places).find((n) => n.toLowerCase() === t) ?? null;
}

/** A field's text as a saved place, labelled with just its name, or null if it isn't one. */
export function savedPlace(places: SavedPlaces, text: string): Place | null {
  const name = savedNameOf(places, text);
  return name ? { label: name, coord: places[name].coord } : null;
}

/** `places` without `name`, in any case. */
export function without(places: SavedPlaces, name: string): SavedPlaces {
  const n = name.trim().toLowerCase();
  return Object.fromEntries(Object.entries(places).filter(([k]) => k.toLowerCase() !== n));
}

/** `places` with `place` saved as `name`, replacing a same-named entry in any case. "home" and "work" become Home and Work. */
export function withSaved(places: SavedPlaces, name: string, place: Place): SavedPlaces {
  const n = name.trim();
  const key = [HOME, WORK].find((k) => k.toLowerCase() === n.toLowerCase()) ?? n;
  return { ...without(places, key), [key]: place };
}

/** In-memory store, for demos and when the browser blocks storage. */
export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}
