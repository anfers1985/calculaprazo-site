# -*- coding: utf-8 -*-
"""
Agente de Postagem Melhorado para CalculaPrazo
Monitora fontes jurídicas/trabalhistas, reformula conteúdos das últimas 24h
e publica com imagens relevantes e atribuição de fonte.
"""

import json
import re
import requests
import time
import os
from datetime import datetime, timedelta
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

# ─────────────────────────────────────────────
# CONFIGURAÇÕES
# ─────────────────────────────────────────────

HOJE = datetime.now()
HORAS_24 = HOJE - timedelta(hours=24)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

# Fontes de conteúdo
FONTES = [
    # Fontes primárias — alta precisão temática
    {"nome": "TST Notícias",     "url": "https://www.tst.jus.br/web/guest/noticias",                          "categoria": "jurisprudencia-tst"},
    {"nome": "MTE Notícias",     "url": "https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo",   "categoria": "noticias-mte-mpt"},
    {"nome": "MPT Notícias",     "url": "https://mpt.mp.br/pgt/noticias",                                    "categoria": "noticias-mte-mpt"},
    {"nome": "TRT2 Notícias",    "url": "https://www.trt2.jus.br/noticias",                                  "categoria": "jurisprudencia-trts"},
    {"nome": "TRT3 Notícias",    "url": "https://www.trt3.jus.br/component/k2/itemlist/tag/noticias",        "categoria": "jurisprudencia-trts"},
    {"nome": "TRT4 Notícias",    "url": "https://www.trt4.jus.br/portais/trt4/noticias",                    "categoria": "jurisprudencia-trts"},
    # Fontes especializadas — nicho trabalhista/contábil
    {"nome": "Portal Contábeis Trabalhista", "url": "https://www.contabeis.com.br/conteudo/trabalhista/",   "categoria": "orientacoes-praticas"},
    {"nome": "Guia Trabalhista", "url": "https://www.guiatrabalhista.com.br/noticias/index.htm",             "categoria": "legislacao-normas"},
    {"nome": "Conjur Trabalhista","url": "https://www.conjur.com.br/categoria/trabalho",                    "categoria": "jurisprudencia-tst"},
    # G1 — aceita mas com filtro rigoroso de whitelist
    {"nome": "G1 Trabalho",      "url": "https://g1.globo.com/trabalho-e-carreira/",                        "categoria": "noticias-mte-mpt"},
]

# Temas a excluir (baixo valor editorial)
TEMAS_EXCLUIR = [
    "plenária", "posse", "homenagem", "evento", "seminário", "congresso",
    "palestra", "eleição", "capacitação", "curso", "treinamento",
    "agenda", "reunião", "análise estratégica", "planejamento estratégico",
    "inauguração", "aniversário", "visita", "entrega de",
    # Títulos genéricos inválidos
    "notícias atualizadas", "sem título", "notícias", "últimas notícias",
    "noticias atualizadas", "página inicial", "home",
    # Fora do nicho trabalhista
    "currículo", "curriculo", "inteligência artificial", "ia pode", "tecnologia",
    "startup", "empreendedor", "inovação", "bitcoin", "criptomoeda",
    "moda", "beleza", "saúde pessoal", "dieta", "esporte", "futebol",
    "política", "eleições", "candidato", "partido", "presidente",
    "internacional", "guerra", "conflito", "exterior",
    # Tech/comportamento fora do nicho
    "inteligência artificial", "ia pode", "ia está", "machine learning",
    "curriculo", "currículo", "linkedin", "processo seletivo", "entrevista de emprego",
    "dicas de carreira", "networking", "soft skills", "hard skills",
    "empreendedorismo", "startup", "inovação tecnológica",
    # Financeiro não trabalhista
    "bolsa de valores", "ibovespa", "bitcoin", "criptomoeda", "ação da",
    "imposto de renda pessoa física", "declaração ir",
    # Saúde/comportamento
    "saúde mental", "burnout pessoal", "qualidade de vida", "bem-estar",
    "alimentação", "exercício", "academia",
]

