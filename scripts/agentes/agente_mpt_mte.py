# -*- coding: utf-8 -*-
"""
Agente MPT e MTE — Ministério Público do Trabalho e Ministério do Trabalho
"""
import os, json, re, requests, random
from datetime import date, timedelta
from slugify import slugify
from html.parser import HTMLParser

API_KEY = os.environ["OPENROUTER_KEY"]
MODEL   = "google/gemini-flash-1.5"
HOJE    = date.today()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CalculaPrazoBot/1.0; +https://calculaprazo.com.br)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

PROPOSITO = """
O site CalculaPrazo é voltado a advogados trabalhistas, profissionais de RH e contadores.
Publica conteúdo sobre: decisões trabalhistas, jurisprudência do TST e TRTs,
legislação trabalhista, eSocial, FGTS Digital, folha de pagamento, rescisões,
férias, 13º salário, horas extras, jornada de trabalho e obrigações acessórias.
NÃO é relevante: esportes, política geral, crimes, celebridades, economia macro.
"""

SOURCES = [
    {"nome": "MPT - Notícias", "url": "https://mpt.mp.br/pgt/noticias"},
    {"nome": "MTE - Notícias", "url": "https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo"},
    {"nome": "MPT - Portarias", "url": "https://mpt.mp.br/pgt/portarias"},
]

# (O resto do código é idêntico ao agente_tst_stf.py — apenas mudei o nome e as SOURCES)
# Copie todo o código do agente_tst_stf.py a partir da class TextExtractor até o final
# e cole aqui, mantendo apenas as mudanças acima (HEADERS, PROPOSITO, SOURCES e o print do main)
