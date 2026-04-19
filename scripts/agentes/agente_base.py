# -*- coding: utf-8 -*-
# agente_base.py — Módulo compartilhado CalculaPrazo
#
# VARIÁVEIS DE AMBIENTE (Secrets no GitHub):
#   GEMINI_API_KEY       -> Google AI Studio (primário)
#   GLM_API_KEY          -> Zhipu AI ChatGLM (secundário)
#   GROK_API_KEY         -> xAI Grok (terciário — quando conta tiver créditos)
#   OPENROUTER_API_KEY   -> OpenRouter modelos :free (fallback)
#   UNSPLASH_ACCESS_KEY  -> Unsplash (imagens)
#
# NOTA SOBRE QWEN: A QWEN_API_KEY cadastrada no GitHub está com erro 401
# (chave inválida para o endpoint DashScope). Removida da cadeia até revalidação.
# Para reativar: acesse https://bailian.console.aliyun.com/ e gere nova chave sk-...
#
import os, json, re, datetime, requests, random, time
from slugify import slugify

HOJE = datetime.date.today()

GEMINI_KEY     = os.environ.get("GEMINI_API_KEY", "")
GLM_KEY        = os.environ.get("GLM_API_KEY", "")
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
# PROVEDORES LLM
# ─────────────────────────────────────────────────────────────────────────────

def _gemini(prompt, max_tokens, temperature):
    """Google AI Studio.
    
    Usa DOIS modelos com quotas independentes para maximizar disponibilidade:
      - gemini-2.0-flash       → 1.500 req/dia
      - gemini-2.0-flash-lite  → quota separada, mais leve
      - gemini-1.5-flash-8b    → quota separada (modelo pequeno, muito rápido)
    
    CORRIGIDO: gemini-1.5-flash foi descontinuado (retornava 404).
    """
    if not GEMINI_KEY:
        raise RuntimeError("GEMINI_API_KEY não configurada")

    modelos_gemini = [
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-1.5-flash-8b",
    ]
    last_error = None
    for modelo in modelos_gemini:
        try:
            url = (
                "https://generativelanguage.googleapis.com/v1beta/models/"
                + modelo + ":generateContent?key=" + GEMINI_KEY
            )
            r = requests.post(
                url,
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "maxOutputTokens": max_tokens,
                        "temperature": temperature,
                    },
                },
                timeout=120,
            )
            if r.status_code == 200:
                candidate = r.json().get("candidates", [{}])[0]
                if candidate.get("finishReason") == "SAFETY":
                    last_error = f"{modelo}: bloqueado por segurança"
                    continue
                text = (candidate
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "").strip())
                if text:
                    print(f"  LLM OK modelo={modelo}")
                    return text
                last_error = f"{modelo}: resposta vazia"
            elif r.status_code == 429:
                last_error = f"{modelo}: 429 rate limit"
                print(f"  Gemini {modelo} 429 — tentando próximo modelo...")
            elif r.status_code == 404:
                last_error = f"{modelo}: 404 não encontrado"
                print(f"  Gemini {modelo} 404 — tentando próximo modelo...")
            else:
                last_error = f"{modelo}: HTTP {r.status_code}: {r.text[:100]}"
                print(f"  Gemini {modelo} {r.status_code}")
        except Exception as e:
            last_error = str(e)
            print(f"  Gemini {modelo} exceção: {e}")
    raise RuntimeError("Gemini: todos os modelos falharam. Último: " + str(last_error))


def _glm(prompt, max_tokens, temperature):
    """Zhipu AI — glm-4-flash-250414.
    
    CORRIGIDO: glm-4-flash foi descontinuado (retornava HTTP 400 código 1211).
    Modelo atual confirmado: glm-4-flash-250414
    Quota gratuita: muito generosa (milhões de tokens/mês).
    """
    if not GLM_KEY:
        raise RuntimeError("GLM_API_KEY não configurada")

    # Tenta o modelo atual e o anterior como fallback
    modelos_glm = ["glm-4-flash-250414", "glm-4-flash", "glm-4-flash-2"]
    last_error = None
    for modelo in modelos_glm:
        try:
            r = requests.post(
                "https://open.bigmodel.cn/api/paas/v4/chat/completions",
                headers={
                    "Authorization": "Bearer " + GLM_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "model": modelo,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": min(max_tokens, 4096),
                    "temperature": temperature,
                },
                timeout=120,
            )
            if r.status_code == 200:
                text = r.json()["choices"][0]["message"]["content"].strip()
                if text:
                    print(f"  LLM OK modelo={modelo}")
                    return text
                last_error = f"{modelo}: resposta vazia"
            elif r.status_code == 400:
                err = r.json().get("error", {})
                code = err.get("code", "")
                if code == "1211":
                    last_error = f"{modelo}: modelo não existe (1211)"
                    print(f"  GLM {modelo} não existe — tentando próximo...")
                else:
                    last_error = f"{modelo}: HTTP 400: {r.text[:150]}"
            elif r.status_code == 429:
                last_error = f"{modelo}: 429 rate limit"
                print(f"  GLM {modelo} 429 — tentando próximo modelo...")
            else:
                last_error = f"{modelo}: HTTP {r.status_code}: {r.text[:150]}"
                print(f"  GLM {modelo} {r.status_code}")
        except Exception as e:
            last_error = str(e)
            print(f"  GLM {modelo} exceção: {e}")
    raise RuntimeError("GLM: todos os modelos falharam. Último: " + str(last_error))


