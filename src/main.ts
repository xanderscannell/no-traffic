import './style.css';
import { combobox } from './combobox';
import { googleMapsUrl } from './handoff';
import { createMap } from './map';
import { checkResponse, MapboxError, type Coord, type FetchJson } from './mapbox';
import { HOME, loadSaved, memoryStore, MY_LOCATION, nameProblem, savedMatches, savedNameOf, savedNames, savedPlace, storeSaved, without, withSaved, WORK, type KeyValueStore } from './places';
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
const toHint = $<HTMLElement>('#to-hint');
const placesEl = $<HTMLDetailsElement>('#places');
const placesList = $<HTMLUListElement>('#places-list');
const placeForm = $<HTMLFormElement>('#place-form');
const placeName = $<HTMLInputElement>('input[name=place-name]');
const placeInput = $<HTMLInputElement>('input[name=place]');
const placeHint = $<HTMLElement>('#place-hint');
const placeSave = $<HTMLButtonElement>('#place-save');
const placeCancel = $<HTMLButtonElement>('#place-cancel');

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
  placesEl.hidden = collapsed || needsSetup;
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

/** Autocomplete state for an address box. One Search Box session per box, renewed after each pick. */
interface Lookup {
  input: HTMLInputElement;
  session: string;
  /** The row the user chose, and its coordinates (fetched as soon as it is chosen). */
  picked: { name: string; place: Promise<Place> } | null;
}
/** From or To. */
interface Field extends Lookup {
  hint: HTMLElement;
  /** Row of link buttons under the field; saved-place buttons are added to it. */
  shortcuts: HTMLElement;
  /** Whether the hint holds a saved-place message, which is cleared when the field changes. */
  savedHint: boolean;
}
const fields: Record<'from' | 'to', Field> = {
  from: { input: fromInput, session: newSession(), picked: null, hint: fromHint, shortcuts: $('#from-shortcuts'), savedHint: false },
  to: { input: toInput, session: newSession(), picked: null, hint: toHint, shortcuts: $('#to-shortcuts'), savedHint: false },
};
/** The address box of the Saved places form. */
const placeLookup: Lookup = { input: placeInput, session: newSession(), picked: null };

// Saved places, remembered per browser. Demos use a throwaway store, seeded by ?home=lat,lng.
const savedStore: KeyValueStore = (() => {
  if (demo) return memoryStore();
  try {
    return localStorage;
  } catch {
    return memoryStore();
  }
})();
let saved = loadSaved(savedStore);
const demoHome = demo ? parseLatLng(params.get('home') ?? '') : null;
if (demoHome) saved = { Home: { label: params.get('home')!, coord: demoHome } };

/** Fixture-backed fetch for `?demo=`. Loaded on demand so the recordings stay out of the main bundle. */
const demoFetch =
  (name: string): FetchJson =>
  async (url) =>
    (await import('./demo')).demoFetch(name)(url);

const plainFetch: FetchJson = async (url) => {
  const r = await fetch(url);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

async function suggest(q: string, f: Lookup, fetchJson: FetchJson): Promise<Suggestion[]> {
  const near = here ?? (saved[HOME] ?? saved[WORK] ?? Object.values(saved)[0])?.coord ?? 'ip';
  const body = await getJson(suggestUrl(q, { proximity: near, session: f.session, token: token ?? '' }), fetchJson);
  return parseSuggest(body);
}

async function retrieve(s: Suggestion, f: Lookup, fetchJson: FetchJson): Promise<Place> {
  const body = await getJson(retrieveUrl(s.id, { session: f.session, token: token ?? '' }), fetchJson);
  f.session = newSession(); // a retrieve ends the billing session
  const place = parseRetrieve(body);
  if (!place) throw new MapboxError('notfound', `Couldn't look up "${s.name}". Try another suggestion.`);
  return { label: shortLabel(s), coord: place.coord };
}

/** Wires autocomplete to an address box. With `pickedSaved`, saved places are offered too, and it runs when one is picked. */
function autocomplete(f: Lookup, pickedSaved?: () => void) {
  combobox(f.input, {
    // Typed coordinates and saved places are used as-is, so there is nothing to look up.
    suggest: (q) => (parseLatLng(q) || savedPlace(saved, q) ? Promise.resolve([]) : suggest(q, f, demo ? demoFetch(demo) : plainFetch)),
    saved: pickedSaved && ((q) => savedMatches(saved, q).map((n) => ({ id: `saved:${n}`, name: n, detail: saved[n].label, saved: true }))),
    pick: (s) => {
      if (s.saved) {
        f.picked = null; // the name in the field is enough
        pickedSaved?.();
        return;
      }
      const place = retrieve(s, f, demo ? demoFetch(demo) : plainFetch);
      place.catch(() => {}); // reported when a search awaits it
      f.picked = { name: s.name, place };
    },
    edited: () => (f.picked = null),
  });
}
for (const f of Object.values(fields)) autocomplete(f, () => refreshSaved(f));
autocomplete(placeLookup);

/** Turns a field into a place: my location, a saved place, a typed lat,lng, the picked suggestion, or else the top suggestion. */
async function resolve(f: Lookup, fetchJson: FetchJson): Promise<Place> {
  const t = f.input.value.trim();
  if (demo && DEMO_PLACES[t]) return { label: t, coord: DEMO_PLACES[t] };
  if (t === MY_LOCATION && here) return { label: MY_LOCATION, coord: here };
  const mine = savedPlace(saved, t);
  if (mine) return mine;
  const typed = parseLatLng(t);
  if (typed) return { label: t, coord: typed };
  if (f.picked && f.picked.name === t) return f.picked.place;
  const [top] = await suggest(t, f, fetchJson);
  if (!top) throw new MapboxError('notfound', `Couldn't find "${t}". Try a fuller name or address, like "Michigan Stadium, Ann Arbor".`);
  return retrieve(top, f, fetchJson);
}

function savedHint(f: Field, text: string) {
  f.hint.textContent = text;
  f.savedHint = true;
}

function linkButton(text: string, onClick: () => void): HTMLButtonElement {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'link', textContent: text });
  b.addEventListener('click', onClick);
  return b;
}