# Palavras-chave obrigatórias — a notícia DEVE conter ao menos uma
# para ser considerada de direito do trabalho / RH / contabilidade trabalhista
TEMAS_INCLUIR_OBRIGATORIO = [
    # CLT e relações de trabalho
    "trabalhador", "empregado", "empregador", "clt", "vínculo empregatício",
    "contrato de trabalho", "rescisão", "demissão", "admissão",
    # Direitos e verbas
    "fgts", "férias", "13", "salário", "remuneração", "hora extra",
    "adicional", "insalubridade", "periculosidade", "desvio de função",
    "jornada", "banco de horas", "intervalo", "descanso",
    # Processo e órgãos
    "tst", "trt", "tribunal", "vara do trabalho", "ação trabalhista",
    "reclamação trabalhista", "audiência", "sentença trabalhista",
    "jurisprudência trabalhista",
    # Legislação
    "reforma trabalhista", "lei trabalhista", "portaria", "instrução normativa",
    "mte", "ministério do trabalho", "mpt", "ministério público do trabalho",
    # RH e folha
    "rh", "recursos humanos", "folha de pagamento", "inss", "irrf",
    "esocial", "fgts digital", "e-social", "caged", "rais",
    # Categorias específicas
    "terceirização", "pejotização", "teletrabalho", "home office",
    "equiparação salarial", "acidente de trabalho", "doença ocupacional",
    "assédio moral", "assédio sexual", "greve", "sindicato", "acordo coletivo",
    "convenção coletiva", "negociação coletiva",
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
        if tag in ("script", "style", "nav", "header", "footer", "aside", "noscript"):
            self._skip = True
        if tag == "a":
            for k, v in attrs:
                if k == "href" and v and len(v) > 10:
                    self.links.append(v)

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "header", "footer", "aside", "noscript"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            t = data.strip()
            if len(t) > 30:
                self.texts.append(t)

    def get_text(self, max_chars=8000):
        return " ".join(self.texts)[:max_chars]


# ─────────────────────────────────────────────
# FUNÇÕES DE BUSCA E FILTRAGEM
# ─────────────────────────────────────────────

def fetch_html(url, timeout=15):
    """Busca HTML de uma URL com retry."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout, verify=False)
        if r.ok and len(r.text) > 500:
            return r.text
    except Exception as e:
        print(f"  ERRO ao buscar {url}: {str(e)[:80]}")
    return ""


def extrair_links_artigo(html, base_url):
    """Extrai URLs de artigos individuais de uma página de listagem."""
    p = TextExtractor()
    try:
        p.feed(html)
    except Exception:
        pass
    
    base = urlparse(base_url)
    candidatos = []
    
    for href in p.links:
        full = urljoin(base_url, href)
        fu = urlparse(full)
        
        if fu.netloc != base.netloc:
            continue
        
        path = fu.path.lower()
        if any(x in path for x in ['/tags/', '/busca', '/search', '/categoria', '/page/', '#', '/login']):
            continue
        
        if any(x in path for x in ['/noticias/', '/noticia/', '/materia/', '/artigo/', '/detalhe/', '/view/', '/post/']):
            candidatos.append(full)
    
    return candidatos


def eh_tema_valido(titulo, conteudo=""):
    """
    Verifica se a notícia é válida:
    1. Título não é genérico (comprimento mínimo de 20 chars)
    2. Título não contém termos da blacklist
    3. O TÍTULO (não o conteúdo) deve conter ao menos uma palavra trabalhista
       — conteúdo genérico com palavras trabalhistas não é suficiente
    4. Título não é uma frase de interface (ex: "Página inicial", "Ver mais")
    """
    titulo_lower = titulo.lower().strip()

    # Rejeitar títulos muito curtos ou muito longos (>150 chars = título de página)
    if len(titulo_lower) < 20 or len(titulo_lower) > 150:
        return False

    # Rejeitar títulos que parecem cabeçalhos de seção/página (sem verbos)
    titulos_interface = [
        "notícias", "noticias", "mais notícias", "ver mais", "leia mais",
        "destaques", "últimas", "ultimas", "conteúdo", "home", "início",
        "página inicial", "artigos", "publicações", "atualizadas", "recentes",
    ]
    for ti in titulos_interface:
        if titulo_lower == ti or titulo_lower.startswith(ti + " ") or titulo_lower.endswith(" " + ti):
            return False

    # Blacklist de termos excluídos
    for tema_excluir in TEMAS_EXCLUIR:
        if tema_excluir in titulo_lower:
            return False

    # Whitelist OBRIGATÓRIA NO TÍTULO — conteúdo não compensa
    # Pelo menos uma palavra-chave trabalhista deve estar no título
    for palavra in TEMAS_INCLUIR_OBRIGATORIO:
        if palavra in titulo_lower:
            return True

    # Segunda chance: se a fonte é primária (TST/TRT/MTE/MPT), relaxar um pouco
    # verificando também o início do conteúdo (primeiras 300 chars)
    conteudo_inicio = conteudo.lower()[:300]
    palavras_alta_confianca = [
        "tst", "trt", "tribunal superior do trabalho", "vara do trabalho",
        "mte", "mpt", "ministério do trabalho", "ministério público do trabalho",
        "clt", "consolidação das leis do trabalho", "reclamação trabalhista",
        "empregado", "empregador", "rescisão", "fgts", "esocial",
    ]
    hits = sum(1 for p in palavras_alta_confianca if p in conteudo_inicio)
    if hits >= 3:  # pelo menos 3 termos de alta confiança no início do texto
        return True

    return False  # Não é trabalhista


def eh_recente(data_texto):
    """
    Verifica se a notícia foi publicada nas últimas 48 horas.
    Tenta encontrar padrões de data no texto extraído da página.
    Se não encontrar data, aceita (benefício da dúvida — fontes primárias
    como TST/TRT raramente reindexam conteúdo antigo).
    """
    import re
    from datetime import datetime, timedelta

    agora = datetime.now()
    limite = agora - timedelta(hours=48)

    # Padrões de data em português e ISO
    padroes = [
        # ISO: 2026-04-25
        r'(\d{4}-\d{2}-\d{2})',
        # BR: 25/04/2026
        r'(\d{2}/\d{2}/\d{4})',
        # BR por extenso: 25 de abril de 2026
        r'(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})',
    ]

    meses = {
        'janeiro':1,'fevereiro':2,'março':3,'abril':4,'maio':5,'junho':6,
        'julho':7,'agosto':8,'setembro':9,'outubro':10,'novembro':11,'dezembro':12
    }

    texto = data_texto[:3000]  # Verificar apenas o início do texto

    for padrao in padroes:
        matches = re.findall(padrao, texto, re.IGNORECASE)
        for match in matches:
            try:
                if isinstance(match, tuple) and len(match) == 3:
                    # Formato "25 de abril de 2026"
                    dia, mes_str, ano = match
                    mes = meses.get(mes_str.lower(), 0)
                    if not mes:
                        continue
                    data = datetime(int(ano), mes, int(dia))
                elif '-' in str(match):
                    data = datetime.strptime(str(match), '%Y-%m-%d')
                elif '/' in str(match):
                    data = datetime.strptime(str(match), '%d/%m/%Y')
                else:
                    continue

                # Aceitar se a data está dentro da janela de 48h
                if data >= limite:
                    return True
                # Rejeitar explicitamente datas muito antigas (> 7 dias)
                elif data < agora - timedelta(days=7):
                    return False
            except Exception:
                continue

    # Se não encontrou data, aceitar (benefício da dúvida para fontes primárias)
    return True


# ─────────────────────────────────────────────
# REFORMULAÇÃO DE CONTEÚDO
# ─────────────────────────────────────────────

def reformular_conteudo(titulo_original, conteudo_original, fonte_nome):
    """
    Usa o LLM para gerar um artigo técnico original baseado na notícia coletada.
    Retorna dict com title, excerpt, content, tags prontos para salvar_post().
    """
    from agente_base import chamar_llm

    prompt = f"""Você é um especialista em Direito do Trabalho brasileiro com experiência em consultoria trabalhista, RH e contabilidade. Escreva um artigo técnico original e completo para o site Calcula Prazo, destinado a advogados trabalhistas, profissionais de RH e contadores brasileiros.

NOTÍCIA DE REFERÊNCIA:
Título: {titulo_original}
Fonte: {fonte_nome}
Resumo: {conteudo_original[:2000]}

ESTRUTURA OBRIGATÓRIA DO ARTIGO (usar exatamente estas seções em HTML, nesta ordem):

<div class="resumo-rapido">
<strong>Resumo rápido:</strong>
<ul>
<li>[Ponto principal 1 — 1 linha]</li>
<li>[Ponto principal 2 — 1 linha]</li>
<li>[Ponto principal 3 — 1 linha]</li>
<li>[Base legal aplicável — ex: Art. 477, CLT / Súmula 331, TST]</li>
<li>[Impacto prático — 1 linha]</li>
</ul>
</div>

<h2>Contexto e relevância prática</h2>
[2 a 3 parágrafos explicando o tema, por que surgiu e por que importa para advogados, RH e contadores. Contextualizar no cenário jurídico atual.]

<h2>Base legal aplicável</h2>
[Artigos da CLT, leis, portarias, instruções normativas e resoluções relevantes — citar com numeração exata. Mínimo 2 parágrafos.]

<h2>Posição do TST e tribunais</h2>
[Jurisprudência consolidada, súmulas, OJs e precedentes vinculantes relevantes. Citar apenas fontes que você tem certeza da existência — se não houver jurisprudência clara, omitir esta seção.]

<h2>Impacto prático para empresas e trabalhadores</h2>
[Mínimo 2 parágrafos com exemplos concretos: valores, prazos, procedimentos, riscos. Usar situações reais do dia a dia jurídico e de RH.]

<h2>[Pergunta prática 1 relevante ao tema — formular como dúvida real de advogado ou RH?]</h2>
[Resposta técnica direta em 2 parágrafos]

<h2>[Pergunta prática 2 relevante ao tema?]</h2>
[Resposta técnica direta em 2 parágrafos]

<h2>[Pergunta prática 3 relevante ao tema?]</h2>
[Resposta técnica direta em 2 parágrafos]

<h2>Conclusão e orientação para profissionais</h2>
[Recomendação prática objetiva em 1 a 2 parágrafos. Finalizar com orientação concreta.]

REGRAS OBRIGATÓRIAS:
- Extensão MÍNIMA: 1.000 palavras. Extensão máxima: 1.600 palavras. NUNCA entregue menos de 1.000 palavras.
- Se o artigo estiver se aproximando do fim antes de 1.000 palavras, expanda as seções de "Impacto prático" e as perguntas práticas com mais detalhes e exemplos.
- Não citar o nome da fonte ({fonte_nome}) no texto
- Tom técnico e direto — proibido usar: "é importante ressaltar", "vale destacar", "cumpre salientar", "nesse sentido", "por sua vez"
- Usar <strong> para termos jurídicos e artigos de lei na primeira menção
- Cada parágrafo deve ter entre 3 e 6 linhas
- Não repetir o título no primeiro parágrafo
- Não inventar súmulas, OJs ou números de lei que não existem
- Todo conteúdo tem caráter informativo — não constitui assessoria jurídica
- Responder APENAS com o HTML do artigo (começando em <div class="resumo-rapido"> ou <h2>), sem preâmbulo, sem marcação de código

Responda APENAS com o HTML do artigo, sem explicações, sem markdown, sem blocos de código."""

    try:
        content_html = chamar_llm(prompt, max_tokens=5000, temperature=0.3)
        if not content_html or len(content_html) < 400:
            raise ValueError("Conteúdo gerado muito curto")
    except Exception as e:
        print(f"  AVISO LLM: {e} — usando fallback")
        content_html = f"<p>{conteudo_original[:1500]}</p>"

    # Gerar título SEO, excerpt e tags via LLM (chamada curta)
    meta_prompt = f"""Com base neste artigo sobre "{titulo_original}", responda APENAS com JSON válido (sem markdown):
{{"title": "Título SEO atraente de 50-65 caracteres para o artigo", "excerpt": "Meta description de 120-155 caracteres resumindo o conteúdo", "tags": ["Tag1", "Tag2", "Tag3", "Tag4"]}}"""

    import json
    try:
        meta_raw = chamar_llm(meta_prompt, max_tokens=200, temperature=0.2)
        meta_raw = meta_raw.strip().lstrip("```json").rstrip("```").strip()
        meta = json.loads(meta_raw)
    except Exception:
        meta = {
            "title": titulo_original[:65],
            "excerpt": conteudo_original[:155],
            "tags": ["Direito do Trabalho", "CLT", "RH"]
        }

    return {
        "title":   meta.get("title", titulo_original[:65]),
        "excerpt": meta.get("excerpt", conteudo_original[:155]),
        "content": content_html,
        "tags":    meta.get("tags", ["Direito do Trabalho"])[:4],
        "image_query": titulo_original,
    }


# ─────────────────────────────────────────────
# SELEÇÃO DE IMAGEM
# ─────────────────────────────────────────────

def selecionar_imagem(categoria, titulo):
    """
    Seleciona uma imagem relevante baseada na categoria e título.
    Pode integrar com Unsplash API ou usar URLs pré-definidas.
    """
    
    # Mapeamento de categorias para queries de imagem
    imagens_categoria = {
        "jurisprudencia-tst": "justice court gavel law",
        "jurisprudencia-trts": "labor court hearing workplace",
        "noticias-mte-mpt": "labor inspection ministry workers",
        "legislacao-normas": "law books legislation documents",
        "saude-seguranca": "workplace safety helmet worker",
        "orientacoes-praticas": "human resources office meeting",
    }
    
    query = imagens_categoria.get(categoria, "law justice")
    
    # Aqui seria integrado com Unsplash API
    # Por enquanto, retorna uma URL genérica
    return f"https://images.unsplash.com/photo-placeholder?q={query}"


# ─────────────────────────────────────────────
# MONITORAMENTO DE FONTES
# ─────────────────────────────────────────────

def monitorar_fonte(fonte):
    """Monitora uma fonte e retorna notícias válidas das últimas 24 horas."""
    
    print(f"\n📰 Monitorando: {fonte['nome']}")
    
    html = fetch_html(fonte['url'])
    if not html:
        print(f"  ❌ Falha ao buscar conteúdo")
        return []
    
    links = extrair_links_artigo(html, fonte['url'])
    print(f"  ✓ Encontrados {len(links)} links de artigos")
    
    noticias_validas = []
    
    for link in links[:5]:  # Limitar a 5 artigos por fonte para teste
        
        artigo_html = fetch_html(link)
        if not artigo_html:
            continue
        
        extrator = TextExtractor()
        try:
            extrator.feed(artigo_html)
        except Exception:
            pass
        
        texto = extrator.get_text()
        
        # Extrair título — tenta <h1>, depois <title>, descarta genéricos
        titulo_match = re.search(r'<h1[^>]*>([^<]{10,})</h1>', artigo_html)
        if titulo_match:
            titulo = titulo_match.group(1).strip()
        else:
            title_match = re.search(r'<title[^>]*>([^<|–—-]{10,})', artigo_html)
            titulo = title_match.group(1).strip() if title_match else ""

        # Limpar entidades HTML básicas do título
        titulo = titulo.replace('&amp;', '&').replace('&#8211;', '–').replace('&#8212;', '—').replace('&nbsp;', ' ').strip()

        if not titulo or len(titulo) < 15:
            print(f"  ⊘ Título inválido ou genérico — pulando")
            continue

        # Validar tema (whitelist obrigatória + blacklist)
        if not eh_tema_valido(titulo, texto):
            print(f"  ⊘ Tema excluído: {titulo[:60]}")
            continue
        
        # Validar recência
        if not eh_recente(texto):
            print(f"  ⊘ Notícia antiga: {titulo[:60]}")
            continue
        
        # Adicionar à lista de notícias válidas
        noticias_validas.append({
            "titulo": titulo,
            "conteudo": texto[:1000],
            "link": link,
            "fonte": fonte['nome'],
            "categoria": fonte['categoria'],
            "imagem": selecionar_imagem(fonte['categoria'], titulo),
        })
        
        print(f"  ✓ Notícia válida: {titulo[:60]}")
    
    return noticias_validas


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    """Executa o agente de postagem: coleta → gera via LLM → publica."""
    from agente_base import salvar_post, is_duplicata, validar_qualidade

    print("=" * 80)
    print("🤖 AGENTE DE POSTAGEM CALCULAPRAZO")
    print(f"   Data/Hora: {HOJE.strftime('%d/%m/%Y %H:%M:%S')}")
    print("=" * 80)

    todas_noticias = []

    # 1. Monitorar todas as fontes
    for fonte in FONTES:
        noticias = monitorar_fonte(fonte)
        todas_noticias.extend(noticias)
        time.sleep(2)

    print(f"\n📊 RESUMO: {len(todas_noticias)} notícias válidas encontradas")

    if not todas_noticias:
        print("Nenhuma notícia encontrada. Encerrando.")
        return []

    publicados = 0
    MAX_POSTS = 5  # máximo por execução

    for noticia in todas_noticias:
        if publicados >= MAX_POSTS:
            break

        titulo = noticia["titulo"]
        print(f"\n✍️  Gerando artigo: {titulo[:60]}")

        # 2. Verificar duplicata antes de chamar o LLM
        if is_duplicata(titulo):
            print(f"  ⊘ Duplicata ignorada: {titulo[:60]}")
            continue

        # 3. Gerar artigo completo via LLM
        try:
            dados = reformular_conteudo(
                titulo_original=titulo,
                conteudo_original=noticia["conteudo"],
                fonte_nome=noticia["fonte"]
            )
        except Exception as e:
            print(f"  ERRO na geração: {e}")
            continue

        dados["source_url"] = noticia.get("link", "")

        # 4. Validar qualidade mínima
        ok, motivo = validar_qualidade(dados, noticia["categoria"])
        if not ok:
            print(f"  ⊘ Qualidade insuficiente ({motivo}): {titulo[:60]}")
            continue

        # 5. Salvar post
        sucesso = salvar_post(dados, noticia["categoria"], noticia["fonte"])
        if sucesso:
            publicados += 1
            print(f"  ✅ Publicado ({publicados}/{MAX_POSTS}): {dados['title'][:60]}")

        time.sleep(3)  # delay entre publicações

    print(f"\n✅ CONCLUÍDO: {publicados} post(s) publicado(s).")
    return todas_noticias


if __name__ == "__main__":
    noticias = main()
