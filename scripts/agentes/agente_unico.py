# -*- coding: utf-8 -*-
# agente_unico.py — Agente unificado CalculaPrazo v2
#
# Mudanças v2:
#   - API gratuita: Gemini (primário) → Grok (secundário) → OpenRouter :free (terciário)
#   - Publica 5 a 10 posts por execução
#   - 45 fontes: MPT regional, TRTs, TST, STF, MTE, Legislação, Notícias Gerais
#   - Reescrita anti-plágio obrigatória com análise de originalidade
#   - Pausa inteligente entre chamadas para respeitar rate limits
#
import json, re, requests, random, time, sys, os
from html.parser import HTMLParser
from agente_base import (chamar_llm, validar_qualidade, is_duplicata,
                         salvar_post, HOJE, CATEGORIAS_VALIDAS)

# ─────────────────────────────────────────────
# CONFIGURAÇÃO
# ─────────────────────────────────────────────
META_POSTS_MIN = 5    # mínimo de posts por execução
META_POSTS_MAX = 10   # máximo de posts por execução

# Pausa entre fontes (segundos) — respeita rate limits dos sites e das APIs
PAUSA_ENTRE_FONTES = 4

# ─────────────────────────────────────────────
# FONTES — 45 fontes consolidadas
# ─────────────────────────────────────────────
FONTES = [
    # ── MPT Regional ─────────────────────────────────────────────────────────
    {"nome": "CNMP — Notícias",           "url": "https://www.cnmp.mp.br/portal/noticias?o=date&t[]=",                                                       "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "PRT-12 (SC)",               "url": "https://www.prt12.mpt.mp.br/informe-se/noticias-do-mpt-sc",                                                 "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "PRT-1 (RJ)",                "url": "https://www.prt1.mpt.mp.br/informe-se/noticias-do-mpt-rj",                                                  "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "PRT-2 (SP)",                "url": "https://www.prt2.mpt.mp.br/informe-se/noticias-do-mpt-sp",                                                  "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "PRT-4 (RS)",                "url": "https://www.prt4.mpt.mp.br/informe-se/noticias-do-mpt-rs",                                                  "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "PRT-3 (MG)",                "url": "https://www.prt3.mpt.mp.br/comunicacao/noticias-do-mpt-mg",                                                 "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "PRT-5 (BA)",                "url": "https://www.prt5.mpt.mp.br/informe-se/noticias-do-mpt-ba",                                                  "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},

    # ── MTE e Legislação ─────────────────────────────────────────────────────
    {"nome": "MTE — Notícias",            "url": "https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo",                                           "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "Resenha Legislativa",       "url": "https://www4.planalto.gov.br/legislacao/portal-legis/resenha-diaria/resenha-diaria-" + str(HOJE.year),      "categoria": "legislacao-normas",    "tipo": "ANALISE_LEI"},
    {"nome": "Agência Gov — Economia",    "url": "https://agenciagov.ebc.com.br/noticias/economia",                                                           "categoria": "legislacao-normas",    "tipo": "INFORMATIVO"},
    {"nome": "Agência Gov — Previdência", "url": "https://agenciagov.ebc.com.br/noticias/previdencia",                                                        "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Agência Gov — Trabalho",    "url": "https://agenciagov.ebc.com.br/noticias/trabalho-e-emprego",                                                 "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "eSocial — Notícias",        "url": "https://www.gov.br/esocial/pt-br/noticias",                                                                 "categoria": "esocial-fgts-digital", "tipo": "INFORMATIVO"},
    {"nome": "FGTS Digital",              "url": "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/fgts-digital/noticias",                                "categoria": "esocial-fgts-digital", "tipo": "INFORMATIVO"},

    # ── TRTs ─────────────────────────────────────────────────────────────────
    {"nome": "TRT-4 (RS)",                "url": "https://www.trt4.jus.br/portais/trt4/modulos/noticias/todas/0",                                             "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-12 (SC)",               "url": "https://portal.trt12.jus.br/noticias",                                                                     "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-9 (PR)",                "url": "https://www.trt9.jus.br/portal/noticias.xhtml",                                                             "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-2 (SP)",                "url": "https://ww2.trt2.jus.br/noticias/noticias",                                                                 "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-15 (Campinas)",         "url": "https://trt15.jus.br/noticias/maisnoticias",                                                                "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-1 (RJ) — Notícias",    "url": "https://trt1.jus.br/web/guest/ultimas-noticias",                                                            "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-1 (RJ) — Destaque",    "url": "https://trt1.jus.br/web/guest/destaque-juridico",                                                           "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-5 (BA)",                "url": "https://www.trt5.jus.br/noticias",                                                                          "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-3 (MG)",                "url": "https://portal.trt3.jus.br/internet/conheca-o-trt/comunicacao/noticias-juridicas",                          "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-6 (PE)",                "url": "https://www.trt6.jus.br/portal/noticias",                                                                   "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-10 (DF/TO)",            "url": "https://www.trt10.jus.br/ascom/?pagina=consulta_noticias_internet.php&chk_materia_juridica=S&idTRT10M=196", "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-11 (AM/RR)",            "url": "https://portal.trt11.jus.br/index.php/comunicacao/noticias-lista",                                          "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},

    # ── TST / CSJT ───────────────────────────────────────────────────────────
    {"nome": "TST — Notícias",            "url": "https://www.tst.jus.br/web/guest/noticias",                                                                 "categoria": "jurisprudencia-tst",   "tipo": "JURISPRUDENCIA"},
    {"nome": "CSJT — Notícias TRTs",      "url": "https://www.csjt.jus.br/web/csjt/noticias-dos-trts",                                                       "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},

    # ── STF ───────────────────────────────────────────────────────────────────
    {"nome": "STF — Notícias",            "url": "https://noticias.stf.jus.br/",                                                                              "categoria": "jurisprudencia-tst",   "tipo": "JURISPRUDENCIA"},

    # ── Notícias Gerais ───────────────────────────────────────────────────────
    {"nome": "Contabeis — Trabalhista",   "url": "https://www.contabeis.com.br/conteudo/trabalhista/",                                                        "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Contabeis — Previdência",   "url": "https://www.contabeis.com.br/conteudo/previdencia/",                                                        "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Contabeis — Economia",      "url": "https://www.contabeis.com.br/conteudo/economia/",                                                           "categoria": "legislacao-normas",    "tipo": "INFORMATIVO"},
    {"nome": "Contabeis — Contábil",      "url": "https://www.contabeis.com.br/conteudo/contabil/",                                                           "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "G1 — Trabalho e Carreira",  "url": "https://g1.globo.com/trabalho-e-carreira/",                                                                 "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Senado — Dir. Trabalhistas","url": "https://www12.senado.leg.br/noticias/tags/Direitos%20Trabalhistas",                                          "categoria": "legislacao-normas",    "tipo": "ANALISE_LEI"},
    {"nome": "AMATRAXV — Jurídico",       "url": "https://amatraxv.org.br/noticias/noticias-juridicas",                                                       "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "G1 — Ministério Trabalho",  "url": "https://g1.globo.com/tudo-sobre/ministerio-do-trabalho/",                                                   "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "Câmara — CLT",              "url": "https://www.camara.leg.br/noticias/ultimas/tags?tag=Consolida%C3%A7%C3%A3o%20das%20Leis%20do%20Trabalho%20(CLT)", "categoria": "legislacao-normas", "tipo": "ANALISE_LEI"},
]

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection":      "keep-alive",
}

# ─────────────────────────────────────────────
# PADRÃO DE QUALIDADE
# ─────────────────────────────────────────────
PADRAO_QUALIDADE = """
PADRÃO DE QUALIDADE DO CALCULAPRAZO:

PRINCÍPIOS INEGOCIÁVEIS:

1. FIDELIDADE À FONTE
   - Escreva APENAS o que a fonte diz ou confirma.
   - Nunca afirme datas, números de processo, nomes de relatores, números de portaria
     que NÃO constem explicitamente no texto coletado.
   - Se um dado não está na fonte, omita — não preencha com suposições.

2. CLAREZA SOBRE A NATUREZA JURÍDICA
   - PL/Proposta em tramitação: NÃO tem vigência. Use: "se aprovado", "propõe", "prevê".
     NUNCA use "O que mudou", "Vigência", "Penalidades" para algo que ainda não é lei.
   - Decisão judicial: cite tribunal, processo, turma e relator APENAS se a fonte menciona.
   - Norma publicada: cite número e data de publicação conforme a fonte.

3. REESCRITA GENUÍNA — NÃO É CÓPIA
   - Reescreva com suas próprias palavras. Reorganize, sintetize, acrescente análise.
   - Não reproduza frases inteiras da fonte.
   - Acrescente: o que isso significa na prática? Qual o risco para a empresa?

4. CITAÇÃO DA FONTE
   - NÃO inclua bloco de fonte dentro do campo "content".
   - A fonte é adicionada automaticamente no rodapé pelo sistema.

ESTRUTURA OBRIGATÓRIA:
- Título: técnico, específico, máx. 80 chars.
  Bons exemplos: "TST consolida estabilidade da gestante em contratos temporários"
                 "Nova portaria MTE altera registro de jornada: obrigações práticas"
  EVITAR: "Novas tendências", "Análise pós-2026", "Perspectivas do direito"

- Excerpt: 1-2 frases, máx. 160 chars. Resumo direto com o fato principal.

- Conteúdo HTML (mínimo 450 palavras):
  - <h2> para cada seção (mínimo 5 seções)
  - <ul><li> para listas de base legal, requisitos, impactos
  - <p> para parágrafos corridos
  - <strong> para termos técnicos e números de processos/leis
  - NUNCA usar markdown (**, ##) — apenas HTML puro

SEÇÕES POR TIPO:

JURISPRUDENCIA:
  1. <h2>Contexto e fato julgado</h2>
  2. <h2>Fundamentação jurídica</h2>
  3. <h2>O que foi decidido</h2>
  4. <h2>Tese jurídica central</h2>
  5. <h2>Base legal e precedentes</h2>
  6. <h2>Impactos práticos para empresas e trabalhadores</h2>
  7. <h2>Recomendações para RH e jurídico</h2>

INFORMATIVO:
  1. <h2>O que aconteceu</h2>
  2. <h2>Contexto</h2>
  3. <h2>Base normativa</h2>
  4. <h2>Impacto para empresas</h2>
  5. <h2>O que fazer</h2>

ANALISE_LEI — determine PRIMEIRO se é PL ou lei em vigor:
  SE PL EM TRAMITAÇÃO:
  1. <h2>O que propõe o projeto</h2>
  2. <h2>Situação legislativa atual</h2>
  3. <h2>O que mudaria se aprovado</h2> (sempre linguagem condicional)
  4. <h2>Legislação vigente sobre o tema</h2>
  5. <h2>O que acompanhar</h2>

  SE LEI/NORMA JÁ EM VIGOR:
  1. <h2>O que a norma altera</h2>
  2. <h2>Base legal</h2>
  3. <h2>Principais mudanças</h2>
  4. <h2>Vigência e implementação</h2>
  5. <h2>Impactos para empresas</h2>
  6. <h2>O que fazer agora</h2>
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
        if tag in ("script","style","nav","header","footer","aside",
                   "noscript","form","button","svg","iframe"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script","style","nav","header","footer","aside",
                   "noscript","form","button","svg","iframe"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            t = data.strip()
            if len(t) > 40:
                self.texts.append(t)

    def get_text(self, max_chars=8000):
        return " ".join(self.texts)[:max_chars]


# ─────────────────────────────────────────────
# BUSCA DE CONTEÚDO
# ─────────────────────────────────────────────
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
]


def buscar_conteudo(fonte):
    """Busca conteúdo da fonte com retry e User-Agent rotativo.
    Retorna (texto_extraido, url_real)."""
    for tentativa in range(2):
        headers = dict(HEADERS)
        headers["User-Agent"] = USER_AGENTS[tentativa % len(USER_AGENTS)]
        try:
            r = requests.get(fonte["url"], headers=headers, timeout=30,
                             verify=False)  # verify=False para sites com SSL problemático (ex: STF)
            print("  HTTP " + str(r.status_code) + " | " + fonte["nome"])
            if r.ok and len(r.text) > 500:
                p = TextExtractor()
                p.feed(r.text)
                texto = p.get_text(8000)
                if len(texto) > 200:
                    return texto, r.url
            elif r.status_code == 403:
                print("  403 bloqueado — aguardando 5s e tentando novamente...")
                time.sleep(5)
            elif r.status_code == 404:
                print("  404 — fonte indisponível")
                return "", fonte["url"]
        except requests.exceptions.SSLError:
            # Retry sem verificação SSL
            try:
                r = requests.get(fonte["url"], headers=headers, timeout=30, verify=False)
                if r.ok and len(r.text) > 500:
                    p = TextExtractor()
                    p.feed(r.text)
                    texto = p.get_text(8000)
                    if len(texto) > 200:
                        return texto, r.url
            except Exception as e2:
                print("  Erro SSL retry: " + str(e2))
        except Exception as e:
            print("  Erro: " + str(e))
    return "", fonte["url"]


# ─────────────────────────────────────────────
# AVALIAÇÃO DE RELEVÂNCIA
# ─────────────────────────────────────────────
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
        "EXCLUIR: concursos, posses, eventos sociais, homenagens, agenda institucional.\n"
        "INCLUIR: decisões judiciais, portarias, normas, fiscalizações, mudanças de regra.\n\n"
        "Responda APENAS JSON válido (sem markdown, sem explicações fora do JSON):\n"
        '{"relevante": true, "motivo": "1 frase objetiva", '
        '"tema": "tema concreto com número de processo/norma se disponível", '
        '"tipo_conteudo": "JURISPRUDENCIA|INFORMATIVO|ANALISE_LEI"}'
    )
    try:
        raw = chamar_llm(prompt, max_tokens=300, temperature=0.1)
        raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
        # Extrai apenas o JSON mesmo que haja texto em volta
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            raw = match.group(0)
        return json.loads(raw)
    except Exception as e:
        print("  Erro avaliacao: " + str(e))
        return {"relevante": False, "motivo": "erro", "tema": ""}


# ─────────────────────────────────────────────
# GERAÇÃO DE ARTIGO
# ─────────────────────────────────────────────
def gerar_artigo(conteudo, fonte, tema, tipo_conteudo):
    """Gera artigo completo seguindo o padrão de qualidade do CalculaPrazo."""

    instrucoes_tipo = {
        "JURISPRUDENCIA": (
            "Redija boletim de jurisprudência trabalhista (mínimo 500 palavras) com:\n"
            "1. Contexto e fato julgado\n"
            "2. Fundamentação jurídica\n"
            "3. O que foi decidido (processo, turma, relator SE disponíveis na fonte)\n"
            "4. Tese jurídica central\n"
            "5. Base legal e precedentes (lista)\n"
            "6. Impactos práticos para empresas e trabalhadores\n"
            "7. Recomendações para RH e jurídico"
        ),
        "INFORMATIVO": (
            "Redija boletim informativo regulatório (mínimo 500 palavras) com:\n"
            "1. O que aconteceu (fato objetivo)\n"
            "2. Contexto\n"
            "3. Base normativa (número da portaria/IN/lei SE disponível na fonte)\n"
            "4. Impacto para empresas\n"
            "5. O que fazer (checklist prático)"
        ),
        "ANALISE_LEI": (
            "Determine ANTES de escrever se o conteúdo é:\n"
            "(A) PL em tramitação — ainda não é lei\n"
            "(B) Lei/Portaria já publicada e em vigor\n\n"
            "SE FOR (A) PL — redija análise (mínimo 500 palavras):\n"
            "1. O que propõe o projeto\n"
            "2. Situação legislativa (APENAS se constar na fonte)\n"
            "3. O que mudaria se aprovado (SEMPRE linguagem condicional)\n"
            "4. Legislação vigente sobre o tema\n"
            "5. O que acompanhar\n"
            "PROIBIDO: usar 'O que mudou', 'Vigência', 'Penalidades' como se já fosse lei.\n\n"
            "SE FOR (B) Lei/Norma em vigor — redija análise (mínimo 500 palavras):\n"
            "1. O que a norma altera\n"
            "2. Base legal\n"
            "3. Principais mudanças (lista)\n"
            "4. Vigência e implementação\n"
            "5. Impactos para empresas\n"
            "6. O que fazer agora"
        ),
    }
    instrucao = instrucoes_tipo.get(tipo_conteudo,
        "Redija artigo técnico-jurídico (mínimo 500 palavras) com pelo menos 5 seções H2.")

    prompt = (
        PADRAO_QUALIDADE + "\n\n"
        "═══════════════════════════════\n"
        "TAREFA: Gerar post tipo " + tipo_conteudo + "\n"
        "Fonte: " + fonte["nome"] + "\n"
        "URL: " + fonte["url"] + "\n"
        "Data: " + HOJE.strftime("%d/%m/%Y") + "\n"
        "Tema identificado: " + tema + "\n\n"
        "Conteúdo coletado da fonte:\n---\n" + conteudo[:6000] + "\n---\n\n"
        + instrucao + "\n\n"
        "REGRA ANTI-PLÁGIO OBRIGATÓRIA:\n"
        "- Reescreva completamente com suas próprias palavras\n"
        "- Não copie frases inteiras da fonte\n"
        "- Reorganize a ordem das informações\n"
        "- Adicione análise prática que não está na fonte\n\n"
        "FORMATO DE RESPOSTA — JSON válido (sem markdown, sem backticks, sem texto fora do JSON):\n"
        '{"title": "Título técnico específico máx 80 chars", '
        '"excerpt": "Resumo 1-2 frases máx 160 chars com o fato principal", '
        '"tags": ["Tag1","Tag2","Tag3","Tag4"], '
        '"image_query": "3-5 palavras em inglês para busca de imagem no Unsplash", '
        '"content": "<h2>Seção 1</h2><p>...</p><h2>Seção 2</h2>..."}'
    )

    try:
        raw = chamar_llm(prompt, max_tokens=4500, temperature=0.2)
        # Remove possíveis marcadores markdown
        raw = re.sub(r"^```json\s*", "", raw.strip())
        raw = re.sub(r"\s*```$", "", raw.strip())
        # Extrai JSON mesmo que haja texto em volta
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            raw = match.group(0)
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


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
def main():
    # Suprime warnings de SSL (verify=False)
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    print("\nAgente Único CalculaPrazo v2 — " + HOJE.strftime("%d/%m/%Y"))
    print("=" * 70)
    print("Total de fontes configuradas: " + str(len(FONTES)))
    print("Meta: " + str(META_POSTS_MIN) + " a " + str(META_POSTS_MAX) + " posts por execução")

    # Embaralha fontes para variar a cada execução
    fontes_shuffled = list(FONTES)
    random.shuffle(fontes_shuffled)

    publicados   = 0
    temas_vistos = set()  # evita dois posts sobre o mesmo tema na mesma execução

    for fonte in fontes_shuffled:
        if publicados >= META_POSTS_MAX:
            break

        print("\n[" + fonte["nome"] + "] — " + fonte["categoria"])

        conteudo, url_real = buscar_conteudo(fonte)

        if not conteudo or len(conteudo) < 200:
            print("  Conteúdo insuficiente, pulando.")
            continue

        # ── Avaliação de relevância ──────────────────────────────────────────
        avaliacao = avaliar_relevancia(conteudo, fonte)
        tema          = str(avaliacao.get("tema", ""))
        tipo_conteudo = avaliacao.get("tipo_conteudo", fonte.get("tipo", "INFORMATIVO"))

        print("  Avaliação: relevante=" + str(avaliacao.get("relevante")) +
              " | tema: " + tema[:80])

        if not avaliacao.get("relevante"):
            print("  Sem relevância: " + str(avaliacao.get("motivo", "")))
            time.sleep(PAUSA_ENTRE_FONTES)
            continue

        # ── Deduplicação por tema ────────────────────────────────────────────
        tema_slug = tema.lower()[:60]
        if tema_slug in temas_vistos:
            print("  Tema já coberto nesta execução, pulando.")
            continue
        if is_duplicata(tema, "data/posts.json"):
            print("  Duplicata pelo tema (já publicado antes): " + tema)
            continue

        # ── Geração do artigo ────────────────────────────────────────────────
        dados = gerar_artigo(conteudo, fonte, tema, tipo_conteudo)
        if not dados:
            time.sleep(PAUSA_ENTRE_FONTES)
            continue

        # ── Validação de qualidade ───────────────────────────────────────────
        aprovado, motivo = validar_qualidade(dados, fonte["categoria"])
        if not aprovado:
            print("  Reprovado: " + motivo)
            time.sleep(PAUSA_ENTRE_FONTES)
            continue

        # ── Deduplicação pelo título ─────────────────────────────────────────
        if is_duplicata(dados["title"], "data/posts.json"):
            print("  Duplicata pelo título: " + dados["title"])
            continue

        # ── Salvar ───────────────────────────────────────────────────────────
        if salvar_post(dados, fonte["categoria"], fonte["nome"]):
            publicados += 1
            temas_vistos.add(tema_slug)
            print("  ✅ Post publicado (" + str(publicados) + "/" + str(META_POSTS_MAX) + "): " + dados["title"])

        time.sleep(PAUSA_ENTRE_FONTES)

    # ── Resultado final ──────────────────────────────────────────────────────
    if publicados >= META_POSTS_MIN:
        status = "✅ OK"
    elif publicados > 0:
        status = "⚠️  PARCIAL"
    else:
        status = "❌ FALHA"

    print("\n" + status + " — Total publicado: " + str(publicados) + " post(s)")

    if publicados < META_POSTS_MIN:
        print("AVISO: Meta mínima de " + str(META_POSTS_MIN) + " posts não atingida.")
        print("  Causas prováveis:")
        print("  1. Rate limit das APIs gratuitas (Gemini/Grok/OpenRouter) — tente novamente em 1h")
        print("  2. Fontes sem conteúdo recente nas últimas 72h")
        print("  3. Verifique os logs acima para erros específicos")

    return publicados


if __name__ == "__main__":
    resultado = main()
    sys.exit(0 if resultado >= 0 else 1)
