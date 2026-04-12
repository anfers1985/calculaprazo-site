# -*- coding: utf-8 -*-
"""
gerar_posts.py — Gerador Manual / Fallback de Posts — CalculaPrazo
Integrado ao agente_base.py:
  - Validacao de qualidade obrigatorio
  - Verificacao de duplicatas
  - Atualiza data/posts.json e sitemap.xml
  - Adiciona source_url e nota de fonte
  - Usa taxonomia de categorias padronizada
Uso: python scripts/gerar_posts.py
"""
import os, json, re, requests, random, sys
from datetime import date
from slugify import slugify

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'agentes'))
from agente_base import validar_qualidade, is_duplicata, salvar_post, HOJE, CATEGORIAS_VALIDAS

API_KEY = os.environ.get("OPENROUTER_KEY", "")
MODEL   = "google/gemini-2.5-flash"

if not API_KEY:
    print("OPENROUTER_KEY nao definida.")
    sys.exit(1)

BANCO_TEMAS = [
    {"cat": "jurisprudencia-tst",   "tema": "horas extras habituais e reflexos em verbas rescisorias — posicao atual do TST",             "fonte": "TST — Tribunal Superior do Trabalho",      "fonte_url": "https://www.tst.jus.br/jurisprudencia"},
    {"cat": "jurisprudencia-tst",   "tema": "reconhecimento de vinculo empregaticio para trabalhadores de plataformas digitais",           "fonte": "TST — Tribunal Superior do Trabalho",      "fonte_url": "https://www.tst.jus.br/web/guest/noticias"},
    {"cat": "jurisprudencia-trts",  "tema": "teletrabalho: controle de jornada e horas extras — decisoes recentes dos TRTs",              "fonte": "CSJT — Conselho Superior da Justica do Trabalho", "fonte_url": "https://www.csjt.jus.br/web/csjt/noticias-dos-trts"},
    {"cat": "orientacoes-praticas", "tema": "rescisao sem justa causa — calculo completo das verbas e prazo de pagamento",                "fonte": "CLT — Consolidacao das Leis do Trabalho", "fonte_url": "https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm"},
    {"cat": "orientacoes-praticas", "tema": "demissao por justa causa — requisitos legais, provas e riscos para o empregador",            "fonte": "CLT — Art. 482 e jurisprudencia TST",      "fonte_url": "https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm"},
    {"cat": "orientacoes-praticas", "tema": "calculo de 13 salario proporcional com horas extras habituais — Sumula 264 TST",             "fonte": "Sumula 264/TST",                           "fonte_url": "https://www.tst.jus.br/sumulas"},
    {"cat": "legislacao-normas",    "tema": "portarias recentes do MTE: obrigacoes e impacto para o departamento pessoal",                "fonte": "Ministerio do Trabalho e Emprego",         "fonte_url": "https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo"},
    {"cat": "esocial-fgts-digital", "tema": "principais erros no envio de eventos do eSocial e como corrigir antes da multa",            "fonte": "Portal eSocial — gov.br",                 "fonte_url": "https://www.gov.br/esocial"},
    {"cat": "esocial-fgts-digital", "tema": "FGTS Digital: como evitar pendencias e multas no recolhimento mensal",                       "fonte": "FGTS Digital — Caixa Economica Federal",  "fonte_url": "https://fgtsdigital.caixa.gov.br"},
    {"cat": "saude-seguranca",      "tema": "NR-1 revisada: como implementar o PGR e evitar multas da fiscalizacao do MTE",              "fonte": "NR-1 — Portaria MTE 1.419/2022",           "fonte_url": "https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/ctpp-nrs/normas-regulamentadoras-nrs"},
    {"cat": "noticias-mte-mpt",     "tema": "fiscalizacao do MPT em assedio moral organizacional: o que as empresas precisam saber",      "fonte": "Ministerio Publico do Trabalho",           "fonte_url": "https://mpt.mp.br/pgt/noticias"},
    {"cat": "orientacoes-praticas", "tema": "ferias coletivas: regras, comunicacao ao MTE e impacto na folha de pagamento",               "fonte": "CLT — Arts. 139 a 141",                   "fonte_url": "https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm"},
]

