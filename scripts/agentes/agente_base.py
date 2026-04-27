# -*- coding: utf-8 -*-
# agente_base.py — Módulo compartilhado CalculaPrazo
#
# Cadeia de fallback (100% gratuita):
#   1. Groq    → llama-3.3-70b (avaliação) / llama-3.1-8b-instant (geração)
#   2. Gemini  → gemini-2.0-flash / gemini-2.0-flash-lite / gemini-1.5-flash-8b
#   3. GLM     → glm-4-flash-250414
#   4. Qwen    → qwen-turbo
#   5. OpenRouter → modelos :free rotativos
#
# VARIÁVEIS DE AMBIENTE (Secrets no GitHub):
#   GROQ_API_KEY         → Groq Cloud (principal)
#   GEMINI_API_KEY       → Google AI Studio
#   GLM_API_KEY          → Zhipu AI
#   QWEN_API_KEY         → Alibaba Qwen
#   GROK_API_KEY         → xAI Grok (quando conta tiver créditos)
#   OPENROUTER_API_KEY   → OpenRouter :free
#   UNSPLASH_ACCESS_KEY  → Unsplash
#
import os, json, re, datetime, requests, random, time
from slugify import slugify

HOJE = datetime.date.today()

GROQ_KEY       = os.environ.get("GROQ_API_KEY", "")
GEMINI_KEY     = os.environ.get("GEMINI_API_KEY", "")
GLM_KEY        = os.environ.get("GLM_API_KEY", "")
QWEN_KEY       = os.environ.get("QWEN_API_KEY", "")
GROK_KEY       = os.environ.get("GROK_API_KEY", "")
OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")
UNSPLASH_KEY   = os.environ.get("UNSPLASH_ACCESS_KEY", "")

CATEGORIAS_VALIDAS = {
    "jurisprudencia-tst":   "Jurisprudência TST",
    "jurisprudencia-trts":  "Jurisprudência TRTs",
    "noticias-mte-mpt":     "MTE e MPT",
    "legislacao-normas":    "Legislação e Normas",
    "esocial-fgts-digital": "eSocial e FGTS Digital",
    "orientacoes-praticas": "Orientações Práticas RH",
    "saude-seguranca":      "Saúde e Segurança",
    "modelos":              "Modelos",
    "artigos":              "Artigos",
    "geral":                "Geral",
}

MESES = ["janeiro","fevereiro","março","abril","maio","junho",
         "julho","agosto","setembro","outubro","novembro","dezembro"]

UNSPLASH_QUERY_CAT = {
    "jurisprudencia-tst":   "justice court gavel law",
    "jurisprudencia-trts":  "labor court hearing workplace",
    "noticias-mte-mpt":     "labor inspection ministry workers",
    "legislacao-normas":    "law books legislation documents",
    "esocial-fgts-digital": "digital documents payroll technology",
    "orientacoes-praticas": "human resources office meeting",
    "saude-seguranca":      "workplace safety helmet worker",
    "modelos":              "document contract signing",
    "artigos":              "writing law books desk",
    "geral":                "law justice office professional",
}


# ─────────────────────────────────────────────────────────────────────────────
# 1. GROQ
# Limites free tier:
#   llama-3.3-70b-versatile → 6.000 TPM  (avaliação — chamadas curtas)
#   llama-3.1-8b-instant    → 20.000 TPM (geração   — chamadas longas)
# ─────────────────────────────────────────────────────────────────────────────
def _groq_request(modelo, prompt, max_tokens, temperature):
    if not GROQ_KEY:
        raise RuntimeError("GROQ_API_KEY não configurada")
    r = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"},
        json={"model": modelo,
              "messages": [{"role": "user", "content": prompt}],
              "max_tokens": min(max_tokens, 8000),
              "temperature": temperature},
        timeout=180,
    )
    if r.status_code == 200:
        t = r.json()["choices"][0]["message"]["content"].strip()
        if t:
            print(f"  LLM OK modelo=groq/{modelo}")
            return t
        raise RuntimeError(f"Groq {modelo}: resposta vazia")
    elif r.status_code == 429:
        raise RuntimeError(f"Groq {modelo}: 429 rate limit")
    elif r.status_code == 413:
        raise RuntimeError(f"Groq {modelo}: 413 request too large")
    elif r.status_code == 400:
        msg = r.json().get("error", {}).get("message", r.text[:100])
        if "decommissioned" in msg.lower() or "no longer supported" in msg.lower():
            raise RuntimeError(f"Groq {modelo}: modelo desativado")
        raise RuntimeError(f"Groq {modelo}: HTTP 400: {msg[:100]}")
    else:
        raise RuntimeError(f"Groq {modelo}: HTTP {r.status_code}: {r.text[:100]}")


