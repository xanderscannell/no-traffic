import { distanceToLine, offsetSideways } from './geo';
import type { Coord, Route } from './mapbox';
import { WEIGHTS } from './score';

export interface Cluster {
  /** Segment range [start, end). */
  start: number;
  end: number;
  stopGo: number;
}

const isJam = (c: string) => c === 'heavy' || c === 'severe';

/** Heavy/severe stretches, merged across gaps under `mergeGap` meters, largest first. */
export function jamClusters(route: Route, minStopGo = 60, mergeGap = 200): Cluster[] {
  const runs: { start: number; end: number }[] = [];
  route.segments.forEach((s, i) => {
    if (!isJam(s.congestion)) return;
    const last = runs.at(-1);
    if (last && last.end === i) last.end = i + 1;
    else runs.push({ start: i, end: i + 1 });
  });
  const merged: { start: number; end: number }[] = [];
  for (const run of runs) {
    const last = merged.at(-1);
    const gap = last ? route.segments.slice(last.end, run.start).reduce((m, s) => m + s.distance, 0) : Infinity;
    if (last && gap < mergeGap) last.end = run.end;
    else merged.push({ ...run });
  }
  return merged
    .map((c) => ({
      ...c,
      stopGo: route.segments.slice(c.start, c.end).reduce((t, s) => t + s.duration * WEIGHTS[s.congestion], 0),
    }))
    .filter((c) => c.stopGo >= minStopGo)
    .sort((a, b) => b.stopGo - a.stopGo);
}

/** Up to 2 route coordinates inside the cluster, for Mapbox `exclude=point(...)`. */
export function avoidPoints(route: Route, c: Cluster): Coord[] {
  const n = c.end - c.start;
  const idx = n < 3 ? [c.start + Math.floor(n / 2)] : [c.start + Math.floor(n / 3), c.start + Math.floor((2 * n) / 3)];
  return idx.map((i) => route.coords[i]);
}

/** A point `meters` to one side of the cluster's middle, for a silent via. */
export function viaPoint(route: Route, c: Cluster, side: 1 | -1, meters = 1500): Coord {
  const mid = Math.floor((c.start + c.end) / 2);
  return offsetSideways(route.coords[mid], route.coords[c.start], route.coords[c.end], meters, side);
}

/** Meters of `a` that run more than 30 m away from `b`. */
export function divergence(a: Route, b: Route): number {
  return a.segments.reduce((m, s, i) => {
    const [p, q] = [a.coords[i], a.coords[i + 1]];
    const mid: Coord = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    return distanceToLine(mid, b.coords) > 30 ? m + s.distance : m;
  }, 0);
}

/** Two routes are the same if each strays from the other for under 300 m in total. */
export function sameRoute(a: Route, b: Route): boolean {
  return divergence(a, b) < 300 && divergence(b, a) < 300;
}