/** Updates a field's saved-place links and hint to match what is saved and what the field says. */
function refreshSaved(f: Field) {
  const name = savedNameOf(saved, f.input.value);
  if (name) savedHint(f, `${name} is ${saved[name].label}.`);
  else if (f.savedHint) {
    f.hint.textContent = '';
    f.savedHint = false;
  }
  f.shortcuts.querySelectorAll('[data-saved]').forEach((b) => b.remove());
  // ponytail: one link per saved place gets crowded past about 6; the dropdown lists them all, so trim these to Home and Work if they crowd.
  f.shortcuts.append(
    ...savedNames(saved).map((n) => {
      const b = linkButton(n, () => {
        f.input.value = n;
        f.picked = null;
        refreshSaved(f);
      });
      b.dataset.saved = '';
      return b;
    }),
  );
}

/** Draws the Saved places list: Home and Work always, set or not, then the rest. */
function renderPlaces() {
  placesList.replaceChildren(
    ...[...new Set([HOME, WORK, ...savedNames(saved)])].map((name) => {
      const p = saved[name] as Place | undefined;
      const li = document.createElement('li');
      const text = Object.assign(document.createElement('span'), { className: 'place' });
      text.append(Object.assign(document.createElement('strong'), { textContent: name }), Object.assign(document.createElement('small'), { textContent: p?.label ?? 'Not set' }));
      li.append(text);
      if (!p)
        li.append(
          linkButton('Set', () => {
            editPlace(null);
            placeName.value = name;
            placeInput.focus();
          }),
        );
      else
        li.append(
          linkButton('Edit', () => {
            editPlace(name);
            placeName.value = name;
            placeInput.value = p.label;
            placeName.focus();
          }),
          linkButton('Remove', () => {
            if (editing === name) editPlace(null);
            saved = without(saved, name);
            savedChanged();
            placeHint.textContent = `Removed ${name}.`;
          }),
        );
      return li;
    }),
  );
}

/** The saved place the form is changing, or null when it adds a new one. */
let editing: string | null = null;
/** Empties the form, ready to add a place, or to change `name`. */
function editPlace(name: string | null) {
  editing = name;
  placeForm.reset();
  placeLookup.picked = null;
  placeHint.textContent = name ? `Editing ${name}. Change its name or address.` : '';
  placeSave.textContent = name ? 'Save changes' : 'Save place';
  placeCancel.hidden = !name;
}
placeCancel.addEventListener('click', () => editPlace(null));

/** Stores `saved` and redraws everything that shows it. Returns false if the browser won't keep it. */
function savedChanged(): boolean {
  const kept = storeSaved(savedStore, saved);
  Object.values(fields).forEach(refreshSaved);
  renderPlaces();
  return kept;
}

placeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const was = editing;
  const typedName = placeName.value;
  const t = placeInput.value.trim();
  const taken = savedNameOf(saved, typedName);
  const problem = nameProblem(typedName) ?? (taken && taken !== was ? `You already have ${taken}. Tap Edit next to it to change it.` : null);
  if (problem || !t) {
    placeHint.textContent = problem ?? 'Enter an address.';
    return;
  }
  // The address it already had, another saved place, my location, or an address to look up.
  const before = was ? saved[was] : null;
  const other = savedNameOf(saved, t);
  let p: Place;
  if (before && t === before.label) p = before;
  else if (other) p = saved[other];
  else {
    placeHint.textContent = 'Looking it up…';
    try {
      p = await resolve(placeLookup, demo ? demoFetch(demo) : plainFetch);
    } catch (err) {
      if (placeInput.value.trim() === t && editing === was) placeHint.textContent = errorMessage(err);
      return;
    }
    // The user changed the form while we looked it up, so what we found is no longer what they mean.
    if (placeInput.value.trim() !== t || editing !== was) return;
    if (p.label === MY_LOCATION) p = { label: `${p.coord[1].toFixed(5)}, ${p.coord[0].toFixed(5)}`, coord: p.coord };
  }
  saved = withSaved(was ? without(saved, was) : saved, typedName, p);
  const name = savedNameOf(saved, typedName)!;
  const kept = savedChanged();
  editPlace(null);
  placeHint.textContent = kept ? `Saved ${name}. Type it, or tap it under From or To.` : `Saved ${name} for this visit only: this browser won't let the app remember it.`;
});

for (const f of Object.values(fields)) f.input.addEventListener('input', () => refreshSaved(f));

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
      refreshSaved(fields.from);
      fields.from.savedHint = false;
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
Object.values(fields).forEach(refreshSaved);
renderPlaces();
render();
