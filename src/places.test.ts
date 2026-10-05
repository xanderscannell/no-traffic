import { expect, test } from 'vitest';
import { loadSaved, memoryStore, SAVED_KEY, savedNameOf, savedPlace, storeSaved } from './places';

const home = { label: '123 Main St, Ann Arbor', coord: [-83.74, 42.28] as [number, number] };

test('saved places round-trip through storage', () => {
  const store = memoryStore();
  expect(loadSaved(store)).toEqual({});
  expect(storeSaved(store, { Home: home })).toBe(true);
  expect(loadSaved(store)).toEqual({ Home: home });
});

test('malformed storage loads as nothing saved', () => {
  const store = memoryStore();
  for (const bad of ['not json', 'null', '[]', '{"Home":{"label":"x","coord":[200,42]}}', '{"Home":{"coord":[-83,42]}}', '{"Home":{"label":"x","coord":["-83",42]}}']) {
    store.setItem(SAVED_KEY, bad);
    expect(loadSaved(store)).toEqual({});
  }
});

test('unknown names in storage are ignored', () => {
  const store = memoryStore();
  store.setItem(SAVED_KEY, JSON.stringify({ Home: home, Gym: home }));
  expect(loadSaved(store)).toEqual({ Home: home });
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

test('field text matches a saved name regardless of case and spaces', () => {
  expect(savedNameOf(' home ')).toBe('Home');
  expect(savedNameOf('Home Depot')).toBeNull();
  expect(savedPlace({ Home: home }, 'HOME')).toEqual({ label: 'Home', coord: home.coord });
  expect(savedPlace({}, 'Home')).toBeNull();
});
