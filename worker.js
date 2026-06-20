/**
 * calculaprazo-views-api — Cloudflare Worker
 * Contador de visualizações com KV persistente
 * + Proxy de indexação automática (IndexNow + Google Indexing API)
 *
 * KV binding: VIEWS (configurar no dashboard Cloudflare)
 * Variável: ALLOWED_ORIGIN = https://calculaprazo.com.br
 *
 * Secrets necessários (Workers → Settings → Variables):
 *   ADMIN_SECRET     → senha simples que autoriza chamadas do admin
 *                      (usada em /index-now, /index-google e /ai-generate)
 *   INDEXNOW_KEY     → chave gerada (string hex aleatória), o mesmo
 *                      valor deve existir no arquivo público
 *                      /{INDEXNOW_KEY}.txt na raiz do site
 *   GOOGLE_SA_JSON   → conteúdo completo do JSON da Service Account
 *                      (Google Cloud → IAM → Service Accounts → Keys)
 *
 * Endpoints:
 *   GET  /view/:slug     → { slug, views }
 *   POST /view/:slug     → { slug, views }   (incrementa +1)
 *   GET  /top/:limit     → { top: [{slug, views}, ...] }
 *   GET  /health         → { ok: true }
 *   POST /index-now      → notifica Bing/Yandex via IndexNow
 *   POST /index-google   → notifica Google via Indexing API (URL_UPDATED)
 *   POST /ai-generate    → proxy para Gemini/OpenAI/Grok/DeepSeek/Claude
 *                          (Content Studio — chave de API do provedor vem
 *                          no corpo da requisição, enviada pelo navegador)
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
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
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
      // Salvar valor E metadata — /top usa metadata para evitar N gets adicionais
      await env.VIEWS.put(key, String(views), { metadata: { views } });
      return json({ slug, views }, 200, origin);
    }

    // ── GET /top/:limit   ───────────────────────────────────────
    if (request.method === 'GET' && path.startsWith('/top/')) {
      const limit  = Math.min(parseInt(path.slice(5), 10) || 10, 50);
      const listed = await env.VIEWS.list({ prefix: 'v:' });

      // Usar metadata (gravada no PUT) — elimina N KV.get() paralelos
      const entries = listed.keys.map(({ name, metadata }) => ({
        slug:  name.slice(2),
        views: metadata?.views ?? 0
      }));

      entries.sort((a, b) => b.views - a.views);
      const top = entries.slice(0, limit);
      return json({ top }, 200, origin);
    }

    // ── POST /index-now — notifica Bing/Yandex via IndexNow ────
    if (request.method === 'POST' && path === '/index-now') {
      const authErr = checkAdminAuth(request, env, origin);
      if (authErr) return authErr;

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'JSON inválido' }, 400, origin); }
      const urls = Array.isArray(body.urls) ? body.urls.filter(u => typeof u === 'string') : [];
      if (!urls.length) return json({ error: 'urls (array) é obrigatório' }, 400, origin);
      if (!env.INDEXNOW_KEY) return json({ error: 'INDEXNOW_KEY não configurado no Worker' }, 500, origin);

      try {
        const resp = await fetch('https://api.indexnow.org/indexnow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            host: 'calculaprazo.com.br',
            key: env.INDEXNOW_KEY,
            keyLocation: `https://calculaprazo.com.br/${env.INDEXNOW_KEY}.txt`,
            urlList: urls
          })
        });
        const ok = resp.status === 200 || resp.status === 202;
        let detail = '';
        if (!ok) {
          try { detail = await resp.text(); } catch (e2) { detail = '(sem corpo de resposta)'; }
        }
        return json({ ok, status: resp.status, sent: urls.length, detail: detail.slice(0, 500) }, ok ? 200 : 502, origin);
      } catch (e) {
        const errMsg = (e && (e.message || e.toString())) || 'erro desconhecido (sem mensagem)';
        const errName = (e && e.name) || 'Error';
        return json({ error: `Falha ao chamar IndexNow [${errName}]: ${errMsg}` }, 502, origin);
      }
    }

    // ── POST /index-google — notifica Google via Indexing API ──
    if (request.method === 'POST' && path === '/index-google') {
      const authErr = checkAdminAuth(request, env, origin);
      if (authErr) return authErr;

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'JSON inválido' }, 400, origin); }
      const urls = Array.isArray(body.urls) ? body.urls.filter(u => typeof u === 'string') : [];
      const type = body.type === 'URL_DELETED' ? 'URL_DELETED' : 'URL_UPDATED';
      if (!urls.length) return json({ error: 'urls (array) é obrigatório' }, 400, origin);
      if (!env.GOOGLE_SA_JSON) return json({ error: 'GOOGLE_SA_JSON não configurado no Worker' }, 500, origin);

      try {
        const accessToken = await getGoogleAccessToken(env.GOOGLE_SA_JSON);
        const results = [];
        for (const u of urls) {
          const resp = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: u, type })
          });
          const data = await resp.json().catch(() => ({}));
          results.push({ url: u, ok: resp.ok, status: resp.status, data });
        }
        const allOk = results.every(r => r.ok);
        return json({ ok: allOk, results }, allOk ? 200 : 207, origin);
      } catch (e) {
        return json({ error: 'Falha ao chamar Google Indexing API: ' + e.message }, 502, origin);
      }
    }

    // ── POST /ai-generate — proxy para provedores de IA (Content Studio) ──
    if (request.method === 'POST' && path === '/ai-generate') {
      const authErr = checkAdminAuth(request, env, origin);
      if (authErr) return authErr;

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'JSON inválido' }, 400, origin); }
      const { provider, apiKey, model, systemPrompt, userPrompt } = body;
      if (!provider) return json({ error: 'provider é obrigatório' }, 400, origin);
      if (!apiKey)   return json({ error: 'apiKey é obrigatório' }, 400, origin);
      if (!userPrompt) return json({ error: 'userPrompt é obrigatório' }, 400, origin);

      try {
        const text = await callAIProvider(provider, apiKey, model, systemPrompt, userPrompt);
        return json({ ok: true, text }, 200, origin);
      } catch (e) {
        return json({ error: e.message || 'Falha ao chamar o provedor de IA' }, 502, origin);
      }
    }

    return json({ error: 'not found' }, 404, origin);
  }
};

// ════════════════════════════════════════════════════════════════
// CONTENT STUDIO — proxy unificado para provedores de IA de texto
// ════════════════════════════════════════════════════════════════
async function callAIProvider(provider, apiKey, model, systemPrompt, userPrompt) {
  switch (provider) {
    case 'gemini':   return callGemini(apiKey, model || 'gemini-2.5-flash', systemPrompt, userPrompt);
    case 'openai':   return callOpenAICompatible('https://api.openai.com/v1/chat/completions', apiKey, model || 'gpt-5.4-mini', systemPrompt, userPrompt);
    case 'grok':     return callOpenAICompatible('https://api.x.ai/v1/chat/completions', apiKey, model || 'grok-4.3', systemPrompt, userPrompt);
    case 'deepseek': return callOpenAICompatible('https://api.deepseek.com/chat/completions', apiKey, model || 'deepseek-v4-flash', systemPrompt, userPrompt);
    case 'claude':   return callClaude(apiKey, model || 'claude-sonnet-4-6', systemPrompt, userPrompt);
    default: throw new Error(`Provedor desconhecido: ${provider}`);
  }
}

async function callGemini(apiKey, model, systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
  };
  if (systemPrompt) body.system_instruction = { parts: [{ text: systemPrompt }] };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body)
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Gemini: ${data?.error?.message || resp.status}`);
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  if (!text) throw new Error('Gemini: resposta vazia (possível bloqueio de conteúdo ou erro silencioso)');
  return text;
}

async function callOpenAICompatible(url, apiKey, model, systemPrompt, userPrompt) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`${data?.error?.message || resp.status}`);
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Resposta vazia da API');
  return text;
}

async function callClaude(apiKey, model, systemPrompt, userPrompt) {
  const body = {
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: userPrompt }]
  };
  if (systemPrompt) body.system = systemPrompt;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Claude: ${data?.error?.message || resp.status}`);
  const text = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!text) throw new Error('Claude: resposta vazia');
  return text;
}

// ════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO SIMPLES PARA ENDPOINTS DE INDEXAÇÃO
// ════════════════════════════════════════════════════════════════
function checkAdminAuth(request, env, origin) {
  if (!env.ADMIN_SECRET) return json({ error: 'ADMIN_SECRET não configurado no Worker' }, 500, origin);
  const header = request.headers.get('X-Admin-Secret') || '';
  if (header !== env.ADMIN_SECRET) return json({ error: 'Não autorizado' }, 401, origin);
  return null;
}

// ════════════════════════════════════════════════════════════════
// GOOGLE INDEXING API — geração de access token via Service Account
// (assina um JWT com a chave privada RSA e troca por access_token)
// ════════════════════════════════════════════════════════════════
let _cachedToken = null; // { token, exp } — cache em memória da instância do Worker

async function getGoogleAccessToken(saJsonStr) {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && _cachedToken.exp - 60 > now) return _cachedToken.token;

  const sa = JSON.parse(saJsonStr);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const encHeader = base64url(JSON.stringify(header));
  const encClaim  = base64url(JSON.stringify(claimSet));
  const signInput = `${encHeader}.${encClaim}`;

  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signInput)
  );
  const jwt = `${signInput}.${base64urlFromBuffer(signature)}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error('Falha ao obter access_token: ' + JSON.stringify(data));
  }

  _cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return data.access_token;
}

function importPrivateKey(pem) {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(pemBody);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function base64url(str) {
  return base64urlFromBuffer(new TextEncoder().encode(str));
}

function base64urlFromBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
