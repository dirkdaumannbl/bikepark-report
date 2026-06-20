// Vercel Node serverless function — the ONLY dynamic piece of an otherwise
// fully static Astro site. It proxies the Google Routes "Compute Route Matrix"
// API so the browser can show live drive times from the visitor's location to
// each park, WITHOUT ever exposing the Google key to the client.
//
// SECURITY: the key is read ONLY from process.env.GOOGLE_ROUTES_KEY here. It is
// never written into responses, logs, or error messages, and never reaches the
// client bundle or the built `dist/` (this file is not part of the Astro build).
//
// Dependency-free: uses global `fetch` (Node 18+ on Vercel) and a JSON import.

import GEO from './parks-geo.json' with { type: 'json' };

// Europe bounding box — rejects coordinates outside it to curb bounds abuse
// (someone hammering the metered Google API with arbitrary far-flung origins).
const LAT_MIN = 35;
const LAT_MAX = 72;
const LNG_MIN = -25;
const LNG_MAX = 45;

// Cap the destination set so a single matrix call can never blow up in size
// (each origin × destination pair is a billable element).
const MAX_DESTINATIONS = 60;
const DESTINATIONS = GEO.slice(0, MAX_DESTINATIONS);

const ROUTES_ENDPOINT =
  'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';

/**
 * Parse a query value into a finite number, or return null when it is missing,
 * empty, or not a finite number (covers NaN, Infinity, arrays, etc.).
 * @param {unknown} raw
 * @returns {number|null}
 */
function toFiniteNumber(raw) {
  if (raw == null || raw === '') return null;
  // Vercel may hand back string[] for repeated params; only accept a scalar.
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Vercel serverless handler: GET ?lat=&lng= → { origin, parks }.
 * @param {import('http').IncomingMessage & { query?: Record<string, string> }} req
 * @param {import('http').ServerResponse & { status: Function, json: Function, setHeader: Function }} res
 */
export default async function handler(req, res) {
  // --- 1) read + validate the visitor origin -----------------------------
  // Prefer Vercel's parsed req.query; fall back to parsing the URL ourselves
  // so the function also works under `vercel dev` / raw Node invocations.
  const query =
    req.query ||
    Object.fromEntries(
      new URL(req.url, 'http://localhost').searchParams.entries(),
    );

  const lat = toFiniteNumber(query.lat);
  const lng = toFiniteNumber(query.lng);

  if (lat === null || lng === null) {
    return res
      .status(400)
      .json({ error: 'lat and lng must both be finite numbers' });
  }
  if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) {
    return res
      .status(400)
      .json({ error: 'lat/lng out of supported range' });
  }

  // --- 2) read the key (never echoed anywhere) ----------------------------
  const apiKey = process.env.GOOGLE_ROUTES_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'routing not configured' });
  }

  // --- 3) call Google Routes Compute Route Matrix -------------------------
  const body = {
    origins: [
      { waypoint: { location: { latLng: { latitude: lat, longitude: lng } } } },
    ],
    destinations: DESTINATIONS.map((g) => ({
      waypoint: { location: { latLng: { latitude: g.lat, longitude: g.lng } } },
    })),
    travelMode: 'DRIVE',
  };

  let elements;
  try {
    const upstream = await fetch(ROUTES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'originIndex,destinationIndex,distanceMeters,duration,condition',
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      // Do NOT forward the upstream body — it can echo the request (incl. the
      // key in some error shapes). Return a generic, key-free error.
      return res.status(502).json({ error: 'routing upstream error' });
    }

    elements = await upstream.json();
  } catch (err) {
    // Network/parse failure — swallow the detail (it may contain the key/URL)
    // and surface a generic error.
    return res.status(502).json({ error: 'routing upstream error' });
  }

  if (!Array.isArray(elements)) {
    return res.status(502).json({ error: 'routing upstream error' });
  }

  // --- 4) shape the response ----------------------------------------------
  // Each element references its destination by index into DESTINATIONS; map
  // that back to the stable park `id`. `duration` is a string like "8460s".
  const parks = [];
  for (const el of elements) {
    if (!el || typeof el.destinationIndex !== 'number') continue;
    const dest = DESTINATIONS[el.destinationIndex];
    if (!dest) continue;
    const seconds = parseInt(el.duration, 10);
    parks.push({
      id: dest.id,
      meters: typeof el.distanceMeters === 'number' ? el.distanceMeters : null,
      seconds: Number.isFinite(seconds) ? seconds : null,
      ok: el.condition === 'ROUTE_EXISTS',
    });
  }

  // Let Vercel's CDN cache each rounded-coord URL: nearby visitors (the client
  // rounds to 3 decimals) share a cache entry, keeping metered cost down.
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=86400, stale-while-revalidate=604800',
  );

  return res.status(200).json({ origin: { lat, lng }, parks });
}
