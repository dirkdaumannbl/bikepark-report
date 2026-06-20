// Vercel Node serverless function — geocoding proxy for the location picker.
//   GET ?q=<address>     → forward geocode  → { lat, lng, label }
//   GET ?lat=&lng=       → reverse geocode   → { lat, lng, label }
// Same security model as drive-times.js: the Google key lives ONLY in
// process.env.GOOGLE_ROUTES_KEY here, never reaching the client, and the same
// same-origin guard + per-IP rate limit gate every billable call.
//
// The key must have the **Geocoding API** enabled (in addition to Routes API).
// Dependency-free: global `fetch` only.

const LAT_MIN = 35;
const LAT_MAX = 72;
const LNG_MIN = -25;
const LNG_MAX = 45;

const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

// --- same-origin guard (identical policy to drive-times.js) -----------------
function requestOriginHost(req) {
  const src = req.headers.origin || req.headers.referer || req.headers.referrer;
  if (!src) return null;
  try {
    return new URL(src).host.toLowerCase();
  } catch {
    return null;
  }
}
function isAllowedOrigin(req) {
  const host = requestOriginHost(req);
  if (!host) return false;
  const self = (req.headers.host || '').toLowerCase();
  if (self && host === self) return true;
  if (host.endsWith('.vercel.app')) return true;
  if (host === 'localhost' || host.startsWith('localhost:')) return true;
  const allow = process.env.ALLOWED_ORIGIN_HOST;
  return Boolean(allow) && host === allow.toLowerCase();
}

// --- per-IP rate limit (Upstash REST; fail-open) ----------------------------
const RL_LIMIT = 15;
const RL_WINDOW_S = 10;
async function rateLimited(req) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    'unknown';
  const windowId = Math.floor(Date.now() / 1000 / RL_WINDOW_S);
  const key = encodeURIComponent(`geocode:${ip}:${windowId}`);
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  try {
    const r = await fetch(`${url}/incr/${key}`, auth);
    if (!r.ok) return false;
    const { result } = await r.json();
    if (result === 1) {
      await fetch(`${url}/expire/${key}/${RL_WINDOW_S + 5}`, auth).catch(() => {});
    }
    return typeof result === 'number' && result > RL_LIMIT;
  } catch {
    return false;
  }
}

function toFiniteNumber(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req, res) {
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (await rateLimited(req)) {
    res.setHeader('Retry-After', String(RL_WINDOW_S));
    return res.status(429).json({ error: 'rate limit exceeded' });
  }

  const apiKey = process.env.GOOGLE_ROUTES_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'geocoding not configured' });
  }

  const query =
    req.query ||
    Object.fromEntries(new URL(req.url, 'http://localhost').searchParams.entries());

  // Build the upstream Geocoding URL for either forward (?q=) or reverse (?lat&lng).
  let upstreamUrl;
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  if (q) {
    if (q.length > 200) {
      return res.status(400).json({ error: 'query too long' });
    }
    upstreamUrl =
      `${GEOCODE_ENDPOINT}?address=${encodeURIComponent(q)}` +
      `&language=en&key=${apiKey}`;
  } else {
    const lat = toFiniteNumber(query.lat);
    const lng = toFiniteNumber(query.lng);
    if (lat === null || lng === null) {
      return res.status(400).json({ error: 'provide q, or lat and lng' });
    }
    if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) {
      return res.status(400).json({ error: 'lat/lng out of supported range' });
    }
    upstreamUrl =
      `${GEOCODE_ENDPOINT}?latlng=${lat},${lng}&language=en&key=${apiKey}`;
  }

  let data;
  try {
    const upstream = await fetch(upstreamUrl);
    if (!upstream.ok) {
      return res.status(502).json({ error: 'geocoding upstream error' });
    }
    data = await upstream.json();
  } catch {
    return res.status(502).json({ error: 'geocoding upstream error' });
  }

  // Google sets a `status` string; anything other than OK with a result is a miss.
  if (!data || data.status !== 'OK' || !Array.isArray(data.results) || !data.results[0]) {
    return res.status(404).json({ error: 'no match' });
  }
  const top = data.results[0];
  const loc = top.geometry && top.geometry.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
    return res.status(404).json({ error: 'no match' });
  }

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=86400, stale-while-revalidate=604800',
  );
  return res.status(200).json({
    lat: loc.lat,
    lng: loc.lng,
    label: top.formatted_address || q,
  });
}
