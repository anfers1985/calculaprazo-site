# -*- coding: utf-8 -*-
"""
Agente Notícias — Conjur, Migalhas, G1 e UOL (VERSÃO FINAL 2026)
"""
import os, json, re, requests, random, time
from datetime import date, timedelta
from slugify import slugify
from html.parser import HTMLParser

API_KEY = os.environ["OPENROUTER_KEY"]
MODEL   = "google/gemini-2.5-flash"   # Modelo atualizado
HOJE    = date.today()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CalculaPrazoBot/1.0; +https://calculaprazo.com.br)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

PROPOSITO = """
O site CalculaPrazo é voltado a advogados trabalhistas, profissionais de RH e contadores.
Publica conteúdo sobre: decisões trabalhistas, jurisprudência, legislação, eSocial, FGTS, rescisões, etc.
"""

SOURCES = [
    {"nome": "Conjur", "url": "https://www.conjur.com.br/feed"},
    {"nome": "Migalhas", "url": "https://www.migalhas.com.br/rss"},
    {"nome": "G1 - Trabalho", "url": "https://g1.globo.com/rss/g1/trabalho-e-emprego/"},
    {"nome": "UOL Notícias", "url": "https://rss.uol.com.br/"},
]

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.texts, self._skip = [], False
    def handle_starttag(self, tag, attrs):
        if tag in ("script","style","nav","header","footer","aside","noscript"):
            self._skip = True
    def handle_endtag(self, tag):
        if tag in ("script","style","nav","header","footer","aside","noscript"):
            self._skip = False
    def handle_data(self, data):
        if not self._skip:
            t = data.strip()
            if len(t) > 40:
                self.texts.append(t)
    def get_text(self, max_chars=3000):
        return " ".join(self.texts)[:max_chars]


def buscar_conteudo(fonte):
    try:
        r = requests.get(fonte["url"], headers=HEADERS, timeout=20)
        print(f"  Status: {r.status_code}")
        if r.ok:
            p = TextExtractor()
            p.feed(r.text)
            text = p.get_text(2000)
            print(f"  Conteúdo extraído: {len(text)} caracteres")
            return text
    except Exception as e:
        print(f"  Erro ao acessar {fonte['nome']}: {e}")
    return ""


def avaliar_relevancia(conteudo, fonte_nome):
    if len(conteudo) < 100:
        return {"relevante": False, "motivo": "conteúdo muito curto", "tema": ""}
    
    prompt = f"""
Propósito do site: {PROPOSITO}

Conteúdo de {fonte_nome} hoje:
---
{conteudo[:1400]}
---

Responda APENAS com JSON válido:
{{"relevante": true/false, "motivo": "1 frase curta", "tema": "tema principal"}}
"""
    try:
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": MODEL, "messages": [{"role":"user","content":prompt}], "max_tokens":200, "temperature":0.3},
            timeout=40,
        )
        if r.status_code != 200:
            print(f"  API Error: {r.status_code}")
            return {"relevante": False, "motivo": f"api error {r.status_code}", "tema": ""}
        
        raw = r.json()["choices"][0]["message"]["content"]
        raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
        return json.loads(raw)
    except Exception as e:
        print(f"  Erro na avaliação: {e}")
        return {"relevante": False, "motivo": "erro na avaliação", "tema": ""}


def gerar_artigo(conteudo, tema, fonte_nome):
    prompt = f"""
Você é especialista em direito do trabalho brasileiro.

Conteúdo coletado de {fonte_nome} em {HOJE.strftime('%d/%m/%Y')}:
---
{conteudo[:2000]}
---

Tema: {tema}

Escreva um artigo completo, claro e útil para advogados trabalhistas, RH e contadores.

Responda APENAS com JSON:
{{
  "title": "título objetivo até 65 caracteres",
  "excerpt": "resumo até 155 caracteres para SEO",
  "tags": ["tag1", "tag2", "tag3"],
  "content": "HTML completo com h2, p, ul/li, strong, blockquote. Mínimo 500 palavras."
}}
"""
    try:
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": MODEL, "messages": [{"role":"user","content":prompt}], "max_tokens":2500},
            timeout=120,
        )
        raw = r.json()["choices"][0]["message"]["content"]
        raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
        if "null" in raw.lower()[:50]:
            return None
        return json.loads(raw)
    except Exception as e:
        print(f"  Erro ao gerar artigo: {e}")
        return None


