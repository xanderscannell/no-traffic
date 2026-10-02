import './style.css';
import { combobox } from './combobox';
import { googleMapsUrl } from './handoff';
import { createMap } from './map';
import { checkResponse, MapboxError, type Coord, type FetchJson } from './mapbox';
import { plan, type Plan } from './planner';
import { rank, stopGoSeconds, TIE_SECONDS, type Ranked } from './score';
import { newSession, parseLatLng, parseRetrieve, parseSuggest, retrieveUrl, shortLabel, suggestUrl, type Place, type Suggestion } from './search';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const form = $<HTMLFormElement>('#search');
const toleranceInput = $<HTMLInputElement>('#tolerance');
const toleranceOut = $<HTMLOutputElement>('#tolerance-out');
const statusEl = $<HTMLDivElement>('#status');
const resultsEl = $<HTMLOListElement>('#results');
const resetBtn = $<HTMLButtonElement>('#reset');
const whereEl = $<HTMLDivElement>('#where');
const goBtn = $<HTMLButtonElement>('#go');
const tripEl = $<HTMLParagraphElement>('#trip');
const fromInput = $<HTMLInputElement>('input[name=from]');
const toInput = $<HTMLInputElement>('input[name=to]');
const gmapsLink = $<HTMLAnchorElement>('#gmaps');
const setupEl = $<HTMLElement>('#setup');
const hereBtn = $<HTMLButtonElement>('#here');
const fromHint = $<HTMLElement>('#from-hint');

const params = new URLSearchParams(location.search);
const demo = params.get('demo');
if (demo && params.has('tolerance')) toleranceInput.value = params.get('tolerance')!;

type View =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'results'; plan: Plan; ranked: Ranked[]; selected: number; from: Coord; to: Coord }
  | { kind: 'error'; error: unknown };
let view: View = { kind: 'empty' };
/** Bumped by every new search or reset, so a stale search never renders. */
let searchId = 0;

const token: string | null = demo ? null : import.meta.env.VITE_MAPBOX_TOKEN || null;
const needsSetup = demo === 'notoken' || (!demo && !token);
setupEl.hidden = !needsSetup;
form.hidden = needsSetup;
/** The trip as shown in the collapsed line: typed text, then resolved place names. */
let trip: [string, string] = ['', ''];
const map = createMap($('#map'), token, (i) => select(i));
/** The plan the map was last fitted to, so selecting a route does not re-zoom. */
let fittedTo: Plan | null = null;

function select(i: number) {
  if (view.kind !== 'results') return;
  view = { ...view, selected: i };
  render();
}

// Tolerance slider, remembered per browser.
const TOLERANCE_KEY = 'no-traffic.tolerance';
try {
  const saved = localStorage.getItem(TOLERANCE_KEY);
  if (saved !== null && !(demo && params.has('tolerance'))) toleranceInput.value = saved;
} catch {
  /* storage unavailable: keep the default */
}
const tolerance = () => Number(toleranceInput.value) / 100;
const showTolerance = () => (toleranceOut.value = `+${toleranceInput.value}%`);
showTolerance();
toleranceInput.addEventListener('input', () => {
  showTolerance();
  try {
    localStorage.setItem(TOLERANCE_KEY, toleranceInput.value);
  } catch {
    /* ignore */
  }
  if (view.kind === 'results') {
    view = { ...view, ranked: rank(view.plan.routes, tolerance()), selected: 0 };
    render();
  }
});

const minutes = (s: number) => Math.round(s / 60);

