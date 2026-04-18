# -*- coding: utf-8 -*-
# agente_unico.py — Agente unificado do CalculaPrazo
#
import json, re, requests, random, time, sys, os
from html.parser import HTMLParser
from agente_base import (chamar_llm, validar_qualidade, is_duplicata,
                         salvar_post, HOJE, CATEGORIAS_VALIDAS)

# ─────────────────────────────────────────────
# FONTES — Consolidadas conforme solicitação
# ─────────────────────────────────────────────
FONTES = [
    # MPT
    {"nome": "CNMP — Notícias", "url": "https://www.cnmp.mp.br/portal/noticias?o=date&t[]=", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    {"nome": "MPT-SC (PRT-12)", "url": "https://www.prt12.mpt.mp.br/informe-se/noticias-do-mpt-sc", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    {"nome": "MPT-RJ (PRT-1)", "url": "https://www.prt1.mpt.mp.br/informe-se/noticias-do-mpt-rj", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    {"nome": "MPT-SP (PRT-2)", "url": "https://www.prt2.mpt.mp.br/informe-se/noticias-do-mpt-sp", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    {"nome": "MPT-RS (PRT-4)", "url": "https://www.prt4.mpt.mp.br/informe-se/noticias-do-mpt-rs", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    {"nome": "MPT-MG (PRT-3)", "url": "https://www.prt3.mpt.mp.br/comunicacao/noticias-do-mpt-mg", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    {"nome": "MPT-BA (PRT-5)", "url": "https://www.prt5.mpt.mp.br/informe-se/noticias-do-mpt-ba", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    
    # MTE e Legislação
    {"nome": "MTE — Notícias", "url": "https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    {"nome": "Planalto — Resenha Diária", "url": "http://www4.planalto.gov.br/legislacao/portal-legis/resenha-diaria/copy_of_resenha-diaria-ano", "categoria": "legislacao-normas", "tipo": "ANALISE_LEI"},
    {"nome": "Agência Gov — Economia", "url": "https://agenciagov.ebc.com.br/noticias/economia", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    {"nome": "Agência Gov — Previdência", "url": "https://agenciagov.ebc.com.br/noticias/previdencia", "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Agência Gov — Trabalho", "url": "https://agenciagov.ebc.com.br/noticias/trabalho-e-emprego", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    
    # TRTs
    {"nome": "TRT-4 (RS)", "url": "https://www.trt4.jus.br/portais/trt4/modulos/noticias/todas/0", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-12 (SC)", "url": "https://portal.trt12.jus.br/noticias", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-9 (PR)", "url": "https://www.trt9.jus.br/portal/noticias.xhtml", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-2 (SP)", "url": "https://ww2.trt2.jus.br/noticias/noticias", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-15 (Campinas)", "url": "https://trt15.jus.br/noticias/maisnoticias", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-1 (RJ) — Últimas", "url": "https://trt1.jus.br/web/guest/ultimas-noticias", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-1 (RJ) — Destaque", "url": "https://trt1.jus.br/web/guest/destaque-juridico", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-5 (BA)", "url": "https://www.trt5.jus.br/noticias", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-3 (MG)", "url": "https://portal.trt3.jus.br/internet/conheca-o-trt/comunicacao/noticias-juridicas", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-6 (PE)", "url": "https://www.trt6.jus.br/portal/noticias", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-10 (DF/TO)", "url": "https://www.trt10.jus.br/ascom/?pagina=consulta_noticias_internet.php&chk_materia_juridica=S&idTRT10M=196", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "TRT-11 (AM/RR)", "url": "https://portal.trt11.jus.br/index.php/comunicacao/noticias-lista", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    
    # TST
    {"nome": "TST — Notícias", "url": "https://www.tst.jus.br/web/guest/noticias", "categoria": "jurisprudencia-tst", "tipo": "JURISPRUDENCIA"},
    {"nome": "CSJT — Notícias TRTs", "url": "https://www.csjt.jus.br/web/csjt/noticias-dos-trts", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    
    # STF
    {"nome": "STF — Notícias", "url": "https://noticias.stf.jus.br/", "categoria": "jurisprudencia-tst", "tipo": "JURISPRUDENCIA"},
    
    # Notícias Gerais
    {"nome": "Contabeis — Trabalhista", "url": "https://www.contabeis.com.br/conteudo/trabalhista/", "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Contabeis — Previdência", "url": "https://www.contabeis.com.br/conteudo/previdencia/", "categoria": "orientacoes-praticas", "tipo": "INFORMATIVO"},
    {"nome": "Contabeis — Economia", "url": "https://www.contabeis.com.br/conteudo/economia/", "categoria": "geral", "tipo": "INFORMATIVO"},
    {"nome": "Contabeis — Contábil", "url": "https://www.contabeis.com.br/conteudo/contabil/", "categoria": "geral", "tipo": "INFORMATIVO"},
    {"nome": "G1 — Trabalho", "url": "https://g1.globo.com/trabalho-e-carreira/", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    {"nome": "Senado — Direitos Trabalhistas", "url": "https://www12.senado.leg.br/noticias/tags/Direitos%20Trabalhistas", "categoria": "legislacao-normas", "tipo": "ANALISE_LEI"},
    {"nome": "AMATRA XV — Notícias", "url": "https://amatraxv.org.br/noticias/noticias-juridicas", "categoria": "jurisprudencia-trts", "tipo": "JURISPRUDENCIA"},
    {"nome": "G1 — Ministério do Trabalho", "url": "https://g1.globo.com/tudo-sobre/ministerio-do-trabalho/", "categoria": "noticias-mte-mpt", "tipo": "INFORMATIVO"},
    {"nome": "Câmara — CLT", "url": "https://www.camara.leg.br/noticias/ultimas/tags?tag=Consolida%C3%A7%C3%A3o%20das%20Leis%20do%20Trabalho%20(CLT)", "categoria": "legislacao-normas", "tipo": "ANALISE_LEI"},
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
}

PADRAO_QUALIDADE = """
PADRAO DE QUALIDADE DO CALCULAPRAZO:
1. PROFISSIONAL E PRAGMATICO: Linguagem técnica, mas acessível a profissionais de RH e Direito.
2. SEM LADO: Relato imparcial dos fatos e decisões.
3. CONTEUDO INFORMATIVO: Muito próximo do original, mas reescrito para evitar plágio.
4. CITACAO DA FONTE: Indicar sempre a fonte no formato: "Fonte: [Nome do Órgão] — [Título da Notícia] — acesso em [Data]."
5. ESTRUTURA: Mínimo 500 palavras, uso de <h2>, <ul>, <li> e <strong>.
"""

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
    try:
        r = requests.get(fonte["url"], headers=HEADERS, timeout=30, verify=False)
        if r.ok:
            p = TextExtractor()
            p.feed(r.text)
            return p.get_text(7000), r.url
    except Exception as e:
        print(f"  Erro ao buscar {fonte['nome']}: {str(e)}")
    return "", fonte["url"]

def avaliar_relevancia(conteudo, fonte):
    if len(conteudo) < 200:
        return {"relevante": False}
    
    prompt = (
        f"Analise o conteúdo abaixo da fonte {fonte['nome']}.\n"
        f"Data de hoje: {HOJE.strftime('%d/%m/%Y')}\n\n"
        f"Conteúdo:\n{conteudo[:2000]}\n\n"
        "Existe alguma notícia ou decisão RECENTE (últimos 2-3 dias) relevante para o Direito do Trabalho ou RH?\n"
        "Responda APENAS JSON:\n"
        '{"relevante": true/false, "tema": "Título curto do assunto", "tipo_conteudo": "JURISPRUDENCIA|INFORMATIVO|ANALISE_LEI"}'
    )
    try:
        raw = chamar_llm(prompt, max_tokens=300, temperature=0.1)
        raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
        return json.loads(raw)
    except:
        return {"relevante": False}

def gerar_artigo(conteudo, fonte, tema, tipo_conteudo):
    prompt = (
        f"{PADRAO_QUALIDADE}\n\n"
        f"TAREFA: Gerar post profissional sobre: {tema}\n"
        f"Fonte Original: {fonte['nome']}\n"
        f"Tipo: {tipo_conteudo}\n\n"
        f"Conteúdo de base:\n{conteudo[:5000]}\n\n"
        "Gere um artigo técnico com mais de 500 palavras, reescrito de forma original (sem plágio).\n"
        "Use HTML puro (h2, p, strong, ul, li).\n"
        "Responda APENAS JSON:\n"
        '{"title": "Título Profissional", "excerpt": "Resumo curto", "tags": ["Tag1", "Tag2"], "image_query": "english keywords", "content": "HTML content"}'
    )
    try:
        raw = chamar_llm(prompt, max_tokens=4000, temperature=0.2)
        raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
        dados = json.loads(raw)
        dados["source_url"] = fonte["url"]
        return dados
    except:
        return None

def main():
    print(f"\nAgente CalculaPrazo — {HOJE.strftime('%d/%m/%Y')}")
    print(f"Fontes: {len(FONTES)}")
    
    # Meta diária: 5 a 10 posts
    meta = random.randint(5, 10)
    print(f"Meta de hoje: {meta} posts")
    
    fontes_shuffled = list(FONTES)
    random.shuffle(fontes_shuffled)
    
    publicados = 0
    for fonte in fontes_shuffled:
        if publicados >= meta:
            break
            
        print(f"\nVerificando: {fonte['nome']}")
        conteudo, _ = buscar_conteudo(fonte)
        if not conteudo: continue
        
        av = avaliar_relevancia(conteudo, fonte)
        if not av.get("relevante"):
            print("  Sem novidades relevantes.")
            continue
            
        tema = av.get("tema", "")
        if is_duplicata(tema):
            print(f"  Já publicado: {tema}")
            continue
            
        print(f"  Gerando post sobre: {tema}")
        dados = gerar_artigo(conteudo, fonte, tema, av.get("tipo_conteudo", fonte["tipo"]))
        if not dados: continue
        
        ok, motivo = validar_qualidade(dados, fonte["categoria"])
        if not ok:
            print(f"  Qualidade insuficiente: {motivo}")
            continue
            
        if salvar_post(dados, fonte["categoria"], fonte["nome"]):
            publicados += 1
            print(f"  ✅ Post {publicados}/{meta} publicado!")
            time.sleep(2)

    print(f"\nFim da execução. Total publicado: {publicados}")

if __name__ == "__main__":
    main()