def _grok(prompt, max_tokens, temperature):
    """xAI Grok — grok-3-mini.
    Funciona apenas quando a conta tiver créditos ativos no console.x.ai.
    Incluído pois a situação pode mudar a qualquer momento.
    """
    if not GROK_KEY:
        raise RuntimeError("GROK_API_KEY não configurada")
    r = requests.post(
        "https://api.x.ai/v1/chat/completions",
        headers={
            "Authorization": "Bearer " + GROK_KEY,
            "Content-Type": "application/json",
        },
        json={
            "model": "grok-3-mini",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": min(max_tokens, 4096),
            "temperature": temperature,
        },
        timeout=120,
    )
    if r.status_code == 200:
        text = r.json()["choices"][0]["message"]["content"].strip()
        if text:
            print("  LLM OK modelo=grok-3-mini")
            return text
        raise RuntimeError("Grok: resposta vazia")
    elif r.status_code in (401, 403):
        raise RuntimeError(f"Grok {r.status_code} (sem permissão/créditos): {r.text[:120]}")
    elif r.status_code == 429:
        raise RuntimeError("Grok 429 (rate limit)")
    else:
        raise RuntimeError(f"Grok HTTP {r.status_code}: {r.text[:150]}")


def _openrouter_free(prompt, max_tokens, temperature):
    """OpenRouter — modelos :free ativos (revisado abr/2026).
    
    REMOVIDOS do log anterior (404): phi-4-reasoning, qwen3-8b, deepseek-r1, mistral-7b
    MANTIDOS (429 = existem, só em rate limit temporário): llama-3.3-70b, gemma-3-27b
    ADICIONADOS (confirmados ativos abr/2026): deepseek-chat-v3, deepseek-r1-zero, devstral-small
    
    Estratégia: embaralha a lista a cada chamada para distribuir o rate limit.
    """
    if not OPENROUTER_KEY:
        raise RuntimeError("OPENROUTER_API_KEY não configurada")

    modelos = [
        "meta-llama/llama-3.3-70b-instruct:free",
        "google/gemma-3-27b-it:free",
        "deepseek/deepseek-chat-v3-0324:free",
        "deepseek/deepseek-r1-zero:free",
        "mistralai/devstral-small:free",
        "nousresearch/deephermes-3-llama-3-8b-preview:free",
    ]
    # Embaralha para não sobrecarregar sempre o mesmo modelo
    random.shuffle(modelos)

    last_error = None
    for model in modelos:
        try:
            r = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": "Bearer " + OPENROUTER_KEY,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://calculaprazo.com.br",
                    "X-Title": "CalculaPrazo Blog Agent",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": min(max_tokens, 4096),
                    "temperature": temperature,
                },
                timeout=120,
            )
            if r.status_code == 200:
                text = r.json()["choices"][0]["message"]["content"].strip()
                if text:
                    print("  LLM OK modelo=" + model)
                    return text
            elif r.status_code == 429:
                last_error = f"429: {model}"
                print(f"  OpenRouter 429 {model} — próximo...")
                time.sleep(2)
            elif r.status_code == 404:
                last_error = f"404 removido: {model}"
                print(f"  OpenRouter 404 {model} — indisponível, próximo...")
            else:
                last_error = f"HTTP {r.status_code} {model}: {r.text[:100]}"
                print(f"  OpenRouter {r.status_code} {model}")
        except Exception as e:
            last_error = str(e)
            print(f"  OpenRouter exceção {model}: {e}")

    raise RuntimeError("OpenRouter :free esgotado. Último erro: " + str(last_error))


# ─────────────────────────────────────────────────────────────────────────────
# DISPATCHER PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

def chamar_llm(prompt, max_tokens=4000, temperature=0.2):
    """
    Cadeia de fallback 100% gratuita:
      1. Gemini   → 3 modelos com quotas independentes (2.0-flash, 2.0-flash-lite, 1.5-flash-8b)
      2. GLM      → glm-4-flash-250414 (Zhipu AI, muito generoso)
      3. Grok     → grok-3-mini (quando conta xAI tiver créditos)
      4. OpenRouter → 6 modelos :free embaralhados
    """
    provedores = [
        ("Gemini",     _gemini),
        ("GLM",        _glm),
        ("Grok",       _grok),
        ("OpenRouter", _openrouter_free),
    ]
    last_error = None
    for nome, func in provedores:
        try:
            return func(prompt, max_tokens=max_tokens, temperature=temperature)
        except RuntimeError as e:
            last_error = str(e)
            print(f"  [{nome}] falhou: {last_error[:150]}")
    raise RuntimeError("Todas as APIs falharam. Último erro: " + str(last_error))


# ─────────────────────────────────────────────────────────────────────────────
# IMAGEM
# ─────────────────────────────────────────────────────────────────────────────

def obter_imagem_url(image_query, categoria):
    query    = re.sub(r'[^a-zA-Z0-9 ]', '', (image_query or "")).strip()
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
    if not title or len(title.strip()) < 10:
        return False, "Titulo ausente ou muito curto"
    if not excerpt or len(excerpt.strip()) < 30:
        return False, "Excerpt ausente ou muito curto"
    words = len(re.sub(r'<[^>]+>', ' ', content).split())
    if words < 300:
        return False, f"Conteudo curto: {words} palavras (min 300)"
    if '<h2' not in content.lower():
        return False, "Sem H2 no conteudo"
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
                f'<div style="margin-bottom:24px;border-radius:12px;overflow:hidden;max-height:380px;">'
                f'<img src="{img}" alt="{dados["title"]}" style="width:100%;object-fit:cover;" loading="lazy" '
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
