# -*- coding: utf-8 -*-
# agente_mpt.py - CalculaPrazo
# Categoria: noticias-mte-mpt
import json, re, requests, random, time
from html.parser import HTMLParser
from agente_base import chamar_llm, validar_qualidade, is_duplicata, salvar_post, HOJE

CATEGORIA   = "noticias-mte-mpt"
FONTE_LABEL = "MPT"

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (compatible; CalculaPrazoBot/1.0; +https://calculaprazo.com.br)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

SOURCES = [
    {"nome": "MPT -- Portal Nacional", "url": "https://mpt.mp.br/pgt/noticias"},
    {"nome": "PRT-12 (SC)", "url": "https://www.prt12.mpt.mp.br/informe-se/noticias-do-mpt-sc"},
    {"nome": "PRT-1 (RJ)", "url": "https://www.prt1.mpt.mp.br/informe-se/noticias-do-mpt-rj"},
    {"nome": "PRT-2 (SP)", "url": "https://www.prt2.mpt.mp.br/informe-se/noticias-do-mpt-sp"},
    {"nome": "PRT-4 (RS)", "url": "https://www.prt4.mpt.mp.br/informe-se/noticias-do-mpt-rs"},
    {"nome": "PRT-3 (MG)", "url": "https://www.prt3.mpt.mp.br/comunicacao/noticias-do-mpt-mg"},
    {"nome": "PRT-5 (BA)", "url": "https://www.prt5.mpt.mp.br/informe-se/noticias-do-mpt-ba"},
]

PROPOSITO = (
    "Voce e Especialista em Conformidade Trabalhista do CalculaPrazo.\n"
    "Publico: empresas, juridico corporativo, RH estrategico.\n"
    "Foco: acoes do MPT (TAC, ACP, recomendacoes, inqueritos, fiscalizacoes), riscos para empresas.\n"
    "NAO PUBLICAR: posses, agendas de eventos, notas de pesar sem impacto pratico.\n"
    "REGRAS: Citar numero do inquerito/TAC/ACP quando disponivel. Nunca inventar dados."
)


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.texts = []
        self._skip = False
    def handle_starttag(self, tag, attrs):
        if tag in ("script","style","nav","header","footer","aside","noscript","form"):
            self._skip = True
    def handle_endtag(self, tag):
        if tag in ("script","style","nav","header","footer","aside","noscript","form"):
            self._skip = False
    def handle_data(self, data):
        if not self._skip:
            t = data.strip()
            if len(t) > 40:
                self.texts.append(t)
    def get_text(self, max_chars=6000):
        return " ".join(self.texts)[:max_chars]


def buscar_conteudo(fonte):
    try:
        r = requests.get(fonte["url"], headers=HEADERS, timeout=30)
        print("  HTTP " + str(r.status_code) + " | " + fonte["nome"])
        if r.ok:
            p = TextExtractor()
            p.feed(r.text)
            return p.get_text(6000), r.url
    except Exception as e:
        print("  Erro: " + str(e))
    return "", fonte["url"]


def avaliar_relevancia(conteudo, fonte_nome):
    if len(conteudo) < 150:
        return {"relevante": False, "motivo": "conteudo insuficiente", "tema": ""}
    prompt = (
        PROPOSITO + "\n\n"
        "Conteudo coletado de " + fonte_nome + " (hoje: " + HOJE.strftime("%d/%m/%Y") + "):\n"
        "---\n" + conteudo[:3000] + "\n---\n\n"
        "Ha publicacao recente (ultimas 72h) com impacto relevante para o publico-alvo?\n"
        "Responda APENAS com JSON valido (sem markdown):\n"
        '{"relevante": true, "motivo": "1 frase", "tema": "tema concreto com numero norma/processo se disponivel"}'
    )
    try:
        raw = chamar_llm(prompt, max_tokens=300, temperature=0.1)
        raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
        return json.loads(raw)
    except Exception as e:
        print("  Erro avaliacao: " + str(e))
        return {"relevante": False, "motivo": "erro", "tema": ""}


def gerar_artigo(conteudo, tema, fonte_nome, fonte_url):
    prompt = (
        PROPOSITO + "\n\n"
        "Fonte: " + fonte_nome + "\n"
        "URL: " + fonte_url + "\n"
        "Data: " + HOJE.strftime("%d/%m/%Y") + "\n"
        "Tema: " + tema + "\n\n"
        "Conteudo coletado:\n---\n" + conteudo[:5000] + "\n---\n\n"
        "Redija boletim tecnico completo (minimo 450 palavras) com:\n"
        "1. O que aconteceu (fato, orgao, numero norma/processo)\n"
        "2. Base legal aplicavel\n"
        "3. Analise do conteudo (baseada APENAS no que foi coletado)\n"
        "4. Impacto para empresas, RH ou trabalhadores\n"
        "5. Acao recomendada\n\n"
        "Nunca invente dados ausentes da fonte.\n\n"
        "Responda APENAS com JSON valido (sem markdown):\n"
        '{"title": "Titulo tecnico max 70 chars", "excerpt": "Resumo max 160 chars", "tags": ["Tag1", "Tag2", "Tag3"], "image_query": "3-5 palavras em ingles", "content": "<h2>...</h2><p>...</p>..."}'
    )
    try:
        raw = chamar_llm(prompt, max_tokens=4000, temperature=0.2)
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        dados = json.loads(raw)
        dados.setdefault("title",       "Atualizacao " + FONTE_LABEL + " -- " + HOJE.strftime("%d/%m/%Y"))
        dados.setdefault("excerpt",     tema[:120])
        dados.setdefault("content",     "<p>Analise em elaboracao.</p>")
        dados.setdefault("tags",        [FONTE_LABEL])
        dados.setdefault("image_query", "labor inspection ministry workplace")
        dados["source_url"] = fonte_url
        return dados
    except Exception as e:
        print("  Erro gerar artigo: " + str(e))
        return None


def main():
    print("\nAgente " + FONTE_LABEL + " -- " + HOJE.strftime("%d/%m/%Y"))
    print("=" * 70)
    random.shuffle(SOURCES)
    publicados = 0
    for fonte in SOURCES:
        print("\n[" + fonte["nome"] + "]")
        conteudo, url_real = buscar_conteudo(fonte)
        if not conteudo or len(conteudo) < 200:
            print("  Conteudo insuficiente, pulando.")
            continue
        avaliacao = avaliar_relevancia(conteudo, fonte["nome"])
        print("  Avaliacao: " + str(avaliacao))
        if not avaliacao.get("relevante"):
            print("  Sem relevancia: " + str(avaliacao.get("motivo")))
            continue
        tema = avaliacao.get("tema", "")
        if is_duplicata(tema, "data/posts.json"):
            print("  Duplicata: " + tema)
            continue
        dados = gerar_artigo(conteudo, tema, fonte["nome"], url_real)
        if not dados:
            continue
        aprovado, motivo = validar_qualidade(dados, CATEGORIA)
        if not aprovado:
            print("  Reprovado: " + motivo)
            continue
        if is_duplicata(dados["title"], "data/posts.json"):
            print("  Duplicata: " + dados["title"])
            continue
        if salvar_post(dados, CATEGORIA, fonte["nome"]):
            publicados += 1
        time.sleep(5)
        if publicados >= 1:
            break
    status = "OK" if publicados else "AVISO"
    print("\n" + status + " Total: " + str(publicados) + " post(s) " + FONTE_LABEL)


if __name__ == "__main__":
    main()