const ERRORS: Record<string, string> = {
  auth: 'Mapbox rejected the access token. Check VITE_MAPBOX_TOKEN in .env.local and restart the dev server.',
  rate: 'Too many requests to Mapbox right now. Wait a minute and try again.',
  network: "Couldn't reach Mapbox. Check your internet connection and try again.",
  noroute: 'No driving route found between those places.',
};
function errorMessage(e: unknown): string {
  if (e instanceof MapboxError && e.kind === 'notfound') return e.message;
  return (e instanceof MapboxError && ERRORS[e.kind]) || `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;
}

/** One-line verdict shown above the route list. */
function summary(p: Plan, ranked: Ranked[]): string {
  const best = ranked[0];
  if (best.route !== p.fastest) {
    const saved = minutes(stopGoSeconds(p.fastest) - best.stopGo);
    return `Found a calmer way: about ${saved} min less stop-and-go for ${minutes(best.extra)} extra min of driving.`;
  }
  const calmer = rank(p.routes, Infinity).filter((r) => r.stopGo < best.stopGo - TIE_SECONDS);
  if (calmer.length) {
    const c = calmer[0];
    return `Calmer routes exist but are ${minutes(c.extra)} min slower, past your +${toleranceInput.value}% limit. Raise the limit to see them.`;
  }
  return best.stopGo < 30 ? 'Good news: the fastest route is already the calmest.' : 'The fastest route is also the calmest one available.';
}

function card(r: Ranked, i: number, p: Plan, selected: boolean): HTMLLIElement {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'card';
  btn.setAttribute('aria-pressed', String(selected));
  const stopGo = minutes(r.stopGo);
  const alone = view.kind === 'results' && view.ranked.length === 1;
  const badges = [i === 0 && !alone ? 'Calmest' : '', r.route === p.fastest ? 'Fastest' : ''].filter(Boolean);
  btn.innerHTML = `
    <span class="top">
      <span class="time">${minutes(r.route.duration)} min</span>
      <span class="extra">${r.extra < 30 ? '' : `+${minutes(r.extra)} min vs fastest`}</span>
      ${badges.map((b) => `<span class="badge">${b}</span>`).join('')}
    </span>
    <span class="stopgo${stopGo >= 1 ? ' bad' : ''}">${stopGo < 1 ? 'No stop-and-go' : `${stopGo} min of stop-and-go`}</span>
    <span class="via"></span>`;
  btn.querySelector('.via')!.textContent = r.route.summary ? `via ${r.route.summary}` : '';
  btn.addEventListener('click', () => select(i));
  li.append(btn);
  return li;
}

function render() {
  const busy = view.kind === 'loading';
  // After a search, From/To collapse into one trip line so results fit on a phone.
  const collapsed = view.kind !== 'empty';
  whereEl.hidden = collapsed;
  goBtn.hidden = collapsed;
  tripEl.hidden = !collapsed;
  tripEl.replaceChildren(trip[0], Object.assign(document.createElement('span'), { className: 'arrow', textContent: ' to ' }), trip[1]);
  statusEl.className = 'status';
  statusEl.textContent = '';
  resultsEl.replaceChildren();
  resetBtn.hidden = view.kind === 'empty';
  resetBtn.textContent = busy ? 'Cancel' : 'New search';
  gmapsLink.hidden = view.kind !== 'results';
  if (view.kind !== 'results') map.clear();

  if (view.kind === 'loading') {
    statusEl.classList.add('loading');
    statusEl.textContent = 'Checking traffic on every route…';
  } else if (view.kind === 'error') {
    statusEl.classList.add('error');
    statusEl.textContent = errorMessage(view.error);
  } else if (view.kind === 'results') {
    const { plan: p, ranked, selected } = view;
    statusEl.textContent = summary(p, ranked);
    resultsEl.replaceChildren(...ranked.map((r, i) => card(r, i, p, i === selected)));
    const chosen = ranked[selected].route;
    gmapsLink.href = googleMapsUrl(view.from, view.to, chosen, p.fastest);
    map.draw(
      ranked.map((r) => r.route),
      selected,
      [view.from, view.to],
      fittedTo !== p,
    );
    fittedTo = p;
  }
}

const MY_LOCATION = 'My location';
/** Last position from "Use my location", used while From says "My location". */
let here: Coord | null = null;
/** Demo searches use fixed places so they match the recorded routes. */
const DEMO_PLACES: Record<string, Coord> = {
  'Campus Martius, Detroit': [-83.046668, 42.331852],
  'Michigan Stadium, Ann Arbor': [-83.748741, 42.265884],
};

/** Fetch that throws MapboxError for network and HTTP failures. */
async function getJson(url: string, fetchJson: FetchJson): Promise<unknown> {
  let res;
  try {
    res = await fetchJson(url);
  } catch (e) {
    throw new MapboxError('network', e instanceof Error ? e.message : String(e));
  }
  checkResponse(res.status, res.body);
  return res.body;
}

/** Per-field autocomplete state. One Search Box session per field, renewed after each pick. */
interface Field {
  input: HTMLInputElement;
  session: string;
  /** The row the user chose, and its coordinates (fetched as soon as it is chosen). */
  picked: { name: string; place: Promise<Place> } | null;
}
const fields: Record<'from' | 'to', Field> = {
  from: { input: fromInput, session: newSession(), picked: null },
  to: { input: toInput, session: newSession(), picked: null },
};

/** Fixture-backed fetch for `?demo=`. Loaded on demand so the recordings stay out of the main bundle. */
const demoFetch =
  (name: string): FetchJson =>
  async (url) =>
    (await import('./demo')).demoFetch(name)(url);

const plainFetch: FetchJson = async (url) => {
  const r = await fetch(url);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

async function suggest(q: string, f: Field, fetchJson: FetchJson): Promise<Suggestion[]> {
  const body = await getJson(suggestUrl(q, { proximity: here ?? 'ip', session: f.session, token: token ?? '' }), fetchJson);
  return parseSuggest(body);
}

async function retrieve(s: Suggestion, f: Field, fetchJson: FetchJson): Promise<Place> {
  const body = await getJson(retrieveUrl(s.id, { session: f.session, token: token ?? '' }), fetchJson);
  f.session = newSession(); // a retrieve ends the billing session
  const place = parseRetrieve(body);
  if (!place) throw new MapboxError('notfound', `Couldn't look up "${s.name}". Try another suggestion.`);
  return { label: shortLabel(s), coord: place.coord };
}

