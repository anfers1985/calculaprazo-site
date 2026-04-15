# -*- coding: utf-8 -*-
"""
agente_tst_stf.py — Monitora TST e STF.
Categoria: jurisprudencia-tst
"""
import os, json, re, requests, random, time
from html.parser import HTMLParser
from agente_base import claude, validar_qualidade, is_duplicata, salvar_post, HOJE

CATEGORIA   = "jurisprudencia-tst"
FONTE_LABEL = "TST/STF"

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (compatible; CalculaPrazoBot/1.0; +https://calculaprazo.com.br)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

SOURCES = [
    {"nome": "TST — Notícias",          "url": "https://www.tst.jus.br/web/guest/noticias"},
    {"nome": "TST — Jurisprudência",    "url": "https://jurisprudencia.tst.jus.br/"},
    {"nome": "STF — Notícias",          "url": "https://noticias.stf.jus.br/"},
    {"nome": "STF — Plenário Virtual",  "url": "https://portal.stf.jus.br/noticias/"},
]

PROPOSITO = """
Você é Analista Estratégico de Relações Trabalhistas do CalculaPrazo.
P�blico: advogados trabalhistas, RH estratégico, controladoria.
Estilo: técnico, direto, sem juridiquês vazio.

MISSÃO: monitorar TST/STF — decisões, acórdãos, súmulas, teses vinculantes
com impacto em relações de trabalho, empresas e trabalhadores.
NÃO PUBLICAR: concursos, eleições internas, eventos sociais, homenagens.

REGRAS:
1. Citar número do processo, turma e relator quando disponíveis.
2. Citar súmula/OJ/tese pelo número quando disponível.
3. Nunca inventar dados ausentes da fonte.
4. Concluir com impacto prático e ação recomendada.
"""


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
        print(f"  HTTP {r.status_code} | {fonte['nome']}")
        if r.ok:
            p = TextExtractor()
            p.feed(r.text)
            return p.get_text(6000), r.url
    except Exception as e:
        print(f"  Erro ao acessar {fonte['nome']}: {e}")
    return "", fonte["url"]


def avaliar_relevancia(conteudo, fonte_nome):
    if len(conteudo) < 150:
        return {"relevante": False, "motivo": "conteudo insuficiente", "tema": ""}

    prompt = f"""
{PROPOSITO}

Conteúdo coletado de {fonte_nome} (hoje: {HOJE.strftime('%d/%m/%Y')}):
---
{conteudo[:3000]}
---

Há publicação recente (últimas 72h) com impacto relevante para advogados trabalhistas,
empresas ou trabalhadores? Exclua conteúdo institucional interno.

Responda APENAS com JSON válido (sem markdown):
{{"relevante": true/false, "motivo": "1 frase objetiva", "tema": "tema concreto com processo/sumula se disponivel"}}
"""
    try:
        raw = claude(prompt, max_tokens=300, temperature=0.1)
        raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
        return json.loads(raw)
    except Exception as e:
        print(f"  Erro avaliacao: {e}")
        return {"relevante": False, "motivo": "erro", "tema": ""}


def gerar_artigo(conteudo, tema, fonte_nome, fonte_url):
    prompt = f"""
{PROPOSITO}

Fonte: {fonte_nome}
URL: {fonte_url}
Data: {HOJE.strftime('%d/%m/%Y')}
Tema: {tema}

Conteúdo coletado:
---
{conteudo[:5000]}
---

Redija boletim técnico completo com:
1. Resumo executivo (o que aconteceu, qual órgão, número processo/súmula, impacto imediato)
2. Contexto jurídico (norma ou entendimento anterior)
3. O que foi decidido (baseado APENAS no conteúdo coletado, com processo, turma, relator)
4. Tese jurídica central
5. Impacto para empresas e RH (riscos de passivo, erros comuns)
6. Ação recomendada (medidas para jurídico, RH, controladoria)

Mínimo 450 palavras. Nunca invente dados.

Responda APENAS com JSON válido (sem markdown):
{{
  "title": "Título técnico com foco em risco ou impacto (max 70 chars)",
  "excerpt": "Resumo executivo 1-2 frases (max 160 chars)",
  "tags": ["Tag1", "Tag2", "Tag3"],
  "image_query": "3-5 palavras em inglês para busca de imagem (ex: court gavel justice law)",
  "content": "<h2>...</h2><p>...</p>..."
}}
"""
    try:
        raw = claude(prompt, max_tokens=4000, temperature=0.2)
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        dados = json.loads(raw)
        dados.setdefault("title",       f"Atualização TST/STF — {HOJE.strftime('%d/%m/%Y')}")
        dados.setdefault("excerpt",     tema[:120])
        dados.setdefault("content",     "<p>Análise técnica em elaboração.</p>")
        dados.setdefault("tags",        ["TST", "Jurisprudência"])
        dados.setdefault("image_query", "supreme court justice gavel law")
        dados["source_url"] = fonte_url
        return dados
    except Exception as e:
        print(f"  Erro gerar artigo: {e}")
        return None


def main():
    print(f"\nAgente {FONTE_LABEL} — {HOJE.strftime('%d/%m/%Y')}")
    print("=" * 70)

    random.shuffle(SOURCES)
    publicados = 0

    for fonte in SOURCES:
        print(f"\n[{fonte['nome']}]")
        conteudo, url_real = buscar_conteudo(fonte)
        if not conteudo or len(conteudo) < 200:
            print("  Conteudo insuficiente, pulando.")
            continue

        avaliacao = avaliar_relevancia(conteudo, fonte["nome"])
        print(f"  Avaliacao: {avaliacao}")

        if not avaliacao.get("relevante"):
            print(f"  Sem relevancia: {avaliacao.get('motivo')}")
            continue

        tema = avaliacao.get("tema", "")
        if is_duplicata(tema, "data/posts.json"):
            print(f"  Duplicata: '{tema}'")
            continue

        dados = gerar_artigo(conteudo, tema, fonte["nome"], url_real)
        if not dados:
            continue

        aprovado, motivo = validar_qualidade(dados, CATEGORIA)
        if not aprovado:
            print(f"  Reprovado: {motivo} | '{dados.get('title','')}'")
            continue

        if is_duplicata(dados["title"], "data/posts.json"):
            print(f"  Duplicata por titulo: '{dados['title']}'")
            continue

        if salvar_post(dados, CATEGORIA, fonte["nome"]):
            publicados += 1

        time.sleep(5)
        if publicados >= 1:
            break

    print(f"\n{'OK' if publicados else 'AVISO'} Total publicado: {publicados} post(s) {FONTE_LABEL}")


if __name__ == "__main__":
    main()
