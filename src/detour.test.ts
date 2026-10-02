import { describe, expect, test } from 'vitest';
import { avoidPoints, divergence, jamClusters, sameRoute, viaPoint } from './detour';
import { fixtures } from './fixtures';
import { distanceToLine, haversine } from './geo';
import { parseDirections, type Route } from './mapbox';
import { withJam } from './test-helpers';

const [base] = parseDirections(fixtures['det-aa'].body);

/** First index j > i where the sum of `key` over segments [i, j) reaches `amount`. */
function advance(route: Route, i: number, key: 'duration' | 'distance', amount: number): number {
  let sum = 0;
  while (sum < amount) sum += route.segments[i++][key];
  return i;
}

/** Last index j >= i where the distance over segments [i, j) stays under `meters`. */
function advanceUnder(route: Route, i: number, meters: number): number {
  let sum = 0;
  while (sum + route.segments[i].distance < meters) sum += route.segments[i++].distance;
  return i;
}

describe('jamClusters', () => {
  const start = 560;
  const end1 = advance(base, start, 'duration', 70);

  test('the real midday recording has no clusters', () => {
    expect(jamClusters(base)).toEqual([]);
  });

  test('runs under 200 m apart merge', () => {
    const s2 = advanceUnder(base, end1, 190);
    expect(s2).toBeGreaterThan(end1);
    const route = withJam(withJam(base, start, end1, 'heavy'), s2, advance(base, s2, 'duration', 70), 'severe');
    const c = jamClusters(route);
    expect(c).toHaveLength(1);
    expect(c[0].start).toBe(start);
  });

  test('runs 300 m apart stay separate, largest first', () => {
    const s2 = advance(base, end1, 'distance', 300);
    const route = withJam(withJam(base, start, end1, 'heavy'), s2, advance(base, s2, 'duration', 70), 'severe');
    const c = jamClusters(route);
    expect(c).toHaveLength(2);
    expect(c[0].start).toBe(s2); // severe weighs more
    expect(c[1].start).toBe(start);
  });

  test('a 50 s jam is dropped', () => {
    expect(jamClusters(withJam(base, start, advance(base, start, 'duration', 50) - 1, 'heavy'))).toEqual([]);
  });
});

describe('detour points', () => {
  const end = advance(base, 560, 'duration', 90);
  const route = withJam(base, 560, end, 'heavy');
  const [cluster] = jamClusters(route);

  test('avoid points are on the route, inside the cluster', () => {
    const pts = avoidPoints(route, cluster);
    expect(pts).toHaveLength(2);
    const inside = route.coords.slice(cluster.start, cluster.end + 1);
    for (const p of pts) expect(distanceToLine(p, inside)).toBeLessThan(1);
  });

  test('via point is 1.5 km from the cluster middle, on either side', () => {
    const mid = route.coords[Math.floor((cluster.start + cluster.end) / 2)];
    const left = viaPoint(route, cluster, 1);
    const right = viaPoint(route, cluster, -1);
    expect(Math.abs(haversine(left, mid) - 1500)).toBeLessThan(50);
    expect(Math.abs(haversine(right, mid) - 1500)).toBeLessThan(50);
    expect(haversine(left, right)).toBeGreaterThan(2900);
  });
});

describe('sameRoute', () => {
  test('a route is the same as itself', () => {
    expect(divergence(base, base)).toBe(0);
    expect(sameRoute(base, base)).toBe(true);
  });

  test('the recorded exclude routes differ from the base', () => {
    for (const r of parseDirections(fixtures['det-aa-exclude'].body)) expect(sameRoute(r, base)).toBe(false);
  });

  test('a 1 km detour on a long route is still different', () => {
    // Shift a ~1 km stretch 200 m sideways: same shape, different road.
    const i = 560;
    const j = advance(base, i, 'distance', 1000);
    const shifted = { ...base, coords: base.coords.map((c, k) => (k > i && k < j ? ([c[0] + 0.003, c[1]] as [number, number]) : c)) };
    expect(sameRoute(shifted, base)).toBe(false);
  });
});
