import { avoidPoints, jamClusters, sameRoute, viaPoint } from './detour';
import { checkResponse, directionsUrl, MapboxError, parseDirections, type Coord, type FetchJson, type Route } from './mapbox';
import { rank, type Ranked } from './score';

export interface Plan {
  /** Every distinct candidate found, before the tolerance filter. */
  routes: Route[];
  ranked: Ranked[];
  fastest: Route;
  requests: number;
}

export async function plan(
  opts: { from: Coord; to: Coord; tolerance: number; token: string },
  fetchJson: FetchJson,
  maxRequests = 5,
): Promise<Plan> {
  const { from, to, token } = opts;
  let requests = 0;
  const get = async (url: string): Promise<Route[]> => {
    requests++;
    let res;
    try {
      res = await fetchJson(url);
    } catch (e) {
      throw new MapboxError('network', e instanceof Error ? e.message : String(e));
    }
    checkResponse(res.status, res.body);
    return parseDirections(res.body);
  };
  /** Adds routes not already known; true if any were new. Detour failures are dropped. */
  const tryDetour = async (url: string): Promise<boolean> => {
    if (requests >= maxRequests) return false;
    let found: Route[];
    try {
      found = await get(url);
    } catch {
      return false;
    }
    const fresh = found.filter((r) => !routes.some((known) => sameRoute(r, known)));
    routes.push(...fresh);
    return fresh.length > 0;
  };

  const routes = await get(directionsUrl({ from, to, token }));
  const clusters = rank(routes, opts.tolerance)
    .slice(0, 2)
    .flatMap(({ route }) => jamClusters(route).map((c) => ({ route, c })))
    .sort((a, b) => b.c.stopGo - a.c.stopGo);

  for (const { route, c } of clusters) {
    if (requests >= maxRequests) break;
    if (await tryDetour(directionsUrl({ from, to, token, exclude: avoidPoints(route, c) }))) continue;
    for (const side of [1, -1] as const) {
      if (await tryDetour(directionsUrl({ from, to, token, via: viaPoint(route, c, side) }))) break;
    }
  }

  const fastest = routes.reduce((a, b) => (b.duration < a.duration ? b : a));
  return { routes, ranked: rank(routes, opts.tolerance), fastest, requests };
}
