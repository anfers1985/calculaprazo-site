# -*- coding: utf-8 -*-
"""
Agente Notícias — Conjur, Migalhas, G1 e UOL (Versão Corrigida)
"""
import os, json, re, requests, random, time
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
Foco em: direito do trabalho, jurisprudência, legislação trabalhista, eSocial, FGTS, rescisões, etc.
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
            print(f"  API Error: {r.status_code} - {r.text[:200]}")
            return {"relevante": False, "motivo": f"api error {r.status_code}", "tema": ""}

        raw = r.json()["choices"][0]["message"]["content"]
        raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
        return json.loads(raw)
    except Exception as e:
        print(f"  Erro na avaliação: {e}")
        return {"relevante": False, "motivo": "erro na avaliação", "tema": ""}


# (Mantenha as funções gerar_artigo e salvar_post que você já tem - ou use a versão robusta que te passei antes)


def main():
    print(f"\nAgente Notícias — {HOJE.strftime('%d/%m/%Y')} [VERSÃO CORRIGIDA]")
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
        time.sleep(3)  # evita rate limit

    print(f"\nTotal publicado: {publicados} artigo(s)")


if __name__ == "__main__":
    main()