for (const f of Object.values(fields)) {
  combobox(f.input, {
    // Typed coordinates are used as-is, so there is nothing to look up.
    suggest: (q) => (parseLatLng(q) ? Promise.resolve([]) : suggest(q, f, demo ? demoFetch(demo) : plainFetch)),
    pick: (s) => {
      const place = retrieve(s, f, demo ? demoFetch(demo) : plainFetch);
      place.catch(() => {}); // reported when a search awaits it
      f.picked = { name: s.name, place };
    },
    edited: () => (f.picked = null),
  });
}

/** Turns a field into a place: my location, a typed lat,lng, the picked suggestion, or else the top suggestion. */
async function resolve(f: Field, fetchJson: FetchJson): Promise<Place> {
  const t = f.input.value.trim();
  if (demo && DEMO_PLACES[t]) return { label: t, coord: DEMO_PLACES[t] };
  if (t === MY_LOCATION && here) return { label: MY_LOCATION, coord: here };
  const typed = parseLatLng(t);
  if (typed) return { label: t, coord: typed };
  if (f.picked && f.picked.name === t) return f.picked.place;
  const [top] = await suggest(t, f, fetchJson);
  if (!top) throw new MapboxError('notfound', `Couldn't find "${t}". Try a fuller name or address, like "Michigan Stadium, Ann Arbor".`);
  return retrieve(top, f, fetchJson);
}

/** Real network fetch that a newer search can cancel. */
const liveFetch =
  (signal: AbortSignal): FetchJson =>
  async (url) => {
    const r = await fetch(url, { signal });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
let inFlight: AbortController | null = null;

async function search() {
  const id = ++searchId;
  inFlight?.abort();
  inFlight = new AbortController();
  const fetchJson = demo ? demoFetch(demo) : liveFetch(inFlight.signal);
  trip = [fromInput.value, toInput.value];
  view = { kind: 'loading' };
  render();
  try {
    const [from, to] = await Promise.all([resolve(fields.from, fetchJson), resolve(fields.to, fetchJson)]);
    if (id !== searchId) return;
    trip = [from.label, to.label];
    const p = await plan({ from: from.coord, to: to.coord, tolerance: tolerance(), token: token ?? 'demo' }, fetchJson);
    if (id !== searchId) return;
    const initial = demo ? Number(params.get('select')) || 0 : 0;
    view = { kind: 'results', plan: p, ranked: p.ranked, selected: Math.min(initial, p.ranked.length - 1), from: from.coord, to: to.coord };
  } catch (error) {
    if (id !== searchId) return;
    view = { kind: 'error', error };
  }
  render();
}

resetBtn.addEventListener('click', () => {
  searchId++;
  inFlight?.abort();
  view = { kind: 'empty' };
  render();
  toInput.focus();
});

hereBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    fromHint.textContent = "This browser can't share your location.";
    return;
  }
  fromHint.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      here = [pos.coords.longitude, pos.coords.latitude];
      fromInput.value = MY_LOCATION;
      fromHint.textContent = `Located within about ${Math.round(pos.coords.accuracy)} m.`;
    },
    (err) => {
      fromHint.textContent = err.code === err.PERMISSION_DENIED ? 'Location permission was denied. Type a starting address instead.' : "Couldn't get your location. Type a starting address instead.";
    },
    { enableHighAccuracy: true, timeout: 15000 },
  );
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  search();
});

if (demo === 'suggest') {
  // Shows the dropdown: types a partial name the way a person would.
  toInput.focus();
  toInput.value = 'detroit airp';
  toInput.dispatchEvent(new Event('input'));
} else if (demo && !needsSetup) {
  fromInput.value = 'Campus Martius, Detroit';
  toInput.value = 'Michigan Stadium, Ann Arbor';
  search();
}
render();