def _groq_avaliacao(prompt, max_tokens, temperature):
    """Chamadas curtas (~700 tokens) — usa llama-3.3-70b (qualidade)."""
    for modelo in ["llama-3.3-70b-versatile", "llama3-70b-8192"]:
        try:
            return _groq_request(modelo, prompt, max_tokens, temperature)
        except RuntimeError as e:
            print(f"  Groq avaliação {modelo}: {str(e)[:80]}")
    raise RuntimeError("Groq avaliação: todos os modelos falharam")


def _groq_geracao(prompt, max_tokens, temperature):
    """Chamadas longas (~10k tokens) — usa llama-3.1-8b-instant (20k TPM)."""
    for modelo in ["llama-3.1-8b-instant"]:
        try:
            return _groq_request(modelo, prompt, max_tokens, temperature)
        except RuntimeError as e:
            print(f"  Groq geração {modelo}: {str(e)[:80]}")
    raise RuntimeError("Groq geração: todos os modelos falharam")


# ─────────────────────────────────────────────────────────────────────────────
# 2. GEMINI — 3 modelos com quotas independentes
# ─────────────────────────────────────────────────────────────────────────────
def _gemini(prompt, max_tokens, temperature):
    if not GEMINI_KEY:
        raise RuntimeError("GEMINI_API_KEY não configurada")
    for modelo in ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash-8b"]:
        try:
            r = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={GEMINI_KEY}",
                json={"contents": [{"parts": [{"text": prompt}]}],
                      "generationConfig": {"maxOutputTokens": max_tokens, "temperature": temperature}},
                timeout=120,
            )
            if r.status_code == 200:
                c = r.json().get("candidates", [{}])[0]
                if c.get("finishReason") == "SAFETY":
                    continue
                t = c.get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                if t:
                    print(f"  LLM OK modelo={modelo}")
                    return t
            elif r.status_code == 429:
                print(f"  Gemini {modelo} 429 — próximo...")
            elif r.status_code == 404:
                print(f"  Gemini {modelo} 404 — próximo...")
            else:
                print(f"  Gemini {modelo} HTTP {r.status_code}")
        except Exception as e:
            print(f"  Gemini {modelo} exceção: {e}")
    raise RuntimeError("Gemini: todos os modelos falharam")


# ─────────────────────────────────────────────────────────────────────────────
# 3. GLM — Zhipu AI
# ─────────────────────────────────────────────────────────────────────────────
def _glm(prompt, max_tokens, temperature):
    if not GLM_KEY:
        raise RuntimeError("GLM_API_KEY não configurada")
    for modelo in ["glm-4-flash-250414", "glm-4-air", "glm-z1-flash", "glm-4-flash"]:
        try:
            r = requests.post(
                "https://open.bigmodel.cn/api/paas/v4/chat/completions",
                headers={"Authorization": f"Bearer {GLM_KEY}", "Content-Type": "application/json"},
                json={"model": modelo,
                      "messages": [{"role": "user", "content": prompt}],
                      "max_tokens": min(max_tokens, 4096),
                      "temperature": temperature},
                timeout=120,
            )
            if r.status_code == 200:
                t = r.json()["choices"][0]["message"]["content"].strip()
                if t:
                    print(f"  LLM OK modelo={modelo}")
                    return t
            elif r.status_code == 400:
                code = str(r.json().get("error", {}).get("code", ""))
                if code == "1211":
                    continue  # modelo não existe, tenta próximo silenciosamente
                print(f"  GLM {modelo} HTTP 400")
            elif r.status_code == 429:
                print(f"  GLM {modelo} 429 — próximo...")
        except Exception as e:
            print(f"  GLM {modelo} exceção: {e}")
    raise RuntimeError("GLM: nenhum modelo disponível")