PROPOSITO = """
Voce e um advogado trabalhista especialista e redator juridico do CalculaPrazo.
Publico-alvo: advogados trabalhistas, profissionais de RH e contadores brasileiros.
Estilo: tecnico, preciso, direto, orientado a pratica.
REGRAS: citar base legal exata (artigo, lei, sumula, portaria); linguagem juridica profissional;
minimo 400 palavras; concluir com impacto pratico e recomendacao acionavel.
"""

def gerar_artigo(tema_obj):
    prompt = f"""
{PROPOSITO}

Tema: {tema_obj['tema']}
Fonte de referencia: {tema_obj['fonte']}
Data: {HOJE.strftime('%d/%m/%Y')}

Redija artigo juridico completo com esta estrutura HTML:

<h2>Contexto</h2><p>[situacao juridica atual e norma aplicavel]</p>
<h2>Fundamentos Legais</h2><p>[base legal com numero do artigo/lei/sumula]</p><ul><li>...</li></ul>
<h2>Situacoes Praticas e Riscos</h2><p>[casos concretos e valores de passivo]</p>
<h2>Impacto para RH e Departamento Pessoal</h2><p>[acoes concretas e verificaveis]</p>
<h2>Recomendacao Imediata</h2><p>[acao especifica que o leitor deve tomar agora]</p>

Minimo 400 palavras. Sem frases genericas.

Responda APENAS com JSON valido:
{{"title": "titulo tecnico ate 65 chars", "excerpt": "resumo ate 155 chars", "tags": ["Tag1","Tag2","Tag3"], "content": "<h2>Contexto</h2><p>...</p>..."}}
"""
    try:
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": MODEL, "messages": [{"role": "user", "content": prompt}], "max_tokens": 3500, "temperature": 0.25},
            timeout=180,
        )
        raw = r.json()["choices"][0]["message"]["content"].strip()
        raw = re.sub(r"^```json\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        dados = json.loads(raw)
        dados.setdefault("title",   f"Orientacao Trabalhista — {HOJE.strftime('%d/%m/%Y')}")
        dados.setdefault("excerpt", tema_obj["tema"][:120])
        dados.setdefault("content", "<p>Conteudo em elaboracao.</p>")
        dados.setdefault("tags",    [tema_obj["cat"]])
        dados["source_url"] = tema_obj.get("fonte_url", "")
        return dados
    except Exception as e:
        print(f"  Erro ao gerar artigo: {e}")
        return None


def main():
    print(f"\nGerador Manual de Posts — {HOJE.strftime('%d/%m/%Y')}")
    print("=" * 65)

    random.seed(HOJE.toordinal())
    temas_dia = random.sample(BANCO_TEMAS, min(2, len(BANCO_TEMAS)))

    publicados = 0
    for tema_obj in temas_dia:
        print(f"\n[Tema] {tema_obj['tema'][:65]}...")

        if is_duplicata(tema_obj["tema"], "data/posts.json"):
            print(f"  Tema similar ja publicado. Pulando.")
            continue

        dados = gerar_artigo(tema_obj)
        if not dados:
            continue

        aprovado, motivo = validar_qualidade(dados, tema_obj["cat"])
        if not aprovado:
            print(f"  Reprovado: {motivo} | Titulo: '{dados.get('title','')}'")
            continue

        if is_duplicata(dados["title"], "data/posts.json"):
            print(f"  Titulo duplicado: '{dados['title']}'")
            continue

        sucesso = salvar_post(dados, tema_obj["cat"], tema_obj.get("fonte", "CalculaPrazo"))
        if sucesso:
            publicados += 1

    print(f"\nTotal publicado: {publicados} post(s)")

if __name__ == "__main__":
    main()
