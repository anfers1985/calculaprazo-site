# -*- coding: utf-8 -*-
# agente_unico.py — Agente unificado do CalculaPrazo (Versão Corrigida: Jornalismo e Originalidade)
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

def parse_json_robusto(raw):
    if not raw: return None
    def _valida(obj): return obj if isinstance(obj, dict) else None
    limpo = raw.strip()
    limpo = re.sub(r'^```json\s*', '', limpo)
    limpo = re.sub(r'\s*```$',     '', limpo)
    limpo = re.sub(r'^```\s*',     '', limpo)
    limpo = limpo.strip()
    try: return _valida(json.loads(limpo))
    except: pass
    try:
        inicio = limpo.index('{')
        fim = limpo.rindex('}')
        return _valida(json.loads(limpo[inicio:fim+1]))
    except: pass
    return None

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

def avaliar_relevancia(conteudo, fonte):
    if len(conteudo) < 200: return {"relevante": False}
    prompt = (
        f"Analise o conteúdo abaixo da fonte {fonte['nome']}.\n"
        f"Data de hoje: {HOJE.strftime('%d/%m/%Y')}\n\n"
        f"Conteúdo:\n{conteudo[:2000]}\n\n"
        "Existe alguma notícia ou decisão RECENTE relevante para o Direito do Trabalho ou RH?\n"
        "Responda APENAS com um objeto JSON válido:\n"
        '{"relevante": true, "tema": "Título curto", "tipo_conteudo": "JURISPRUDENCIA|INFORMATIVO|ANALISE_LEI"}'
    )
    try:
        raw = chamar_llm(prompt, max_tokens=300, temperature=0.1)
        dados = parse_json_robusto(raw)
        return dados if dados else {"relevante": False}
    except: return {"relevante": False}

def gerar_artigo(conteudo, fonte, tema, tipo_conteudo):
    orientacao_tipo = {
        "JURISPRUDENCIA": "Foque na decisão judicial, fundamentos legais e impacto prático para empresas.",
        "INFORMATIVO": "Foque no fato novo, prazos, obrigações e quem é afetado.",
        "ANALISE_LEI": "Foque nas mudanças legislativas, vigência e o que muda na prática.",
    }.get(tipo_conteudo, "Foque nos aspectos técnicos e práticos do tema.")

    prompt = (
        "Você é um Jornalista Jurídico Sênior e Redator Chefe do site CalculaPrazo.com.br.\n"
        "Seu objetivo é transformar uma notícia bruta em um ARTIGO JORNALÍSTICO ORIGINAL, INFORMATIVO e PROFISSIONAL.\n\n"
        
        "REGRAS CRÍTICAS PARA EVITAR PLÁGIO E GARANTIR QUALIDADE:\n"
        "1. TOM JORNALÍSTICO: Use uma linguagem clara, direta e informativa. Evite 'juridiquês' excessivo, mas mantenha a precisão técnica.\n"
        "2. REESCRITA TOTAL: É expressamente proibido copiar frases da fonte. Você deve ler a informação, absorver o fato e escrever o texto DO ZERO com suas próprias palavras.\n"
        "3. ESTRUTURA DE NOTÍCIA: Comece com um 'Lead' (quem, o quê, onde, quando, por quê). Desenvolva o contexto e termine com o impacto prático.\n"
        "4. ANÁLISE PRÓPRIA: Não apenas relate o fato, mas explique o que ele significa para o advogado, o RH ou o empresário que lê o site.\n"
        "5. SUBTÍTULOS CRIATIVOS: Crie subtítulos (<h2>) que sejam chamadas jornalísticas reais, não use 'Introdução' ou 'Conclusão'.\n\n"

        f"TEMA: {tema}\n"
        f"FONTE ORIGINAL (apenas para extrair os fatos): {conteudo[:3500]}\n\n"
        
        f"{orientacao_tipo}\n\n"

        "FORMATO DE SAÍDA (JSON APENAS):\n"
        "{\n"
        '  "title": "Título jornalístico impactante e original (máx 75 chars)",\n'
        '  "excerpt": "Resumo profissional de 2 frases para redes sociais e SEO",\n'
        '  "tags": ["Tag1", "Tag2", "Tag3"],\n'
        '  "image_query": "3 palavras em inglês para busca de imagem",\n'
        '  "content": "HTML PURO (<h2>, <p>, <ul>). Mínimo 500 palavras. Texto rico, fluido e totalmente original."\n'
        "}"
    )
    try:
        raw = chamar_llm(prompt, max_tokens=6000, temperature=0.3)
        dados = parse_json_robusto(raw)
        if dados:
            dados["source_url"] = fonte["url"]
        return dados
    except Exception as e:
        print(f"  ERRO gerar artigo: {str(e)[:120]}")
        return None

def main():
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    print(f"\nAgente CalculaPrazo — {HOJE.strftime('%d/%m/%Y')}")
    meta = 5
    fontes_shuffled = list(FONTES)
    random.shuffle(fontes_shuffled)
    publicados = 0
    temas_vistos = set()

    for fonte in fontes_shuffled:
        if publicados >= meta: break
        print(f"\nVerificando: {fonte['nome']}")
        conteudo, _ = buscar_conteudo(fonte)
        if not conteudo: continue
        av = avaliar_relevancia(conteudo, fonte)
        if not av.get("relevante"): continue
        tema = av.get("tema", "").strip()
        if not tema or tema.lower()[:60] in temas_vistos or is_duplicata(tema): continue
        
        print(f"  Gerando post original sobre: {tema}")
        dados = gerar_artigo(conteudo, fonte, tema, av.get("tipo_conteudo", fonte["tipo"]))
        if not dados: continue
        
        ok, motivo = validar_qualidade(dados, fonte["categoria"])
        if ok and salvar_post(dados, fonte["categoria"], fonte["nome"]):
            publicados += 1
            temas_vistos.add(tema.lower()[:60])
            print(f"  ✅ Post {publicados}/{meta} publicado: {dados['title'][:60]}")
            time.sleep(2)

    print(f"\nFim da execução. Total: {publicados}")
    return publicados

if __name__ == "__main__":
    main()
