// Recorded Mapbox responses (see scripts/record-fixtures.mjs), keyed by file name.
export interface Fixture {
  recorded: string;
  status: number;
  body: unknown;
}

const files = import.meta.glob<Fixture>('../fixtures/*.json', { eager: true, import: 'default' });

export const fixtures: Record<string, Fixture> = Object.fromEntries(
  Object.entries(files).map(([path, f]) => [path.replace(/^.*\/(.*)\.json$/, '$1'), f]),
);
