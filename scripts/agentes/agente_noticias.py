# -*- coding: utf-8 -*-
"""
Agente Notícias — Monitora Conjur, Migalhas, G1 e UOL
"""
import os, json, re, requests, random
from datetime import date, timedelta
from slugify import slugify
from html.parser import HTMLParser

API_KEY = os.environ["OPENROUTER_KEY"]
MODEL   = "google/gemini-flash-1.5"
HOJE    = date.today()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CalculaPrazoBot/1.0; +https://calculaprazo.com.br)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

PROPOSITO = """
O site CalculaPrazo é voltado a advogados trabalhistas, profissionais de RH e contadores.
Publica conteúdo sobre: decisões trabalhistas, jurisprudência do TST e TRTs,
legislação trabalhista, eSocial, FGTS Digital, folha de pagamento, rescisões,
férias, 13º salário, horas extras, jornada de trabalho e obrigações acessórias.
NÃO é relevante: esportes, política geral, crimes, celebridades, economia macro.
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
        r = requests.get(fonte["url"], headers=HEADERS, timeout=15)
        if r.ok:
            p = TextExtractor()
            p.feed(r.text)
            return p.get_text(2000)
    except Exception as e:
        print(f"  Erro ao acessar {fonte['nome']}: {e}")
    return ""


def avaliar_relevancia(conteudo, fonte_nome):
    prompt = f"""
Propósito do site: {PROPOSITO}

Conteúdo coletado hoje ({HOJE.strftime('%d/%m/%Y')}) de: {fonte_nome}
---
{conteudo[:1500]}
---

Existe alguma notícia jurídica ou trabalhista relevante para advogados, RH ou contadores?

Responda APENAS com JSON:
{{"relevante": true/false, "motivo": "explicação em 1 frase", "tema": "tema principal se relevante"}}
"""
    try:
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": MODEL, "messages": [{"role":"user","content":prompt}], "max_tokens":300},
            timeout=30,
        )
        raw = r.json()["choices"][0]["message"]["content"]
        raw = re.sub(r"^```json\s*","",raw.strip())
        raw = re.sub(r"\s*```$","",raw.strip())
        return json.loads(raw)
    except:
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
        raw = re.sub(r"^```json\s*","",raw.strip())
        raw = re.sub(r"\s*```$","",raw.strip())
        if "null" in raw.lower()[:50]:
            return None
        return json.loads(raw)
    except Exception as e:
        print(f"  Erro ao gerar artigo: {e}")
        return None


def salvar_post(dados, fonte_nome):
    meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"]
    data_str = HOJE.strftime("%Y-%m-%d")
    data_br  = f"{HOJE.day} de {meses[HOJE.month-1]} de {HOJE.year}"
    slug     = slugify(dados["title"])[:60]

    with open("blog/POST_TEMPLATE.html", encoding="utf-8") as f:
        template = f.read()

    tags        = dados.get("tags", ["Notícia", "Conjur"])
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

    with open(f"blog/{slug}.html", "w", encoding="utf-8") as f:
        f.write(html)

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

    print(f"  PUBLICADO: {slug}.html")
    return slug


def main():
    print(f"\nAgente Notícias — {HOJE.strftime('%d/%m/%Y')} [MODO TESTE]")
    print("=" * 60)

    random.seed(HOJE.year * 10000 + HOJE.month * 100 + HOJE.day)
    fontes_hoje = random.sample(SOURCES, len(SOURCES))

    publicados = 0
    for fonte in fontes_hoje:
        print(f"\n[{fonte['nome']}] Verificando...")
        conteudo = buscar_conteudo(fonte)
        if not conteudo:
            print("  Sem conteúdo acessível.")
            continue

        # MODO TESTE: força relevância
        avaliacao = {"relevante": True, "motivo": "Teste forçado", "tema": "Notícias jurídicas recentes"}
        print(f"  → FORÇANDO publicação (modo teste)")

        dados = gerar_artigo(conteudo, avaliacao.get("tema",""), fonte["nome"])
        if not dados:
            print("  Conteúdo insuficiente para gerar artigo.")
            continue

        salvar_post(dados, fonte["nome"])
        publicados += 1
        break  # publica só 1 para teste

    print(f"\n{'='*60}")
    print(f"Total publicado em modo teste: {publicados}")
