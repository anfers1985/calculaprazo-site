# -*- coding: utf-8 -*-
# agente_unico.py — Agente CalculaPrazo
#
import json, re, requests, random, time, sys, os
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
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
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

# Palavras que indicam post de baixo valor editorial — NUNCA publicar
TEMAS_EXCLUIR = [
    "plenária", "posse", "homenagem", "evento", "seminário", "congresso",
    "palestra", "eleição", "capacitação", "curso", "treinamento",
    "agenda", "reunião de", "análise estratégica", "planejamento estratégico",
    "inauguração", "aniversário", "visita", "entrega de",
]


# ─────────────────────────────────────────────
# EXTRATOR HTML
# ─────────────────────────────────────────────
class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.texts = []
        self.links = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script","style","nav","header","footer","aside","noscript","form","button","svg","iframe"):
            self._skip = True
        if tag == "a":
            for k, v in attrs:
                if k == "href" and v and len(v) > 10:
                    self.links.append(v)

    def handle_endtag(self, tag):
        if tag in ("script","style","nav","header","footer","aside","noscript","form","button","svg","iframe"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            t = data.strip()
            if len(t) > 30:
                self.texts.append(t)

    def get_text(self, max_chars=8000):
        return " ".join(self.texts)[:max_chars]


# ─────────────────────────────────────────────
# BUSCA — LISTAGEM + ARTIGO INDIVIDUAL
# ─────────────────────────────────────────────
def _fetch(url, timeout=25):
    """GET com retry de User-Agent. Retorna (html, url_final)."""
    for ua in [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    ]:
        try:
            h = dict(HEADERS)
            h["User-Agent"] = ua
            r = requests.get(url, headers=h, timeout=timeout, verify=False)
            if r.ok and len(r.text) > 500:
                return r.text, r.url
        except Exception:
            pass
    return "", url


def _extrair_links_artigo(html, base_url):
    """Extrai URLs de artigos individuais de uma página de listagem."""
    p = TextExtractor()
    p.feed(html)
    base = urlparse(base_url)
    candidatos = []
    for href in p.links:
        full = urljoin(base_url, href)
        fu = urlparse(full)
        if fu.netloc != base.netloc:
            continue
        path = fu.path.lower()
        if any(x in path for x in ['/tags/', '/busca', '/search', '/categoria',
                                     '/page/', '#', '/login', '/contato', '/sobre',
                                     '/rss', '.pdf', '.zip']):
            continue
        if any(x in path for x in ['/noticias/', '/noticia/', '/materia/', '/artigo/',
                                     '/detalhe/', '/view/', '/post/', '/destaque/', '/news/']):
            candidatos.append(full)
        elif path.count('/') >= 3 and len(path) > 35:
            candidatos.append(full)
    seen, uniq = set(), []
    for c in candidatos:
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    return uniq[:15]


def buscar_conteudo(fonte):
    """
    Busca em dois passos:
    1. Carrega listagem e extrai links de artigos
    2. Busca artigo individual mais rico
    Retorna (texto_completo, url_artigo)
    """
    html_lista, url_lista = _fetch(fonte["url"])
    if not html_lista:
        return "", fonte["url"]

    p = TextExtractor()
    p.feed(html_lista)
    texto_lista = p.get_text(4000)

    # Tenta enriquecer buscando artigo individual
    links_artigos = _extrair_links_artigo(html_lista, url_lista)

    if not links_artigos:
        return texto_lista, url_lista

    melhor_texto = texto_lista
    melhor_url   = url_lista
    melhor_tam   = len(texto_lista)

    for url_art in links_artigos[:6]:
        if url_art == url_lista:
            continue
        html_art, url_final = _fetch(url_art, timeout=20)
        if not html_art:
            continue
        p2 = TextExtractor()
        p2.feed(html_art)
        texto_art = p2.get_text(8000)
        if len(texto_art) > melhor_tam:
            melhor_texto = texto_art
            melhor_url   = url_final
            melhor_tam   = len(texto_art)
        if melhor_tam > 4000:
            break  # conteúdo suficiente

    return melhor_texto, melhor_url


# ─────────────────────────────────────────────
# PARSE JSON ROBUSTO
# ─────────────────────────────────────────────
def parse_json_robusto(raw):
    """Extrai dict JSON de resposta de LLM em qualquer formato."""
    if not raw:
        return None

    def _valida(obj):
        return obj if isinstance(obj, dict) else None

    limpo = raw.strip()
    for pat in [r'^```json\s*', r'\s*```$', r'^```\s*']:
        limpo = re.sub(pat, '', limpo).strip()

    try:
        return _valida(json.loads(limpo))
    except Exception:
        pass
    try:
        i = limpo.index('{')
        j = limpo.rindex('}')
        return _valida(json.loads(limpo[i:j+1]))
    except Exception:
        pass
    m = re.search(r'\{.*\}', limpo, re.DOTALL)
    if m:
        try:
            return _valida(json.loads(m.group(0)))
        except Exception:
            pass
    return None


# ─────────────────────────────────────────────
# AVALIAÇÃO — filtro rigoroso
# ─────────────────────────────────────────────
def avaliar_relevancia(conteudo, fonte):
    if len(conteudo) < 200:
        return {"relevante": False}

    prompt = (
        f"Fonte: {fonte['nome']} | Data: {HOJE.strftime('%d/%m/%Y')}\n\n"
        f"Conteúdo coletado:\n{conteudo[:2500]}\n\n"
        "Avalie se há notícia RECENTE (últimas 48h) de alto valor informativo "
        "para advogados trabalhistas, gestores de RH e empresários.\n\n"
        "ACEITAR: decisões judiciais com tese definida, portarias publicadas, "
        "fiscalizações com resultado, acordos judiciais com impacto coletivo, "
        "mudanças legislativas em tramitação avançada.\n\n"
        "REJEITAR OBRIGATORIAMENTE: eventos, posses, homenagens, concursos, "
        "capacitações, planejamento estratégico de tribunais, agendas, "
        "reuniões administrativas, notícias sem fato jurídico concreto.\n\n"
        "Se aceitar, o tema DEVE conter entidade + fato específico.\n"
        "CERTO: 'TST define adicional de periculosidade para motociclistas sem nova regulamentação'\n"
        "ERRADO: 'Estabilidade provisória' ou 'Reunião estratégica do TRT'\n\n"
        "Responda APENAS JSON:\n"
        '{"relevante": true/false, '
        '"tema": "Entidade + fato específico em uma frase", '
        '"tipo_conteudo": "JURISPRUDENCIA|INFORMATIVO|ANALISE_LEI", '
        '"motivo_rejeicao": "só se relevante=false"}'
    )
    try:
        raw = chamar_llm(prompt, max_tokens=300, temperature=0.1)
        dados = parse_json_robusto(raw)
        if not dados:
            return {"relevante": False}
        tema = dados.get("tema", "").lower()
        if any(x in tema for x in TEMAS_EXCLUIR):
            return {"relevante": False, "motivo_rejeicao": f"tema excluído: {tema[:50]}"}
        return dados
    except Exception as e:
        print(f"  Erro avaliação: {str(e)[:80]}")
        return {"relevante": False}


# ─────────────────────────────────────────────
# GERAÇÃO — fidelidade total ao conteúdo fonte
# ─────────────────────────────────────────────
def gerar_artigo(conteudo, fonte, tema, tipo_conteudo, url_artigo):
    instrucao_tipo = {
        "JURISPRUDENCIA": (
            "É um boletim de jurisprudência. Desenvolva:\n"
            "- O caso: partes, setor, fato gerador do conflito\n"
            "- O julgamento: instância, órgão fracionário, relator (se disponível na fonte)\n"
            "- A fundamentação: artigos de lei, súmulas ou OJs aplicados\n"
            "- A tese fixada: em linguagem clara, o que vale como regra\n"
            "- O impacto prático para empresas e trabalhadores\n"
            "- Orientações objetivas para RH e jurídico"
        ),
        "INFORMATIVO": (
            "É um boletim de notícia regulatória. Desenvolva:\n"
            "- O fato: o que o órgão fez ou publicou, com data e número se disponíveis\n"
            "- O contexto: por que isso está acontecendo agora\n"
            "- Quem é afetado: empresas, setores, categorias de trabalhadores\n"
            "- As obrigações: o que cada afetado precisa fazer\n"
            "- Os riscos: consequências do descumprimento"
        ),
        "ANALISE_LEI": (
            "É uma análise legislativa. Desenvolva:\n"
            "- O que a norma ou proposta estabelece (se PL, use linguagem condicional)\n"
            "- O contexto: por que surgiu, qual problema resolve\n"
            "- As mudanças em relação ao regime atual\n"
            "- A vigência (se em vigor) ou estágio de tramitação (se PL)\n"
            "- O impacto para empregadores e trabalhadores"
        ),
    }.get(tipo_conteudo, "Desenvolva: contexto, fatos centrais, base legal, impactos e orientações.")

    prompt = (
        "Você é redator jurídico sênior do CalculaPrazo.com.br.\n"
        "Público: advogados trabalhistas, gestores de RH, analistas de DP, empresários.\n\n"

        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"TEMA: {tema}\n"
        f"FONTE: {fonte['nome']}\n"
        f"URL ORIGINAL: {url_artigo}\n"
        f"DATA: {HOJE.strftime('%d/%m/%Y')} | TIPO: {tipo_conteudo}\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"

        "CONTEÚDO ORIGINAL (base exclusiva para o artigo):\n"
        "┌─────────────────────────────\n"
        f"{conteudo[:4000]}\n"
        "└─────────────────────────────\n\n"

        f"{instrucao_tipo}\n\n"

        "REGRAS ABSOLUTAS — leia antes de escrever:\n\n"

        "① NUNCA INVENTE\n"
        "   Só escreva o que está explicitamente no conteúdo acima.\n"
        "   Se um número, nome, data ou artigo de lei não aparece na fonte: NÃO mencione.\n"
        "   Quando a fonte for rasa, escreva com o que há — não preencha lacunas com suposições.\n\n"

        "② REESCREVA, NÃO COPIE\n"
        "   Reformule cada informação com suas próprias palavras e estrutura de frase.\n"
        "   O conteúdo deve ser idêntico em fatos mas completamente diferente em forma.\n\n"

        "③ TÍTULO OBRIGATORIAMENTE ESPECÍFICO\n"
        "   Deve conter a entidade (TST, TRT, MPT, MTE, STF…) e o fato concreto.\n"
        "   ERRADO: 'Estabilidade provisória' / 'Bloqueio de bens' / 'Penhora de salário'\n"
        "   CERTO: 'TST reafirma estabilidade de gestante em contrato temporário'\n"
        "          'MPT-MG obtém bloqueio de bens em operação contra trabalho escravo'\n"
        "          'TRT-15 mantém penhora de 30% do salário em dívida trabalhista'\n\n"

        "④ SUBTÍTULOS LIVRES E INFORMATIVOS\n"
        "   <h2> que descrevam o conteúdo real da seção.\n"
        "   Evite: 'Contexto', 'Introdução', 'Conclusão', 'O que aconteceu', 'Impactos'.\n"
        "   Use subtítulos específicos como se fossem manchetes de seção.\n\n"

        "⑤ EXTENSÃO E FORMATO\n"
        "   Mínimo 600 palavras. HTML puro: <h2>, <h3>, <p>, <ul>, <li>, <strong>.\n"
        "   Parágrafos com pelo menos 3 frases. Nunca markdown (**, ##, -).\n"
        "   NÃO inclua nota de fonte no campo content.\n\n"

        "Responda APENAS com JSON válido, sem texto antes ou depois:\n"
        '{"title": "Entidade + fato específico, máx 85 chars", '
        '"excerpt": "1-2 frases com os fatos centrais, máx 160 chars", '
        '"tags": ["Tag1", "Tag2", "Tag3", "Tag4"], '
        '"image_query": "3-5 palavras em inglês para Unsplash", '
        '"content": "<h2>...</h2><p>...</p>..."}'
    )
    try:
        raw = chamar_llm(prompt, max_tokens=6000, temperature=0.15)
        dados = parse_json_robusto(raw)
        if not dados:
            print(f"  ERRO parse. Resposta (200 chars): {raw[:200] if raw else 'VAZIA'}")
            return None
        dados.setdefault("title",       f"{fonte['nome']}: {tema[:55]}")
        dados.setdefault("excerpt",     tema[:150])
        dados.setdefault("content",     f"<h2>{tema}</h2><p>Conteúdo em elaboração.</p>")
        dados.setdefault("tags",        ["Direito Trabalhista"])
        dados.setdefault("image_query", "law justice court")
        dados["source_url"] = url_artigo
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
    print(f"Fontes: {len(FONTES)} | Meta: 5 posts")

    fontes = list(FONTES)
    random.shuffle(fontes)

    publicados   = 0
    temas_vistos = set()

    for fonte in fontes:
        if publicados >= 5:
            break

        print(f"\nVerificando: {fonte['nome']}")

        conteudo, url_artigo = buscar_conteudo(fonte)
        if not conteudo or len(conteudo) < 200:
            print("  Sem conteúdo acessível.")
            continue

        print(f"  Conteúdo: {len(conteudo)} chars | {url_artigo[:70]}")

        av = avaliar_relevancia(conteudo, fonte)
        if not av.get("relevante"):
            motivo = av.get("motivo_rejeicao", "sem fato relevante")
            print(f"  Descartado: {motivo}")
            continue

        tema          = av.get("tema", "").strip()
        tipo_conteudo = av.get("tipo_conteudo", fonte["tipo"])

        if not tema:
            print("  Sem tema definido, pulando.")
            continue

        tema_key = tema.lower()[:60]
        if tema_key in temas_vistos:
            print(f"  Tema já coberto.")
            continue
        if is_duplicata(tema):
            print(f"  Já publicado: {tema[:60]}")
            continue

        print(f"  Gerando: {tema[:70]}")
        dados = gerar_artigo(conteudo, fonte, tema, tipo_conteudo, url_artigo)
        if not dados:
            print("  Geração falhou.")
            continue

        ok, motivo = validar_qualidade(dados, fonte["categoria"])
        if not ok:
            print(f"  Reprovado: {motivo}")
            if not dados.get("title") or len(dados["title"]) < 10:
                dados["title"] = f"{fonte['nome']}: {tema[:60]}"
            if not dados.get("excerpt") or len(dados["excerpt"]) < 30:
                dados["excerpt"] = tema[:150]
            if not dados.get("tags"):
                dados["tags"] = ["Direito Trabalhista", "RH"]
            ok2, motivo2 = validar_qualidade(dados, fonte["categoria"])
            if not ok2:
                print(f"  Reprovado definitivo: {motivo2}")
                continue

        if is_duplicata(dados["title"]):
            print(f"  Título duplicado.")
            continue

        if salvar_post(dados, fonte["categoria"], fonte["nome"]):
            publicados += 1
            temas_vistos.add(tema_key)
            print(f"  ✅ Post {publicados}/5: {dados['title'][:65]}")
            time.sleep(3)

    print(f"\nFim. Total publicado: {publicados}/5")
    return publicados


if __name__ == "__main__":
    main()
