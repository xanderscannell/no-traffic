import { describe, expect, test } from 'vitest';
import { demoFetch, jamBody } from './demo';
import { fixtures } from './fixtures';
import { MapboxError, parseDirections, type FetchJson } from './mapbox';
import { plan } from './planner';
import { stopGoSeconds } from './score';

const opts = { from: [-83.046668, 42.331852] as [number, number], to: [-83.748741, 42.265884] as [number, number], tolerance: 0.25, token: 't' };

/** Wraps a fetch to record the URLs it was asked for. */
function counting(inner: FetchJson) {
  const urls: string[] = [];
  const f: FetchJson = (url) => {
    urls.push(url);
    return inner(url);
  };
  return { f, urls };
}

/** The recorded det-aa body with every heavy/severe segment set to low. */
function withoutJams(body: unknown): unknown {
  const copy = structuredClone(body) as { routes: { legs: { annotation: { congestion: string[] } }[] }[] };
  for (const r of copy.routes) for (const l of r.legs) l.annotation.congestion = l.annotation.congestion.map((c) => (c === 'heavy' || c === 'severe' ? 'low' : c));
  return copy;
}
const baseRoutes = parseDirections(fixtures['det-aa'].body).length;

const errorOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as MapboxError;
  }
  throw new Error('expected a rejection');
};

describe('plan', () => {
  test('no jams: exactly one request', async () => {
    const body = withoutJams(fixtures['det-aa'].body);
    const { f, urls } = counting(() => Promise.resolve({ status: 200, body }));
    const p = await plan(opts, f);
    expect(urls).toHaveLength(1);
    expect(p.requests).toBe(1);
    expect(p.ranked).toHaveLength(baseRoutes);
    expect(p.ranked[0].route).toBe(p.fastest);
  });

  test('a jam triggers detours and the calmest route beats the jammed base', async () => {
    const { f, urls } = counting(demoFetch('det-aa-jam'));
    const p = await plan(opts, f);
    expect(urls.length).toBeGreaterThanOrEqual(2);
    expect(urls.length).toBeLessThanOrEqual(5);
    expect(urls[1]).toContain('exclude=point(');
    const jammedBase = p.fastest;
    expect(stopGoSeconds(jammedBase)).toBeGreaterThan(60);
    expect(p.ranked[0].route).not.toBe(jammedBase);
    expect(p.ranked[0].stopGo).toBeLessThan(stopGoSeconds(jammedBase));
  });

  test('base request errors are thrown with their kind', async () => {
    expect((await errorOf(plan(opts, demoFetch('error-401')))).kind).toBe('auth');
    const offline: FetchJson = () => Promise.reject(new TypeError('Failed to fetch'));
    expect((await errorOf(plan(opts, offline))).kind).toBe('network');
  });

  test('a failing detour still returns the base routes', async () => {
    const jam = demoFetch('det-aa-jam');
    const { f, urls } = counting((url) => (url.includes('exclude=') || url.includes('waypoints=') ? Promise.resolve({ status: 500, body: {} }) : jam(url)));
    const p = await plan(opts, f);
    expect(urls.length).toBeGreaterThan(1);
    expect(p.ranked).toHaveLength(baseRoutes);
  });

  test('never more than 5 requests, even with many jams and useless detours', async () => {
    let body = fixtures['det-aa'].body;
    for (let k = 0; k < 6; k++) body = jamBody(body, 40 + k * 80, 75 + k * 80, 'severe');
    const { f, urls } = counting(() => Promise.resolve({ status: 200, body }));
    const p = await plan(opts, f);
    expect(urls).toHaveLength(5);
    expect(p.requests).toBe(5);
    expect(p.ranked).toHaveLength(baseRoutes); // every detour came back as the same routes
  });
});