# ─────────────────────────────────────────────────────────────────────────────
# 4. QWEN — Alibaba
# ─────────────────────────────────────────────────────────────────────────────
def _qwen(prompt, max_tokens, temperature):
    if not QWEN_KEY:
        raise RuntimeError("QWEN_API_KEY não configurada")
    r = requests.post(
        "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        headers={"Authorization": f"Bearer {QWEN_KEY}", "Content-Type": "application/json"},
        json={"model": "qwen-turbo",
              "messages": [{"role": "user", "content": prompt}],
              "max_tokens": min(max_tokens, 4096),
              "temperature": temperature},
        timeout=120,
    )
    if r.status_code == 200:
        t = r.json()["choices"][0]["message"]["content"].strip()
        if t:
            print("  LLM OK modelo=qwen-turbo")
            return t
        raise RuntimeError("Qwen: resposta vazia")
    elif r.status_code == 401:
        raise RuntimeError("Qwen 401: chave inválida")
    else:
        raise RuntimeError(f"Qwen HTTP {r.status_code}: {r.text[:100]}")


# ─────────────────────────────────────────────────────────────────────────────
# 5. GROK — xAI
# ─────────────────────────────────────────────────────────────────────────────
def _grok(prompt, max_tokens, temperature):
    if not GROK_KEY:
        raise RuntimeError("GROK_API_KEY não configurada")
    r = requests.post(
        "https://api.x.ai/v1/chat/completions",
        headers={"Authorization": f"Bearer {GROK_KEY}", "Content-Type": "application/json"},
        json={"model": "grok-3-mini",
              "messages": [{"role": "user", "content": prompt}],
              "max_tokens": min(max_tokens, 4096),
              "temperature": temperature},
        timeout=120,
    )
    if r.status_code == 200:
        t = r.json()["choices"][0]["message"]["content"].strip()
        if t:
            print("  LLM OK modelo=grok-3-mini")
            return t
        raise RuntimeError("Grok: resposta vazia")
    elif r.status_code in (401, 403):
        raise RuntimeError(f"Grok {r.status_code} (sem créditos)")
    else:
        raise RuntimeError(f"Grok HTTP {r.status_code}: {r.text[:100]}")


# ─────────────────────────────────────────────────────────────────────────────
# 6. OPENROUTER — modelos :free confirmados ativos
# ─────────────────────────────────────────────────────────────────────────────
def _openrouter_free(prompt, max_tokens, temperature):
    if not OPENROUTER_KEY:
        raise RuntimeError("OPENROUTER_API_KEY não configurada")
    modelos = [
        "meta-llama/llama-3.3-70b-instruct:free",
        "google/gemma-3-27b-it:free",
    ]
    random.shuffle(modelos)
    last_error = None
    for model in modelos:
        try:
            r = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENROUTER_KEY}",
                         "Content-Type": "application/json",
                         "HTTP-Referer": "https://calculaprazo.com.br",
                         "X-Title": "CalculaPrazo Blog Agent"},
                json={"model": model,
                      "messages": [{"role": "user", "content": prompt}],
                      "max_tokens": min(max_tokens, 4096),
                      "temperature": temperature},
                timeout=120,
            )
            if r.status_code == 200:
                t = r.json()["choices"][0]["message"]["content"].strip()
                if t:
                    print(f"  LLM OK modelo={model}")
                    return t
            elif r.status_code == 429:
                last_error = f"429: {model}"
                print(f"  OpenRouter 429 {model} — aguardando 5s...")
                time.sleep(5)
            else:
                last_error = f"HTTP {r.status_code} {model}"
        except Exception as e:
            last_error = str(e)
    raise RuntimeError("OpenRouter :free esgotado. Último: " + str(last_error))


# ─────────────────────────────────────────────────────────────────────────────
# DISPATCHER PRINCIPAL
# Detecta pelo max_tokens se é chamada curta (avaliação) ou longa (geração)
# ─────────────────────────────────────────────────────────────────────────────
def chamar_llm(prompt, max_tokens=4000, temperature=0.2):
    eh_avaliacao = max_tokens <= 400 or len(prompt) < 2000

    if eh_avaliacao:
        # Avaliação: prioriza qualidade (llama-3.3-70b)
        provedores = [
            ("Groq-70b",   lambda p,m,t: _groq_avaliacao(p,m,t)),
            ("Gemini",     _gemini),
            ("Groq-8b",    lambda p,m,t: _groq_geracao(p,m,t)),
            ("GLM",        _glm),
            ("OpenRouter", _openrouter_free),
        ]
    else:
        # Geração: prioriza throughput (llama-3.1-8b-instant = 20k TPM)
        provedores = [
            ("Groq-8b",    lambda p,m,t: _groq_geracao(p,m,t)),
            ("Gemini",     _gemini),
            ("GLM",        _glm),
            ("Qwen",       _qwen),
            ("Grok",       _grok),
            ("OpenRouter", _openrouter_free),
            ("Groq-70b",   lambda p,m,t: _groq_avaliacao(p,m,t)),
        ]

    last_error = None
    for nome, func in provedores:
        try:
            return func(prompt, max_tokens, temperature)
        except RuntimeError as e:
            last_error = str(e)
            if "401" not in last_error and "403" not in last_error:
                print(f"  [{nome}] falhou: {last_error[:120]}")
            else:
                print(f"  [{nome}] não disponível")
    raise RuntimeError("Todas as APIs falharam. Último: " + str(last_error))


