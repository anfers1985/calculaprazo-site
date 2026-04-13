# -*- coding: utf-8 -*-
"""
agente_mpt.py — CalculaPrazo
Monitora publicações do Ministério Público do Trabalho (MPT) — nacional e PRTs.
Foco: TACs, ACPs, operações de fiscalização, resultados de investigações,
      setores e empresas autuadas, irregularidades identificadas.
Categoria: noticias-mte-mpt
Execução: dias úteis, 11h (Brasília) via GitHub Actions.
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

CATEGORIA   = "noticias-mte-mpt"
FONTE_LABEL = "MPT"

PROPOSITO = """
Você é um Analista Estratégico de Relações Trabalhistas e Auditor Jurídico do CalculaPrazo.
P�blico-alvo: advogados trabalhistas, diretoria jurídica, compliance, RH estratégico.
Estilo: técnico, direto, pragmático — foco em risco e conformidade para empresas.

MISSÃO DESTE AGENTE:
Monitorar publicações do Ministério Público do Trabalho (MPT) com impacto para
empresas e empregadores.
Isso inclui: TACs assinados, ACPs ajuizadas, operações de fiscalização, resultados
de investigações, setores autuados, irregularidades identificadas, multas aplicadas,
orientações de compliance trabalhista emitidas pelo MPT.

NÃO PUBLICAR: notas de pesar, agendas de eventos internos, posses e nomeações sem
conteúdo de fiscalização, eventos acadêmicos internos.

REGRAS ABSOLUTAS:
1. Identificar o Procurador responsável e a PRT (regional) quando disponíveis.
2. Identificar a empresa ou setor investigado/autuado.
3. Classificar o tipo de instrumento: TAC, ACP, Recomendação, Notícia-Crime, Operação.
4. Informar valor da multa ou obrigação firmada quando disponível.
5. Nunca inventar dados ausentes da fonte.
6. Concluir com padrões de risco e ação preventiva para empresas do setor afetado.
"""

SOURCES = [
    {"nome": "CNMP — Notícias MPT",   "url": "https://www.cnmp.mp.br/portal/noticias?o=date&t[]="},
    {"nome": "PRT-12 (SC)",            "url": "https://www.prt12.mpt.mp.br/informe-se/noticias-do-mpt-sc"},
    {"nome": "PRT-1 (RJ)",             "url": "https://www.prt1.mpt.mp.br/informe-se/noticias-do-mpt-rj"},
    {"nome": "PRT-2 (SP)",             "url": "https://www.prt2.mpt.mp.br/informe-se/noticias-do-mpt-sp"},
    {"nome": "PRT-4 (RS)",             "url": "https://www.prt4.mpt.mp.br/informe-se/noticias-do-mpt-rs"},
    {"nome": "PRT-3 (MG)",             "url": "https://www.prt3.mpt.mp.br/comunicacao/noticias-do-mpt-mg"},
    {"nome": "PRT-5 (BA)",             "url": "https://www.prt5.mpt.mp.br/informe-se/noticias-do-mpt-ba"},
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

Há publicação das últimas 72 horas sobre TAC, ACP, fiscalização, autuação ou
irregularidade com impacto para empresas ou empregadores?
Exclua conteúdo institucional interno do MPT.

Responda APENAS com JSON:
{{"relevante": true/false, "motivo": "1 frase objetiva", "tema": "tema com PRT, empresa/setor e tipo de instrumento se disponíveis"}}
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

1. Resumo executivo (2-3 frases): o que aconteceu, qual PRT/MPT, empresa ou setor, tipo de instrumento e valor se disponível.
2. Contexto da irregularidade: qual norma foi violada (CLT, NR, CF/88) e como o MPT identificou o problema.
3. Instrumento utilizado: TAC, ACP, Recomendação ou Operação — descreva os termos e obrigações.
4. Risco para empresas do setor: padrões de irregularidade recorrente, valor de multas típicas.
5. Impacto para compliance e RH: o que revisar internamente para evitar o mesmo tipo de autuação.
6. Ação preventiva: medidas concretas para diretoria jurídica, compliance e RH estratégico.

Mínimo 450 palavras. Nunca invente dados.

Responda APENAS com JSON válido:
{{
  "title": "Título com MPT/PRT, setor e tipo de instrumento (máx 70 chars)",
  "excerpt": "Resumo em 1-2 frases (máx 160 chars)",
  "tags": ["Tag1", "Tag2", "Tag3"],
  "image_query": "3-5 palavras em inglês para imagem contextual (ex: labor inspection compliance audit)",
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
        dados.setdefault("tags",        ["MPT", "Fiscalização"])
        dados.setdefault("image_query", "labor inspection compliance audit workplace")
        dados["source_url"] = fonte_url
        return dados
    except Exception as e:
        print(f"  Erro ao gerar artigo: {e}")
        return None


def main():
    print(f"\nAgente {FONTE_LABEL} — {HOJE.strftime('%d/%m/%Y')}")
    print("=" * 70)

    # Sorteia 3 PRTs por dia para variar cobertura regional
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
