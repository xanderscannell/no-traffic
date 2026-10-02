import { expect, test } from 'vitest';
import { fixtures } from './fixtures';
import { newSession, parseLatLng, parseRetrieve, parseSuggest, retrieveUrl, shortLabel, suggestUrl } from './search';

test('"detroit airp" suggests the airport first, with readable details', () => {
  const s = parseSuggest(fixtures['suggest-detroit-airp'].body);
  expect(s).toHaveLength(5);
  expect(s[0].name).toBe('Detroit Metropolitan Airport');
  expect(s[0].detail).toBe('Detroit, Michigan 48242');
  expect(s[0].id).toMatch(/\S{10,}/);
  // A street address loses the repeated name and the country.
  expect(s[1].detail).toBe('7680 Merriman Rd, Romulus, Michigan 48174');
  expect(shortLabel(s[0])).toBe('Detroit Metropolitan Airport, Detroit');
  // A place with a street address still shows its town, not the street.
  expect(shortLabel({ id: 'x', name: 'Campus Martius', detail: '800 Woodward Avenue, Detroit, Michigan 48226' })).toBe('Campus Martius, Detroit');
  expect(shortLabel({ id: 'x', name: 'Michigan', detail: 'United States' })).toBe('Michigan, United States');
});

test('an address suggestion drops its repeated name', () => {
  const [s] = parseSuggest({
    suggestions: [{ mapbox_id: 'x', name: '1300 South Main Street', full_address: '1300 South Main Street, Ann Arbor, Michigan 48104, United States' }],
  });
  expect(s.detail).toBe('Ann Arbor, Michigan 48104');
  expect(shortLabel(s)).toBe('1300 South Main Street, Ann Arbor');
});

test('no suggestions', () => {
  expect(parseSuggest({ suggestions: [] })).toEqual([]);
  expect(parseSuggest({})).toEqual([]);
  expect(shortLabel({ id: 'x', name: 'Ann Arbor', detail: '' })).toBe('Ann Arbor');
});

test('retrieve gives the airport coordinates', () => {
  expect(parseRetrieve(fixtures['retrieve-dtw'].body)).toEqual({ label: 'Detroit Metropolitan Airport', coord: [-83.3568429, 42.2081265] });
  expect(parseRetrieve({ features: [] })).toBeNull();
});

test('urls carry the session, proximity, and token last', () => {
  const u = suggestUrl('Main St & Stadium', { proximity: [-83.05, 42.33], session: 's1', token: 'pk.t' });
  expect(u).toContain('/searchbox/v1/suggest?q=Main%20St%20%26%20Stadium&');
  expect(u).toContain('session_token=s1');
  expect(u).toContain('proximity=-83.05,42.33');
  expect(u.endsWith('&access_token=pk.t')).toBe(true);
  expect(suggestUrl('x', { proximity: 'ip', session: 's', token: 't' })).toContain('proximity=ip');
  expect(retrieveUrl('dXJuOm1ieHBvaTo=', { session: 's1', token: 't' })).toBe(
    'https://api.mapbox.com/search/searchbox/v1/retrieve/dXJuOm1ieHBvaTo%3D?session_token=s1&access_token=t',
  );
});

test('typed lat,lng pairs', () => {
  expect(parseLatLng('42.331852, -83.046668')).toEqual([-83.046668, 42.331852]);
  expect(parseLatLng(' 42,-83 ')).toEqual([-83, 42]);
  expect(parseLatLng('Ann Arbor, MI')).toBeNull();
  expect(parseLatLng('42.1')).toBeNull();
  expect(parseLatLng('95, -83')).toBeNull();
  expect(parseLatLng('42, -183')).toBeNull();
});

test('session tokens are distinct v4 UUIDs', () => {
  const a = newSession();
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(newSession()).not.toBe(a);
});
