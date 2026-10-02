import { expect, test } from 'vitest';
import { distanceToLine, haversine, offsetSideways } from './geo';

test('one degree of latitude is about 111.2 km', () => {
  expect(Math.abs(haversine([-83, 42], [-83, 43]) - 111200)).toBeLessThan(500);
});

test('distance to a line', () => {
  const line: [number, number][] = [[-83, 42], [-83, 42.01]];
  expect(distanceToLine([-83, 42.005], line)).toBeLessThan(0.01);
  const d = distanceToLine(offsetSideways([-83, 42.005], line[0], line[1], 500, 1), line);
  expect(Math.abs(d - 500)).toBeLessThan(1);
});

test('offset sideways: left of northbound is west', () => {
  const p = offsetSideways([-83, 42], [-83, 42], [-83, 42.01], 1000, 1);
  expect(p[0]).toBeLessThan(-83);
  expect(Math.abs(haversine(p, [-83, 42]) - 1000)).toBeLessThan(1);
});
