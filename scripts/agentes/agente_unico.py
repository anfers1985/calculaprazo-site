# -*- coding: utf-8 -*-
# agente_unico.py — Agente unificado do CalculaPrazo
#
import json, re, requests, random, time, sys, os
from html.parser import HTMLParser
from agente_base import (chamar_llm, validar_qualidade, is_duplicata,
                         salvar_post, HOJE, CATEGORIAS_VALIDAS)

# ─────────────────────────────────────────────
# FONTES
# ─────────────────────────────────────────────
FONTES = [
    # MPT
    {"nome": "CNMP — Notícias",           "url": "https://www.cnmp.mp.br/portal/noticias?o=date&t[]=",                                                        "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "MPT-SC (PRT-12)",            "url": "https://www.prt12.mpt.mp.br/informe-se/noticias-do-mpt-sc",                                                 "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "MPT-RJ (PRT-1)",             "url": "https://www.prt1.mpt.mp.br/informe-se/noticias-do-mpt-rj",                                                  "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "MPT-SP (PRT-2)",             "url": "https://www.prt2.mpt.mp.br/informe-se/noticias-do-mpt-sp",                                                  "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "MPT-RS (PRT-4)",             "url": "https://www.prt4.mpt.mp.br/informe-se/noticias-do-mpt-rs",                                                  "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "MPT-MG (PRT-3)",             "url": "https://www.prt3.mpt.mp.br/comunicacao/noticias-do-mpt-mg",                                                 "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "MPT-BA (PRT-5)",             "url": "https://www.prt5.mpt.mp.br/informe-se/noticias-do-mpt-ba",                                                  "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    # MTE e Legislação
    {"nome": "MTE — Notícias",             "url": "https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo",                                           "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "Planalto — Resenha Diária",  "url": "http://www4.planalto.gov.br/legislacao/portal-legis/resenha-diaria/copy_of_resenha-diaria-ano",             "categoria": "legislacao-normas",    "tipo": "ANALISE_LEI"},
    {"nome": "Agência Gov — Economia",     "url": "https://agenciagov.ebc.com.br/noticias/economia",                                                           "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "Agência Gov — Previdência",  "url": "https://agenciagov.ebc.com.br/noticias/previdencia",                                                        "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Agência Gov — Trabalho",     "url": "https://agenciagov.ebc.com.br/noticias/trabalho-e-emprego",                                                 "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    # TRTs
    {"nome": "TRT-4 (RS)",                 "url": "https://www.trt4.jus.br/portais/trt4/modulos/noticias/todas/0",                                             "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-12 (SC)",                "url": "https://portal.trt12.jus.br/noticias",                                                                     "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-9 (PR)",                 "url": "https://www.trt9.jus.br/portal/noticias.xhtml",                                                             "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-2 (SP)",                 "url": "https://ww2.trt2.jus.br/noticias/noticias",                                                                 "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-15 (Campinas)",          "url": "https://trt15.jus.br/noticias/maisnoticias",                                                                "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-1 (RJ) — Últimas",      "url": "https://trt1.jus.br/web/guest/ultimas-noticias",                                                            "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-1 (RJ) — Destaque",     "url": "https://trt1.jus.br/web/guest/destaque-juridico",                                                           "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-5 (BA)",                 "url": "https://www.trt5.jus.br/noticias",                                                                          "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-3 (MG)",                 "url": "https://portal.trt3.jus.br/internet/conheca-o-trt/comunicacao/noticias-juridicas",                          "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-6 (PE)",                 "url": "https://www.trt6.jus.br/portal/noticias",                                                                   "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-10 (DF/TO)",             "url": "https://www.trt10.jus.br/ascom/?pagina=consulta_noticias_internet.php&chk_materia_juridica=S&idTRT10M=196", "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-11 (AM/RR)",             "url": "https://portal.trt11.jus.br/index.php/comunicacao/noticias-lista",                                          "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    # TST
    {"nome": "TST — Notícias",             "url": "https://www.tst.jus.br/web/guest/noticias",                                                                 "categoria": "jurisprudencia-tst",   "tipo": "JURISPRUDENCIA"},
    {"nome": "CSJT — Notícias TRTs",       "url": "https://www.csjt.jus.br/web/csjt/noticias-dos-trts",                                                       "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    # STF
    {"nome": "STF — Notícias",             "url": "https://noticias.stf.jus.br/",                                                                              "categoria": "jurisprudencia-tst",   "tipo": "JURISPRUDENCIA"},
    # Notícias Gerais
    {"nome": "Contabeis — Trabalhista",    "url": "https://www.contabeis.com.br/conteudo/trabalhista/",                                                        "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Contabeis — Previdência",    "url": "https://www.contabeis.com.br/conteudo/previdencia/",                                                        "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Contabeis — Economia",       "url": "https://www.contabeis.com.br/conteudo/economia/",                                                           "categoria": "geral",                "tipo": "INFORMATIVO"},
    {"nome": "Contabeis — Contábil",       "url": "https://www.contabeis.com.br/conteudo/contabil/",                                                           "categoria": "geral",                "tipo": "INFORMATIVO"},
    {"nome": "G1 — Trabalho",              "url": "https://g1.globo.com/trabalho-e-carreira/",                                                                 "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "Senado — Dir. Trabalhistas", "url": "https://www12.senado.leg.br/noticias/tags/Direitos%20Trabalhistas",                                         "categoria": "legislacao-normas",    "tipo": "ANALISE_LEI"},
    {"nome": "AMATRA XV — Notícias",       "url": "https://amatraxv.org.br/noticias/noticias-juridicas",                                                       "categoria": "jurisprudencia-trts",  "tipo": "JURISPRUDENCIA"},
    {"nome": "G1 — Ministério do Trabalho","url": "https://g1.globo.com/tudo-sobre/ministerio-do-trabalho/",                                                   "categoria": "noticias-mte-mpt",     "tipo": "INFORMATIVO"},
    {"nome": "Câmara — CLT",               "url": "https://www.camara.leg.br/noticias/ultimas/tags?tag=Consolida%C3%A7%C3%A3o%20das%20Leis%20do%20Trabalho%20(CLT)", "categoria": "legislacao-normas", "tipo": "ANALISE_LEI"},
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
}


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


# ─────────────────────────────────────────────
# PARSING JSON ROBUSTO
# CORREÇÃO CRÍTICA: modelos como llama-3.1-8b-instant frequentemente
# retornam texto antes/depois do JSON ou com markdown. O json.loads()
# simples falha nesses casos. Esta função extrai o JSON de qualquer formato.
# ─────────────────────────────────────────────
def parse_json_robusto(raw):
    """Extrai JSON válido de resposta de LLM independente do formato."""
    if not raw:
        return None
    # 1. Remove fences de markdown comuns
    raw = re.sub(r'^```json\s*', '', raw.strip())
    raw = re.sub(r'\s*```$', '', raw.strip())
    raw = re.sub(r'^```\s*', '', raw.strip())

    # 2. Tenta parse direto
    try:
        return json.loads(raw)
    except Exception:
        pass

    # 3. Extrai o bloco entre { e } mais externo
    try:
        inicio = raw.index('{')
        fim    = raw.rindex('}')
        candidato = raw[inicio:fim+1]
        return json.loads(candidato)
    except Exception:
        pass

    # 4. Último recurso: regex para extrair o objeto JSON
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass

    return None


# ─────────────────────────────────────────────
# BUSCA DE CONTEÚDO
# ─────────────────────────────────────────────
def buscar_conteudo(fonte):
    try:
        r = requests.get(fonte["url"], headers=HEADERS, timeout=30, verify=False)
        if r.ok:
            p = TextExtractor()
            p.feed(r.text)
            return p.get_text(7000), r.url
    except Exception as e:
        print(f"  Erro ao buscar {fonte['nome']}: {str(e)[:80]}")
    return "", fonte["url"]


# ─────────────────────────────────────────────
# AVALIAÇÃO DE RELEVÂNCIA
# ─────────────────────────────────────────────
def avaliar_relevancia(conteudo, fonte):
    if len(conteudo) < 200:
        return {"relevante": False}

    prompt = (
        f"Analise o conteúdo abaixo da fonte {fonte['nome']}.\n"
        f"Data de hoje: {HOJE.strftime('%d/%m/%Y')}\n\n"
        f"Conteúdo:\n{conteudo[:2000]}\n\n"
        "Existe alguma notícia ou decisão RECENTE (últimas 48 horas) relevante para o Direito do Trabalho ou RH?\n"
        "EXCLUIR: concursos, posses, eventos sociais, homenagens, agenda institucional.\n"
        "INCLUIR: decisões judiciais, acórdãos, portarias, normas, fiscalizações, mudanças de regra, autuações.\n\n"
        "Responda APENAS com um objeto JSON válido, sem texto antes ou depois:\n"
        '{"relevante": true, "tema": "Título curto do assunto", "tipo_conteudo": "JURISPRUDENCIA|INFORMATIVO|ANALISE_LEI"}'
    )
    try:
        raw = chamar_llm(prompt, max_tokens=300, temperature=0.1)
        dados = parse_json_robusto(raw)
        if dados:
            return dados
        print(f"  Erro parse avaliação: resposta não era JSON válido")
        return {"relevante": False}
    except Exception as e:
        print(f"  Erro avaliação: {str(e)[:80]}")
        return {"relevante": False}


# ─────────────────────────────────────────────
# GERAÇÃO DE ARTIGO
# ─────────────────────────────────────────────
def gerar_artigo(conteudo, fonte, tema, tipo_conteudo):

    # Orientação por tipo — SEM ditar subtítulos fixos.
    # O modelo cria os h2 a partir do conteúdo real, como um redator faria.
    orientacao_tipo = {
        "JURISPRUDENCIA": (
            "Você está redigindo um boletim de jurisprudência trabalhista.\n"
            "Cubra obrigatoriamente: o caso concreto (partes, fato, setor), "
            "os fundamentos legais e súmulas aplicados, o que foi decidido e por quê, "
            "a tese jurídica que se extrai e as consequências práticas para empresas e trabalhadores.\n"
            "Inclua também orientações objetivas para RH e jurídico."
        ),
        "INFORMATIVO": (
            "Você está redigindo um boletim informativo regulatório.\n"
            "Cubra obrigatoriamente: o fato central (órgão, data, número da norma se disponível), "
            "o contexto que levou a essa medida, quem é afetado e como, "
            "as obrigações práticas geradas e os riscos de não conformidade."
        ),
        "ANALISE_LEI": (
            "Você está redigindo uma análise jurídico-legislativa.\n"
            "Cubra obrigatoriamente: o que a norma ou proposta estabelece, "
            "o contexto legislativo, as mudanças em relação ao regime anterior, "
            "vigência e prazos, impactos para empregadores e trabalhadores, "
            "e medidas imediatas de adequação."
        ),
    }.get(tipo_conteudo,
        "Você está redigindo um artigo técnico-jurídico trabalhista. "
        "Cubra todos os aspectos relevantes do tema: contexto, normas aplicáveis, "
        "impactos práticos e orientações para empresas."
    )

    prompt = (
        "Você é redator jurídico sênior do site CalculaPrazo.com.br, especializado em Direito do Trabalho.\n"
        "Seu público são advogados trabalhistas, gestores de RH, analistas de DP e empresários.\n\n"

        "═══════════════════════════════════════════\n"
        f"TEMA DO ARTIGO: {tema}\n"
        f"FONTE: {fonte['nome']} — {fonte['url']}\n"
        f"DATA: {HOJE.strftime('%d/%m/%Y')}\n"
        f"TIPO: {tipo_conteudo}\n"
        "═══════════════════════════════════════════\n\n"

        "CONTEÚDO ORIGINAL DA FONTE:\n"
        "───────────────────────────\n"
        f"{conteudo[:6000]}\n"
        "───────────────────────────\n\n"

        f"{orientacao_tipo}\n\n"

        "COMO ESCREVER — LEIA COM ATENÇÃO:\n\n"

        "1. FIDELIDADE AOS FATOS\n"
        "   Preserve todos os dados da fonte: números, datas, nomes de tribunais, "
        "   números de processos, artigos de lei, valores, percentuais. "
        "   Não invente nada que não esteja na fonte.\n\n"

        "2. REESCRITA GENUÍNA (não é cópia, não é resumo)\n"
        "   Reescreva cada parágrafo com suas próprias palavras e estrutura de frase diferente. "
        "   O texto final deve transmitir as mesmas informações da fonte, mas em prosa original. "
        "   Acrescente análise: o que isso significa na prática? Qual o risco concreto para a empresa?\n\n"

        "3. SUBTÍTULOS LIVRES E NATURAIS\n"
        "   Crie os subtítulos <h2> a partir do conteúdo real — não use fórmulas genéricas "
        "   como 'O que aconteceu', 'Contexto', 'Conclusão'. "
        "   Bons exemplos baseados no conteúdo: "
        "   'FGTS Digital passa a ser obrigatório em reclamatórias', "
        "   'Gestante em contrato temporário mantém estabilidade, decide TST', "
        "   'Prazo de 30 dias para adequação dos sistemas'. "
        "   Cada subtítulo deve ser específico e informativo por si só.\n\n"

        "4. EXTENSÃO E ESTRUTURA\n"
        "   Mínimo de 800 palavras de texto corrido (não contam as tags HTML). "
        "   Parágrafos com no mínimo 3 frases cada. "
        "   Use <h2> para seções principais, <h3> para subseções quando necessário, "
        "   <ul><li> para listas de itens, <strong> para termos técnicos e dados importantes. "
        "   Apenas HTML puro — nunca markdown (**, ##, - ).\n\n"

        "5. NÃO inclua bloco de 'Fonte:' no campo content — é inserido automaticamente.\n\n"

        "Responda APENAS com um objeto JSON válido, sem nenhum texto antes ou depois:\n"
        '{"title": "Título direto e específico, máx 80 chars", '
        '"excerpt": "1-2 frases com o fato principal, máx 160 chars", '
        '"tags": ["Tag1", "Tag2", "Tag3", "Tag4"], '
        '"image_query": "3-5 palavras em inglês para Unsplash", '
        '"content": "<h2>Subtítulo específico</h2><p>...</p>..."}'
    )
    try:
        raw = chamar_llm(prompt, max_tokens=6000, temperature=0.2)
        dados = parse_json_robusto(raw)
        if not dados:
            print(f"  ERRO parse artigo: JSON não encontrado na resposta")
            print(f"  Resposta recebida (primeiros 200 chars): {raw[:200] if raw else 'VAZIA'}")
            return None
        dados.setdefault("title",       f"Atualização Trabalhista — {HOJE.strftime('%d/%m/%Y')}")
        dados.setdefault("excerpt",     tema[:120])
        dados.setdefault("content",     f"<h2>Análise</h2><p>{tema}</p>")
        dados.setdefault("tags",        ["Direito Trabalhista"])
        dados.setdefault("image_query", "law justice court gavel")
        dados["source_url"] = fonte["url"]
        return dados
    except Exception as e:
        print(f"  ERRO gerar artigo: {str(e)[:120]}")
        return None


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
def main():
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    print(f"\nAgente CalculaPrazo — {HOJE.strftime('%d/%m/%Y')}")
    print(f"Fontes: {len(FONTES)}")

    # 5 posts por execução × 2 execuções/dia = 10 posts/dia
    meta = 5
    print(f"Meta desta execução: {meta} posts")

    fontes_shuffled = list(FONTES)
    random.shuffle(fontes_shuffled)

    publicados  = 0
    temas_vistos = set()

    for fonte in fontes_shuffled:
        if publicados >= meta:
            break

        print(f"\nVerificando: {fonte['nome']}")
        conteudo, _ = buscar_conteudo(fonte)
        if not conteudo:
            continue

        # Avaliação
        av = avaliar_relevancia(conteudo, fonte)
        if not av.get("relevante"):
            print("  Sem novidades relevantes.")
            continue

        tema = av.get("tema", "").strip()
        if not tema:
            print("  Avaliação sem tema definido, pulando.")
            continue

        # Deduplicação
        tema_key = tema.lower()[:60]
        if tema_key in temas_vistos:
            print(f"  Tema já coberto nesta execução: {tema}")
            continue
        if is_duplicata(tema):
            print(f"  Já publicado: {tema}")
            continue

        # Geração
        print(f"  Gerando post sobre: {tema}")
        dados = gerar_artigo(conteudo, fonte, tema, av.get("tipo_conteudo", fonte["tipo"]))
        if not dados:
            print("  Geração falhou, pulando.")
            continue

        # Validação de qualidade
        ok, motivo = validar_qualidade(dados, fonte["categoria"])
        if not ok:
            print(f"  Qualidade insuficiente: {motivo}")
            # Tenta salvar mesmo assim se tiver conteúdo mínimo
            words = len(re.sub(r'<[^>]+>', ' ', dados.get("content","")).split())
            if words < 200:
                continue
            # Completa campos faltantes
            if not dados.get("title") or len(dados["title"]) < 10:
                dados["title"] = f"Atualização: {tema[:70]}"
            if not dados.get("excerpt") or len(dados["excerpt"]) < 30:
                dados["excerpt"] = tema[:150]
            if not dados.get("tags"):
                dados["tags"] = ["Direito Trabalhista", "RH"]
            # Revalida
            ok2, motivo2 = validar_qualidade(dados, fonte["categoria"])
            if not ok2:
                print(f"  Reprovado mesmo após correção: {motivo2}")
                continue

        if is_duplicata(dados["title"]):
            print(f"  Título duplicado: {dados['title']}")
            continue

        # Salvar
        if salvar_post(dados, fonte["categoria"], fonte["nome"]):
            publicados += 1
            temas_vistos.add(tema_key)
            print(f"  ✅ Post {publicados}/{meta} publicado: {dados['title'][:60]}")
            time.sleep(3)  # pausa curta entre posts

    print(f"\nFim da execução. Total publicado: {publicados}")
    return publicados


if __name__ == "__main__":
    resultado = main()
    sys.exit(0 if resultado >= 0 else 1)