# ─────────────────────────────────────────────────────────────────────────────
# IMAGEM
# ─────────────────────────────────────────────────────────────────────────────
def obter_imagem_url(image_query, categoria):
    query = re.sub(r'[^a-zA-Z0-9 ]', '', (image_query or "")).strip()
    fallback = "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=1200&auto=format&fit=crop"
    if len(query) < 5:
        query = UNSPLASH_QUERY_CAT.get(categoria, "law justice professional")
    if not UNSPLASH_KEY:
        return fallback
    for q in [query, UNSPLASH_QUERY_CAT.get(categoria, "law")]:
        if not q:
            continue
        try:
            r = requests.get(
                "https://api.unsplash.com/photos/random",
                headers={"Authorization": "Client-ID " + UNSPLASH_KEY},
                params={"query": q, "orientation": "landscape", "count": 1},
                timeout=15,
            )
            if r.ok:
                photos = r.json()
                if isinstance(photos, list) and photos:
                    url = photos[0].get("urls", {}).get("regular")
                    if url:
                        return url
                elif isinstance(photos, dict):
                    url = photos.get("urls", {}).get("regular")
                    if url:
                        return url
        except Exception as e:
            print("  AVISO Unsplash: " + str(e))
    return fallback


# ─────────────────────────────────────────────────────────────────────────────
# VALIDAÇÃO
# ─────────────────────────────────────────────────────────────────────────────
def validar_qualidade(dados, categoria):
    title   = dados.get("title", "")
    excerpt = dados.get("excerpt", "")
    content = dados.get("content", "")
    tags    = dados.get("tags", [])
    if not title or len(title.strip()) < 10:
        return False, "Titulo ausente ou muito curto"
    genericos = ["novas tendencias","tendencias","atualizacao","novidades",
                 "analise pos","novas fronteiras","perspectivas","o futuro"]
    if any(g in title.lower() for g in genericos):
        return False, "Titulo generico: " + title
    if not excerpt or len(excerpt.strip()) < 30:
        return False, "Excerpt ausente ou muito curto"
    words = len(re.sub(r'<[^>]+>', ' ', content).split())
    if words < 300:
        return False, f"Conteudo curto: {words} palavras (min 300)"
    if '<h2' not in content.lower():
        return False, "Sem H2 no conteudo"
    if not tags:
        return False, "Sem tags"
    if categoria not in CATEGORIAS_VALIDAS:
        return False, "Categoria invalida: " + categoria
    return True, "OK"


def is_duplicata(title, posts_path="data/posts.json"):
    if not os.path.exists(posts_path):
        return False
    try:
        with open(posts_path, encoding="utf-8") as f:
            posts = json.load(f)
        if not isinstance(posts, list):
            return False
    except Exception:
        return False
    title_lower = title.lower().strip()
    slug_novo   = slugify(title)[:40]
    for p in posts:
        existing_slug  = p.get("id", "")
        existing_title = p.get("title", "").lower()
        if slug_novo in existing_slug or existing_slug in slug_novo:
            return True
        words_new = set(title_lower.split())
        words_old = set(existing_title.split())
        if len(words_new) > 3 and len(words_old) > 3:
            common = words_new & words_old
            if len(common) / max(len(words_new), len(words_old)) > 0.75:
                return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# SALVAR POST
