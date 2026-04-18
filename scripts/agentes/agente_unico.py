# -*- coding: utf-8 -*-
# agente_unico.py — Agente unificado do CalculaPrazo
#
# Monitora TODAS as fontes jurídicas e publica 1 post por execução,
# alternando inteligentemente entre os tipos de conteúdo:
#   • Jurisprudência (TST, STF, TRTs)
#   • Notícias regulatórias (MTE, MPT, eSocial, FGTS Digital)
#   • Orientações práticas (Contabeis, Migalhas, Jus.com.br)
#
# Tipos de post suportados:
#   JURISPRUDENCIA  — decisão/acórdão com processo, turma, relator, tese, impacto
#   INFORMATIVO     — notícia regulatória com norma, vigência, obrigação prática
#   ANALISE_LEI     — análise de nova lei/portaria: contexto, mudanças, impactos
#
import json, re, requests, random, time, sys, os
from html.parser import HTMLParser
from agente_base import (chamar_llm, validar_qualidade, is_duplicata,
                         salvar_post, HOJE, CATEGORIAS_VALIDAS)

# ─────────────────────────────────────────────
# FONTES — todas consolidadas em uma lista única
# ─────────────────────────────────────────────
FONTES = [
    # TST / STF
    {"nome": "TST — Notícias",           "url": "https://www.tst.jus.br/web/guest/noticias",             "categoria": "jurisprudencia-tst",   "tipo": "JURISPRUDENCIA"},
    {"nome": "STF — Notícias",           "url": "https://noticias.stf.jus.br/",                          "categoria": "jurisprudencia-tst",   "tipo": "JURISPRUDENCIA"},
    {"nome": "TST — Jurisprudência",     "url": "https://jurisprudencia.tst.jus.br/",                    "categoria": "jurisprudencia-tst",   "tipo": "JURISPRUDENCIA"},
    {"nome": "STF — Portal",             "url": "https://portal.stf.jus.br/noticias/",                   "categoria": "jurisprudencia-tst",   "tipo": "JURISPRUDENCIA"},
    # TRTs
    {"nome": "CSJT — Notícias TRTs",     "url": "https://www.csjt.jus.br/web/csjt/noticias-dos-trts",   "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-2 (SP)",               "url": "https://ww2.trt2.jus.br/noticias/noticias",             "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-4 (RS)",               "url": "https://www.trt4.jus.br/portais/trt4/modulos/noticias/todas/0", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-1 (RJ)",               "url": "https://trt1.jus.br/web/guest/ultimas-noticias",        "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-3 (MG)",               "url": "https://portal.trt3.jus.br/internet/conheca-o-trt/comunicacao/noticias-juridicas", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-12 (SC)",              "url": "https://portal.trt12.jus.br/noticias",                  "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    # MTE / MPT
    {"nome": "MTE — Notícias",           "url": "https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    {"nome": "eSocial — Notícias",       "url": "https://www.gov.br/esocial/pt-br/noticias",             "categoria": "esocial-fgts-digital", "tipo": "INFORMATIVO"},
    {"nome": "FGTS Digital — Notícias",  "url": "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/fgts-digital/noticias", "categoria": "esocial-fgts-digital", "tipo": "INFORMATIVO"},
    {"nome": "Agência Gov — Trabalho",   "url": "https://agenciagov.ebc.com.br/noticias/trabalho-e-emprego", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    {"nome": "MPT — Portal Nacional",    "url": "https://mpt.mp.br/pgt/noticias",                        "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "PRT-2 (SP)",               "url": "https://www.prt2.mpt.mp.br/informe-se/noticias-do-mpt-sp", "categoria": "noticias-mte-mpt",  "tipo": "INFORMATIVO"},
    {"nome": "PRT-1 (RJ)",               "url": "https://www.prt1.mpt.mp.br/informe-se/noticias-do-mpt-rj", "categoria": "noticias-mte-mpt",  "tipo": "INFORMATIVO"},
    # Portais jurídicos / orientações práticas
    {"nome": "Contabeis — Trabalhista",  "url": "https://www.contabeis.com.br/conteudo/trabalhista/",    "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Contabeis — Previdência",  "url": "https://www.contabeis.com.br/conteudo/previdencia/",    "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Migalhas — Trabalhista",   "url": "https://www.migalhas.com.br/quentes/trabalhista",       "categoria": "legislacao-normas",    "tipo": "ANALISE_LEI"},
    {"nome": "Jus.com.br — Trabalhista", "url": "https://jus.com.br/artigos/direito-do-trabalho",        "categoria": "artigos",              "tipo": "ANALISE_LEI"},
]

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
}

# ─────────────────────────────────────────────
# PADRÃO DE QUALIDADE — extraído dos posts reais
# ─────────────────────────────────────────────
PADRAO_QUALIDADE = """
PADRAO DE QUALIDADE DO CALCULAPRAZO (baseado nos posts publicados):

PRINCIPIOS INEGOCIAVEIS:

1. FIDELIDADE ABSOLUTA A FONTE
   - Escreva APENAS o que a fonte diz ou confirma.
   - Nunca afirme datas, numeros de processo, nomes de relatores, numeros de portaria
     ou qualquer dado que NAO conste explicitamente no texto coletado.
   - Se um dado nao esta na fonte, omita — nao preencha com suposicoes.

2. CLAREZA SOBRE A NATUREZA JURIDICA
   - PL/Proposta em tramitacao: NAO tem vigencia, NAO produz efeitos juridicos.
     Use linguagem condicional: "se aprovado", "propoe", "preve", "podera".
     NUNCA use "O que mudou", "Vigencia", "Penalidades" para algo que ainda nao e lei.
   - Decisao judicial: cite tribunal, processo, turma e relator APENAS se a fonte menciona.
   - Norma publicada: cite numero e data de publicacao conforme a fonte.

3. REESCRITA GENUINA — NAO E COPIA
   - Reescreva com suas proprias palavras. Reorganize, sintetize, acrescente analise.
   - Nao reproduza frases inteiras da fonte.
   - Acrescente: o que isso significa na pratica? Qual o risco para a empresa?

4. CITACAO DA FONTE
   - NAO inclua bloco de fonte dentro do campo "content".
   - A fonte ja e adicionada automaticamente no rodape pelo sistema.

ESTRUTURA OBRIGATORIA DOS POSTS:
- Titulo: tecnico, especifico, max. 80 chars. Citar tribunal/orgao/lei quando possivel.
  Exemplos bons: "TST consolida estabilidade da gestante em contratos temporarios"
                 "Nova Lei de Licenca-Paternidade: impactos praticos para empresas"
                 "Descumprimento de sobrestamento do TST gera nulidade de sentenca"
  EVITAR: "Novas tendencias", "Analise pos-2026", "Perspectivas do direito"

- Excerpt: 1-2 frases, max. 160 chars. Resumo direto com o fato principal.

- Conteudo HTML (minimo 450 palavras):
  - Usar <h2> para cada secao (min. 5 secoes)
  - Usar <h3> para subsecoes quando necessario
  - Usar <ul><li> para listas de base legal, requisitos, impactos
  - Usar <p> para paragrafos corridos
  - Usar <strong> para termos tecnicos e numeros de processos/leis
  - NUNCA usar markdown (**, ##) — apenas HTML puro

SECOES POR TIPO DE POST:

JURISPRUDENCIA (decisao/acordao):
  1. <h2>Contexto e fato julgado</h2>
  2. <h2>Fundamentacao juridica</h2>
  3. <h2>O que foi decidido</h2> (processo, turma, relator SE constam na fonte)
  4. <h2>Tese juridica central</h2>
  5. <h2>Base legal e precedentes</h2>
  6. <h2>Impactos praticos para empresas e trabalhadores</h2>
  7. <h2>Recomendacoes para RH e juridico</h2>

INFORMATIVO (noticia de orgao oficial: MTE, MPT, eSocial):
  1. <h2>O que aconteceu</h2> (orgao, numero da norma/inquerito SE constam na fonte)
  2. <h2>Contexto</h2>
  3. <h2>Base normativa</h2>
  4. <h2>Impacto para empresas</h2>
  5. <h2>O que fazer</h2>

ANALISE_LEI — ATENCAO: determine PRIMEIRO se e PL ou lei ja em vigor:

  SE FOR PL EM TRAMITACAO (ainda nao e lei):
  1. <h2>O que propoe o projeto</h2>
  2. <h2>Situacao legislativa atual</h2> (SE constar na fonte)
  3. <h2>O que mudaria se aprovado</h2> (sempre linguagem condicional)
  4. <h2>Legislacao vigente sobre o tema</h2>
  5. <h2>O que acompanhar</h2>
  NAO USE: "O que mudou", "Vigencia e prazos", "Penalidades" como se ja fosse lei.

  SE FOR LEI/NORMA JA EM VIGOR:
  1. <h2>O que a norma altera</h2>
  2. <h2>Base legal</h2>
  3. <h2>Principais mudancas</h2>
  4. <h2>Vigencia e implementacao</h2>
  5. <h2>Impactos para empresas</h2>
  6. <h2>Impactos para trabalhadores</h2>
  7. <h2>O que fazer agora</h2>
"""

# ─────────────────────────────────────────────
# EXTRATOR DE TEXTO HTML
# ─────────────────────────────────────────────
class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.texts = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script","style","nav","header","footer","aside","noscript","form","button"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script","style","nav","header","footer","aside","noscript","form","button"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            t = data.strip()
            if len(t) > 40:
                self.texts.append(t)

    def get_text(self, max_chars=7000):
        return " ".join(self.texts)[:max_chars]


def buscar_conteudo(fonte):
    """Busca conteúdo da fonte com retry e User-Agent rotativo."""
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
    ]
    for tentativa in range(2):
        headers = dict(HEADERS)
        headers["User-Agent"] = user_agents[tentativa % len(user_agents)]
        try:
            r = requests.get(fonte["url"], headers=headers, timeout=30)
            print("  HTTP " + str(r.status_code) + " | " + fonte["nome"])
            if r.ok and len(r.text) > 500:
                p = TextExtractor()
                p.feed(r.text)
                texto = p.get_text(7000)
                if len(texto) > 200:
                    return texto, r.url
            elif r.status_code == 403:
                print("  403 bloqueado — tentando com delay...")
                time.sleep(3)
        except Exception as e:
            print("  Erro: " + str(e))
    return "", fonte["url"]


def avaliar_relevancia(conteudo, fonte):
    """Avalia se há conteúdo relevante recente (72h) na fonte."""
    if len(conteudo) < 150:
        return {"relevante": False, "motivo": "conteudo insuficiente", "tema": ""}

    tipo = fonte.get("tipo", "INFORMATIVO")
    cat  = fonte.get("categoria", "geral")

    prompt = (
        "Você é curador de conteúdo jurídico-trabalhista do CalculaPrazo.\n"
        "Público: advogados, RH estratégico, DP, contadores, empresas.\n\n"
        "Fonte: " + fonte["nome"] + " | Categoria: " + cat + " | Tipo: " + tipo + "\n"
        "Data de hoje: " + HOJE.strftime("%d/%m/%Y") + "\n\n"
        "Conteúdo coletado:\n---\n" + conteudo[:3000] + "\n---\n\n"
        "Existe publicação RECENTE (últimas 72h) com impacto real para o público?\n"
        "EXCLUIR: concursos, posses, eventos sociais, homenagens, agenda institucional.\n\n"
        "Responda APENAS JSON válido (sem markdown):\n"
        '{"relevante": true, "motivo": "1 frase objetiva", '
        '"tema": "tema concreto com número de processo/norma se disponível", '
        '"tipo_conteudo": "JURISPRUDENCIA|INFORMATIVO|ANALISE_LEI"}'
    )
    try:
        raw = chamar_llm(prompt, max_tokens=300, temperature=0.1)
        raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
        return json.loads(raw)
    except Exception as e:
        print("  Erro avaliacao: " + str(e))
        return {"relevante": False, "motivo": "erro", "tema": ""}


def gerar_artigo(conteudo, fonte, tema, tipo_conteudo):
    """Gera artigo completo seguindo o padrão de qualidade do CalculaPrazo."""

    instrucao_tipo = {
        "JURISPRUDENCIA": (
            "Redija boletim de jurisprudência trabalhista (mínimo 500 palavras) com:\n"
            "1. Contexto e fato julgado\n"
            "2. Fundamentação jurídica\n"
            "3. O que foi decidido (processo, turma, relator se disponíveis)\n"
            "4. Tese jurídica central\n"
            "5. Base legal e precedentes (lista)\n"
            "6. Impactos práticos para empresas e trabalhadores\n"
            "7. Recomendações para RH e jurídico"
        ),
        "INFORMATIVO": (
            "Redija boletim informativo regulatório (mínimo 500 palavras) com:\n"
            "1. O que mudou (fato objetivo)\n"
            "2. Base normativa (número da portaria/IN/lei)\n"
            "3. Vigência e prazos\n"
            "4. Obrigações práticas (lista)\n"
            "5. Quem está sujeito\n"
            "6. Riscos e penalidades\n"
            "7. O que fazer agora (checklist)"
        ),
        "ANALISE_LEI": (
            "Determine ANTES de escrever se o conteudo e:\n"
            "(A) PL em tramitacao — ainda nao e lei, sem efeito juridico atual\n"
            "(B) Lei/Portaria ja publicada e em vigor\n\n"
            "SE FOR (A) PL em tramitacao — redija analise (minimo 500 palavras) com:\n"
            "1. O que propoe o projeto (resumo fiel, linguagem clara)\n"
            "2. Situacao legislativa (casa, estagio — APENAS se constam na fonte)\n"
            "3. O que mudaria se aprovado (SEMPRE linguagem condicional: se aprovado, preve, podera)\n"
            "4. Legislacao vigente sobre o tema (o que a lei atual ja prevê)\n"
            "5. O que acompanhar (proximos passos)\n"
            "PROIBIDO: usar O que mudou, Vigencia, Penalidades como se ja fosse lei.\n\n"
            "SE FOR (B) lei/norma ja em vigor — redija analise (minimo 500 palavras) com:\n"
            "1. O que a norma altera (dispositivos e artigos)\n"
            "2. Base legal (numero e data conforme a fonte)\n"
            "3. Principais mudancas (lista)\n"
            "4. Vigencia e implementacao\n"
            "5. Impactos para empresas\n"
            "6. Impactos para trabalhadores\n"
            "7. O que fazer agora (checklist)"
        ),
    }.get(tipo_conteudo, instrucao_tipo_default := (
        "Redija artigo técnico-jurídico (mínimo 500 palavras) com pelo menos 6 seções H2."
    ))

    prompt = (
        PADRAO_QUALIDADE + "\n\n"
        "═══════════════════════════════\n"
        "TAREFA: Gerar post tipo " + tipo_conteudo + "\n"
        "Fonte: " + fonte["nome"] + "\n"
        "URL: " + fonte["url"] + "\n"
        "Data: " + HOJE.strftime("%d/%m/%Y") + "\n"
        "Tema identificado: " + tema + "\n\n"
        "Conteúdo coletado:\n---\n" + conteudo[:5500] + "\n---\n\n"
        + instrucao_tipo + "\n\n"
        "FORMATO DE RESPOSTA — JSON válido (sem markdown, sem backticks):\n"
        '{"title": "Título técnico específico máx 80 chars", '
        '"excerpt": "Resumo 1-2 frases máx 160 chars com o fato principal", '
        '"tags": ["Tag1","Tag2","Tag3","Tag4"], '
        '"image_query": "3-5 palavras em inglês para busca de imagem", '
        '"content": "<h2>Seção 1</h2><p>...</p><h2>Seção 2</h2>..."}'
    )

    try:
        raw = chamar_llm(prompt, max_tokens=4500, temperature=0.2)
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        dados = json.loads(raw)
        dados.setdefault("title",       "Atualização Trabalhista — " + HOJE.strftime("%d/%m/%Y"))
        dados.setdefault("excerpt",     tema[:120])
        dados.setdefault("content",     "<p>Análise técnica em elaboração.</p>")
        dados.setdefault("tags",        ["Direito Trabalhista"])
        dados.setdefault("image_query", "law justice court gavel")
        dados["source_url"] = fonte["url"]
        return dados
    except Exception as e:
        print("  Erro gerar artigo: " + str(e))
        return None


def main():
    print("\nAgente Único CalculaPrazo — " + HOJE.strftime("%d/%m/%Y"))
    print("=" * 70)
    print("Total de fontes configuradas: " + str(len(FONTES)))

    # Embaralhar para variar as fontes a cada execução
    fontes_shuffled = list(FONTES)
    random.shuffle(fontes_shuffled)

    publicados = 0

    for fonte in fontes_shuffled:
        if publicados >= 1:
            break

        print("\n[" + fonte["nome"] + "] — " + fonte["categoria"])
        conteudo, url_real = buscar_conteudo(fonte)

        if not conteudo or len(conteudo) < 200:
            print("  Conteúdo insuficiente, pulando.")
            continue

        avaliacao = avaliar_relevancia(conteudo, fonte)
        print("  Avaliação: relevante=" + str(avaliacao.get("relevante")) +
              " | tema: " + str(avaliacao.get("tema", ""))[:80])

        if not avaliacao.get("relevante"):
            print("  Sem relevância: " + str(avaliacao.get("motivo")))
            time.sleep(2)
            continue

        tema          = avaliacao.get("tema", "")
        tipo_conteudo = avaliacao.get("tipo_conteudo", fonte.get("tipo", "INFORMATIVO"))

        if is_duplicata(tema, "data/posts.json"):
            print("  Duplicata pelo tema: " + tema)
            continue

        dados = gerar_artigo(conteudo, fonte, tema, tipo_conteudo)
        if not dados:
            continue

        aprovado, motivo = validar_qualidade(dados, fonte["categoria"])
        if not aprovado:
            print("  Reprovado: " + motivo)
            continue

        if is_duplicata(dados["title"], "data/posts.json"):
            print("  Duplicata pelo título: " + dados["title"])
            continue

        if salvar_post(dados, fonte["categoria"], fonte["nome"]):
            publicados += 1
            print("  ✅ Post publicado: " + dados["title"])

        time.sleep(5)

    status = "✅ OK" if publicados else "⚠️  AVISO"
    print("\n" + status + " — Total publicado: " + str(publicados) + " post(s)")
    return publicados


if __name__ == "__main__":
    resultado = main()
    sys.exit(0 if resultado >= 0 else 1)
