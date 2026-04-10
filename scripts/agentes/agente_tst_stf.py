# -*- coding: utf-8 -*-
"""
Agente TST + STF — Analista Estratégico de Relações Trabalhistas e Auditor Jurídico
"""
import os, json, re, requests, random, time
from datetime import date, timedelta
from slugify import slugify
from html.parser import HTMLParser

API_KEY = os.environ["OPENROUTER_KEY"]
MODEL   = "google/gemini-2.5-flash"
HOJE    = date.today()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CalculaPrazoBot/1.0; +https://calculaprazo.com.br)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

PROPOSITO = """
Você é Analista Estratégico de Relações Trabalhistas e Auditor Jurídico atuando como consultor corporativo.
Estilo: técnico, direto, pragmático e orientado à decisão.
Foco exclusivo: risco jurídico, impacto financeiro, conformidade trabalhista e eficiência operacional.
"""

SOURCES = [
    {"nome": "TST - Notícias", "url": "https://www.tst.jus.br/web/guest/noticias"},
    {"nome": "CSJT - Notícias dos TRTs", "url": "https://www.csjt.jus.br/web/csjt/noticias-dos-trts"},
    {"nome": "STF - Notícias", "url": "https://noticias.stf.jus.br/"},
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
            if len(t) > 30:
                self.texts.append(t)
    def get_text(self, max_chars=4000):
        return " ".join(self.texts)[:max_chars]


def buscar_conteudo(fonte):
    try:
        r = requests.get(fonte["url"], headers=HEADERS, timeout=25)
        print(f"  Status: {r.status_code} | {fonte['nome']}")
        if r.ok:
            p = TextExtractor()
            p.feed(r.text)
            return p.get_text(4000)
    except Exception as e:
        print(f"  Erro ao acessar {fonte['nome']}: {e}")
    return ""


def avaliar_relevancia(conteudo, fonte_nome):
    if len(conteudo) < 150:
        return {"relevante": False, "motivo": "conteúdo insuficiente", "tema": ""}
    
    prompt = f"""
{PROPOSITO}

Conteúdo coletado de {fonte_nome} hoje:
---
{conteudo[:1600]}
---

Existe decisão ou notícia das últimas 24-72 horas com impacto em risco jurídico ou conformidade?
Responda APENAS com JSON:
{{"relevante": true/false, "motivo": "1 frase curta", "tema": "tema principal"}}
"""
    try:
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": MODEL, "messages": [{"role":"user","content":prompt}], "max_tokens":250, "temperature":0.2},
            timeout=45,
        )
        raw = r.json()["choices"][0]["message"]["content"]
        raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
        return json.loads(raw)
    except Exception as e:
        print(f"  Erro na avaliação: {e}")
        return {"relevante": False, "motivo": "erro na avaliação", "tema": ""}


def gerar_artigo(conteudo, tema, fonte_nome):
    prompt = f"""
{PROPOSITO}

Conteúdo real de {fonte_nome}:
---
{conteudo[:3000]}
---

Tema: {tema}

Gere um boletim técnico direto e pragmático no formato abaixo.

**Título** (curto e objetivo)
**Resumo Executivo** (1 linha)
**Análise Técnica**
**Impacto Prático**
**Recomendação de Ação**

Estilo: técnico, direto, pragmático.

Responda APENAS com JSON válido e completo:
{{
  "title": "título objetivo até 65 caracteres",
  "excerpt": "resumo até 155 caracteres",
  "tags": ["tag1", "tag2", "tag3"],
  "content": "HTML completo com <h2>, <p>, <ul>, <strong>..."
}}
"""
    try:
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": MODEL, "messages": [{"role":"user","content":prompt}], "max_tokens":3000, "temperature":0.3},
            timeout=180,
        )
        
        raw = r.json()["choices"][0]["message"]["content"].strip()
        
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        raw = re.sub(r"[\n\r]+", " ", raw)
        
        dados = json.loads(raw)
        
        if not dados.get("title"):
            dados["title"] = f"Atualização {fonte_nome} - {HOJE.strftime('%d/%m')}"
        if not dados.get("excerpt"):
            dados["excerpt"] = tema[:120] if tema else "Atualização importante"
        if not dados.get("content"):
            dados["content"] = "<p>Conteúdo técnico gerado automaticamente.</p>"
           
        return dados
    except Exception as e:
        print(f"  Erro ao gerar artigo: {e}")
        return None

def main():
    print(f"\nAgente TST/STF — {HOJE.strftime('%d/%m/%Y')} [ANALISTA ESTRATÉGICO]")
    print("=" * 90)

    random.seed(HOJE.year * 10000 + HOJE.month * 100 + HOJE.day)
    fontes_hoje = random.sample(SOURCES, len(SOURCES))

    publicados = 0
    for fonte in fontes_hoje:
        print(f"\n[{fonte['nome']}] Verificando...")
        conteudo = buscar_conteudo(fonte)
        if not conteudo or len(conteudo) < 200:
            continue

        avaliacao = avaliar_relevancia(conteudo, fonte["nome"])
        print(f"  Avaliação: {avaliacao}")

        if not avaliacao.get("relevante", False):
            continue

        dados = gerar_artigo(conteudo, avaliacao.get("tema",""), fonte["nome"])
        if not dados:
            continue

        salvar_post(dados, fonte["nome"])
        publicados += 1
        time.sleep(5)

    print(f"\nTotal publicado: {publicados} boletim(s) do TST/STF")


if __name__ == "__main__":
    main()