# ─────────────────────────────────────────────────────────────────────────────
def salvar_post(dados, categoria, fonte_nome=""):
    try:
        data_str  = HOJE.strftime("%Y-%m-%d")
        data_br   = str(HOJE.day) + " de " + MESES[HOJE.month - 1] + " de " + str(HOJE.year)
        slug      = slugify(dados["title"])[:60]
        cat_label = CATEGORIAS_VALIDAS.get(categoria, categoria)

        template_path = "blog/POST_TEMPLATE.html"
        if not os.path.exists(template_path):
            print(f"  ERRO: Template {template_path} não encontrado.")
            return False

        with open(template_path, encoding="utf-8") as f:
            template = f.read()

        tags       = dados.get("tags", [])[:4]
        tags_json  = json.dumps(tags, ensure_ascii=False)
        source_url = dados.get("source_url", "")

        tags_badges = "".join([
            f'<span style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:.72rem;font-weight:700;background:rgba(255,255,255,.15);color:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.25);margin-right:5px;">{t}</span>'
            for t in tags
        ])

        fonte_nota = ""
        if source_url:
            fonte_nota = (
                f'\n<p style="font-size:.78rem;color:#64748B;margin-top:28px;'
                f'padding-top:12px;border-top:1px solid #E2E8F0;">'
                f'<strong>Fonte:</strong> '
                f'<a href="{source_url}" target="_blank" rel="noopener noreferrer">'
                f'{fonte_nome or source_url}</a> — acesso em {data_br}.</p>'
            )
        elif fonte_nome:
            fonte_nota = (
                f'\n<p style="font-size:.78rem;color:#64748B;margin-top:28px;'
                f'padding-top:12px;border-top:1px solid #E2E8F0;">'
                f'<strong>Fonte:</strong> {fonte_nome} — {data_br}.</p>'
            )

        content_final = dados.get("content", "") + fonte_nota
        image_query   = dados.get("image_query", dados.get("title", ""))
        img           = obter_imagem_url(image_query, categoria)

        html = (template
            .replace("{{TITLE}}",            dados["title"])
            .replace("{{DESCRIPTION}}",      dados["excerpt"])
            .replace("{{SLUG}}",             slug)
            .replace("{{CATEGORY}}",         categoria)
            .replace("{{CATEGORY_LABEL}}",   cat_label)
            .replace("{{TAGS_BADGES}}",      tags_badges)
            .replace("{{TAGS_JSON}}",        tags_json)
            .replace("{{DATE}}",             data_str)
            .replace("{{DATE_BR}}",          data_br)
            .replace("{{CONTENT}}",          content_final)
            .replace("{{OG_IMAGE}}",         f'<meta property="og:image" content="{img}">')
            .replace("{{SCHEMA_IMAGE}}",     f',"image":"{img}"')
            .replace("{{COVER_IMAGE_HTML}}", (
                f'<div style="margin-bottom:24px;border-radius:12px;overflow:hidden;">'
                f'<img src="{img}" alt="{dados["title"]}" width="1200" height="630" '
                f'style="width:100%;height:auto;object-fit:cover;display:block;" loading="lazy" '
                f'onerror="this.parentElement.style.display=\'none\'"></div>'
            ))
        )

        blog_path = f"blog/{slug}.html"
        with open(blog_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  OK Post salvo: {blog_path}")

        posts_path = "data/posts.json"
        try:
            if os.path.exists(posts_path):
                with open(posts_path, encoding="utf-8") as f:
                    posts = json.load(f)
            else:
                posts = []
        except Exception:
            posts = []

        if not any(p.get("id") == slug for p in posts):
            posts.insert(0, {
                "id":             slug,
                "title":          dados["title"],
                "category":       categoria,
                "category_label": cat_label,
                "tags":           tags,
                "excerpt":        dados["excerpt"],
                "image":          img,
                "date":           data_str,
                "source":         fonte_nome,
                "source_url":     source_url,
            })
            with open(posts_path, "w", encoding="utf-8") as f:
                json.dump(posts, f, ensure_ascii=False, indent=2)
            print(f"  OK posts.json atualizado ({len(posts)} posts)")

        _atualizar_sitemap(slug, data_str)
        return True

    except Exception as e:
        import traceback
        print(f"  ERRO ao salvar post: {str(e)}")
        traceback.print_exc()
        return False


def _atualizar_sitemap(slug, data_str):
    try:
        sitemap_path = "sitemap.xml"
        if not os.path.exists(sitemap_path):
            return
        nova_url = f"https://calculaprazo.com.br/blog/{slug}"
        with open(sitemap_path, "r", encoding="utf-8") as f:
            sc = f.read()
        if nova_url in sc:
            return
        nova_entrada = (
            f"  <url>\n    <loc>{nova_url}</loc>\n"
            f"    <lastmod>{data_str}</lastmod>\n"
            f"    <changefreq>monthly</changefreq>\n"
            f"    <priority>0.8</priority>\n  </url>\n"
        )
        sc = sc.replace("</urlset>", nova_entrada + "</urlset>")
        with open(sitemap_path, "w", encoding="utf-8") as f:
            f.write(sc)
        print("  OK sitemap.xml atualizado")
    except Exception as e:
        print(f"  AVISO sitemap: {str(e)}")
