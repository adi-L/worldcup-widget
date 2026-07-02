/**
 * World Cup proxy — a tiny Cloudflare Worker in front of TheSportsDB.
 *
 * Why this exists:
 *   1. CACHING — it fetches TheSportsDB once every ~2 min and serves that
 *      cached result to *all* visitors. A viral LinkedIn spike of 100k people
 *      becomes a handful of upstream calls, so you never hit the rate limit.
 *   2. KEY SECURITY — if you upgrade to live scores, the paid API key lives
 *      here as a server-side secret (env.THESPORTSDB_KEY) and is NEVER sent to
 *      the browser. Without this proxy a key in frontend code gets scraped.
 *
 * It returns a small pre-computed payload: { featured, next, updatedAt }.
 * Free tier works with NO key. Add a key later to enable real live scores.
 *
 * Deploy:  see worker/README-worker.md
 */

const V1 = 'https://www.thesportsdb.com/api/v1/json/3';
const LIVE_WINDOW_MIN = 150;
const CACHE_SECONDS = 120; // matches TheSportsDB's ~2-min livescore cadence

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const league = (url.searchParams.get('league') || '4429').replace(/[^0-9]/g, '');

    // Edge cache: key the cache by the normalized URL so all visitors share it.
    const cacheKey = new Request(`${url.origin}/wc?league=${league}`, request);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    let payload;
    try {
      payload = await buildPayload(league, env);
    } catch (err) {
      return json({ error: 'upstream_failed' }, 502, 0);
    }

    const response = json(payload, 200, CACHE_SECONDS);
    // Store in edge cache without blocking the response.
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};

async function buildPayload(league, env) {
  const [pastRes, nextRes] = await Promise.all([
    fetchJson(`${V1}/eventspastleague.php?id=${league}`),
    fetchJson(`${V1}/eventsnextleague.php?id=${league}`),
  ]);

  const past = (pastRes.events || []).sort((a, b) => ts(b) - ts(a));
  const upcoming = (nextRes.events || []).sort((a, b) => ts(a) - ts(b));

  const now = Date.now();
  let live = upcoming.find(
    (e) =>
      ts(e) <= now &&
      now - ts(e) < LIVE_WINDOW_MIN * 60000 &&
      (e.strStatus || '').toUpperCase() !== 'FT'
  );

  // Optional real live scores (paid tier). Key stays server-side.
  if (env && env.THESPORTSDB_KEY && live) {
    live = await overlayLiveScore(live, league, env.THESPORTSDB_KEY);
  }

  const featured = live
    ? { ...slim(live), live: true }
    : past[0]
    ? { ...slim(past[0]), live: false }
    : null;

  const nextGame =
    upcoming.find((e) => e.idEvent !== (featured && featured.idEvent)) || null;

  return {
    featured,
    next: nextGame ? slim(nextGame) : null,
    updatedAt: new Date(now).toISOString(),
  };
}

/**
 * Best-effort real-time overlay using TheSportsDB v2 livescore (paid).
 * Matches the live event by id and overlays fresh score/status.
 * If the shape/path differs on your plan, adjust the endpoint below.
 */
async function overlayLiveScore(event, league, key) {
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v2/json/livescore/${league}`,
      { headers: { 'X-API-KEY': key } }
    );
    if (!res.ok) return event;
    const data = await res.json();
    const rows = data.livescore || data.events || [];
    const match = rows.find((r) => r.idEvent === event.idEvent);
    if (!match) return event;
    return {
      ...event,
      intHomeScore: match.intHomeScore ?? event.intHomeScore,
      intAwayScore: match.intAwayScore ?? event.intAwayScore,
      strStatus: match.strStatus || match.strProgress || event.strStatus,
      strProgress: match.strProgress || null,
    };
  } catch {
    return event; // never let live-score fetch break the response
  }
}

// Keep the payload tiny — only fields the widget renders.
function slim(e) {
  return {
    idEvent: e.idEvent,
    strLeague: e.strLeague,
    strLeagueBadge: e.strLeagueBadge,
    strHomeTeam: e.strHomeTeam,
    strAwayTeam: e.strAwayTeam,
    strHomeTeamBadge: e.strHomeTeamBadge,
    strAwayTeamBadge: e.strAwayTeamBadge,
    intHomeScore: e.intHomeScore,
    intAwayScore: e.intAwayScore,
    strStatus: e.strStatus,
    strProgress: e.strProgress || null,
    strVenue: e.strVenue,
    strTimestamp: e.strTimestamp,
    dateEvent: e.dateEvent,
    strTime: e.strTime,
  };
}

function ts(e) {
  return new Date(
    e.strTimestamp || `${e.dateEvent}T${e.strTime || '00:00:00'}`
  ).getTime();
}

async function fetchJson(u) {
  const r = await fetch(u, { cf: { cacheTtl: CACHE_SECONDS } });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return r.json();
}

function json(obj, status, maxAge) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${maxAge}`,
      ...CORS,
    },
  });
}
