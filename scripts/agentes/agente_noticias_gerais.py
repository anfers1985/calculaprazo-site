# -*- coding: utf-8 -*-
"""
agente_noticias_gerais.py — CalculaPrazo
Monitora portais de notícias jurídicas, contábeis e de negócios.
Foco: repercussão trabalhista, previdenciária e contábil com impacto
      para trabalhadores e empresas — legislação, decisões comentadas,
      tendências com base em fatos concretos.
Fontes de apoio NUNCA usadas isoladamente — sempre com referência a fonte oficial.
Categoria: orientacoes-praticas
Execução: dias úteis, 13h (Brasília) via GitHub Actions.
"""
import os, json, re, requests, random, time
from datetime import date
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

CATEGORIA   = "orientacoes-praticas"
FONTE_LABEL = "Geral"

PROPOSITO = """
Você é um Analista Estratégico de Relações Trabalhistas e Auditor Jurídico do CalculaPrazo.
P�blico-alvo: advogados, RH estratégico, controladoria, contadores, empresários.
Estilo: técnico, direto, pragmático — útil para decisão corporativa imediata.

MISSÃO DESTE AGENTE:
Monitorar portais de notícias jurídicas, contábeis e econômicas em busca de conteúdo
com repercussão trabalhista, previdenciária ou contábil para trabalhadores e empresas.
Isso inclui: análises de novas leis com impacto em folha ou contratos, decisões do TST/STF
comentadas por especialistas, mudanças previdenciárias, alterações tributárias que afetam
RH, movimentos legislativos no Congresso com impacto trabalhista.

REGRA CRÍTICA DE FONTES:
Estas fontes são de APOIO — nunca usar isoladamente. Todo boletim deve referenciar
ao menos uma fonte oficial (TST, TRT, STF, MTE, MPT, INSS, Congresso) citada no
próprio conteúdo coletado. Se o conteúdo coletado não mencionar fonte oficial,
NÃO PUBLICAR.

NÃO PUBLICAR: especulação sem base legal, "tendências" sem fato concreto,
conteúdo de marketing ou opinião sem referência normativa verificável.

REGRAS ABSOLUTAS:
1. Referenciar sempre a fonte oficial citada no conteúdo (lei, processo, norma).
2. Nunca inventar dados ausentes da fonte coletada.
3. Foco em impacto prático para RH, folha, contratos e compliance.
4. Concluir com ação concreta e verificável para o leitor.
"""

SOURCES = [
    {"nome": "Contábeis — Trabalhista",   "url": "https://www.contabeis.com.br/conteudo/trabalhista/"},
    {"nome": "Contábeis — Previdência",   "url": "https://www.contabeis.com.br/conteudo/previdencia/"},
    {"nome": "Contábeis — Economia",      "url": "https://www.contabeis.com.br/conteudo/economia/"},
    {"nome": "Contábeis — Contábil",      "url": "https://www.contabeis.com.br/conteudo/contabil/"},
    {"nome": "G1 — Trabalho e Carreira",  "url": "https://g1.globo.com/trabalho-e-carreira/"},
    {"nome": "G1 — Ministério do Trabalho","url": "https://g1.globo.com/tudo-sobre/ministerio-do-trabalho/"},
    {"nome": "Senado — Dir. Trabalhistas","url": "https://www12.senado.leg.br/noticias/tags/Direitos%20Trabalhistas"},
    {"nome": "Câmara — CLT",              "url": "https://www.camara.leg.br/noticias/ultimas/tags?tag=Consolida%C3%A7%C3%A3o%20das%20Leis%20do%20Trabalho%20(CLT)"},
    {"nome": "AMATRAXV — Jurídico",       "url": "https://amatraxv.org.br/noticias/noticias-juridicas"},
    {"nome": "Conjur — Trabalhista",      "url": "https://www.conjur.com.br/direito-trabalho"},
    {"nome": "Migalhas — Trabalhista",    "url": "https://www.migalhas.com.br/quentes/trabalhista"},
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

Há conteúdo das últimas 72 horas com impacto trabalhista, previdenciário ou contábil
para empresas ou trabalhadores, COM referência a fonte oficial (lei, processo, norma)?
Se não houver referência oficial verificável no conteúdo, retorne relevante: false.

Responda APENAS com JSON:
{{"relevante": true/false, "motivo": "1 frase objetiva", "tema": "tema com referência oficial identificada"}}
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

Fonte de apoio: {fonte_nome}
Link: {fonte_url}
Data: {HOJE.strftime('%d/%m/%Y')}
Tema identificado: {tema}

Conteúdo coletado:
---
{conteudo[:5000]}
---

Redija um boletim técnico completo com base exclusiva no conteúdo coletado.
Varie os subtítulos conforme o caso, mas inclua obrigatoriamente estes elementos:

1. Resumo executivo (2-3 frases): fato concreto, fonte oficial referenciada, impacto imediato.
2. Contexto e base legal: qual norma, decisão ou movimento legislativo está em jogo.
3. Desenvolvimento analítico: explique o tema com foco em impacto para empresas e trabalhadores.
4. Reflexos para RH e folha de pagamento: o que muda na prática operacional.
5. Risco financeiro e de compliance: exposição potencial, multas, passivo.
6. Ação recomendada: medidas objetivas para jurídico, RH e controladoria.

Mínimo 450 palavras. Nunca invente dados — se não estiver no conteúdo, não escreva.

Responda APENAS com JSON válido:
{{
  "title": "Título técnico com foco em impacto ou risco (máx 70 chars)",
  "excerpt": "Resumo em 1-2 frases (máx 160 chars)",
  "tags": ["Tag1", "Tag2", "Tag3"],
  "image_query": "3-5 palavras em inglês para imagem contextual (ex: HR payroll office compliance)",
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
        dados.setdefault("title",       f"Orientação Trabalhista — {HOJE.strftime('%d/%m/%Y')}")
        dados.setdefault("excerpt",     tema[:120])
        dados.setdefault("content",     "<p>Análise técnica em elaboração.</p>")
        dados.setdefault("tags",        ["RH", "Trabalhista"])
        dados.setdefault("image_query", "HR payroll office compliance workplace")
        dados["source_url"] = fonte_url
        return dados
    except Exception as e:
        print(f"  Erro ao gerar artigo: {e}")
        return None


def main():
    print(f"\nAgente {FONTE_LABEL} — {HOJE.strftime('%d/%m/%Y')}")
    print("=" * 70)

    # Sorteia 3 fontes por dia
    fontes = random.sample(SOURCES, min(3, len(SOURCES)))
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
