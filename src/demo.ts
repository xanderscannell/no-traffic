import { fixtures } from './fixtures';
import type { FetchJson } from './mapbox';

/** Copy of a raw Directions body with congestion on route 0, segments [from, to), set to `level`. */
export function jamBody(body: unknown, from: number, to: number, level: string): unknown {
  const copy = structuredClone(body) as { routes: { legs: { annotation: { congestion: string[] } }[] }[] };
  const c = copy.routes[0].legs[0].annotation.congestion;
  for (let i = from; i < to; i++) c[i] = level;
  return copy;
}

/** det-aa with a synthetic jam on I-94 near Romulus (the recordings were made at midday). */
const jammed = jamBody(jamBody(fixtures['det-aa'].body, 560, 600, 'severe'), 600, 640, 'heavy');

/**
 * Fetch that answers from recorded fixtures, for `?demo=<name>` and tests.
 * `loading` never resolves. `det-aa-jam` serves the jammed base route,
 * then the recorded exclude and via responses for detour requests.
 */
export function demoFetch(name: string): FetchJson {
  return async (url) => {
    if (name === 'loading') return new Promise(() => {});
    if (url.includes('/searchbox/v1/suggest')) return fixtures['suggest-detroit-airp'];
    if (url.includes('/searchbox/v1/retrieve/')) return fixtures['retrieve-dtw'];
    if (name === 'det-aa-jam') {
      if (url.includes('exclude=')) return fixtures['det-aa-exclude'];
      if (url.includes('waypoints=')) return fixtures['det-aa-via'];
      return { status: 200, body: jammed };
    }
    const f = fixtures[name];
    if (!f) throw new Error(`no demo fixture "${name}"`);
    return f;
  };
}
