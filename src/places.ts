import type { Coord } from './mapbox';
import type { Place } from './search';

/** Places the user can save and then type by name. Add a name here (like 'Work') to offer it everywhere. */
export const SAVED_NAMES = ['Home'] as const;
export type SavedName = (typeof SAVED_NAMES)[number];
/** Each saved place keeps the address it was saved from, for the hint under the field. */
export type SavedPlaces = Partial<Record<SavedName, Place>>;
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
  if (!raw || typeof raw !== 'object') return out;
  for (const name of SAVED_NAMES) {
    const p = (raw as Record<string, unknown>)[name] as Partial<Place> | undefined;
    if (p && typeof p.label === 'string' && isCoord(p.coord)) out[name] = { label: p.label, coord: [p.coord[0], p.coord[1]] };
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

/** The saved name a field's text refers to ("home" counts as "Home"), or null. */
export function savedNameOf(text: string): SavedName | null {
  const t = text.trim().toLowerCase();
  return SAVED_NAMES.find((n) => n.toLowerCase() === t) ?? null;
}

/** A field's text as a saved place, labelled with just its name, or null if it isn't one. */
export function savedPlace(places: SavedPlaces, text: string): Place | null {
  const name = savedNameOf(text);
  const p = name && places[name];
  return p ? { label: name, coord: p.coord } : null;
}

/** In-memory store, for demos and when the browser blocks storage. */
export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}
