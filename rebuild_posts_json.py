# -*- coding: utf-8 -*-
"""
rebuild_posts_json.py — Reconstrói data/posts.json a partir dos arquivos HTML do blog.
Execute na raiz do projeto: python rebuild_posts_json.py
Uso: após edição manual de posts, para sincronizar o JSON.
"""
import os, json, re
from datetime import datetime

BLOG_DIR   = "blog"
OUTPUT     = "data/posts.json"
SKIP_FILES = {"POST_TEMPLATE.html"}

CATEGORY_LABELS = {
    "jurisprudencia-tst":   "Jurisprudência TST/STF",
    "jurisprudencia-trts":  "Jurisprudência TRTs",
    "noticias-mte-mpt":     "MTE & MPT",
    "legislacao-normas":    "Legislação e Normas",
    "esocial-fgts-digital": "eSocial e FGTS Digital",
    "orientacoes-praticas": "Orientações Práticas RH",
    "saude-seguranca":      "Saúde e Segurança",
    # legados (mapeados automaticamente)
    "direito":      "Jurisprudência TST/STF",
    "noticia":      "MTE & MPT",
    "legislacao":   "Legislação e Normas",
    "folha":        "Orientações Práticas RH",
    "pratica":      "Orientações Práticas RH",
    "esocial":      "eSocial e FGTS Digital",
    "jurisprudencia":"Jurisprudência TST/STF",
    "geral":        "MTE & MPT",
}

CATEGORY_REMAP = {
    "direito":       "jurisprudencia-tst",
    "noticia":       "noticias-mte-mpt",
    "legislacao":    "legislacao-normas",
    "folha":         "orientacoes-praticas",
    "pratica":       "orientacoes-praticas",
    "esocial":       "esocial-fgts-digital",
    "jurisprudencia":"jurisprudencia-tst",
    "geral":         "noticias-mte-mpt",
}

def extract_meta(filepath):
    with open(filepath, encoding="utf-8") as f:
        html = f.read()

    def get(pattern, default=""):
        m = re.search(pattern, html)
        return m.group(1).strip() if m else default

    title    = get(r'<title>(.+?) \| Calcula Prazo', "")
    desc     = get(r'<meta name="description" content="([^"]+)"', "")
    slug     = get(r'<link[^>]+canonical[^>]+href="https://calculaprazo\.com\.br/blog/([^"]+)"', "")
    date_pub = get(r'"datePublished":"([^"]+)"', "")
    category = get(r'var THIS_CAT\s*=\s*'([^']+)\'', "")
    tags_raw = get(r'var THIS_TAGS\s*=\s*(\[[^\]]+\])', "[]")
    image    = get(r'"image":"([^"]+)"', "")

    if not slug:
        slug = os.path.splitext(os.path.basename(filepath))[0]

    if not title or len(title) < 5:
        return None

    try:
        tags = json.loads(tags_raw)
    except Exception:
        tags = []

    # Normalize category
    if category in CATEGORY_REMAP:
        category = CATEGORY_REMAP[category]

    cat_label = CATEGORY_LABELS.get(category, category)

    return {
        "id":             slug,
        "title":          title,
        "category":       category,
        "category_label": cat_label,
        "tags":           [t for t in tags if isinstance(t, str) and len(t) < 50][:4],
        "excerpt":        desc,
        "image":          image,
        "imageCaption":   "",
        "date":           date_pub or "2026-04-10",
    }

def main():
    posts = []
    files = [f for f in os.listdir(BLOG_DIR) if f.endswith(".html") and f not in SKIP_FILES]

    for fname in files:
        fpath = os.path.join(BLOG_DIR, fname)
        meta = extract_meta(fpath)
        if meta:
            posts.append(meta)
        else:
            print(f"  ⚠️  Ignorado (sem título): {fname}")

    # Ordenar por data decrescente
    posts.sort(key=lambda p: p.get("date", ""), reverse=True)

    os.makedirs("data", exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)

    print(f"\n✅ {OUTPUT} reconstruído com {len(posts)} posts.")
    for p in posts:
        print(f"  {p['date']} | {p['category']:<24} | {p['title'][:55]}")

if __name__ == "__main__":
    main()
