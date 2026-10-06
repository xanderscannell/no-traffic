import { expect, test } from 'vitest';
import { loadSaved, memoryStore, nameProblem, SAVED_KEY, savedMatches, savedNameOf, savedNames, savedPlace, storeSaved, without, withSaved } from './places';

const home = { label: '123 Main St, Ann Arbor', coord: [-83.74, 42.28] as [number, number] };
const gym = { label: 'Planet Fitness, Ypsilanti', coord: [-83.61, 42.24] as [number, number] };

test('saved places round-trip through storage', () => {
  const store = memoryStore();
  expect(loadSaved(store)).toEqual({});
  expect(storeSaved(store, { Home: home, Gym: gym })).toBe(true);
  expect(loadSaved(store)).toEqual({ Home: home, Gym: gym });
});

test('a Home saved by the first version still loads', () => {
  const store = memoryStore();
  store.setItem(SAVED_KEY, '{"Home":{"label":"123 Main St, Ann Arbor","coord":[-83.74,42.28]}}');
  expect(loadSaved(store)).toEqual({ Home: home });
});

test('malformed storage loads as nothing saved', () => {
  const store = memoryStore();
  for (const bad of [
    'not json',
    'null',
    '[]',
    '[{"label":"x","coord":[-83,42]}]',
    '{"Home":null}',
    '{"Home":{"label":"x","coord":[200,42]}}',
    '{"Home":{"coord":[-83,42]}}',
    '{"Home":{"label":"x","coord":["-83",42]}}',
    '{"":{"label":"x","coord":[-83,42]}}',
    '{" Gym":{"label":"x","coord":[-83,42]}}',
    '{"My location":{"label":"x","coord":[-83,42]}}',
  ]) {
    store.setItem(SAVED_KEY, bad);
    expect(loadSaved(store), bad).toEqual({});
  }
});

test('storage that throws is survivable', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  expect(loadSaved(broken)).toEqual({});
  expect(storeSaved(broken, { Home: home })).toBe(false);
});

test('Home and Work come first, then the rest alphabetically', () => {
  // "10" would sort first as an object key; the list order must not depend on that.
  const places = { Zoo: gym, Gym: gym, Work: gym, '10': gym, Home: home };
  expect(savedNames(places)).toEqual(['Home', 'Work', '10', 'Gym', 'Zoo']);
  expect(savedNames({})).toEqual([]);
});

test('the dropdown offers every saved place, then those matching by name or address', () => {
  const places = { Gym: gym, Home: home, Work: { label: 'Ford Field, Detroit', coord: [-83.05, 42.34] as [number, number] } };
  expect(savedMatches(places, '')).toEqual(['Home', 'Work', 'Gym']);
  expect(savedMatches(places, ' GY')).toEqual(['Gym']);
  expect(savedMatches(places, 'main st')).toEqual(['Home']);
  expect(savedMatches(places, 'o')).toEqual(['Home', 'Work']);
  expect(savedMatches(places, 'zzz')).toEqual([]);
});

test('names that would clash with other inputs are refused', () => {
  expect(nameProblem("Mom's")).toBeNull();
  expect(nameProblem('  ')).toMatch(/name/);
  expect(nameProblem('x'.repeat(41))).toMatch(/40/);
  expect(nameProblem('x'.repeat(40))).toBeNull();
  expect(nameProblem('my location')).toMatch(/Use my location/);
  expect(nameProblem('42.3, -83.1')).toMatch(/coordinates/);
});

test('field text matches a saved name regardless of case and spaces', () => {
  const places = { Home: home, Gym: gym };
  expect(savedNameOf(places, ' home ')).toBe('Home');
  expect(savedNameOf(places, 'GYM')).toBe('Gym');
  expect(savedNameOf(places, 'Home Depot')).toBeNull();
  expect(savedPlace(places, 'HOME')).toEqual({ label: 'Home', coord: home.coord });
  expect(savedPlace({}, 'Home')).toBeNull();
});

test('saving replaces a same-named place in any case, and removing ignores case', () => {
  let places = withSaved({}, ' home ', gym);
  expect(places).toEqual({ Home: gym });
  places = withSaved(places, 'HOME', home);
  expect(places).toEqual({ Home: home });
  places = withSaved(places, 'gym', gym);
  places = withSaved(places, 'Gym', home);
  expect(places).toEqual({ Home: home, Gym: home });
  expect(without(places, 'GYM')).toEqual({ Home: home });
  expect(without(places, 'Work')).toEqual(places);
});

test('renaming moves the place to the new name and keeps its coordinates', () => {
  const places = { Home: home, Gym: gym };
  expect(withSaved(without(places, 'Gym'), 'Climbing', places.Gym)).toEqual({ Home: home, Climbing: gym });
  // Fixing only the case of a name keeps one entry.
  expect(withSaved(without(places, 'Gym'), 'GYM', places.Gym)).toEqual({ Home: home, GYM: gym });
});
