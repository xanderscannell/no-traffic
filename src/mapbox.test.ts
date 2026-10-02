import { describe, expect, test } from 'vitest';
import { checkResponse, directionsUrl, MapboxError, parseDirections } from './mapbox';
import { fixtures } from './fixtures';

const kindOf = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return (e as MapboxError).kind;
  }
  return 'none';
};

describe('parseDirections', () => {
  test('det-aa: two routes, segments match annotations, durations sum', () => {
    const [r, ...rest] = parseDirections(fixtures['det-aa'].body);
    expect(rest).toHaveLength(1);
    expect(r.segments).toHaveLength(1113);
    expect(r.coords).toHaveLength(1114);
    const sum = r.segments.reduce((a, s) => a + s.duration, 0);
    expect(sum).toBeCloseTo(r.duration, 0);
    expect(r.summary).toMatch(/I 94 West/);
  });

  test('aa-det has two routes', () => {
    expect(parseDirections(fixtures['aa-det'].body)).toHaveLength(2);
  });

  test('two legs concatenate in order', () => {
    const body = structuredClone(fixtures['det-aa'].body) as {
      routes: { legs: { annotation: Record<string, unknown[]> }[] }[];
    };
    const leg = body.routes[0].legs[0];
    const cut = 200;
    const split = (k: string, a: boolean) => (a ? leg.annotation[k].slice(0, cut) : leg.annotation[k].slice(cut));
    const keys = ['duration', 'distance', 'congestion'];
    body.routes[0].legs = [true, false].map((a) => ({ annotation: Object.fromEntries(keys.map((k) => [k, split(k, a)])) }));
    const whole = parseDirections(fixtures['det-aa'].body)[0];
    const joined = parseDirections(body)[0];
    expect(joined.segments).toEqual(whole.segments);
  });

  test('unrecognized congestion strings become unknown', () => {
    const body = structuredClone(fixtures['det-aa'].body) as {
      routes: { legs: { annotation: { congestion: string[] } }[] }[];
    };
    body.routes[0].legs[0].annotation.congestion[0] = 'gridlock';
    expect(parseDirections(body)[0].segments[0].congestion).toBe('unknown');
  });

  test('NoRoute body throws noroute', () => {
    expect(kindOf(() => parseDirections({ code: 'NoRoute', message: 'x' }))).toBe('noroute');
  });
});

describe('directionsUrl', () => {
  const from: [number, number] = [-83.046668, 42.331852];
  const to: [number, number] = [-83.748741, 42.265884];

  test('plain request', () => {
    const u = directionsUrl({ from, to, token: 'pk.test' });
    expect(u).toContain('/mapbox/driving-traffic/-83.046668,42.331852;-83.748741,42.265884?');
    expect(u).toContain('alternatives=true');
    expect(u).not.toContain('waypoints=');
    expect(u).not.toContain('exclude=');
    expect(u.endsWith('&access_token=pk.test')).toBe(true);
  });

  test('exclude points are lng%20lat', () => {
    const u = directionsUrl({ from, to, token: 't', exclude: [[-83.2, 42.2], [-83.1, 42.3]] });
    expect(u).toContain('exclude=point(-83.2%2042.2),point(-83.1%2042.3)');
    expect(u.endsWith('&access_token=t')).toBe(true);
  });

  test('via is a silent middle waypoint', () => {
    const u = directionsUrl({ from, to, token: 't', via: [-83.386, 42.2814] });
    expect(u).toContain('-83.046668,42.331852;-83.386,42.2814;-83.748741,42.265884?');
    expect(u).toContain('waypoints=0;2');
  });
});

describe('checkResponse', () => {
  test('error kinds', () => {
    const f = fixtures['error-401'];
    expect(kindOf(() => checkResponse(f.status, f.body))).toBe('auth');
    expect(kindOf(() => checkResponse(429, { message: 'Too Many Requests' }))).toBe('rate');
    expect(kindOf(() => checkResponse(200, { code: 'NoRoute' }))).toBe('noroute');
    expect(kindOf(() => checkResponse(500, {}))).toBe('other');
    expect(kindOf(() => checkResponse(200, fixtures['det-aa'].body))).toBe('none');
  });
});
