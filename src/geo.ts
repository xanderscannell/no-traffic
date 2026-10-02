import type { Coord } from './mapbox';

const R = 6371008.8; // mean Earth radius, meters
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: Coord, b: Coord): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Local flat projection around `origin`, in meters. Accurate over a few km. */
function project(p: Coord, origin: Coord): [number, number] {
  return [rad(p[0] - origin[0]) * R * Math.cos(rad(origin[1])), rad(p[1] - origin[1]) * R];
}

export function unproject(xy: [number, number], origin: Coord): Coord {
  return [origin[0] + (xy[0] / (R * Math.cos(rad(origin[1])))) * (180 / Math.PI), origin[1] + (xy[1] / R) * (180 / Math.PI)];
}

/** Shortest distance in meters from `p` to the polyline `line`. */
export function distanceToLine(p: Coord, line: Coord[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = project(line[i], p);
    const [bx, by] = project(line[i + 1], p);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Point `meters` to the left (side 1) or right (side -1) of the direction a -> b, from `at`. */
export function offsetSideways(at: Coord, a: Coord, b: Coord, meters: number, side: 1 | -1): Coord {
  const [dx, dy] = project(b, a);
  const len = Math.hypot(dx, dy) || 1;
  return unproject([(-dy / len) * meters * side, (dx / len) * meters * side], at);
}
