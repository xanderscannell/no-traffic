# No Traffic

A route planner that picks the drive with the least **stop-and-go traffic**,
not just the fastest one.

Built for driving a manual transmission: crawling through a jam means
working the clutch every few seconds, and a slightly longer drive at a
steady speed is often the better trip. You set how much extra time you will
accept (default +25%), and the app finds the calmest route inside that limit.
Then it hands the route to Google Maps for turn-by-turn directions.

## Setup

1. Create a free account at [mapbox.com](https://account.mapbox.com/) and
   copy your default public access token (it starts with `pk.`).
2. In the project folder, create `.env.local`:

   ```
   VITE_MAPBOX_TOKEN=pk.your-token
   ```

3. Install and run:

   ```
   npm install
   npm run dev
   ```

   Open http://127.0.0.1:5173.

Without a token, the app shows these steps instead of the search form. To look around
without a token, open http://127.0.0.1:5173/?demo=det-aa-jam (recorded
Detroit to Ann Arbor routes with a simulated jam on I-94).

## Install as an app

The site is an installable web app. On Android, open it in Chrome and choose
**Install app** from the menu (or accept the install prompt); it gets its own
icon and opens full screen without the address bar. On iPhone, use Safari's
**Share > Add to Home Screen**. The icons are rendered from `public/icon.svg`
by `node scripts/icons.mjs`.

## How it works

0. **Places.** Start typing in From or To and pick from the suggestions
   (Mapbox Search Box, which knows businesses and landmarks as well as
   addresses). If you press Find without picking, the top suggestion is used.
   Typed coordinates (`42.32, -83.18`) and "Use my location" also work.
   **Set as Home** saves whatever a field points at; after that, the
   **Home** link (or typing `home`) fills either field with it. Saved places
   stay in this browser only (`src/places.ts`, which is also where more
   names like "Work" would be added).
1. **Candidates.** One request to Mapbox Directions (`driving-traffic`
   profile) returns up to 3 routes, each with a congestion level for every
   road segment: low, moderate, heavy, or severe.
2. **Score.** Stop-and-go seconds = the time spent on each segment, times a
   weight for its congestion: heavy 1, severe 1.5, moderate 0.25, otherwise 0.
   The weights are in `src/score.ts`.
3. **Detours.** For the worst jams (heavy or severe stretches worth at least
   a minute of stop-and-go), the app asks Mapbox for a route that avoids
   points inside the jam. If that finds nothing new, it tries a via point
   1.5 km to either side. A search never makes more than 5 Directions requests.
4. **Rank.** Routes slower than the fastest by more than your limit are
   dropped. The rest are sorted by stop-and-go time, then by travel time.
   Moving the slider re-ranks without a new search.
5. **Hand-off.** "Open in Google Maps" opens the selected route with up to 3
   waypoints placed where it differs most from the fastest route, so Google
   follows it instead of taking its own.

## Development

```
npm test        # unit tests (offline, against recorded responses in fixtures/)
npm run lint    # ESLint with zero warnings, then a strict type check
npm run build
npm run shots -- demo=det-aa-jam   # screenshots into shots/, network blocked
```

To re-record the fixtures (for example at rush hour, when there is real
congestion to test against), run `node scripts/record-fixtures.mjs`, or name
the ones to refresh: `node scripts/record-fixtures.mjs det-aa`. It reads
the token from `.env.local`, makes at most 7 requests, and refuses to save a
response that contains the token. Several tests pin values from the current
recordings, so expect to update them after re-recording.

## Known limits

- Traffic is a snapshot of right now. A jam can clear, or a new one form,
  while you drive.
- Roads without Mapbox traffic coverage count as free-flowing.
- Google Maps shows the waypoints as stops and can still choose its own
  path between them.
- Traffic lights, stop signs, turns, and hills are not scored yet.
- The token is bundled into the built app. That is normal for a public
  `pk.` token, but restrict it to your site's URL in the Mapbox account
  page before hosting the app anywhere.
- Phone use needs HTTPS hosting, because browsers only share location
  with secure pages.
