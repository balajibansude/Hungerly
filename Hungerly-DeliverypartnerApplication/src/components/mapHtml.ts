/**
 * Self-contained Leaflet map page used by RiderMap (WebView on phones, iframe in the browser preview).
 *
 * Why a web map: it renders identically in Expo Go on Android and iOS with no Google/Apple API key,
 * which the native map needed. Leaflet is pinned with Subresource Integrity, so a tampered CDN file is
 * refused. Tiles: OpenStreetMap by default; set EXPO_PUBLIC_MAP_TILE_URL for a keyed provider in production.
 *
 * Messages in:  {type:'update', state:{rider, pickup, drop, leg, insets}}  and  {type:'fit'}
 * Message out:  'ready'
 */
// Default: OpenStreetMap's public tiles (no key; fine for development and light use under the OSM tile
// policy). Production should set EXPO_PUBLIC_MAP_TILE_URL to a keyed provider, e.g.
// https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=YOUR_KEY (restrict the key to the app).
const TILE_URL = process.env.EXPO_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = process.env.EXPO_PUBLIC_MAP_TILE_URL ? '&copy; OpenStreetMap contributors' : '&copy; OpenStreetMap';

export const MAP_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous">
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #F5F1EA; }
  .leaflet-container { background: #F5F1EA; font-family: -apple-system, Roboto, sans-serif; }
  /* Quiet the standard map colours so it sits in the app's warm, minimal palette. */
  .leaflet-tile-pane { filter: saturate(0.45) sepia(0.12) brightness(1.04) contrast(0.92); }
  .leaflet-control-attribution { font-size: 9px; background: rgba(250,247,242,.75) !important; color: #6E6762; }
  .leaflet-control-attribution a { color: #6E6762; pointer-events: none; }
  .pin { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #fff; box-sizing: border-box;
         display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px rgba(31,51,44,.28); }
  .pin svg { width: 16px; height: 16px; fill: #fff; }
  .pin.r { background: #C2410C; } .pin.h { background: #1F332C; }
  .me { width: 34px; height: 34px; border-radius: 50%; background: rgba(21,128,61,.18);
        display: flex; align-items: center; justify-content: center; }
  .me::after { content: ''; width: 16px; height: 16px; border-radius: 50%; background: #15803D; border: 3px solid #fff;
               box-sizing: border-box; box-shadow: 0 1px 4px rgba(0,0,0,.25); }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>
<script>
(function () {
  var PUNE = [18.5362, 73.8939];
  var map = L.map('map', { zoomControl: false, attributionControl: true, rotate: false }).setView(PUNE, 13);
  L.tileLayer(${JSON.stringify(TILE_URL)}, { maxZoom: 19, attribution: ${JSON.stringify(TILE_ATTRIBUTION)} }).addTo(map);
  map.attributionControl.setPrefix(false);

  var FORK = '<svg viewBox="0 0 24 24"><path d="M8.1 13.34l2.83-2.83L3.91 3.5a4 4 0 000 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z"/></svg>';
  var HOME = '<svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>';
  function pin(cls, svg) { return L.divIcon({ className: '', html: '<div class="pin ' + cls + '">' + svg + '</div>', iconSize: [34, 34], iconAnchor: [17, 17] }); }
  var ICON_R = pin('r', FORK), ICON_H = pin('h', HOME);
  var ICON_ME = L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [34, 34], iconAnchor: [17, 17] });

  var layer = L.layerGroup().addTo(map);
  var state = {}, lastKey = '';
  function ll(p) { return p ? [p.lat, p.lng] : null; }

  function render() {
    layer.clearLayers();
    var me = ll(state.rider), pk = state.leg !== 'drop' ? ll(state.pickup) : null, dr = ll(state.drop);
    var target = state.leg === 'pickup' ? ll(state.pickup) : state.leg === 'drop' ? dr : null;
    if (me && target) L.polyline([me, target], { color: '#1F332C', weight: 4, opacity: .9, lineCap: 'round' }).addTo(layer);
    if (state.leg === 'pickup' && pk && dr) L.polyline([pk, dr], { color: '#A8A097', weight: 3, dashArray: '6 8' }).addTo(layer);
    if (pk) L.marker(pk, { icon: ICON_R, keyboard: false }).addTo(layer);
    if (dr) L.marker(dr, { icon: ICON_H, keyboard: false }).addTo(layer);
    if (me) L.marker(me, { icon: ICON_ME, keyboard: false, zIndexOffset: 1000 }).addTo(layer);
  }

  function fit() {
    var ins = state.insets || { top: 120, bottom: 280 };
    var pts = [ll(state.rider), state.leg !== 'drop' ? ll(state.pickup) : null, ll(state.drop)].filter(Boolean);
    if (pts.length >= 2) {
      map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [48, ins.top + 30], paddingBottomRight: [48, ins.bottom + 30], maxZoom: 16, animate: true });
    } else {
      var c = pts[0] || PUNE;
      // Offset the centre so the point sits in the visible area between the top bar and bottom sheet.
      var zoom = pts[0] ? 16 : 13;
      var px = map.project(c, zoom).add([0, (ins.bottom - ins.top) / 2]);
      map.setView(map.unproject(px, zoom), zoom, { animate: true });
    }
  }

  function update(s) {
    state = s || {};
    render();
    var key = [!!state.rider, state.pickup && state.pickup.lat, state.drop && state.drop.lat, state.leg].join('|');
    if (key !== lastKey) { lastKey = key; fit(); }
  }

  function onMessage(e) {
    var d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { return; } }
    if (!d || typeof d !== 'object') return;
    if (d.type === 'update') update(d.state);
    if (d.type === 'fit') fit();
  }
  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage); // older Android WebView bridge
  window.hg = { update: update, fit: fit };
  var post = window.ReactNativeWebView ? function (m) { window.ReactNativeWebView.postMessage(m); } : function (m) { parent.postMessage(m, '*'); };
  post('ready');
})();
</script>
</body>
</html>`;
