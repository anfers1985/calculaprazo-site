# -*- coding: utf-8 -*-
# agente_base.py - Modulo compartilhado por todos os agentes do CalculaPrazo
#
# VARIAVEIS DE AMBIENTE NECESSARIAS:
#   OPENROUTER_API_KEY   -> sua chave OpenRouter  (sk-or-v1-...)
#   UNSPLASH_ACCESS_KEY  -> sua chave Unsplash Access Key
#
import os, json, re, datetime, requests, random
from slugify import slugify

HOJE = datetime.date.today()

OPENROUTER_KEY  = os.environ.get("OPENROUTER_API_KEY", "")
UNSPLASH_KEY    = os.environ.get("UNSPLASH_ACCESS_KEY", "")
MODEL           = "anthropic/claude-3-5-haiku"  # modelo principal (fallback automatico no chamar_llm)

CATEGORIAS_VALIDAS = {
    "jurisprudencia-tst":   "Jurisprudencia TST",
    "jurisprudencia-trts":  "Jurisprudencia TRTs",
    "noticias-mte-mpt":     "MTE e MPT",
    "legislacao-normas":    "Legislacao e Normas",
    "esocial-fgts-digital": "eSocial e FGTS Digital",
    "orientacoes-praticas": "Orientacoes Praticas RH",
    "saude-seguranca":      "Saude e Seguranca",
    "modelos":              "Modelos",
    "artigos":              "Artigos",
    "geral":                "Geral",
}

MESES = ["janeiro","fevereiro","marco","abril","maio","junho",
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


# Modelos em ordem de preferencia (fallback automatico se um falhar)
MODELS_FALLBACK = [
    "anthropic/claude-3-5-haiku",
    "anthropic/claude-3-5-sonnet-20241022",
    "openai/gpt-4o-mini",
    "google/gemini-2.0-flash-001",
]

def chamar_llm(prompt, max_tokens=3500, temperature=0.2):
    """Chama OpenRouter com fallback automatico entre modelos."""
    if not OPENROUTER_KEY:
        raise RuntimeError("OPENROUTER_API_KEY nao configurada")

    last_error = None
    for model in MODELS_FALLBACK:
        try:
            r = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": "Bearer " + OPENROUTER_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                },
                timeout=180,
            )
            if r.status_code == 200:
                data = r.json()
                text = data["choices"][0]["message"]["content"].strip()
                if text:
                    print("  LLM OK modelo=" + model)
                    return text
            else:
                body = r.text[:300]
                print("  LLM erro " + str(r.status_code) + " modelo=" + model + " | " + body)
                last_error = "HTTP " + str(r.status_code) + ": " + body
        except Exception as e:
            print("  LLM excecao modelo=" + model + ": " + str(e))
            last_error = str(e)

    raise RuntimeError("Todos os modelos falharam. Ultimo erro: " + str(last_error))


def obter_imagem_url(image_query, categoria):
    """Busca imagem via Unsplash API. Fallback para imagem padrao."""
    query    = re.sub(r'[^a-zA-Z0-9 ]', '', (image_query or "")).strip()
    fallback = "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=1200&auto=format&fit=crop"

    if len(query) < 5:
        query = UNSPLASH_QUERY_CAT.get(categoria, "law justice professional")

    if not UNSPLASH_KEY:
        print("  AVISO: UNSPLASH_ACCESS_KEY nao configurada -- usando imagem padrao")
        query_url = query.replace(" ", ",")
        return "https://source.unsplash.com/1200x600/?" + query_url

    for q in [query, UNSPLASH_QUERY_CAT.get(categoria, "law")]:
        if not q:
            continue
        try:
            r = requests.get(
                "https://api.unsplash.com/photos/random",
                headers={"Authorization": "Client-ID " + UNSPLASH_KEY},
                params={"query": q, "orientation": "landscape", "count": 5},
                timeout=15,
            )
            if r.ok:
                photos = r.json()
                if isinstance(photos, list) and photos:
                    foto = random.choice(photos[:5])
                    url = foto.get("urls", {}).get("regular") or foto.get("urls", {}).get("full")
                    if url:
                        return url
        except Exception as e:
            print("  AVISO Unsplash: " + str(e))

    return fallback


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
        return False, "Conteudo curto: " + str(words) + " palavras (min 300)"

    if '<h2' not in content.lower():
        return False, "Sem H2 no conteudo"

    if not tags:
        return False, "Sem tags"

    if categoria not in CATEGORIAS_VALIDAS:
        return False, "Categoria invalida: " + categoria

    return True, "OK"


