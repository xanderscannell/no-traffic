// Records live Mapbox responses into fixtures/ for offline tests and demo mode.
// Usage: node scripts/record-fixtures.mjs [name ...]   (reads VITE_MAPBOX_TOKEN from .env.local)
// With names, only those fixtures are re-recorded. Several tests pin values from
// the current recordings, so re-recording everything means updating those tests.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const token = readFileSync('.env.local', 'utf8').match(/VITE_MAPBOX_TOKEN=(\S+)/)[1];
const DETROIT = '-83.046668,42.331852'; // Campus Martius
const ANN_ARBOR = '-83.748741,42.265884'; // Michigan Stadium
const DIR = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/';
const OPTS = 'alternatives=true&overview=full&geometries=geojson&annotations=congestion,congestion_numeric,duration,distance';
const SEARCH = 'https://api.mapbox.com/search/searchbox/v1/';
// Any fixed UUID works; it only groups requests for billing.
const SESSION = 'session_token=7d3c1a52-9b8e-4f0a-a6d2-5c4e8b1f0a93';

const recorded = {};
/** Each entry builds its URL, possibly from an earlier recording. */
const fixtures = {
  'det-aa': () => `${DIR}${DETROIT};${ANN_ARBOR}?${OPTS}`,
  'aa-det': () => `${DIR}${ANN_ARBOR};${DETROIT}?${OPTS}`,
  // Two points on I-94 westbound from the det-aa route.
  'det-aa-exclude': () => `${DIR}${DETROIT};${ANN_ARBOR}?${OPTS}&exclude=point(-83.359307%2042.234969),point(-83.39754%2042.225437)`,
  // Silent via on Michigan Ave (US-12), which parallels I-94.
  'det-aa-via': () => `${DIR}${DETROIT};-83.386,42.2814;${ANN_ARBOR}?${OPTS}&waypoints=0;2`,
  'suggest-detroit-airp': () => `${SEARCH}suggest?q=detroit%20airp&country=us&limit=5&proximity=${DETROIT}&${SESSION}`,
  // The first suggestion above (Detroit Metropolitan Airport).
  'retrieve-dtw': () => `${SEARCH}retrieve/${encodeURIComponent(recorded['suggest-detroit-airp'].suggestions[0].mapbox_id)}?${SESSION}`,
};

const only = process.argv.slice(2);
mkdirSync('fixtures', { recursive: true });
for (const [name, url] of Object.entries(fixtures)) {
  if (only.length && !only.includes(name)) {
    // Later entries may build their URL from this one's saved recording.
    if (existsSync(`fixtures/${name}.json`)) recorded[name] = JSON.parse(readFileSync(`fixtures/${name}.json`, 'utf8')).body;
    continue;
  }
  const res = await fetch(`${url()}&access_token=${token}`, { signal: AbortSignal.timeout(20000) });
  const body = await res.text();
  if (body.includes(token)) throw new Error(`${name}: response contains the token`);
  recorded[name] = JSON.parse(body);
  writeFileSync(`fixtures/${name}.json`, JSON.stringify({ recorded: new Date().toISOString(), status: res.status, body: recorded[name] }, null, 1));
  console.log(res.status, name);
}
if (!only.length || only.includes('error-401')) {
  const bad = await fetch(`${DIR}${DETROIT};${ANN_ARBOR}?${OPTS}&access_token=pk.invalid`, { signal: AbortSignal.timeout(20000) });
  writeFileSync('fixtures/error-401.json', JSON.stringify({ recorded: new Date().toISOString(), status: bad.status, body: await bad.json() }, null, 1));
  console.log(bad.status, 'error-401');
}
