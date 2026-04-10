#!/usr/bin/env python3
"""
rebuild_posts_json.py — CalculaPrazo
====================================
Varre todos os .html da pasta blog/ (exceto POST_TEMPLATE.html),
extrai os metadados de cada post e regera data/posts.json completo.

USO:
  python rebuild_posts_json.py

Execute a partir da raiz do repositório (onde ficam index.html e data/).

DEPENDÊNCIAS:
  pip install beautifulsoup4
"""

import os
import re
import json
import sys
from pathlib import Path
from bs4 import BeautifulSoup

# ─── Posts a EXCLUIR do JSON (slugs exatos) ──────────────────────────────────
# Adicione aqui slugs de posts de teste ou que não devem aparecer no site
EXCLUDE_SLUGS = {
    # Exemplo: "meu-post-de-teste",
}

# ─── Utilitários ─────────────────────────────────────────────────────────────

def find_repo_root():
    cwd = Path.cwd()
    for p in [cwd, *cwd.parents]:
        if (p / "index.html").exists() and (p / "blog").is_dir():
            return p
    return cwd


def extract_post_meta(html_path: Path) -> dict | None:
    try:
        with open(html_path, encoding="utf-8") as f:
            html = f.read()
    except Exception as e:
        print(f"  ⚠ Erro ao ler {html_path.name}: {e}")
        return None

    soup = BeautifulSoup(html, "html.parser")

    # ── Slug, categoria e tags ──
    slug_m = re.search(r"THIS_SLUG\s*=\s*['\"]([^'\"]+)['\"]", html)
    cat_m  = re.search(r"THIS_CAT\s*=\s*['\"]([^'\"]+)['\"]", html)
    tags_m = re.search(r"THIS_TAGS\s*=\s*(\[[^\]]*\])", html)

    slug = slug_m.group(1) if slug_m else html_path.stem
    cat  = cat_m.group(1)  if cat_m  else "geral"

    # Detectar template não preenchido (placeholders {{...}})
    if "{{" in slug or "{{" in cat:
        return None

    try:
        tags = json.loads(tags_m.group(1)) if tags_m else []
    except Exception:
        tags = []

    # ── Título ──
    og_title = soup.find("meta", property="og:title")
    h1       = soup.find("h1")
    title    = (og_title["content"] if og_title else None) \
               or (h1.get_text(strip=True) if h1 else slug)

    # ── Descrição / excerpt ──
    og_desc = soup.find("meta", property="og:description")
    meta_d  = soup.find("meta", attrs={"name": "description"})
    excerpt = (og_desc["content"] if og_desc else None) \
              or (meta_d["content"] if meta_d else "")

    # ── Imagem de capa ──
    og_img = soup.find("meta", property="og:image")
    image  = og_img["content"] if og_img else ""

    # ── Legenda da imagem ──
    caption_el    = soup.find(class_="post-cover-caption") or soup.find("figcaption")
    image_caption = caption_el.get_text(strip=True) if caption_el else ""

    # ── Data de publicação (Schema.org) ──
    date = ""
    schema_tag = soup.find("script", type="application/ld+json")
    if schema_tag and schema_tag.string:
        try:
            schema = json.loads(schema_tag.string)
            date   = schema.get("datePublished", "")
        except Exception:
            pass
    if not date:
        time_el = soup.find("time")
        if time_el:
            date = time_el.get("datetime", "") or time_el.get_text(strip=True)

    # ── Conteúdo HTML ──
    article = soup.find("article")
    content = article.decode_contents().strip() if article else ""

    return {
        "id":           slug,
        "title":        title,
        "category":     cat,
        "excerpt":      excerpt,
        "image":        image,
        "imageCaption": image_caption,
        "date":         date,
        "content":      content,
        "tags":         tags,
    }


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    repo     = find_repo_root()
    blog_dir = repo / "blog"
    output   = repo / "data" / "posts.json"

    if not blog_dir.is_dir():
        sys.exit(f"❌ Pasta blog/ não encontrada em {repo}")

    print(f"📂 Repositório : {repo}")
    print(f"📂 Pasta blog  : {blog_dir}")
    print(f"📄 Saída       : {output}")
    print()

    # Ignora POST_TEMPLATE.html (qualquer capitalização)
    html_files = sorted(
        [f for f in blog_dir.glob("*.html")
         if f.name.upper() != "POST_TEMPLATE.HTML"],
        key=lambda f: f.name
    )

    if not html_files:
        sys.exit("❌ Nenhum .html encontrado na pasta blog/ (exceto o template).")

    print(f"🔍 {len(html_files)} arquivo(s) encontrado(s):\n")

    posts   = []
    skipped = []

    for html_file in html_files:
        meta = extract_post_meta(html_file)

        if meta is None:
            print(f"  ⊘ IGNORADO   {html_file.name:<50} (template ou erro de leitura)")
            skipped.append(html_file.name)
            continue

        if meta["id"].lower() in {s.lower() for s in EXCLUDE_SLUGS}:
            print(f"  ⊘ EXCLUÍDO   {html_file.name:<50} (listado em EXCLUDE_SLUGS)")
            skipped.append(html_file.name)
            continue

        posts.append(meta)
        date_str = meta["date"] or "sem data"
        print(f"  ✔ {html_file.name:<55} [{date_str}]  {meta['title'][:45]}")

    # Ordenar por data decrescente (mais recente primeiro)
    posts.sort(key=lambda p: p.get("date", ""), reverse=True)

    # Salvar
    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)

    print()
    print(f"✅ posts.json gerado com {len(posts)} post(s).")
    if skipped:
        print(f"⊘  Ignorados : {', '.join(skipped)}")
    print(f"\n📌 Próximo passo: faça commit de data/posts.json no GitHub Desktop.")


if __name__ == "__main__":
    main()
