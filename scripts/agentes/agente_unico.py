# -*- coding: utf-8 -*-
# agente_unico.py — Agente unificado do CalculaPrazo
#
# Monitora TODAS as fontes jurídicas e publica 1 post por execução.
#
# Tipos de post:
#   JURISPRUDENCIA  — decisão/acórdão/súmula: processo, turma, relator, tese, impacto
#   INFORMATIVO     — notícia de órgão oficial: fato, contexto, impacto, recomendação
#   ANALISE_LEI     — PL em tramitação OU norma já publicada (tratamento diferenciado)
#
import json, re, requests, random, time, sys
from html.parser import HTMLParser
from agente_base import (chamar_llm, validar_qualidade, is_duplicata,
                         salvar_post, HOJE, CATEGORIAS_VALIDAS)

# ─────────────────────────────────────────────────────────────
# FONTES
# ─────────────────────────────────────────────────────────────
FONTES = [
    # TST / STF
    {"nome": "TST — Notícias",          "url": "https://www.tst.jus.br/web/guest/noticias",                                      "categoria": "jurisprudencia-tst",   "tipo": "JURISPRUDENCIA"},
    {"nome": "STF — Notícias",          "url": "https://noticias.stf.jus.br/",                                                    "categoria": "jurisprudencia-tst",   "tipo": "JURISPRUDENCIA"},
    {"nome": "TST — Jurisprudência",    "url": "https://jurisprudencia.tst.jus.br/",                                             "categoria": "jurisprudencia-tst",   "tipo": "JURISPRUDENCIA"},
    {"nome": "STF — Portal",            "url": "https://portal.stf.jus.br/noticias/",                                            "categoria": "jurisprudencia-tst",   "tipo": "JURISPRUDENCIA"},
    # TRTs
    {"nome": "CSJT — Notícias TRTs",    "url": "https://www.csjt.jus.br/web/csjt/noticias-dos-trts",                            "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-2 (SP)",              "url": "https://ww2.trt2.jus.br/noticias/noticias",                                      "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-4 (RS)",              "url": "https://www.trt4.jus.br/portais/trt4/modulos/noticias/todas/0",                  "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-1 (RJ)",              "url": "https://trt1.jus.br/web/guest/ultimas-noticias",                                  "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-3 (MG)",              "url": "https://portal.trt3.jus.br/internet/conheca-o-trt/comunicacao/noticias-juridicas","categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-12 (SC)",             "url": "https://portal.trt12.jus.br/noticias",                                           "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    # MTE / MPT / eSocial
    {"nome": "MTE — Notícias",          "url": "https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo",                "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "eSocial — Notícias",      "url": "https://www.gov.br/esocial/pt-br/noticias",                                      "categoria": "esocial-fgts-digital", "tipo": "INFORMATIVO"},
    {"nome": "FGTS Digital — Notícias", "url": "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/fgts-digital/noticias",     "categoria": "esocial-fgts-digital", "tipo": "INFORMATIVO"},
    {"nome": "Agência Gov — Trabalho",  "url": "https://agenciagov.ebc.com.br/noticias/trabalho-e-emprego",                      "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "MPT — Portal Nacional",   "url": "https://mpt.mp.br/pgt/noticias",                                                  "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "PRT-2 (SP)",              "url": "https://www.prt2.mpt.mp.br/informe-se/noticias-do-mpt-sp",                       "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "PRT-1 (RJ)",              "url": "https://www.prt1.mpt.mp.br/informe-se/noticias-do-mpt-rj",                       "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    # Portais / orientações práticas
    {"nome": "Contabeis — Trabalhista", "url": "https://www.contabeis.com.br/conteudo/trabalhista/",                              "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Contabeis — Previdência", "url": "https://www.contabeis.com.br/conteudo/previdencia/",                              "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Migalhas — Trabalhista",  "url": "https://www.migalhas.com.br/quentes/trabalhista",                                 "categoria": "legislacao-normas",    "tipo": "ANALISE_LEI"},
    {"nome": "Jus.com.br — Trabalhista","url": "https://jus.com.br/artigos/direito-do-trabalho",                                  "categoria": "artigos",              "tipo": "ANALISE_LEI"},
]

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
}

# ─────────────────────────────────────────────────────────────
# IDENTIDADE EDITORIAL
# Padrão extraído dos posts de referência publicados no site:
#   tst-estabilidade-gestante-contrato-temporario-lei-6019
#   nulidade-sentenca-sobrestamento-tst-tema-02-irdr
#   nova-lei-licenca-paternidade-impactos-empresas
#   aposentadoria-por-pontos-inss-2026
#   aviso-previo-proporcional-como-calcular
# ─────────────────────────────────────────────────────────────
IDENTIDADE_EDITORIAL = """
IDENTIDADE EDITORIAL DO CALCULAPRAZO
======================================
P�blico-alvo: advogados trabalhistas, RH estratégico, DP, controladoria, contadores.
Tom: técnico e direto — sem juridiquês vazio, sem sensacionalismo, sem exagero.
Objetivo: transformar notícias e decisões em análise útil para quem toma decisões.

PRINCÍPIOS INEGOCIÁVEIS:

1. FIDELIDADE ABSOLUTA À FONTE
   - Escreva APENAS o que a fonte diz ou confirma.
   - Nunca afirme datas, números de processo, nomes de relatores, números de portaria
     ou qualquer outro dado que NÃO conste explicitamente no texto coletado.
   - Exemplo proibido: dizer que "o PL foi enviado ao Congresso em 17/04/2026" se
     a fonte não menciona essa data.
   - Se um dado não está na fonte, simplesmente omita — não preencha com suposições.

2. CLAREZA SOBRE A NATUREZA JURÍDICA DO CONTEÚDO
   - PL / Proposta em tramitação: não tem vigência, não produz efeitos jurídicos.
     Use linguagem condicional: "se aprovado", "propõe", "prevê", "poderá".
     NUNCA use "O que mudou", "Vigência", "Penalidades" como se já fosse lei.
   - Decisão judicial: cite tribunal, processo, turma e relator APENAS se a fonte menciona.
   - Norma publicada: cite número e data de publicação conforme a fonte.

3. REESCRITA GENUÍNA — NÃO É CÓPIA
   - Reescreva com suas próprias palavras. Reorganize, sintetize, acrescente análise.
   - Não reproduza frases inteiras da fonte — isso não é análise, é ctrl+C.
   - Acrescente: o que isso significa na prática? Qual o risco para a empresa?

4. CITAÇÃO DA FONTE
   - NÃO inclua bloco de fonte dentro do campo "content".
   - A fonte já é adicionada automaticamente no rodapé pelo sistema, no formato:
     "Fonte: [Nome da Fonte] — acesso em [data]."
"""

# ─────────────────────────────────────────────────────────────
# ESTRUTURAS POR TIPO
# ─────────────────────────────────────────────────────────────
ESTRUTURA_JURISPRUDENCIA = """
TIPO: JURISPRUDÊNCIA (decisão / acórdão / súmula de tribunal)
Seções obrigatórias com <h2>:
  1. Contexto — o que estava em discussão no caso concreto
  2. O que foi decidido — tese/resultado (cite processo, turma, relator APENAS se constam na fonte)
  3. Fundamento jurídico — base legal, artigos, súmulas, OJs aplicados
  4. Alinhamento com precedentes — como se relaciona com entendimentos anteriores do STF, TST
  5. Impactos práticos — consequências objetivas para empresas e trabalhadores (use <ul><li>)
  6. Recomendações — medidas concretas para jurídico e RH (use <ul><li>)
Mínimo: 500 palavras de conteúdo útil.
"""

ESTRUTURA_INFORMATIVO = """
TIPO: INFORMATIVO (notícia de MTE, MPT, eSocial, FGTS Digital, Agência Gov)
Seções obrigatórias com <h2>:
  1. O que aconteceu — descrição objetiva e precisa do fato, citando o órgão e número
     da norma/inquerito/portaria APENAS SE constarem na fonte
  2. Contexto — por que esse fato é relevante, qual o histórico, a quem afeta
  3. Base normativa — legislação e normas aplicáveis ao tema (CLT, portarias, leis)
  4. Impacto para empresas — riscos, obrigações, passivos concretos
  5. O que fazer — recomendações práticas e objetivas (use <ul><li>)
Mínimo: 450 palavras de conteúdo útil.
"""

ESTRUTURA_ANALISE_LEI = """
TIPO: ANÁLISE DE NORMA / PL

PASSO OBRIGATÓRIO ANTES DE ESCREVER:
Determine a natureza do conteúdo coletado:
  (A) PL / Proposta de lei ainda em tramitação → ainda NÃO é lei, sem efeito jurídico
  (B) Lei / Portaria / Resolução já publicada e em vigor → produz efeitos imediatos

SE FOR (A) — PL EM TRAMITAÇÃO:
Seções obrigatórias com <h2>:
  1. O que propõe o projeto — resumo fiel da proposta, em linguagem clara
  2. Situação legislativa — em qual casa legislativa, qual estágio (APENAS se constam na fonte)
  3. O que mudaria se aprovado — impactos possíveis, sempre em linguagem condicional
     ("caso aprovado", "se convertido em lei", "poderá", "prevê")
  4. Legislação vigente sobre o tema — o que a lei atual já prevê (CLT, leis especiais)
  5. O que acompanhar — pontos de atenção e próximos passos legislativos
PROIBIDO neste caso: "O que mudou", "Vigência e prazos", "Riscos e penalidades"
  como se a proposta já tivesse força de lei.

SE FOR (B) — LEI / NORMA JÁ EM VIGOR:
Seções obrigatórias com <h2>:
  1. O que a norma altera — dispositivos e artigos modificados
  2. Base legal — número, data de publicação (conforme a fonte)
  3. Principais mudanças — lista das alterações concretas (use <ul><li>)
  4. Vigência e implementação — data e fase de adaptação
  5. Impactos para empresas
  6. Impactos para trabalhadores
  7. O que fazer agora — checklist prático (use <ul><li>)
Mínimo: 480 palavras de conteúdo útil.
"""

INSTRUCOES_POR_TIPO = {
    "JURISPRUDENCIA": ESTRUTURA_JURISPRUDENCIA,
    "INFORMATIVO":    ESTRUTURA_INFORMATIVO,
    "ANALISE_LEI":    ESTRUTURA_ANALISE_LEI,
}

# ─────────────────────────────────────────────────────────────
# EXTRATOR DE TEXTO HTML
# ─────────────────────────────────────────────────────────────
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
                time.sleep(3)
        except Exception as e:
            print("  Erro: " + str(e))
    return "", fonte["url"]


# ─────────────────────────────────────────────────────────────
# AVALIAÇÃO DE RELEVÂNCIA
# ─────────────────────────────────────────────────────────────
def avaliar_relevancia(conteudo, fonte):
    if len(conteudo) < 150:
        return {"relevante": False, "motivo": "conteudo insuficiente", "tema": ""}

    tipo = fonte.get("tipo", "INFORMATIVO")
    cat  = fonte.get("categoria", "geral")

    prompt = (
        "Você é curador de conteúdo jurídico-trabalhista do CalculaPrazo.\n"
        "Público: advogados, RH estratégico, DP, contadores.\n\n"
        "Fonte: " + fonte["nome"] + " | Categoria: " + cat + " | Tipo esperado: " + tipo + "\n"
        "Data de hoje: " + HOJE.strftime("%d/%m/%Y") + "\n\n"
        "Conteúdo coletado:\n---\n" + conteudo[:3000] + "\n---\n\n"
        "Existe publicação RECENTE (últimas 72h) com impacto real para o público?\n"
        "EXCLUIR: concursos, posses, eventos sociais, homenagens, agenda sem impacto jurídico.\n\n"
        "Se relevante, classifique o TIPO CORRETO:\n"
        "  JURISPRUDENCIA — decisão/acórdão/súmula de tribunal\n"
        "  INFORMATIVO    — notícia de órgão oficial (MTE, MPT, eSocial, FGTS Digital)\n"
        "  ANALISE_LEI    — PL em tramitação OU lei/portaria já publicada\n\n"
        "Responda APENAS JSON válido (sem markdown):\n"
        '{"relevante": true, "motivo": "1 frase objetiva", '
        '"tema": "tema concreto — cite número de processo/norma APENAS se aparecer no texto coletado", '
        '"tipo_conteudo": "JURISPRUDENCIA|INFORMATIVO|ANALISE_LEI"}'
    )
    try:
        raw = chamar_llm(prompt, max_tokens=400, temperature=0.1)
        raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
        return json.loads(raw)
    except Exception as e:
        print("  Erro avaliacao: " + str(e))
        return {"relevante": False, "motivo": "erro", "tema": ""}


# ─────────────────────────────────────────────────────────────
# GERAÇÃO DO ARTIGO
# ─────────────────────────────────────────────────────────────
def gerar_artigo(conteudo, fonte, tema, tipo_conteudo):
    instrucoes = INSTRUCOES_POR_TIPO.get(tipo_conteudo, INSTRUCOES_POR_TIPO["INFORMATIVO"])

    prompt = (
        IDENTIDADE_EDITORIAL + "\n\n"
        "═══════════════════════════════════════════════════════\n"
        "TAREFA: Gerar post tipo " + tipo_conteudo + "\n"
        "Fonte: " + fonte["nome"] + "\n"
        "URL da fonte: " + fonte["url"] + "\n"
        "Data: " + HOJE.strftime("%d/%m/%Y") + "\n"
        "Tema identificado: " + tema + "\n\n"
        "CONTEÚDO COLETADO (base para o artigo — reescreva, não copie):\n"
        "---\n" + conteudo[:5500] + "\n---\n\n"
        + instrucoes + "\n\n"
        "REGRAS HTML:\n"
        "- Use <h2> para seções principais\n"
        "- Use <h3> para subseções quando necessário\n"
        "- Use <ul><li> para listas de obrigações, impactos, requisitos\n"
        "- Use <p> para parágrafos (2-4 frases cada)\n"
        "- Use <strong> para números de processos, artigos de lei, portarias e termos técnicos-chave\n"
        "- NUNCA use markdown (**, ##, *) — somente HTML puro\n"
        "- NÃO inclua linha de fonte/citação no content — ela é adicionada automaticamente\n\n"
        "RESPOSTA: JSON válido sem markdown, sem backticks:\n"
        '{"title": "Título técnico específico máx 80 chars", '
        '"excerpt": "1-2 frases máx 160 chars com o fato principal", '
        '"tags": ["Tag1","Tag2","Tag3","Tag4"], '
        '"image_query": "3-5 palavras em inglês para imagem", '
        '"content": "<h2>...</h2><p>...</p>..."}'
    )

    try:
        raw = chamar_llm(prompt, max_tokens=5000, temperature=0.2)
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


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
def main():
    print("\nAgente Único CalculaPrazo — " + HOJE.strftime("%d/%m/%Y"))
    print("=" * 70)
    print("Total de fontes: " + str(len(FONTES)))

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
        relevante = avaliacao.get("relevante", False)
        tema      = avaliacao.get("tema", "")
        print("  Relevante: " + str(relevante) + " | " + str(avaliacao.get("motivo", ""))[:80])
        if tema:
            print("  Tema: " + tema[:100])

        if not relevante:
            time.sleep(2)
            continue

        if is_duplicata(tema, "data/posts.json"):
            print("  Duplicata pelo tema: " + tema)
            continue

        tipo_conteudo = avaliacao.get("tipo_conteudo", fonte.get("tipo", "INFORMATIVO"))
        dados = gerar_artigo(conteudo, fonte, tema, tipo_conteudo)
        if not dados:
            continue

        aprovado, motivo = validar_qualidade(dados, fonte["categoria"])
        if not aprovado:
            print("  Reprovado qualidade: " + motivo)
            continue

        if is_duplicata(dados["title"], "data/posts.json"):
            print("  Duplicata pelo título: " + dados["title"])
            continue

        if salvar_post(dados, fonte["categoria"], fonte["nome"]):
            publicados += 1
            print("  OK Publicado: " + dados["title"])

        time.sleep(5)

    status = "OK" if publicados else "AVISO — nenhum post publicado"
    print("\n" + status + " — Total: " + str(publicados) + " post(s)")
    return publicados


if __name__ == "__main__":
    resultado = main()
    sys.exit(0 if resultado >= 0 else 1)
