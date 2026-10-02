import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { Congestion, Coord, Route } from './mapbox';

const dark = matchMedia('(prefers-color-scheme: dark)');
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const color = (c: Congestion) => css(`--c-${c === 'unknown' ? 'low' : c}`);
const ll = ([lng, lat]: Coord): L.LatLngTuple => [lat, lng];

export interface RouteMap {
  draw(routes: Route[], selected: number, ends: [Coord, Coord], fit: boolean): void;
  clear(): void;
}

/** Leaflet map with Mapbox tiles when a token is given, and a plain background otherwise. */
export function createMap(el: HTMLElement, token: string | null, onSelect: (i: number) => void): RouteMap {
  const map = L.map(el, { zoomSnap: 0.25 }).setView([42.25, -83.3], 10);
  map.attributionControl.setPrefix(false);

  if (token) {
    let tiles: L.TileLayer | null = null;
    const setTiles = () => {
      tiles?.remove();
      const style = dark.matches ? 'dark-v11' : 'light-v11';
      tiles = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/256/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(token)}`, {
        attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
    };
    setTiles();
    dark.addEventListener('change', setTiles);
  }

  const legend = new L.Control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML = (['low', 'moderate', 'heavy', 'severe'] as const)
      .map((c) => `<span><i style="background:${color(c)}"></i>${c === 'low' ? 'Flowing' : c[0].toUpperCase() + c.slice(1)}</span>`)
      .join('');
    return div;
  };

  const layer = L.layerGroup().addTo(map);

  /** One polyline per run of equal congestion. */
  function runs(route: Route): { c: Congestion; pts: L.LatLngTuple[] }[] {
    const out: { c: Congestion; pts: L.LatLngTuple[] }[] = [];
    route.segments.forEach((s, i) => {
      const c = s.congestion === 'unknown' ? 'low' : s.congestion;
      const last = out.at(-1);
      if (last && last.c === c) last.pts.push(ll(route.coords[i + 1]));
      else out.push({ c, pts: [ll(route.coords[i]), ll(route.coords[i + 1])] });
    });
    return out;
  }

  return {
    clear() {
      layer.clearLayers();
      legend.remove();
    },
    draw(routes, selected, ends, fit) {
      layer.clearLayers();
      legend.addTo(map);
      const order = routes.map((_, i) => i).filter((i) => i !== selected);
      order.push(selected);
      for (const i of order) {
        const on = i === selected;
        // A wide casing under each route gives a click target and separates the selected route.
        L.polyline(routes[i].coords.map(ll), {
          color: css(on ? '--casing' : '--casing-dim'),
          weight: on ? 11 : 9,
          opacity: on ? 1 : 0.6,
        })
          .on('click', () => onSelect(i))
          .addTo(layer);
        for (const run of runs(routes[i])) {
          L.polyline(run.pts, { color: color(run.c), weight: on ? 6 : 4, opacity: on ? 1 : 0.8, interactive: false }).addTo(layer);
        }
      }
      const [from, to] = ends;
      for (const [p, cls] of [[from, '--accent'], [to, '--text']] as const) {
        L.circleMarker(ll(p), { radius: 7, color: css('--surface'), weight: 3, fillColor: css(cls), fillOpacity: 1 }).addTo(layer);
      }
      map.invalidateSize();
      if (fit) map.fitBounds(L.latLngBounds(routes.flatMap((r) => r.coords.map(ll))), { paddingTopLeft: [32, 32], paddingBottomRight: [32, 64], animate: false } /* bottom clears the legend; an animated zoom-out left routes clipped to the old view */);
    },
  };
}
