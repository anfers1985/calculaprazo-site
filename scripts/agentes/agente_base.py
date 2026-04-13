# -*- coding: utf-8 -*-
"""
agente_base.py — Módulo compartilhado por todos os agentes do CalculaPrazo.
Contém: validação de qualidade, salvar_post com sitemap, deduplicação e padrão editorial.
"""

import os, json, re, datetime
from slugify import slugify

HOJE = datetime.date.today()

# ─── Taxonomia de categorias (padrão editorial) ───────────────────────
CATEGORIAS_VALIDAS = {
    "jurisprudencia-tst":   "Jurisprudência TST/STF",
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

# ─── Query de imagem padrão por categoria ────────────────────────────
IMAGEM_QUERY_CATEGORIA = {
    "jurisprudencia-tst":   "supreme court justice gavel law",
    "jurisprudencia-trts":  "labor court hearing workplace law",
    "noticias-mte-mpt":     "labor inspection ministry work regulation",
    "legislacao-normas":    "legislation law books gavel",
    "esocial-fgts-digital": "digital documents HR payroll technology",
    "orientacoes-praticas": "HR human resources office management",
    "saude-seguranca":      "workplace safety health equipment worker",
}


def obter_imagem_url(image_query: str, categoria: str) -> str:
    """
    Monta URL de imagem contextual via source.unsplash.com (sem autenticação).
    Usa image_query gerada pelo modelo; fallback para query da categoria.
    """
    query = re.sub(r'[^a-zA-Z0-9 ]', '', (image_query or "")).strip()
    if len(query) < 5:
        query = IMAGEM_QUERY_CATEGORIA.get(categoria, "law justice workplace")
    query_url = query.replace(' ', ',')
    return f"https://source.unsplash.com/1200x600/?{query_url}"


# ─── Validação de qualidade ───────────────────────────────────────────
def validar_qualidade(dados: dict, categoria: str) -> tuple[bool, str]:
    title      = dados.get("title", "")
    excerpt    = dados.get("excerpt", "")
    content    = dados.get("content", "")
    tags       = dados.get("tags", [])

    if not title or len(title.strip()) < 10:
        return False, "Título ausente ou muito curto"

    TITULOS_GENERICOS = [
        "novas tendências", "tendências", "atualização", "novidades",
        "análise pós", "novas fronteiras", "perspectivas", "o futuro"
    ]
    if any(g in title.lower() for g in TITULOS_GENERICOS):
        return False, f"Título genérico detectado: '{title}'"

    if not excerpt or len(excerpt.strip()) < 30:
        return False, "Resumo (excerpt) ausente ou muito curto"

    text_only = re.sub(r'<[^>]+>', ' ', content)
    words = len(text_only.split())
    if words < 300:
        return False, f"Conteúdo muito curto: {words} palavras (mínimo: 300)"

    if '<h2' not in content.lower():
        return False, "Conteúdo sem H2 — estrutura mínima não atendida"

    if not tags:
        return False, "Nenhuma tag informada"

    if categoria not in CATEGORIAS_VALIDAS:
        return False, f"Categoria inválida: '{categoria}'"

    # Aviso (não reprovação) se não houver referência de processo/norma
    refs = re.findall(
        r'(processo\s*n[º°.]|portaria|instrução normativa|acórdão|súmula|'
        r'lei\s+n[º°.]|resolução|RR-|AIRR-|AgR-|TAC|ACP)',
        content, re.IGNORECASE
    )
    if not refs:
        print(f"  ⚠️  Aviso: sem referência explícita de processo/norma — '{title}'")

    return True, "OK"


# ─── Verificar duplicata ──────────────────────────────────────────────
def is_duplicata(title: str, posts_path: str = "data/posts.json") -> bool:
    try:
        with open(posts_path, encoding="utf-8") as f:
            posts = json.load(f)
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
            common     = words_new & words_old
            similarity = len(common) / max(len(words_new), len(words_old))
            if similarity > 0.75:
                return True

    return False


# ─── Salvar post + atualizar JSON + atualizar sitemap ─────────────────
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
            f'<span style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:.72rem;'
            f'font-weight:700;background:rgba(255,255,255,.15);color:rgba(255,255,255,.9);'
            f'border:1px solid rgba(255,255,255,.25);margin-right:5px;">{t}</span>'
            for t in tags
        )

        fonte_nota = ""
        if source_url:
            fonte_nota = (
                f'\n<p style="font-size:.78rem;color:#64748B;margin-top:28px;padding-top:12px;'
                f'border-top:1px solid #E2E8F0;">📌 <strong>Fonte:</strong> '
                f'<a href="{source_url}" target="_blank" rel="noopener noreferrer">'
                f'{fonte_nome or source_url}</a> — acesso em {data_br}.</p>'
            )
        elif fonte_nome:
            fonte_nota = (
                f'\n<p style="font-size:.78rem;color:#64748B;margin-top:28px;padding-top:12px;'
                f'border-top:1px solid #E2E8F0;">📌 <strong>Fonte:</strong> {fonte_nome} — {data_br}.</p>'
            )

        content_final = dados.get("content", "") + fonte_nota

        # ── Imagem contextual via Unsplash ────────────────────────────
        image_query = dados.get("image_query", dados.get("title", ""))
        img = obter_imagem_url(image_query, categoria)

        schema_image = f',"image":"{img}"'
        og_image_tag = f'<meta property="og:image" content="{img}">'
        cover_html   = (
            f'<div style="margin-bottom:24px;border-radius:12px;overflow:hidden;max-height:380px;">'
            f'<img src="{img}" alt="{dados["title"]}" '
            f'style="width:100%;object-fit:cover;" loading="lazy" '
            f'onerror="this.parentElement.style.display=\'none\'"></div>'
        )

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
            .replace("{{OG_IMAGE}}",         og_image_tag)
            .replace("{{SCHEMA_IMAGE}}",     schema_image)
            .replace("{{COVER_IMAGE_HTML}}", cover_html)
        )

        blog_path = f"blog/{slug}.html"
        with open(blog_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  ✅ Post salvo: {blog_path}")

        try:
            with open("data/posts.json", encoding="utf-8") as f:
                posts = json.load(f)
        except Exception:
            posts = []

        if not any(p["id"] == slug for p in posts):
            posts.insert(0, {
                "id":             slug,
                "title":          dados["title"],
                "category":       categoria,
                "category_label": cat_label,
                "tags":           tags,
                "excerpt":        dados["excerpt"],
                "image":          img,
                "imageCaption":   "",
                "date":           data_str,
                "source":         fonte_nome,
                "source_url":     source_url,
            })
            with open("data/posts.json", "w", encoding="utf-8") as f:
                json.dump(posts, f, ensure_ascii=False, indent=2)
            print(f"  ✅ posts.json atualizado")

        _atualizar_sitemap(slug, data_str)
        return True

    except Exception as e:
        print(f"  ❌ Erro ao salvar post: {e}")
        import traceback; traceback.print_exc()
        return False


def _atualizar_sitemap(slug: str, data_str: str):
    try:
        sitemap_path = "sitemap.xml"
        nova_url     = f"https://calculaprazo.com.br/blog/{slug}"

        with open(sitemap_path, "r", encoding="utf-8") as f:
            sitemap_content = f.read()

        if nova_url in sitemap_content:
            return

        nova_entrada = (
            f"  <url>\n"
            f"    <loc>{nova_url}</loc>\n"
            f"    <lastmod>{data_str}</lastmod>\n"
            f"    <changefreq>monthly</changefreq>\n"
            f"    <priority>0.8</priority>\n"
            f"  </url>\n"
        )

        sitemap_content = sitemap_content.replace(
            "</urlset>",
            nova_entrada + "</urlset>"
        )

        with open(sitemap_path, "w", encoding="utf-8") as f:
            f.write(sitemap_content)

        print(f"  ✅ sitemap.xml atualizado com {nova_url}")
    except Exception as e:
        print(f"  ⚠️  Não foi possível atualizar sitemap: {e}")
