# -*- coding: utf-8 -*-
"""
Agente CalculaPrazo — Gerador automático de posts trabalhistas
Pesquisa fontes confiáveis antes de gerar cada artigo via IA.
"""
import os, json, re, requests, urllib.request, random
from datetime import date
from slugify import slugify
from html.parser import HTMLParser

API_KEY = os.environ["OPENROUTER_KEY"]
MODEL   = "google/gemini-flash-1.5"

HEADERS_SCRAPE = {
    "User-Agent": "Mozilla/5.0 (compatible; CalculaPrazoBot/1.0; +https://calculaprazo.com.br)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

# =============================================================
# FONTES CONFIÁVEIS POR CATEGORIA
# O agente busca 3 fontes antes de gerar cada post
# =============================================================
FONTES = {
    "jurisprudencia": [
        {"nome": "TST Noticias",       "url": "https://www.tst.jus.br/noticias"},
        {"nome": "TST Jurisprudencia", "url": "https://jurisprudencia.tst.jus.br/"},
        {"nome": "Conjur Trabalho",    "url": "https://www.conjur.com.br/temas/direito-trabalho/"},
        {"nome": "Migalhas",           "url": "https://migalhas.uol.com.br/quentes"},
        {"nome": "JOTA Trabalho",      "url": "https://www.jota.info/trabalho/"},
        {"nome": "Jusbrasil",          "url": "https://www.jusbrasil.com.br/noticias/direito-do-trabalho"},
    ],
    "legislacao": [
        {"nome": "MTE Gov",            "url": "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/noticias"},
        {"nome": "TST Noticias",       "url": "https://www.tst.jus.br/noticias"},
        {"nome": "Conjur",             "url": "https://www.conjur.com.br/"},
        {"nome": "JOTA",               "url": "https://www.jota.info/"},
        {"nome": "Migalhas",           "url": "https://migalhas.uol.com.br/quentes"},
        {"nome": "Ambito Juridico",    "url": "https://www.ambito-juridico.com.br/"},
    ],
    "pratica": [
        {"nome": "Guia Trabalhista",   "url": "https://trabalhista.blog/"},
        {"nome": "Contabeis Trab",     "url": "https://www.contabeis.com.br/conteudo/trabalhista/"},
        {"nome": "RH Portal",          "url": "https://rhportal.com.br/"},
        {"nome": "Ambito Juridico",    "url": "https://www.ambito-juridico.com.br/"},
        {"nome": "InfoMoney Trabalho", "url": "https://www.infomoney.com.br/tudo-sobre/direitos-trabalhistas/"},
        {"nome": "Jusbrasil",          "url": "https://www.jusbrasil.com.br/artigos/direito-do-trabalho"},
    ],
    "esocial": [
        {"nome": "eSocial Gov",        "url": "https://www.gov.br/esocial/pt-br/noticias"},
        {"nome": "Contabeis eSocial",  "url": "https://www.contabeis.com.br/conteudo/esocial/"},
        {"nome": "Guia Trabalhista",   "url": "https://trabalhista.blog/"},
        {"nome": "RH Portal",          "url": "https://rhportal.com.br/"},
        {"nome": "MTE Gov",            "url": "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/noticias"},
    ],
    "folha": [
        {"nome": "RH Portal",          "url": "https://rhportal.com.br/"},
        {"nome": "Contabeis Trab",     "url": "https://www.contabeis.com.br/conteudo/trabalhista/"},
        {"nome": "Guia Trabalhista",   "url": "https://trabalhista.blog/"},
        {"nome": "InfoMoney Trabalho", "url": "https://www.infomoney.com.br/tudo-sobre/direitos-trabalhistas/"},
        {"nome": "UOL Economia",       "url": "https://economia.uol.com.br/"},
        {"nome": "MTE Gov",            "url": "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/noticias"},
    ],
    "noticias": [
        {"nome": "TST Noticias",       "url": "https://www.tst.jus.br/noticias"},
        {"nome": "Conjur",             "url": "https://www.conjur.com.br/"},
        {"nome": "Migalhas",           "url": "https://migalhas.uol.com.br/quentes"},
        {"nome": "G1 Economia",        "url": "https://g1.globo.com/economia/"},
        {"nome": "JOTA",               "url": "https://www.jota.info/"},
        {"nome": "MPT",                "url": "https://mpt.mp.br/pgt/noticias"},
    ],
}

# TRTs rotacionados por jurisprudencia regional
TRTS = [
    {"nome": "TRT 1 RJ",    "url": "https://www.trt1.jus.br/noticias"},
    {"nome": "TRT 2 SP",    "url": "https://www.trt2.jus.br/"},
    {"nome": "TRT 3 MG",    "url": "https://www.trt3.jus.br/noticias"},
    {"nome": "TRT 4 RS",    "url": "https://www.trt4.jus.br/portais/trt4/home"},
    {"nome": "TRT 9 PR",    "url": "https://www.trt9.jus.br/portal/noticia"},
    {"nome": "TRT 15 SP",   "url": "https://www.trt15.jus.br/noticias"},
    {"nome": "TRT 10 DF",   "url": "https://www.trt10.jus.br/noticias"},
    {"nome": "TRT 12 SC",   "url": "https://www.trt12.jus.br/noticias"},
]

# =============================================================
# BANCO DE TEMAS — 30+ temas rotativos
# =============================================================
BANCO_TEMAS = [
    # Jurisprudencia
    {"cat": "jurisprudencia", "tema": "nova sumula ou orientacao jurisprudencial do TST sobre horas extras e controle de jornada"},
    {"cat": "jurisprudencia", "tema": "decisao do TST sobre reconhecimento de vinculo empregativo de trabalhador autonomo e MEI"},
    {"cat": "jurisprudencia", "tema": "entendimento atual do TST sobre dano moral trabalhista: casos e valores de indenizacao"},
    {"cat": "jurisprudencia", "tema": "jurisprudencia sobre intervalo intrajornada suprimido ou reduzido e reflexos na folha"},
    {"cat": "jurisprudencia", "tema": "tese do TST sobre prescricao trabalhista: prazo, marco interruptivo e prescricao intercorrente"},
    {"cat": "jurisprudencia", "tema": "acumulo de funcoes e desvio de funcao: o que os TRTs e TST tem decidido"},
    {"cat": "jurisprudencia", "tema": "decisoes recentes sobre assedio moral e sexual no ambiente de trabalho"},
    # Pratica
    {"cat": "pratica", "tema": "calculo completo de rescisao sem justa causa: passo a passo com exemplos numericos"},
    {"cat": "pratica", "tema": "demissao por justa causa: requisitos legais, documentacao e erros que invalidam o processo"},
    {"cat": "pratica", "tema": "ferias coletivas: como conceder, calcular e comunicar ao MTE corretamente"},
    {"cat": "pratica", "tema": "admissao de empregado: documentos obrigatorios, prazo de registro e eSocial"},
    {"cat": "pratica", "tema": "hora extra noturna com adicional noturno: formula de calculo e exemplos praticos"},
    {"cat": "pratica", "tema": "estabilidade provisoria: gestante, CIPA, acidente do trabalho — direitos e excecoes"},
    {"cat": "pratica", "tema": "suspensao e interrupcao do contrato de trabalho: diferenca pratica e impacto na folha"},
    # eSocial e FGTS Digital
    {"cat": "esocial", "tema": "principais erros na transmissao do eSocial e como corrigi-los sem multa"},
    {"cat": "esocial", "tema": "FGTS Digital: como emitir guia, prazos de recolhimento e diferencas com o GFIP"},
    {"cat": "esocial", "tema": "evento S-2230 de afastamento temporario no eSocial: prazo, motivos e correcoes"},
    {"cat": "esocial", "tema": "DCTFWeb e eSocial: integracao, obrigatoriedade e como declarar corretamente"},
    {"cat": "esocial", "tema": "tabela de rubricas do eSocial: natureza das verbas, impacto no FGTS e INSS"},
    {"cat": "esocial", "tema": "eSocial para pequenas empresas: obrigacoes, cronograma e simplificacoes"},
    # Folha e RH
    {"cat": "folha", "tema": "salario liquido 2026: como calcular INSS e IRRF com as tabelas atualizadas"},
    {"cat": "folha", "tema": "PLR participacao nos lucros: regras, tributacao com isencao de IR e limites"},
    {"cat": "folha", "tema": "adicional de insalubridade e periculosidade: base de calculo, diferencas e cumulatividade"},
    {"cat": "folha", "tema": "salario-maternidade e salario-paternidade: calculo, prazo de pagamento e quem reembolsa"},
    {"cat": "folha", "tema": "vale-transporte e vale-refeicao: obrigatoriedade, desconto maximo e impacto trabalhista"},
    {"cat": "folha", "tema": "13 salario: calculo com comissoes, horas extras e gratificacoes — exemplos completos"},
    # Legislacao
    {"cat": "legislacao", "tema": "reforma trabalhista 2017: o que os tribunais consolidaram oito anos depois"},
    {"cat": "legislacao", "tema": "trabalho intermitente: regras de convocacao, remuneracao, INSS e FGTS"},
    {"cat": "legislacao", "tema": "lei de igualdade salarial: requisitos do relatorio, auditoria e multas em 2025"},
    {"cat": "legislacao", "tema": "normas regulamentadoras NR atualizadas: o que mudou para empresas e trabalhadores"},
    {"cat": "legislacao", "tema": "terceirizacao irrestrita: limites impostos pelos TRTs e responsabilidade subsidiaria"},
    # Noticias
    {"cat": "noticias", "tema": "principais noticias trabalhistas da semana: TST, TRTs, MTE e MPT"},
    {"cat": "noticias", "tema": "atualizacoes do STF com impacto direto nas relacoes trabalhistas"},
]

CAT_LABELS = {
    "jurisprudencia": "Jurisprudencia",
    "pratica":        "Pratica",
    "esocial":        "eSocial e FGTS",
    "folha":          "Folha e RH",
    "legislacao":     "Legislacao",
    "noticias":       "Noticias",
}

MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho",
         "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


# =============================================================
# EXTRATOR DE TEXTO DE HTML
# =============================================================
class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.texts = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "header", "footer", "aside", "noscript"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "header", "footer", "aside", "noscript"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            t = data.strip()
            if len(t) > 40:
                self.texts.append(t)

    def get_text(self, max_chars=3000):
        return " ".join(self.texts)[:max_chars]


def fetch_context(categoria):
    """Busca contexto nas fontes confiaveis para enriquecer o prompt."""
    fontes = list(FONTES.get(categoria, FONTES["noticias"]))
    if categoria == "jurisprudencia":
        fontes.append(random.choice(TRTS))

    random.shuffle(fontes)
    trechos = []
    for fonte in fontes[:3]:
        try:
            r = requests.get(fonte["url"], headers=HEADERS_SCRAPE, timeout=15)
            if r.ok and "text/html" in r.headers.get("Content-Type", ""):
                parser = TextExtractor()
                parser.feed(r.text)
                texto = parser.get_text(800)
                if texto:
                    trechos.append(f"[{fonte['nome']}]\n{texto}")
        except Exception as e:
            print(f"    aviso: nao foi possivel acessar {fonte['nome']} ({e})")

    return "\n\n---\n\n".join(trechos)


def gerar_post(tema):
    """Gera artigo com IA, enriquecido com contexto das fontes."""
    print(f"  buscando contexto em fontes confiaveis...")
    contexto = fetch_context(tema["cat"])

    if contexto:
        bloco_ctx = (
            "CONTEXTO COLETADO DE FONTES JURIDICAS CONFIAVEIS "
            "(TST, TRTs, MTE, Conjur, Migalhas, JOTA):\n"
            "---\n" + contexto[:2500] + "\n---\n\n"
        )
    else:
        bloco_ctx = ""

    prompt = (
        bloco_ctx
        + "Voce e especialista em direito do trabalho brasileiro. "
        + "Com base no contexto acima (se disponivel) e no seu conhecimento tecnico, "
        + "escreva um artigo completo e aprofundado sobre:\n\n"
        + f"TEMA: {tema['tema']}\n"
        + "PUBLICO: advogados trabalhistas, profissionais de RH e contadores\n\n"
        + "Responda APENAS com JSON valido, sem markdown, sem texto fora do JSON:\n"
        + '{"title": "titulo SEO objetivo ate 65 caracteres",'
        + '"excerpt": "resumo direto ate 155 caracteres para meta description",'
        + '"tags": ["tag1", "tag2", "tag3"],'
        + '"content": "HTML completo: h2 para secoes, p para paragrafos, ul li para listas, '
        + "strong para enfase, blockquote para citacoes legais. "
        + 'Minimo 700 palavras. Cite artigos de lei, sumulas e OJs quando aplicavel."'
        + '} — tags: array com 3 a 5 palavras-chave do artigo (ex: TST, horas extras, CLT, rescisao)'
    )

    r = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        json={
            "model": MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 2500,
        },
        timeout=120,
    )
    raw = r.json()["choices"][0]["message"]["content"]
    raw = re.sub(r"^```json\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw.strip())
    return json.loads(raw)


def preencher_template(dados, tema, slug, data_str, data_br):
    import json as _json
    with open("blog/POST_TEMPLATE.html", encoding="utf-8") as f:
        template = f.read()

    # Tags: usa o campo "tags" do post (array), ou monta a partir do tema
    tags = dados.get("tags") or [tema["cat"]]
    tags_json   = _json.dumps(tags, ensure_ascii=False)
    first_tag   = tags[0] if tags else tema["cat"]
    tags_badges = "".join(
        '<span style="display:inline-block;padding:3px 12px;border-radius:999px;'+
        'font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;'+
        'background:rgba(255,255,255,.15);color:rgba(255,255,255,.9);'+
        'border:1px solid rgba(255,255,255,.25);margin-right:5px;margin-bottom:4px;">'
        + t + "</span>"
        for t in tags
    )

    return (
        template
        .replace("{{TITLE}}",            dados["title"])
        .replace("{{DESCRIPTION}}",      dados["excerpt"])
        .replace("{{SLUG}}",             slug)
        .replace("{{CATEGORY}}",         tema["cat"])
        .replace("{{CATEGORY_LABEL}}",   first_tag)
        .replace("{{TAGS_BADGES}}",      tags_badges)
        .replace("{{TAGS_JSON}}",        tags_json)
        .replace("{{DATE}}",             data_str)
        .replace("{{DATE_BR}}",          data_br)
        .replace("{{CONTENT}}",          dados["content"])
        .replace("{{OG_IMAGE}}",         "")
        .replace("{{SCHEMA_IMAGE}}",     "")
        .replace("{{COVER_IMAGE_HTML}}", "")
    )


def atualizar_posts_json(novo_post):
    try:
        with open("data/posts.json", encoding="utf-8") as f:
            posts = json.load(f)
    except Exception:
        posts = []
    if not any(p["id"] == novo_post["id"] for p in posts):
        posts.insert(0, novo_post)
    posts = posts[:300]
    with open("data/posts.json", "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)


def atualizar_sitemap(posts):
    urls = [
        "https://calculaprazo.com.br/",
        "https://calculaprazo.com.br/#conteudo",
    ]
    for p in posts:
        urls.append(f"https://calculaprazo.com.br/blog/{p['id']}")

    linhas = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">']
    for url in urls:
        linhas += [
            "  <url>",
            f"    <loc>{url}</loc>",
            "    <changefreq>weekly</changefreq>",
            "    <priority>0.7</priority>",
            "  </url>",
        ]
    linhas.append("</urlset>")

    with open("sitemap.xml", "w", encoding="utf-8") as f:
        f.write("\n".join(linhas))

    try:
        urllib.request.urlopen(
            "https://www.google.com/ping?sitemap=https://calculaprazo.com.br/sitemap.xml",
            timeout=10,
        )
        print("  sitemap ping enviado ao Google")
    except Exception:
        pass


def selecionar_temas_do_dia():
    """5 temas diarios — um de cada categoria principal."""
    hoje = date.today()
    random.seed(hoje.year * 10000 + hoje.month * 100 + hoje.day)
    cats = ["jurisprudencia", "pratica", "esocial", "folha", "legislacao"]
    temas_dia = []
    for cat in cats:
        opcoes = [t for t in BANCO_TEMAS if t["cat"] == cat]
        if opcoes:
            temas_dia.append(random.choice(opcoes))
    return temas_dia


def main():
    hoje     = date.today()
    data_str = hoje.strftime("%Y-%m-%d")
    data_br  = f"{hoje.day} de {MESES[hoje.month - 1]} de {hoje.year}"

    temas_dia = selecionar_temas_do_dia()
    print(f"\n{data_str} — gerando {len(temas_dia)} posts")
    print("=" * 60)

    gerados = 0
    for tema in temas_dia:
        try:
            print(f"\n[{tema['cat'].upper()}] {tema['tema'][:60]}...")
            dados = gerar_post(tema)
            slug  = slugify(dados["title"])[:60]

            html = preencher_template(dados, tema, slug, data_str, data_br)
            with open(f"blog/{slug}.html", "w", encoding="utf-8") as f:
                f.write(html)

            tags = dados.get("tags") or [tema["cat"]]
            atualizar_posts_json({
                "id": slug,
                "title": dados["title"],
                "category": tema["cat"],
                "tags": tags,
                "excerpt": dados["excerpt"],
                "image": "",
                "imageCaption": "",
                "date": data_str,
                "content": dados["content"],
            })
            print(f"  publicado: {slug}.html")
            gerados += 1
        except Exception as e:
            print(f"  ERRO: {e}")

    with open("data/posts.json", encoding="utf-8") as f:
        todos = json.load(f)
    atualizar_sitemap(todos)

    print(f"\n{'='*60}")
    print(f"{gerados}/{len(temas_dia)} posts gerados | {len(todos)} total | sitemap: {len(todos)+2} URLs")


if __name__ == "__main__":
    main()
