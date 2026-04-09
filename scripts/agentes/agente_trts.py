# -*- coding: utf-8 -*-
"""
Agente TRTs — busca decisoes e noticias dos Tribunais Regionais do Trabalho
So publica quando encontrar conteudo relevante do dia.
"""
import os, json, re, requests, random
from datetime import date, datetime, timedelta
from slugify import slugify
from html.parser import HTMLParser

API_KEY = os.environ["OPENROUTER_KEY"]
MODEL   = "google/gemini-flash-1.5"
HOJE    = date.today()
ONTEM   = HOJE - timedelta(days=1)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CalculaPrazoBot/1.0; +https://calculaprazo.com.br)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

# Propósito do site — o agente usa isso para avaliar relevância
PROPOSITO = """
O site CalculaPrazo é voltado a advogados trabalhistas, profissionais de RH e contadores.
Publica conteúdo sobre: decisões trabalhistas, jurisprudência do TST e TRTs,
legislação trabalhista, eSocial, FGTS Digital, folha de pagamento, rescisões,
férias, 13º salário, horas extras, jornada de trabalho e obrigações acessórias.
NÃO é relevante: esportes, política geral, crimes, celebridades, economia macro.
"""

# Todos os 24 TRTs — rotaciona entre eles para não sobrecarregar
TRTS = [
    {"nome": "TRT 1 RJ",  "url": "https://www.trt1.jus.br/noticias"},
    {"nome": "TRT 2 SP",  "url": "https://www.trt2.jus.br/"},
    {"nome": "TRT 3 MG",  "url": "https://www.trt3.jus.br/noticias"},
    {"nome": "TRT 4 RS",  "url": "https://www.trt4.jus.br/portais/trt4/home"},
    {"nome": "TRT 5 BA",  "url": "https://www.trt5.jus.br/noticias"},
    {"nome": "TRT 6 PE",  "url": "https://www.trt6.jus.br/"},
    {"nome": "TRT 9 PR",  "url": "https://www.trt9.jus.br/portal/noticia"},
    {"nome": "TRT 10 DF", "url": "https://www.trt10.jus.br/noticias"},
    {"nome": "TRT 12 SC", "url": "https://www.trt12.jus.br/noticias"},
    {"nome": "TRT 15 SP", "url": "https://www.trt15.jus.br/noticias"},
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
    """Pergunta à IA se o conteúdo tem algo relevante para publicar HOJE."""
    prompt = f"""
Propósito do site: {PROPOSITO}

Conteúdo coletado hoje ({HOJE.strftime('%d/%m/%Y')}) de: {fonte_nome}
---
{conteudo[:1500]}
---

PERGUNTA: Existe alguma notícia, decisão ou informação neste conteúdo que seja
relevante para o público do site (advogados trabalhistas, RH, contadores)?

Responda APENAS com JSON:
{{"relevante": true/false, "motivo": "explicação em 1 frase", "tema": "tema principal se relevante"}}

Se não houver nada relevante ou o conteúdo for vago, responda com relevante: false.
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
    """Gera artigo completo baseado no conteúdo coletado."""
    prompt = f"""
Você é especialista em direito do trabalho brasileiro.

Conteúdo coletado de {fonte_nome} em {HOJE.strftime('%d/%m/%Y')}:
---
{conteudo[:2000]}
---

Tema identificado: {tema}

Com base APENAS neste conteúdo real (não invente informações), escreva um artigo
para o site CalculaPrazo, voltado a advogados, RH e contadores.

Responda APENAS com JSON válido:
{{
  "title": "título objetivo até 65 caracteres",
  "excerpt": "resumo até 155 caracteres para SEO",
  "tags": ["tag1", "tag2", "tag3"],
  "content": "HTML completo com h2, p, ul/li, strong, blockquote. Mínimo 500 palavras."
}}

IMPORTANTE: Se o conteúdo não for suficiente para um artigo completo e preciso,
retorne null no lugar do JSON.
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
        if "null" in raw[:20]:
            return None
        return json.loads(raw)
    except Exception as e:
        print(f"  Erro ao gerar artigo: {e}")
        return None


def salvar_post(dados, fonte_nome):
    meses = ["janeiro","fevereiro","março","abril","maio","junho",
             "julho","agosto","setembro","outubro","novembro","dezembro"]
    data_str = HOJE.strftime("%Y-%m-%d")
    data_br  = f"{HOJE.day} de {meses[HOJE.month-1]} de {HOJE.year}"
    slug     = slugify(dados["title"])[:60]

    # Carrega template
    with open("blog/POST_TEMPLATE.html", encoding="utf-8") as f:
        template = f.read()

    tags        = dados.get("tags", ["Trabalhista", "TRT"])
    tags_json   = json.dumps(tags, ensure_ascii=False)
    first_tag   = tags[0] if tags else "Trabalhista"
    tags_badges = "".join(
        f'<span style="display:inline-block;padding:3px 12px;border-radius:999px;'
        f'font-size:.72rem;font-weight:700;background:rgba(255,255,255,.15);'
        f'color:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.25);'
        f'margin-right:5px;">{t}</span>' for t in tags
    )

    html = (template
        .replace("{{TITLE}}",            dados["title"])
        .replace("{{DESCRIPTION}}",      dados["excerpt"])
        .replace("{{SLUG}}",             slug)
        .replace("{{CATEGORY}}",         "jurisprudencia")
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

    # Atualiza posts.json
    try:
        with open("data/posts.json", encoding="utf-8") as f:
            posts = json.load(f)
    except:
        posts = []
    if not any(p["id"] == slug for p in posts):
        posts.insert(0, {
            "id": slug, "title": dados["title"],
            "category": "jurisprudencia", "tags": tags,
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
    print(f"\nAgente TRTs — {HOJE.strftime('%d/%m/%Y')}")
    print("=" * 50)

    # Seleciona 4 TRTs aleatórios por dia (seed = data para ser consistente)
    random.seed(HOJE.year * 10000 + HOJE.month * 100 + HOJE.day)
    trts_hoje = random.sample(TRTS, min(4, len(TRTS)))

    publicados = 0
    for trt in trts_hoje:
        print(f"\n[{trt['nome']}] Verificando...")
        conteudo = buscar_conteudo(trt)
        if not conteudo:
            print("  Sem conteúdo acessível hoje.")
            continue

        avaliacao = avaliar_relevancia(conteudo, trt["nome"])
        if not avaliacao.get("relevante"):
            print(f"  Nada relevante: {avaliacao.get('motivo','')}")
            continue

        print(f"  Relevante! Tema: {avaliacao.get('tema','')}")
        dados = gerar_artigo(conteudo, avaliacao.get("tema",""), trt["nome"])
        if not dados:
            print("  Conteúdo insuficiente para artigo.")
            continue

        salvar_post(dados, trt["nome"])
        publicados += 1

    print(f"\n{'='*50}")
    print(f"Total publicado: {publicados} artigo(s) dos TRTs de hoje.")
    if publicados == 0:
        print("Nenhum conteúdo relevante encontrado hoje — nada publicado.")


if __name__ == "__main__":
    main()
