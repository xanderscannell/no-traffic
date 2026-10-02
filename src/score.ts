import type { Congestion, Route } from './mapbox';

/** Seconds of stop-and-go counted per second driven at each congestion level. */
export const WEIGHTS: Record<Congestion, number> = { unknown: 0, low: 0, moderate: 0.25, heavy: 1, severe: 1.5 };

export interface Ranked {
  route: Route;
  /** Weighted seconds spent in stop-and-go traffic. */
  stopGo: number;
  /** Seconds slower than the fastest candidate. */
  extra: number;
}

export function stopGoSeconds(route: Route): number {
  return route.segments.reduce((sum, s) => sum + s.duration * (WEIGHTS[s.congestion] ?? 0), 0);
}

/** Stop-and-go differences smaller than this are a tie, so the quicker route wins. */
export const TIE_SECONDS = 60;

/** Routes within `fastest * (1 + tolerance)`, calmest first, then quickest. */
export function rank(routes: Route[], tolerance: number): Ranked[] {
  if (!routes.length) return [];
  const fastest = Math.min(...routes.map((r) => r.duration));
  const limit = fastest * (1 + tolerance);
  const kept = routes.filter((r) => r.duration <= limit).map((route) => ({ route, stopGo: stopGoSeconds(route), extra: route.duration - fastest }));
  // Everything within a minute of the calmest shares one sort key, then sorts by duration.
  const floor = Math.min(...kept.map((r) => r.stopGo)) + TIE_SECONDS;
  const key = (r: Ranked) => Math.max(r.stopGo, floor);
  return kept.sort((a, b) => key(a) - key(b) || a.route.duration - b.route.duration);
}
