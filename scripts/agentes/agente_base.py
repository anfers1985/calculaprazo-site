# -*- coding: utf-8 -*-
# agente_base.py - Modulo compartilhado — CalculaPrazo
#
# VARIAVEIS DE AMBIENTE:
#   GEMINI_API_KEY       -> chave Google Gemini
#   GROK_API_KEY         -> chave xAI Grok
#   UNSPLASH_ACCESS_KEY  -> chave Unsplash Access Key
#
import os, json, re, datetime, requests, random
from slugify import slugify

HOJE = datetime.date.today()

GEMINI_KEY   = os.environ.get("GEMINI_API_KEY", "")
GROK_KEY     = os.environ.get("GROK_API_KEY", "")
UNSPLASH_KEY = os.environ.get("UNSPLASH_ACCESS_KEY", "")

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

def chamar_llm(prompt, max_tokens=4000, temperature=0.2):
    """Chama Gemini ou Grok como fallback."""
    
    # 1. Tentar Gemini
    if GEMINI_KEY:
        try:
            # Usando a API do Gemini via REST
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_KEY}"
            headers = {"Content-Type": "application/json"}
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": max_tokens
                }
            }
            r = requests.post(url, headers=headers, json=payload, timeout=120)
            if r.status_code == 200:
                res = r.json()
                text = res['candidates'][0]['content']['parts'][0]['text'].strip()
                print("  LLM OK modelo=gemini-1.5-flash")
                return text
            else:
                print(f"  LLM erro Gemini: {r.status_code} - {r.text[:100]}")
        except Exception as e:
            print(f"  LLM excecao Gemini: {str(e)}")

    # 2. Tentar Grok (xAI)
    if GROK_KEY:
        try:
            url = "https://api.x.ai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {GROK_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "grok-beta", # ou o modelo atual disponível
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            r = requests.post(url, headers=headers, json=payload, timeout=120)
            if r.status_code == 200:
                text = r.json()["choices"][0]["message"]["content"].strip()
                print("  LLM OK modelo=grok-beta")
                return text
            else:
                print(f"  LLM erro Grok: {r.status_code} - {r.text[:100]}")
        except Exception as e:
            print(f"  LLM excecao Grok: {str(e)}")

    raise RuntimeError("Todos os modelos (Gemini/Grok) falharam ou chaves nao configuradas.")


def obter_imagem_url(image_query, categoria):
    query    = re.sub(r'[^a-zA-Z0-9 ]', '', (image_query or "")).strip()
    fallback = "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=1200&auto=format&fit=crop"
    if len(query) < 5:
        query = UNSPLASH_QUERY_CAT.get(categoria, "law justice professional")
    
    if not UNSPLASH_KEY:
        return "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=1200&auto=format&fit=crop"

    for q in [query, UNSPLASH_QUERY_CAT.get(categoria, "law")]:
        if not q: continue
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
                    if url: return url
                elif isinstance(photos, dict):
                    url = photos.get("urls", {}).get("regular")
                    if url: return url
        except Exception as e:
            print("  AVISO Unsplash: " + str(e))
    return fallback


def validar_qualidade(dados, categoria):
    title   = dados.get("title", "")
    excerpt = dados.get("excerpt", "")
    content = dados.get("content", "")
    if not title or len(title.strip()) < 10:
        return False, "Titulo ausente ou muito curto"
    if not excerpt or len(excerpt.strip()) < 30:
        return False, "Excerpt ausente ou muito curto"
    
    # Contagem de palavras aproximada removendo tags HTML
    text_only = re.sub(r'<[^>]+>', ' ', content)
    words = len(text_only.split())
    
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
        
        # Similaridade simples por palavras
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

        template_path = "blog/POST_TEMPLATE.html"
        if not os.path.exists(template_path):
            print(f"  ERRO: Template {template_path} nao encontrado.")
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
                f'\n<p style="font-size:.78rem;color:#64748B;margin-top:28px;padding-top:12px;border-top:1px solid #E2E8F0;">'
                f'<strong>Fonte:</strong> <a href="{source_url}" target="_blank" rel="noopener noreferrer">'
                f'{fonte_nome or source_url}</a> — acesso em {data_br}.</p>'
            )
        elif fonte_nome:
            fonte_nota = (
                f'\n<p style="font-size:.78rem;color:#64748B;margin-top:28px;padding-top:12px;border-top:1px solid #E2E8F0;">'
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
        print(f"  ERRO ao salvar post: {str(e)}")
        return False


def _atualizar_sitemap(slug, data_str):
    try:
        sitemap_path = "sitemap.xml"
        if not os.path.exists(sitemap_path): return
        
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
