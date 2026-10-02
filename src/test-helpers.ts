import type { Congestion, Route } from './mapbox';

/** Copy of `route` with congestion on segments [from, to) set to `level`. */
export function withJam(route: Route, from: number, to: number, level: Congestion): Route {
  return {
    ...route,
    segments: route.segments.map((s, i) => (i >= from && i < to ? { ...s, congestion: level } : s)),
  };
}

/** A straight synthetic route of equal one-second segments, all at `level`. */
export function flatRoute(seconds: number, level: Congestion = 'low'): Route {
  const segments = Array.from({ length: seconds }, () => ({ duration: 1, distance: 10, congestion: level }));
  return {
    coords: Array.from({ length: seconds + 1 }, (_, i) => [-83 + i * 0.0001, 42] as [number, number]),
    segments,
    duration: seconds,
    distance: seconds * 10,
    summary: '',
  };
}