def salvar_post(dados, fonte_nome):
    try:
        meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"]
        data_str = HOJE.strftime("%Y-%m-%d")
        data_br  = f"{HOJE.day} de {meses[HOJE.month-1]} de {HOJE.year}"
        slug     = slugify(dados["title"])[:60]

        with open("blog/POST_TEMPLATE.html", encoding="utf-8") as f:
            template = f.read()

        tags        = dados.get("tags", ["Notícia"])
        tags_json   = json.dumps(tags, ensure_ascii=False)
        first_tag   = tags[0] if tags else "Notícia"
        tags_badges = "".join(f'<span style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:.72rem;font-weight:700;background:rgba(255,255,255,.15);color:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.25);margin-right:5px;">{t}</span>' for t in tags)

        html = (template
            .replace("{{TITLE}}",            dados["title"])
            .replace("{{DESCRIPTION}}",      dados["excerpt"])
            .replace("{{SLUG}}",             slug)
            .replace("{{CATEGORY}}",         "noticia")
            .replace("{{CATEGORY_LABEL}}",   first_tag)
            .replace("{{TAGS_BADGES}}",      tags_badges)
            .replace("{{TAGS_JSON}}",        tags_json)
            .replace("{{DATE}}",             data_str)
            .replace("{{DATE_BR}}",          data_br)
            .replace("{{CONTENT}}",          dados["content"])
            .replace("{{OG_IMAGE}}",         "")
            .replace("{{SCHEMA_IMAGE}}",     "")
            .replace("{{COVER_IMAGE_HTML}}", "")
        )

        filepath = f"blog/{slug}.html"
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  ✅ ARQUIVO CRIADO: {filepath}")

        try:
            with open("data/posts.json", encoding="utf-8") as f:
                posts = json.load(f)
        except:
            posts = []
        if not any(p["id"] == slug for p in posts):
            posts.insert(0, {
                "id": slug, "title": dados["title"],
                "category": "noticia", "tags": tags,
                "excerpt": dados["excerpt"], "image": "",
                "imageCaption": "", "date": data_str,
                "content": dados["content"],
            })
            posts = posts[:300]
            with open("data/posts.json", "w", encoding="utf-8") as f:
                json.dump(posts, f, ensure_ascii=False, indent=2)
            print(f"  ✅ posts.json ATUALIZADO")
        return slug
    except Exception as e:
        print(f"  ❌ ERRO AO SALVAR: {e}")
        return None


def main():
    print(f"\nAgente Notícias — {HOJE.strftime('%d/%m/%Y')} [VERSÃO FINAL]")
    print("=" * 70)

    random.seed(HOJE.year * 10000 + HOJE.month * 100 + HOJE.day)
    fontes_hoje = random.sample(SOURCES, len(SOURCES))

    publicados = 0
    for fonte in fontes_hoje:
        print(f"\n[{fonte['nome']}] Verificando...")
        conteudo = buscar_conteudo(fonte)
        if not conteudo:
            continue

        avaliacao = avaliar_relevancia(conteudo, fonte["nome"])
        print(f"  Avaliação: {avaliacao}")

        if not avaliacao.get("relevante", False):
            continue

        dados = gerar_artigo(conteudo, avaliacao.get("tema",""), fonte["nome"])
        if not dados:
            print("  Falha ao gerar artigo")
            continue

        salvar_post(dados, fonte["nome"])
        publicados += 1
        time.sleep(3)

    print(f"\nTotal publicado: {publicados} artigo(s) de notícias.")


if __name__ == "__main__":
    main()
