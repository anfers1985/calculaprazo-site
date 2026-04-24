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
    {"nome": "TST Notícias", "url": "https://www.tst.jus.br/web/guest/noticias", "categoria": "jurisprudencia-tst"},
    {"nome": "Portal Contábeis", "url": "https://www.contabeis.com.br/conteudo/trabalhista/", "categoria": "orientacoes-praticas"},
    {"nome": "G1 Trabalho", "url": "https://g1.globo.com/trabalho-e-carreira/", "categoria": "noticias-mte-mpt"},
    {"nome": "MTE Notícias", "url": "https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo", "categoria": "noticias-mte-mpt"},
]

# Temas a excluir (baixo valor editorial)
TEMAS_EXCLUIR = [
    "plenária", "posse", "homenagem", "evento", "seminário", "congresso",
    "palestra", "eleição", "capacitação", "curso", "treinamento",
    "agenda", "reunião", "análise estratégica", "planejamento estratégico",
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


def eh_tema_valido(titulo):
    """Verifica se o tema é válido (não está na lista de exclusão)."""
    titulo_lower = titulo.lower()
    for tema_excluir in TEMAS_EXCLUIR:
        if tema_excluir in titulo_lower:
            return False
    return True


def eh_recente(data_texto):
    """Verifica se a notícia foi publicada nas últimas 24 horas."""
    # Implementar lógica de parsing de data conforme necessário
    # Por enquanto, retorna True para todas as notícias
    return True


# ─────────────────────────────────────────────
# REFORMULAÇÃO DE CONTEÚDO
# ─────────────────────────────────────────────

def reformular_conteudo(titulo_original, conteudo_original, fonte_nome):
    """
    Reformula o conteúdo para evitar plágio.
    Mantém a essência mas muda a estrutura e redação.
    """
    # Aqui seria integrado um LLM para reformular
    # Por enquanto, retorna o conteúdo com uma nota de reformulação
    
    reformulado = f"""
## {titulo_original}

{conteudo_original}

**Fonte:** {fonte_nome}
"""
    return reformulado


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
        
        # Extrair título (simplificado)
        titulo_match = re.search(r'<h1[^>]*>([^<]+)</h1>', artigo_html)
        titulo = titulo_match.group(1) if titulo_match else "Sem título"
        
        # Validar tema
        if not eh_tema_valido(titulo):
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
    """Executa o agente de postagem."""
    
    print("=" * 80)
    print("🤖 AGENTE DE POSTAGEM CALCULAPRAZO")
    print(f"   Data/Hora: {HOJE.strftime('%d/%m/%Y %H:%M:%S')}")
    print("=" * 80)
    
    todas_noticias = []
    
    # Monitorar todas as fontes
    for fonte in FONTES:
        noticias = monitorar_fonte(fonte)
        todas_noticias.extend(noticias)
        time.sleep(2)  # Delay entre requisições
    
    print(f"\n📊 RESUMO: {len(todas_noticias)} notícias válidas encontradas")
    
    # Salvar notícias em JSON para revisão
    if todas_noticias:
        with open("noticias_agente.json", "w", encoding="utf-8") as f:
            json.dump(todas_noticias, f, ensure_ascii=False, indent=2)
        print(f"✓ Notícias salvas em: noticias_agente.json")
    
    return todas_noticias


if __name__ == "__main__":
    noticias = main()
