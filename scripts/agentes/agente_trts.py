# -*- coding: utf-8 -*-
"""
agente_trts.py — CalculaPrazo
Monitora decisões dos Tribunais Regionais do Trabalho.
Categoria: jurisprudencia-trts
Execução: dias úteis, 09h (Brasília) via GitHub Actions.
"""
import os, json, re, requests, random, time
from datetime import date
from slugify import slugify
from html.parser import HTMLParser
from agente_base import (
    validar_qualidade, is_duplicata, salvar_post, HOJE
)

API_KEY = os.environ["OPENROUTER_KEY"]
MODEL   = "google/gemini-2.5-flash"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CalculaPrazoBot/1.0; +https://calculaprazo.com.br)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

CATEGORIA   = "jurisprudencia-trts"
FONTE_LABEL = "TRTs"

PROPOSITO = """
Você é um advogado trabalhista especialista, redator jurídico do CalculaPrazo.
Seu público: advogados trabalhistas, profissionais de RH e contadores brasileiros.
Estilo: técnico, preciso, direto e orientado à prática.
REGRAS ABSOLUTAS:
1. Cite fontes verificáveis — número de processo, portaria, lei ou URL quando disponível.
2. Linguagem jurídica profissional — sem generalidades ou "tendências".
3. Cada afirmação deve ter base no conteúdo fornecido — nunca invente dados.
4. Conclua com impacto prático e ação recomendada ao leitor.
Identifique a região do TRT (ex: TRT-2 São Paulo) e o número do processo sempre que disponível.
"""

SOURCES = [
{"nome": "CSJT - TRTs", "url": "https://www.csjt.jus.br/web/csjt/noticias-dos-trts"},
    {"nome": "TRT-SP", "url": "https://www.trt2.jus.br/noticias"},
    {"nome": "TRT-RJ", "url": "https://www.trt1.jus.br/noticias"},
    {"nome": "TRT-MG", "url": "https://www.trt3.jus.br/noticias"},
    {"nome": "TRT-RS", "url": "https://www.trt4.jus.br/noticias"}
]


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.texts, self._skip = [], False

    def handle_starttag(self, tag, attrs):
        if tag in ("script","style","nav","header","footer","aside","noscript","form"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script","style","nav","header","footer","aside","noscript","form"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            t = data.strip()
            if len(t) > 40:
                self.texts.append(t)

    def get_text(self, max_chars=5000):
        return " ".join(self.texts)[:max_chars]


def buscar_conteudo(fonte):
    try:
        r = requests.get(fonte["url"], headers=HEADERS, timeout=30)
        print(f"  Status: {r.status_code} | {fonte['nome']}")
        if r.ok:
            p = TextExtractor()
            p.feed(r.text)
            return p.get_text(5000), r.url
    except Exception as e:
        print(f"  Erro ao acessar {fonte['nome']}: {e}")
    return "", fonte["url"]


def avaliar_relevancia(conteudo, fonte_nome):
    if len(conteudo) < 150:
        return {"relevante": False, "motivo": "conteúdo insuficiente", "tema": ""}

    prompt = f"""
{PROPOSITO}

Conteúdo de {fonte_nome} (hoje: {HOJE.strftime('%d/%m/%Y')}):
---
{conteudo[:2000]}
---

Existe decisão, norma ou notícia das últimas 72 horas com impacto relevante para
advogados trabalhistas, RH ou empresas?

Responda APENAS com JSON:
{{"relevante": true/false, "motivo": "1 frase objetiva", "tema": "tema específico e concreto"}}
"""
    try:
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": MODEL, "messages": [{"role":"user","content":prompt}],
                  "max_tokens": 200, "temperature": 0.1},
            timeout=45,
        )
        raw = r.json()["choices"][0]["message"]["content"]
        raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
        return json.loads(raw)
    except Exception as e:
        print(f"  Erro na avaliação: {e}")
        return {"relevante": False, "motivo": "erro", "tema": ""}


