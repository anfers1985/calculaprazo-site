# -*- coding: utf-8 -*-
"""
agente_base.py — Módulo compartilhado por todos os agentes do CalculaPrazo.

Variáveis de ambiente necessárias:
  ANTHROPIC_API_KEY  — chave da API Anthropic (Claude)
  PEXELS_API_KEY     — chave da API Pexels  (pexels.com/api — gratuita)
"""

import os, json, re, datetime, requests, random
from slugify import slugify

HOJE = datetime.date.today()

ANTHROPIC_KEY   = os.environ.get("ANTHROPIC_API_KEY", "")
PEXELS_KEY      = os.environ.get("PEXELS_API_KEY", "")
ANTHROPIC_MODEL = "claude-opus-4-5"
ANTHROPIC_URL   = "https://api.anthropic.com/v1/messages"

CATEGORIAS_VALIDAS = {
    "jurisprudencia-tst":   "Jurisprudência TST",
    "jurisprudencia-trts":  "Jurisprudência TRTs",
    "noticias-mte-mpt":     "MTE & MPT",
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

PEXELS_QUERY_CATEGORIA = {
    "jurisprudencia-tst":   "justice court law gavel",
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


def claude(prompt: str, max_tokens: int = 3500, temperature: float = 0.2) -> str:
    """Chama Claude via API Anthropic. Lança RuntimeError em caso de falha."""
    if not ANTHROPIC_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY nao configurada")
    headers = {
        "x-api-key":         ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
    }
    body = {
        "model":       ANTHROPIC_MODEL,
        "max_tokens":  max_tokens,
        "temperature": temperature,
        "messages": [{"role": "user", "content": prompt}],
    }
    r = requests.post(ANTHROPIC_URL, headers=headers, json=body, timeout=180)
    r.raise_for_status()
    return r.json()["content"][0]["text"].strip()


def obter_imagem_url(image_query: str, categoria: str) -> str:
    """Busca imagem via Pexels API (gratuita). Fallback para imagem padrao."""
    query    = re.sub(r'[^a-zA-Z0-9 ]', '', (image_query or "")).strip()
    fallback = "https://images.pexels.com/photos/5668858/pexels-photo-5668858.jpeg?auto=compress&cs=tinysrgb&w=1200"

    if len(query) < 5:
        query = PEXELS_QUERY_CATEGORIA.get(categoria, "law justice professional")

    if not PEXELS_KEY:
        print("  AVISO: PEXELS_API_KEY nao configurada — usando imagem padrao")
        return fallback

    for tentativa_query in [query, PEXELS_QUERY_CATEGORIA.get(categoria, "")]:
        if not tentativa_query:
            continue
        try:
            r = requests.get(
                "https://api.pexels.com/v1/search",
                headers={"Authorization": PEXELS_KEY},
                params={"query": tentativa_query, "per_page": 10, "orientation": "landscape"},
                timeout=15,
            )
            if r.ok:
                photos = r.json().get("photos", [])
                if photos:
                    foto = random.choice(photos[:5])
                    url = foto["src"].get("large2x") or foto["src"].get("large")
                    if url:
                        return url
        except Exception as e:
            print(f"  AVISO Pexels: {e}")

    return fallback


def validar_qualidade(dados: dict, categoria: str) -> tuple:
    title   = dados.get("title", "")
    excerpt = dados.get("excerpt", "")
    content = dados.get("content", "")
    tags    = dados.get("tags", [])

    if not title or len(title.strip()) < 10:
        return False, "Titulo ausente ou muito curto"

    GENERICOS = ["novas tendencias","tendencias","atualizacao","novidades",
                 "analise pos","novas fronteiras","perspectivas","o futuro"]
    if any(g in title.lower() for g in GENERICOS):
        return False, f"Titulo generico: '{title}'"

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
        return False, f"Categoria invalida: '{categoria}'"

    return True, "OK"


def is_duplicata(title: str, posts_path: str = "data/posts.json") -> bool:
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


def salvar_post(dados: dict, categoria: str, fonte_nome: str = "") -> bool:
    try:
        data_str  = HOJE.strftime("%Y-%m-%d")
        data_br   = f"{HOJE.day} de {MESES[HOJE.month - 1]} de {HOJE.year}"
        slug      = slugify(dados["title"])[:60]
        cat_label = CATEGORIAS_VALIDAS.get(categoria, categoria)

        with open("blog/POST_TEMPLATE.html", encoding="utf-8") as f:
            template = f.read()

        tags       = dados.get("tags", [])[:4]
        tags_json  = json.dumps(tags, ensure_ascii=False)
        source_url = dados.get("source_url", "")

        tags_badges = "".join(
            f'<span style="display:inline-block;padding:3px 12px;border-radius:999px;'
            f'font-size:.72rem;font-weight:700;background:rgba(255,255,255,.15);'
            f'color:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.25);'
            f'margin-right:5px;">{t}</span>'
            for t in tags
        )

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

        image_query = dados.get("image_query", dados.get("title", ""))
        img         = obter_imagem_url(image_query, categoria)

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
                f'<img src="{img}" alt="{dados["title"]}" '
                f'style="width:100%;object-fit:cover;" loading="lazy" '
                f'onerror="this.parentElement.style.display=\'none\'"></div>'
            ))
        )

        blog_path = f"blog/{slug}.html"
        with open(blog_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  OK Post salvo: {blog_path}")
        print(f"  OK Imagem: {img}")

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
            print(f"  OK posts.json atualizado ({len(posts)} posts)")

        _atualizar_sitemap(slug, data_str)
        return True

    except Exception as e:
        print(f"  ERRO ao salvar post: {e}")
        import traceback; traceback.print_exc()
        return False


def _atualizar_sitemap(slug: str, data_str: str):
    try:
        sitemap_path = "sitemap.xml"
        nova_url     = f"https://calculaprazo.com.br/blog/{slug}"
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
        print(f"  OK sitemap.xml atualizado")
    except Exception as e:
        print(f"  AVISO sitemap: {e}")
