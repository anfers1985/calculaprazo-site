# -*- coding: utf-8 -*-
"""
agente_mte_legislacao.py — CalculaPrazo
Categoria: legislacao-normas
"""
import json, re, requests, random, time
from html.parser import HTMLParser
from agente_base import claude, validar_qualidade, is_duplicata, salvar_post, HOJE

CATEGORIA   = "legislacao-normas"
FONTE_LABEL = "MTE/Legislacao"

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (compatible; CalculaPrazoBot/1.0; +https://calculaprazo.com.br)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

SOURCES = [
    {"nome": "MTE — Noticias",            "url": "https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo"},
    {"nome": "Agencia Gov — Trabalho",    "url": "https://agenciagov.ebc.com.br/noticias/trabalho-e-emprego"},
    {"nome": "Agencia Gov — Previdencia", "url": "https://agenciagov.ebc.com.br/noticias/previdencia"},
    {"nome": "Planalto — Legislacao",     "url": "http://www4.planalto.gov.br/legislacao/portal-legis/resenha-diaria/copy_of_resenha-diaria-ano"},
    {"nome": "eSocial — Noticias",        "url": "https://www.gov.br/esocial/pt-br/noticias"},
    {"nome": "FGTS Digital — Noticias",   "url": "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/fgts-digital/noticias"},
]

PROPOSITO = """Voce e Especialista em Direito Regulatorio Trabalhista do CalculaPrazo.
Publico: RH, DP, contadores, advogados trabalhistas.
Foco: portarias MTE, instrucoes normativas, atualizacoes eSocial/FGTS Digital,
      fiscalizacoes, programas e obrigacoes acessorias.
NAO PUBLICAR: nomeacoes de servidores, eventos internos sem impacto regulatorio.
REGRAS: Citar numero da norma (Portaria, IN, Resolucao). Nunca inventar dados."""


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
        dados.setdefault("image_query", "labor ministry legislation documents")
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