def gerar_artigo(conteudo, tema, fonte_nome, fonte_url):
    prompt = f"""
{PROPOSITO}

Fonte: {fonte_nome} ({fonte_url})
Data: {HOJE.strftime('%d/%m/%Y')}
Tema: {tema}

Conteúdo coletado:
---
{conteudo[:4000]}
---

Redija um artigo jurídico completo com EXATAMENTE esta estrutura HTML:

<h2>Contexto</h2>
<p>[Situação jurídica, norma ou súmula aplicável]</p>

<h2>O que aconteceu</h2>
<p>[Fato concreto com órgão, data e número do processo/ato se disponível]</p>

<h2>Fundamentação</h2>
<p>[Base legal, artigo CLT/CPC/CF citado]</p>

<h2>Impacto Prático para Empresas e RH</h2>
<p>[O que muda, o que o RH/advogado deve fazer]</p>

<h2>Recomendação Imediata</h2>
<p>[Ação concreta e verificável]</p>

Mínimo 400 palavras. NÃO invente dados não presentes no conteúdo.

Responda APENAS com JSON:
{{
  "title": "Título técnico e específico (máx 65 caracteres)",
  "excerpt": "Resumo objetivo (máx 155 caracteres)",
  "tags": ["Tag1", "Tag2", "Tag3"],
  "content": "<h2>Contexto</h2><p>...</p>..."
}}
"""
    try:
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": MODEL, "messages": [{"role":"user","content":prompt}],
                  "max_tokens": 3500, "temperature": 0.2},
            timeout=180,
        )
        raw = r.json()["choices"][0]["message"]["content"].strip()
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

        dados = json.loads(raw)
        dados.setdefault("title", f"Atualização {FONTE_LABEL} — {HOJE.strftime('%d/%m/%Y')}")
        dados.setdefault("excerpt", tema[:120])
        dados.setdefault("content", "<p>Análise técnica em elaboração.</p>")
        dados.setdefault("tags", ["TRT", "Jurisprudência Regional"])
        dados["source_url"] = fonte_url
        return dados
    except Exception as e:
        print(f"  Erro ao gerar artigo: {e}")
        return None


def main():
    print(f"\nAgente {FONTE_LABEL} — {HOJE.strftime('%d/%m/%Y')}")
    print("=" * 70)

    random.seed(HOJE.year * 10000 + HOJE.month * 100 + HOJE.day)
    fontes = random.sample(SOURCES, min(len(SOURCES), 3))

    publicados = 0
    for fonte in fontes:
        print(f"\n[{fonte['nome']}] Verificando...")
        conteudo, url_real = buscar_conteudo(fonte)
        if not conteudo or len(conteudo) < 200:
            print("  ⚠️  Conteúdo insuficiente, pulando.")
            continue

        avaliacao = avaliar_relevancia(conteudo, fonte["nome"])
        print(f"  Avaliação: {avaliacao}")

        if not avaliacao.get("relevante", False):
            print(f"  ⏭  Sem relevância: {avaliacao.get('motivo')}")
            continue

        tema = avaliacao.get("tema", "")
        if is_duplicata(tema, "data/posts.json"):
            print(f"  ⏭  Possível duplicata para: '{tema}'")
            continue

        dados = gerar_artigo(conteudo, tema, fonte["nome"], url_real)
        if not dados:
            continue

        # Validação de qualidade obrigatória
        aprovado, motivo = validar_qualidade(dados, CATEGORIA)
        if not aprovado:
            print(f"  ❌ Reprovado: {motivo} | Título: '{dados.get('title','')}'")
            continue

        if is_duplicata(dados["title"], "data/posts.json"):
            print(f"  ⏭  Duplicata por título: '{dados['title']}'")
            continue

        sucesso = salvar_post(dados, CATEGORIA, fonte["nome"])
        if sucesso:
            publicados += 1

        time.sleep(5)
        if publicados >= 1:
            break

    print(f"\n{'✅' if publicados else '⚠️ '} Total publicado: {publicados} post(s) {FONTE_LABEL}")


if __name__ == "__main__":
    main()
