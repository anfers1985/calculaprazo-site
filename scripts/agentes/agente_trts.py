# -*- coding: utf-8 -*-
"""
agente_trts.py — CalculaPrazo
Categoria: jurisprudencia-trts
"""
import json, re, requests, random, time
from html.parser import HTMLParser
from agente_base import claude, validar_qualidade, is_duplicata, salvar_post, HOJE

CATEGORIA   = "jurisprudencia-trts"
FONTE_LABEL = "TRTs"

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (compatible; CalculaPrazoBot/1.0; +https://calculaprazo.com.br)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

SOURCES = [
    {"nome": "CSJT — Noticias TRTs",   "url": "https://www.csjt.jus.br/web/csjt/noticias-dos-trts"},
    {"nome": "TRT-4 (RS)",              "url": "https://www.trt4.jus.br/portais/trt4/modulos/noticias/todas/0"},
    {"nome": "TRT-12 (SC)",             "url": "https://portal.trt12.jus.br/noticias"},
    {"nome": "TRT-9 (PR)",              "url": "https://www.trt9.jus.br/portal/noticias.xhtml"},
    {"nome": "TRT-2 (SP)",              "url": "https://ww2.trt2.jus.br/noticias/noticias"},
    {"nome": "TRT-1 (RJ)",              "url": "https://trt1.jus.br/web/guest/ultimas-noticias"},
    {"nome": "TRT-3 (MG)",              "url": "https://portal.trt3.jus.br/internet/conheca-o-trt/comunicacao/noticias-juridicas"},
    {"nome": "TRT-5 (BA)",              "url": "https://www.trt5.jus.br/noticias"},
]

PROPOSITO = """Voce e Analista de Jurisprudencia Trabalhista do CalculaPrazo.
Publico: advogados trabalhistas, RH estrategico.
Foco: decisoes dos TRTs com impacto em relacoes de trabalho e empresas.
NAO PUBLICAR: concursos, eventos internos, nomeacoes sem impacto juridico.
REGRAS: Citar numero do processo, turma, relator. Nunca inventar dados."""


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
        print(f"  Erro: {e}")
    return "", fonte["url"]


def avaliar_relevancia(conteudo, fonte_nome):
    if len(conteudo) < 150:
        return {"relevante": False, "motivo": "conteudo insuficiente", "tema": ""}
    prompt = f"""
{PROPOSITO}

Conteudo coletado de {fonte_nome} (hoje: {HOJE.strftime('%d/%m/%Y')}):
---
{conteudo[:3000]}
---

Ha publicacao recente (ultimas 72h) com impacto relevante para o publico-alvo?
Responda APENAS com JSON valido (sem markdown):
{"relevante": true/false, "motivo": "1 frase", "tema": "tema concreto com numero de norma/processo se disponivel"}
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

Conteudo coletado:
---
{conteudo[:5000]}
---

Redija boletim tecnico completo (minimo 450 palavras) com:
1. O que aconteceu (fato, orgao, numero de norma/processo)
2. Base legal aplicavel
3. Analise do conteudo (baseada APENAS no que foi coletado)
4. Impacto para empresas, RH ou trabalhadores
5. Acao recomendada

Nunca invente dados ausentes da fonte.

Responda APENAS com JSON valido (sem markdown):
{
  "title": "Titulo tecnico direto (max 70 chars)",
  "excerpt": "Resumo executivo 1-2 frases (max 160 chars)",
  "tags": ["Tag1", "Tag2", "Tag3"],
  "image_query": "3-5 palavras em ingles para busca de imagem",
  "content": "<h2>...</h2><p>...</p>..."
}
"""
    try:
        raw = claude(prompt, max_tokens=4000, temperature=0.2)
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        dados = json.loads(raw)
        dados.setdefault("title",       f"Atualizacao {FONTE_LABEL} — {HOJE.strftime('%d/%m/%Y')}")
        dados.setdefault("excerpt",     tema[:120])
        dados.setdefault("content",     "<p>Analise tecnica em elaboracao.</p>")
        dados.setdefault("tags",        [FONTE_LABEL])
        dados.setdefault("image_query", "labor court hearing workers")
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
            print(f"  Reprovado: {motivo}")
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
