# -*- coding: utf-8 -*-
"""
agente_tst_stf.py — CalculaPrazo
Monitora publicações do TST e STF.
Foco: decisões, súmulas, teses vinculantes, campanhas e informativos com
      impacto em relações de trabalho, empresas, RH e trabalhadores.
Descarta: conteúdo institucional interno (concursos, eleições de diretoria,
          eventos internos, homenagens a servidores).
Categoria: jurisprudencia-tst
Execução: dias úteis, 09h (Brasília) via GitHub Actions.
"""
import os, json, re, requests, random, time
from datetime import date, timedelta
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

CATEGORIA   = "jurisprudencia-tst"
FONTE_LABEL = "TST/STF"

# Janela de atualidade: prioriza 24h, aceita até 72h
JANELA_HORAS = 72

PROPOSITO = """
Você é um Analista Estratégico de Relações Trabalhistas e Auditor Jurídico do CalculaPrazo.
Público-alvo: advogados trabalhistas, diretoria jurídica, RH estratégico e controladoria.
Estilo: técnico, direto, pragmático — sem juridiquês acadêmico, sem generalidades.

MISSÃO DESTE AGENTE:
Monitorar publicações do TST e STF que impactem relações de trabalho, empresas e trabalhadores.
Isso inclui: decisões de turmas, acórdãos relevantes, súmulas novas ou revisadas, teses de
repercussão geral, informativos de jurisprudência, campanhas e orientações ao jurisdicionado.

NÃO PUBLICAR: conteúdo institucional interno — concurso público, eleição de diretoria,
evento social, homenagem a servidor, inauguração, visita protocolar.

REGRAS ABSOLUTAS:
1. Citar número do processo (ex: RR-1234-56.2023.5.02.0000), turma julgadora e relator
   sempre que constarem no conteúdo coletado.
2. Citar súmula, OJ ou tese de repercussão geral pelo número quando disponível.
3. Nunca inventar dados — se não estiver na fonte, não escreva.
4. Cada afirmação factual deve ser rastreável ao conteúdo coletado.
5. Concluir com impacto prático e ação recomendada para jurídico/RH/controladoria.
"""

SOURCES = [
    {"nome": "TST — Notícias",  "url": "https://www.tst.jus.br/web/guest/noticias"},
    {"nome": "STF — Notícias",  "url": "https://noticias.stf.jus.br/"},
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

    def get_text(self, max_chars=6000):
        return " ".join(self.texts)[:max_chars]


def buscar_conteudo(fonte):
    try:
        r = requests.get(fonte["url"], headers=HEADERS, timeout=30)
        print(f"  Status: {r.status_code} | {fonte['nome']}")
        if r.ok:
            p = TextExtractor()
            p.feed(r.text)
            return p.get_text(6000), r.url
    except Exception as e:
        print(f"  Erro ao acessar {fonte['nome']}: {e}")
    return "", fonte["url"]


def avaliar_relevancia(conteudo, fonte_nome):
    if len(conteudo) < 150:
        return {"relevante": False, "motivo": "conteúdo insuficiente", "tema": ""}

    prompt = f"""
{PROPOSITO}

Conteúdo coletado de {fonte_nome} (hoje: {HOJE.strftime('%d/%m/%Y')}):
---
{conteudo[:3000]}
---

Há publicação das últimas 72 horas com impacto relevante para advogados trabalhistas,
empresas ou trabalhadores? Exclua conteúdo institucional interno.

Responda APENAS com JSON:
{{"relevante": true/false, "motivo": "1 frase objetiva", "tema": "tema específico e concreto com processo/súmula se disponível"}}
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

Fonte: {fonte_nome}
Link direto: {fonte_url}
Data: {HOJE.strftime('%d/%m/%Y')}
Tema identificado: {tema}

Conteúdo coletado:
---
{conteudo[:5000]}
---

Redija um boletim técnico completo. Varie os subtítulos conforme o caso, mas inclua
obrigatoriamente estes elementos em sequência lógica:

1. Resumo executivo (2-3 frases): o que aconteceu, qual órgão, número do processo/súmula/tese, impacto imediato.
2. Contexto jurídico: norma ou entendimento anterior aplicável (CLT, CF/88, Súmula TST/STF).
3. O que foi decidido/publicado: descreva com base exclusiva no conteúdo coletado, cite processo, turma e relator se disponíveis.
4. Tese jurídica central: qual entendimento foi firmado ou reforçado.
5. Impacto para empresas e RH: o que muda na prática, riscos de passivo, padrões de erro empresarial.
6. Ação recomendada: medidas objetivas para diretoria jurídica, RH estratégico e controladoria.

Mínimo 450 palavras. Nunca invente dados ausentes da fonte.

Responda APENAS com JSON válido:
{{
  "title": "Título técnico direto com foco em risco ou impacto (máx 70 chars)",
  "excerpt": "Resumo executivo em 1-2 frases (máx 160 chars)",
  "tags": ["Tag1", "Tag2", "Tag3"],
  "image_query": "3-5 palavras em inglês descrevendo imagem contextual (ex: supreme court gavel law)",
  "content": "<h2>...</h2><p>...</p>..."
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
        dados.setdefault("title",       f"Atualização {FONTE_LABEL} — {HOJE.strftime('%d/%m/%Y')}")
        dados.setdefault("excerpt",     tema[:120])
        dados.setdefault("content",     "<p>Análise técnica em elaboração.</p>")
        dados.setdefault("tags",        ["TST", "Jurisprudência"])
        dados.setdefault("image_query", "supreme court justice gavel law")
        dados["source_url"] = fonte_url
        return dados
    except Exception as e:
        print(f"  Erro ao gerar artigo: {e}")
        return None


def main():
    print(f"\nAgente {FONTE_LABEL} — {HOJE.strftime('%d/%m/%Y')}")
    print("=" * 70)

    random.shuffle(SOURCES)
    publicados = 0

    for fonte in SOURCES:
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
