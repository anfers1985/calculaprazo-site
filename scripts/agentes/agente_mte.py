# -*- coding: utf-8 -*-
"""
agente_mte.py — CalculaPrazo
Monitora publicações do Ministério do Trabalho e Emprego (MTE) e Governo Federal.
Foco: mudanças de legislação, novas normas, portarias, instruções normativas,
      operações de fiscalização, programas e obrigações para empregadores.
Categoria: legislacao-normas
Execução: dias úteis, 08h (Brasília) via GitHub Actions.
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

CATEGORIA   = "legislacao-normas"
FONTE_LABEL = "MTE"

PROPOSITO = """
Você é um Analista Estratégico de Relações Trabalhistas e Auditor Jurídico do CalculaPrazo.
P�blico-alvo: advogados trabalhistas, diretoria jurídica, RH estratégico, controladoria,
              departamento pessoal.
Estilo: técnico, direto, pragmático — foco em obrigações concretas e prazos.

MISSÃO DESTE AGENTE:
Monitorar publicações do Ministério do Trabalho e Emprego (MTE) e do Governo Federal
com impacto para empregadores, trabalhadores e profissionais de RH/DP.
Isso inclui: novas portarias, instruções normativas, decretos, resoluções, mudanças
na CLT ou legislação trabalhista, operações de fiscalização, novos programas
obrigatórios, alterações de NRs, prazos de adequação.

NÃO PUBLICAR: notas de pesar, agendas de eventos internos, discursos políticos sem
conteúdo normativo, nomeações de servidores sem impacto na regulação trabalhista.

REGRAS ABSOLUTAS:
1. Citar SEMPRE o número e nome da norma (ex: Portaria MTE nº 671/2021, IN nº 2/2023).
2. Informar a data de vigência ou prazo de adequação quando disponível.
3. Descrever objetivamente o que muda na prática para empresas e RH/DP.
4. Nunca inventar dados ausentes da fonte.
5. Concluir com checklist de ação para o departamento pessoal e jurídico.
"""

SOURCES = [
    {"nome": "MTE — Notícias",              "url": "https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo"},
    {"nome": "Planalto — Resenha Diária",   "url": "http://www4.planalto.gov.br/legislacao/portal-legis/resenha-diaria/copy_of_resenha-diaria-ano"},
    {"nome": "Agência Gov — Trabalho",      "url": "https://agenciagov.ebc.com.br/noticias/trabalho-e-emprego"},
    {"nome": "Agência Gov — Previdência",   "url": "https://agenciagov.ebc.com.br/noticias/previdencia"},
    {"nome": "Agência Gov — Economia",      "url": "https://agenciagov.ebc.com.br/noticias/economia"},
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

Há publicação das últimas 72 horas com nova norma, mudança regulatória, fiscalização
ou obrigação com impacto para empregadores, RH ou DP? 

Responda APENAS com JSON:
{{"relevante": true/false, "motivo": "1 frase objetiva", "tema": "tema com número da norma e data de vigência se disponíveis"}}
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

1. Resumo executivo (2-3 frases): o que foi publicado, número da norma, data de vigência e impacto imediato.
2. O que muda: descreva objetivamente as novas obrigações ou alterações com base no conteúdo coletado.
3. Base legal: cite a norma completa (número, ementa, órgão emissor).
4. Impacto para RH e departamento pessoal: o que deve ser revisado — contratos, políticas, sistemas, folha.
5. Risco de descumprimento: multas, autuações, passivo trabalhista.
6. Checklist de adequação: ações concretas com sugestão de prazo.

Mínimo 450 palavras. Nunca invente dados.

Responda APENAS com JSON válido:
{{
  "title": "Título com número da norma e impacto (máx 70 chars)",
  "excerpt": "Resumo em 1-2 frases (máx 160 chars)",
  "tags": ["Tag1", "Tag2", "Tag3"],
  "image_query": "3-5 palavras em inglês para imagem contextual (ex: labor law regulation ministry)",
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
        dados.setdefault("tags",        ["MTE", "Legislação"])
        dados.setdefault("image_query", "labor law regulation ministry document")
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
