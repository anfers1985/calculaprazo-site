/**
 * calculaprazo-views-api — Cloudflare Worker
 * Contador de visualizações com KV persistente
 *
 * KV binding: VIEWS (configurar no dashboard Cloudflare)
 * Variável: ALLOWED_ORIGIN = https://calculaprazo.com.br
 *
 * Endpoints:
 *   GET  /view/:slug   → { slug, views }
 *   POST /view/:slug   → { slug, views }   (incrementa +1)
 *   GET  /top/:limit   → { top: [{slug, views}, ...] }
 *   GET  /health       → { ok: true }
 */

const ALLOWED_ORIGINS = [
  'https://calculaprazo.com.br',
  'https://www.calculaprazo.com.br'
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin'
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin)
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url    = new URL(request.url);
    const path   = url.pathname;

    // ── Preflight CORS ────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin)
      });
    }

    // ── Health check ──────────────────────────────────────────
    if (path === '/health') {
      return json({ ok: true, ts: Date.now() }, 200, origin);
    }

    // ── GET /view/:slug ───────────────────────────────────────
    if (request.method === 'GET' && path.startsWith('/view/')) {
      const slug = decodeURIComponent(path.slice(6));
      if (!slug) return json({ error: 'slug required' }, 400, origin);

      const val = await env.VIEWS.get('v:' + slug);
      const views = val ? parseInt(val, 10) : 0;
      return json({ slug, views }, 200, origin);
    }

    // ── POST /view/:slug ──────────────────────────────────────
    if (request.method === 'POST' && path.startsWith('/view/')) {
      const slug = decodeURIComponent(path.slice(6));
      if (!slug) return json({ error: 'slug required' }, 400, origin);

      const key = 'v:' + slug;
      const val = await env.VIEWS.get(key);
      const views = (val ? parseInt(val, 10) : 0) + 1;
      // Store count both as value AND as metadata — /top uses metadata to avoid N extra GETs
      await env.VIEWS.put(key, String(views), { metadata: { views } });
      return json({ slug, views }, 200, origin);
    }

    // ── GET /top/:limit ───────────────────────────────────────
    if (request.method === 'GET' && path.startsWith('/top/')) {
      const limit  = Math.min(parseInt(path.slice(5), 10) || 10, 50);
      const listed = await env.VIEWS.list({ prefix: 'v:' });

      // Use metadata (stored on each PUT) to avoid N extra KV.get() calls
      const entries = listed.keys.map(({ name, metadata }) => ({
        slug:  name.slice(2),
        views: metadata?.views ?? 0
      }));

      entries.sort((a, b) => b.views - a.views);
      const top = entries.slice(0, limit);
      return json({ top }, 200, origin);
    }

    return json({ error: 'not found' }, 404, origin);
  }
};
