# -*- coding: utf-8 -*-
"""
agente_trts.py — CalculaPrazo
Monitora publicações dos Tribunais Regionais do Trabalho (TRTs).
Foco: decisões, campanhas e informativos dos TRTs com impacto regional
      para empresas, trabalhadores e profissionais de RH/jurídico.
Descarta: conteúdo institucional interno dos tribunais.
Categoria: jurisprudencia-trts
Execução: dias úteis, 10h (Brasília) via GitHub Actions.
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

CATEGORIA   = "jurisprudencia-trts"
FONTE_LABEL = "TRTs"

PROPOSITO = """
Você é um Analista Estratégico de Relações Trabalhistas e Auditor Jurídico do CalculaPrazo.
P�blico-alvo: advogados trabalhistas, diretoria jurídica, RH estratégico, controladoria.
Estilo: técnico, direto, pragmático — sem juridiquês acadêmico, sem generalidades.

MISSÃO DESTE AGENTE:
Monitorar publicações dos Tribunais Regionais do Trabalho (TRTs) com impacto prático
para empresas, trabalhadores e profissionais de RH e jurídico na região.
Isso inclui: decisões relevantes, acórdãos com tese aplicável, informativos jurídicos,
campanhas de conscientização trabalhista, orientações ao jurisdicionado.

NÃO PUBLICAR: conteúdo institucional interno — concurso, eleição de diretoria,
evento social, homenagem, visita protocolar, obra no prédio.

REGRAS ABSOLUTAS:
1. Identificar SEMPRE qual TRT publicou (ex: TRT da 4ª Região — Rio Grande do Sul).
2. Citar número do processo e setor econômico afetado quando disponíveis.
3. Destacar o impacto regional: quais empresas ou setores da região são afetados.
4. Nunca inventar dados ausentes da fonte.
5. Concluir com ação concreta para jurídico/RH da região.
"""

SOURCES = [
    {"nome": "CSJT — Notícias TRTs",    "url": "https://www.csjt.jus.br/web/csjt/noticias-dos-trts"},
    {"nome": "TRT-4 (RS)",               "url": "https://www.trt4.jus.br/portais/trt4/modulos/noticias/todas/0"},
    {"nome": "TRT-12 (SC)",              "url": "https://portal.trt12.jus.br/noticias"},
    {"nome": "TRT-9 (PR)",               "url": "https://www.trt9.jus.br/portal/noticias.xhtml"},
    {"nome": "TRT-2 (SP)",               "url": "https://ww2.trt2.jus.br/noticias/noticias"},
    {"nome": "TRT-15 (Campinas/SP)",     "url": "https://trt15.jus.br/noticias/maisnoticias"},
    {"nome": "TRT-1 (RJ) — Últimas",    "url": "https://trt1.jus.br/web/guest/ultimas-noticias"},
    {"nome": "TRT-1 (RJ) — Jurídico",   "url": "https://trt1.jus.br/web/guest/destaque-juridico"},
    {"nome": "TRT-5 (BA)",               "url": "https://www.trt5.jus.br/noticias"},
    {"nome": "TRT-3 (MG)",               "url": "https://portal.trt3.jus.br/internet/conheca-o-trt/comunicacao/noticias-juridicas"},
    {"nome": "TRT-6 (PE)",               "url": "https://www.trt6.jus.br/portal/noticias"},
    {"nome": "TRT-10 (DF/TO)",           "url": "https://www.trt10.jus.br/ascom/?pagina=consulta_noticias_internet.php&chk_materia_juridica=S&idTRT10M=196"},
    {"nome": "TRT-11 (AM/RR)",           "url": "https://portal.trt11.jus.br/index.php/comunicacao/noticias-lista"},
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

Há publicação das últimas 72 horas com impacto relevante para empresas,
trabalhadores ou profissionais de RH/jurídico? Exclua conteúdo institucional interno.

Responda APENAS com JSON:
{{"relevante": true/false, "motivo": "1 frase objetiva", "tema": "tema específico com TRT, processo ou setor se disponível"}}
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

1. Resumo executivo (2-3 frases): o que aconteceu, qual TRT e região, número do processo se disponível, impacto imediato.
2. Contexto regional: qual setor econômico ou tipo de empresa é afetado nessa região.
3. O que foi decidido/publicado: descreva com base exclusiva no conteúdo coletado.
4. Tese ou entendimento aplicado: cite CLT, CF/88, Súmula ou OJ quando pertinente.
5. Risco e impacto para empresas: passivo trabalhista, padrões de erro recorrente.
6. Ação recomendada: medidas concretas para diretoria jurídica e RH.

Mínimo 450 palavras. Nunca invente dados.

Responda APENAS com JSON válido:
{{
  "title": "Título técnico com TRT/região e tema (máx 70 chars)",
  "excerpt": "Resumo em 1-2 frases (máx 160 chars)",
  "tags": ["Tag1", "Tag2", "Tag3"],
  "image_query": "3-5 palavras em inglês para imagem contextual (ex: labor court hearing workers)",
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
        dados.setdefault("tags",        ["TRT", "Jurisprudência"])
        dados.setdefault("image_query", "labor court hearing workers Brazil")
        dados["source_url"] = fonte_url
        return dados
    except Exception as e:
        print(f"  Erro ao gerar artigo: {e}")
        return None


def main():
    print(f"\nAgente {FONTE_LABEL} — {HOJE.strftime('%d/%m/%Y')}")
    print("=" * 70)

    # Sorteia 4 fontes por dia para variar cobertura regional
    fontes = random.sample(SOURCES, min(4, len(SOURCES)))
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
