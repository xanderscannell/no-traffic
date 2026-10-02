import { expect, test } from 'vitest';
import { fixtures } from './fixtures';
import { distanceToLine } from './geo';
import { googleMapsUrl } from './handoff';
import { parseDirections, type Coord } from './mapbox';

const origin: Coord = [-83.046668, 42.331852];
const dest: Coord = [-83.748741, 42.265884];
const [fastest] = parseDirections(fixtures['det-aa'].body);
const detours = parseDirections(fixtures['det-aa-exclude'].body);

const waypoints = (url: string): Coord[] =>
  (new URL(url).searchParams.get('waypoints') ?? '')
    .split('|')
    .filter(Boolean)
    .map((s) => s.split(',').map(Number).reverse() as Coord);

test('chosen is the fastest: no waypoints', () => {
  const u = new URL(googleMapsUrl(origin, dest, fastest, fastest));
  expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/');
  expect(u.searchParams.get('api')).toBe('1');
  expect(u.searchParams.get('travelmode')).toBe('driving');
  expect(u.searchParams.has('waypoints')).toBe(false);
});

test('origin and destination are lat,lng', () => {
  const u = new URL(googleMapsUrl(origin, dest, fastest, fastest));
  expect(u.searchParams.get('origin')).toBe('42.331852,-83.046668');
  expect(u.searchParams.get('destination')).toBe('42.265884,-83.748741');
});

test('a detour gets 1 to 3 waypoints on it, far from the fastest, in route order', () => {
  const counts: number[] = [];
  for (const chosen of detours) {
    const url = googleMapsUrl(origin, dest, chosen, fastest);
    expect(url).toContain('waypoints=');
    const pts = waypoints(url);
    if (pts.length > 1) expect(url).toContain('%7C'); // encoded |
    counts.push(pts.length);
    expect(pts.length).toBeGreaterThanOrEqual(1);
    expect(pts.length).toBeLessThanOrEqual(3);
    for (const p of pts) {
      expect(p[1]).toBeGreaterThan(41); // latitude came first in the URL
      expect(distanceToLine(p, chosen.coords)).toBeLessThan(1);
      expect(distanceToLine(p, fastest.coords)).toBeGreaterThan(300);
    }
    const order = pts.map((p) => chosen.coords.findIndex((c) => Math.abs(c[0] - p[0]) < 1e-6 && Math.abs(c[1] - p[1]) < 1e-6));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  }
  expect(Math.max(...counts)).toBeGreaterThan(1); // the separator case is exercised
});
