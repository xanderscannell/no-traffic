import type { Coord } from './mapbox';

/** One autocomplete row. Coordinates come later, from `retrieve`. */
export interface Suggestion {
  id: string;
  name: string;
  /** Where it is, e.g. "Detroit, Michigan 48242". */
  detail: string;
}

export interface Place {
  label: string;
  coord: Coord;
}

const BASE = 'https://api.mapbox.com/search/searchbox/v1/';

/** Mapbox Search Box autocomplete. Requests sharing a session token are billed as one session. */
export function suggestUrl(query: string, opts: { proximity?: Coord | 'ip'; session: string; token: string }): string {
  let q = `q=${encodeURIComponent(query)}&country=us&limit=6&session_token=${opts.session}`;
  if (opts.proximity) q += `&proximity=${opts.proximity === 'ip' ? 'ip' : opts.proximity.join(',')}`;
  return `${BASE}suggest?${q}&access_token=${encodeURIComponent(opts.token)}`;
}

export function retrieveUrl(id: string, opts: { session: string; token: string }): string {
  return `${BASE}retrieve/${encodeURIComponent(id)}?session_token=${opts.session}&access_token=${encodeURIComponent(opts.token)}`;
}

interface SuggestBody {
  suggestions?: { mapbox_id: string; name: string; full_address?: string; place_formatted?: string }[];
}

export function parseSuggest(body: unknown): Suggestion[] {
  return ((body as SuggestBody).suggestions ?? []).map((s) => {
    let detail = s.full_address ?? s.place_formatted ?? '';
    if (detail.startsWith(`${s.name}, `)) detail = detail.slice(s.name.length + 2);
    return { id: s.mapbox_id, name: s.name, detail: detail.replace(/, United States$/, '') };
  });
}

interface RetrieveBody {
  features?: { geometry: { coordinates: Coord }; properties: { name: string; full_address?: string; place_formatted?: string } }[];
}

export function parseRetrieve(body: unknown): Place | null {
  const f = (body as RetrieveBody).features?.[0];
  if (!f) return null;
  return { label: f.properties.name, coord: f.geometry.coordinates };
}

/** A typed "lat, lng" pair (the order Google Maps shows), or null. */
export function parseLatLng(text: string): Coord | null {
  const m = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const [lat, lng] = [Number(m[1]), Number(m[2])];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lng, lat] : null;
}

/** "Name" plus the town from its detail: "Detroit Metropolitan Airport, Detroit". */
export const shortLabel = (s: Suggestion) => (s.detail ? `${s.name}, ${s.detail.split(', ')[0]}` : s.name);

/** UUID for session tokens; `crypto.randomUUID` only exists on secure pages. */
export function newSession(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
