import { expect, test } from 'vitest';
import { rank, stopGoSeconds } from './score';
import { flatRoute, withJam } from './test-helpers';
import type { Congestion } from './mapbox';

test('stop-and-go seconds by level', () => {
  expect(stopGoSeconds(flatRoute(300))).toBe(0);
  expect(stopGoSeconds(withJam(flatRoute(300), 10, 130, 'heavy'))).toBe(120);
  expect(stopGoSeconds(withJam(flatRoute(300), 0, 100, 'severe'))).toBe(150);
  expect(stopGoSeconds(withJam(flatRoute(300), 0, 100, 'moderate'))).toBe(25);
  expect(stopGoSeconds(flatRoute(300, 'unknown'))).toBe(0);
  expect(stopGoSeconds(flatRoute(300, 'gridlock' as Congestion))).toBe(0);
});

test('tolerance boundary is inclusive', () => {
  const fastest = withJam(flatRoute(1000), 0, 500, 'heavy');
  const ok = flatRoute(1250);
  const tooSlow = flatRoute(1251);
  const ranked = rank([fastest, ok, tooSlow], 0.25);
  expect(ranked.map((r) => r.route)).toEqual([ok, fastest]);
  expect(ranked[0].extra).toBe(250);
  expect(ranked[1].extra).toBe(0);
});

test('equal stop-and-go sorts by duration', () => {
  const a = flatRoute(1100);
  const b = flatRoute(1050);
  expect(rank([a, b], 0.5).map((r) => r.route)).toEqual([b, a]);
});

test('tolerance 0 keeps only the fastest, and the fastest is always kept', () => {
  const fastest = withJam(flatRoute(1000), 0, 900, 'severe');
  const ranked = rank([flatRoute(1001), fastest], 0);
  expect(ranked.map((r) => r.route)).toEqual([fastest]);
});

test('no routes gives no ranking', () => {
  expect(rank([], 0.25)).toEqual([]);
});

test('under a minute of stop-and-go difference is a tie: the quicker route wins', () => {
  const quick = withJam(flatRoute(1100), 0, 40, 'moderate'); // 10 s stop-and-go
  const slowCalm = flatRoute(1150); // 0 s
  expect(rank([slowCalm, quick], 0.25).map((r) => r.route)).toEqual([quick, slowCalm]);
});

test('a minute or more of difference still wins over speed', () => {
  const quick = withJam(flatRoute(1100), 0, 61, 'heavy'); // 61 s
  const slowCalm = flatRoute(1150);
  expect(rank([quick, slowCalm], 0.25).map((r) => r.route)).toEqual([slowCalm, quick]);
});
