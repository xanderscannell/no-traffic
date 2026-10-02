export type Coord = [number, number]; // [lng, lat]
export type Congestion = 'unknown' | 'low' | 'moderate' | 'heavy' | 'severe';
export interface Segment {
  duration: number;
  distance: number;
  congestion: Congestion;
}
export interface Route {
  coords: Coord[];
  segments: Segment[];
  duration: number;
  distance: number;
  /** Main roads, e.g. "I 275 North, I 94 East". */
  summary: string;
}

/** What every request goes through, so tests and demo mode can swap in fixtures. */
export type FetchJson = (url: string) => Promise<{ status: number; body: unknown }>;

interface DirectionsBody {
  code?: string;
  message?: string;
  routes?: {
    duration: number;
    distance: number;
    geometry: { coordinates: Coord[] };
    legs: { summary?: string; annotation: { duration: number[]; distance: number[]; congestion: string[] } }[];
  }[];
}

export type ErrorKind = 'auth' | 'rate' | 'noroute' | 'notfound' | 'network' | 'other';
export class MapboxError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
  ) {
    super(message);
  }
}

const LEVELS = new Set(['low', 'moderate', 'heavy', 'severe']);
const BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/';

export function directionsUrl(opts: { from: Coord; to: Coord; exclude?: Coord[]; via?: Coord; token: string }): string {
  const coords = [opts.from, ...(opts.via ? [opts.via] : []), opts.to].map((c) => c.join(',')).join(';');
  let q = 'alternatives=true&overview=full&geometries=geojson&annotations=congestion,duration,distance';
  if (opts.via) q += '&waypoints=0;2';
  if (opts.exclude?.length) q += '&exclude=' + opts.exclude.map(([lng, lat]) => `point(${lng}%20${lat})`).join(',');
  return `${BASE}${coords}?${q}&access_token=${encodeURIComponent(opts.token)}`;
}

/** Throws a MapboxError for any non-success response. */
export function checkResponse(status: number, body: unknown): void {
  const b = (body ?? {}) as DirectionsBody;
  const msg = b.message ?? `HTTP ${status}`;
  if (status === 401 || status === 403) throw new MapboxError('auth', msg);
  if (status === 429) throw new MapboxError('rate', msg);
  if (b.code === 'NoRoute' || b.code === 'NoSegment') throw new MapboxError('noroute', msg);
  if (status !== 200) throw new MapboxError('other', msg);
}

export function parseDirections(body: unknown): Route[] {
  const b = body as DirectionsBody;
  if (b.code !== 'Ok') throw new MapboxError(b.code === 'NoRoute' ? 'noroute' : 'other', b.message ?? String(b.code));
  return (b.routes ?? []).map((r) => ({
    coords: r.geometry.coordinates,
    segments: r.legs.flatMap(({ annotation: a }) =>
      a.duration.map((duration, i) => ({
        duration,
        distance: a.distance[i],
        congestion: (LEVELS.has(a.congestion[i]) ? a.congestion[i] : 'unknown') as Congestion,
      })),
    ),
    duration: r.duration,
    distance: r.distance,
    summary: r.legs.map((l) => l.summary ?? '').filter(Boolean).join(', '),
  }));
}
