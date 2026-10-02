import { sameRoute } from './detour';
import { distanceToLine } from './geo';
import type { Coord, Route } from './mapbox';

const latLng = ([lng, lat]: Coord) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

/**
 * Up to `max` points on `chosen` that pin it away from `fastest`: the farthest
 * point of each stretch that strays over `minOff` meters, biggest first, in route order.
 */
export function pinPoints(chosen: Route, fastest: Route, max = 3, minOff = 300): Coord[] {
  const off = chosen.coords.map((c) => distanceToLine(c, fastest.coords));
  const peaks: { i: number; d: number }[] = [];
  let peak: { i: number; d: number } | null = null;
  off.forEach((d, i) => {
    if (d > minOff) {
      if (!peak || d > peak.d) peak = { i, d };
    } else if (peak) {
      peaks.push(peak);
      peak = null;
    }
  });
  if (peak) peaks.push(peak);
  return peaks
    .sort((a, b) => b.d - a.d)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map(({ i }) => chosen.coords[i]);
}

/** Google Maps directions link that follows `chosen` instead of Google's own fastest route. */
export function googleMapsUrl(origin: Coord, dest: Coord, chosen: Route, fastest: Route): string {
  const params = new URLSearchParams({ api: '1', origin: latLng(origin), destination: latLng(dest), travelmode: 'driving' });
  const pins = sameRoute(chosen, fastest) ? [] : pinPoints(chosen, fastest);
  if (pins.length) params.set('waypoints', pins.map(latLng).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}