def is_duplicata(title, posts_path="data/posts.json"):
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


def salvar_post(dados, categoria, fonte_nome=""):
    try:
        data_str  = HOJE.strftime("%Y-%m-%d")
        data_br   = str(HOJE.day) + " de " + MESES[HOJE.month - 1] + " de " + str(HOJE.year)
        slug      = slugify(dados["title"])[:60]
        cat_label = CATEGORIAS_VALIDAS.get(categoria, categoria)

        with open("blog/POST_TEMPLATE.html", encoding="utf-8") as f:
            template = f.read()

        tags       = dados.get("tags", [])[:4]
        tags_json  = json.dumps(tags, ensure_ascii=False)
        source_url = dados.get("source_url", "")

        tags_badges = ""
        for t in tags:
            tags_badges += (
                '<span style="display:inline-block;padding:3px 12px;border-radius:999px;'
                'font-size:.72rem;font-weight:700;background:rgba(255,255,255,.15);'
                'color:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.25);'
                'margin-right:5px;">' + t + '</span>'
            )

        fonte_nota = ""
        if source_url:
            fonte_nota = (
                '\n<p style="font-size:.78rem;color:#64748B;margin-top:28px;'
                'padding-top:12px;border-top:1px solid #E2E8F0;">'
                '<strong>Fonte:</strong> '
                '<a href="' + source_url + '" target="_blank" rel="noopener noreferrer">'
                + (fonte_nome or source_url) + '</a> -- acesso em ' + data_br + '.</p>'
            )
        elif fonte_nome:
            fonte_nota = (
                '\n<p style="font-size:.78rem;color:#64748B;margin-top:28px;'
                'padding-top:12px;border-top:1px solid #E2E8F0;">'
                '<strong>Fonte:</strong> ' + fonte_nome + ' -- ' + data_br + '.</p>'
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
            .replace("{{OG_IMAGE}}",         '<meta property="og:image" content="' + img + '">')
            .replace("{{SCHEMA_IMAGE}}",     ',"image":"' + img + '"')
            .replace("{{COVER_IMAGE_HTML}}", (
                '<div style="margin-bottom:24px;border-radius:12px;overflow:hidden;max-height:380px;">'
                '<img src="' + img + '" alt="' + dados["title"] + '" '
                'style="width:100%;object-fit:cover;" loading="lazy" '
                'onerror="this.parentElement.style.display=\'none\'"></div>'
            ))
        )

        blog_path = "blog/" + slug + ".html"
        with open(blog_path, "w", encoding="utf-8") as f:
            f.write(html)
        print("  OK Post salvo: " + blog_path)
        print("  OK Imagem: " + img)

        # Atualizar data/posts.json
        try:
            with open("data/posts.json", encoding="utf-8") as f:
                posts = json.load(f)
            if not isinstance(posts, list):
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
            with open("data/posts.json", "w", encoding="utf-8") as f:
                json.dump(posts, f, ensure_ascii=False, indent=2)
            print("  OK posts.json atualizado (" + str(len(posts)) + " posts)")

        _atualizar_sitemap(slug, data_str)
        return True

    except Exception as e:
        import traceback
        print("  ERRO ao salvar post: " + str(e))
        traceback.print_exc()
        return False


def _atualizar_sitemap(slug, data_str):
    try:
        nova_url = "https://calculaprazo.com.br/blog/" + slug
        with open("sitemap.xml", "r", encoding="utf-8") as f:
            sc = f.read()
        if nova_url in sc:
            return
        nova_entrada = (
            "  <url>\n    <loc>" + nova_url + "</loc>\n"
            "    <lastmod>" + data_str + "</lastmod>\n"
            "    <changefreq>monthly</changefreq>\n"
            "    <priority>0.8</priority>\n  </url>\n"
        )
        sc = sc.replace("</urlset>", nova_entrada + "</urlset>")
        with open("sitemap.xml", "w", encoding="utf-8") as f:
            f.write(sc)
        print("  OK sitemap.xml atualizado")
    except Exception as e:
        print("  AVISO sitemap: " + str(e))
