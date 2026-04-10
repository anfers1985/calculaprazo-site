# -*- coding: utf-8 -*-
"""
Gerador Manual / Fallback de Posts — CalculaPrazo
Versão atualizada para funcionar com os novos agentes
"""
import os, json, re, requests, random
from datetime import date
from slugify import slugify
from html.parser import HTMLParser

API_KEY = os.environ["OPENROUTER_KEY"]
MODEL   = "google/gemini-2.5-flash"   # ← Atualizado

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; CalculaPrazoBot/1.0; +https://calculaprazo.com.br)",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

# =============================================================
# BANCO DE TEMAS (mantido, mas reduzido)
# =============================================================
BANCO_TEMAS = [
    {"cat": "jurisprudencia", "tema": "horas extras, controle de jornada e reflexos"},
    {"cat": "jurisprudencia", "tema": "reconhecimento de vínculo empregatício"},
    {"cat": "pratica", "tema": "rescisão sem justa causa — cálculos completos"},
    {"cat": "pratica", "tema": "demissão por justa causa — requisitos e riscos"},
    {"cat": "legislacao", "tema": "atualizações do MTE e portarias recentes"},
    {"cat": "esocial", "tema": "principais erros no eSocial e FGTS Digital"},
    {"cat": "folha", "tema": "cálculo de 13º salário e férias com horas extras"},
]

def gerar_post(tema):
    prompt = f"""
Você é Analista Estratégico de Relações Trabalhistas e Auditor Jurídico.

Escreva um boletim técnico direto e pragmático sobre:

Tema: {tema['tema']}

Público: advogados trabalhistas, RH e contadores.

Formato obrigatório:
**Título** (curto e objetivo)
**Resumo Executivo** (1 linha)
**Análise Técnica**
**Impacto Prático** (risco + financeiro)
**Recomendação de Ação**

Estilo: técnico, direto, pragmático. Sem enrolação.

Responda APENAS com JSON válido:
{{
  "title": "...",
  "excerpt": "...",
  "tags": ["tag1", "tag2", "tag3"],
  "content": "HTML completo com h2, p, ul, strong..."
}}
"""
    try:
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": MODEL, "messages": [{"role": "user", "content": prompt}], "max_tokens": 2800},
            timeout=120,
        )
        raw = r.json()["choices"][0]["message"]["content"]
        raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
        return json.loads(raw)
    except Exception as e:
        print(f"Erro ao gerar post: {e}")
        return None


def salvar_post(dados, tema):
    try:
        data_str = date.today().strftime("%Y-%m-%d")
        slug = slugify(dados["title"])[:60]

        with open("blog/POST_TEMPLATE.html", encoding="utf-8") as f:
            template = f.read()

        tags = dados.get("tags", [tema["cat"]])
        first_tag = tags[0] if tags else tema["cat"]

        html = (template
            .replace("{{TITLE}}", dados["title"])
            .replace("{{DESCRIPTION}}", dados["excerpt"])
            .replace("{{SLUG}}", slug)
            .replace("{{CATEGORY}}", tema["cat"])
            .replace("{{CATEGORY_LABEL}}", first_tag)
            .replace("{{TAGS_BADGES}}", "".join(f'<span style="...">{t}</span>' for t in tags))  # ajuste o CSS se necessário
            .replace("{{TAGS_JSON}}", json.dumps(tags, ensure_ascii=False))
            .replace("{{DATE}}", data_str)
            .replace("{{DATE_BR}}", f"{date.today().day} de {['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][date.today().month-1]} de {date.today().year}")
            .replace("{{CONTENT}}", dados["content"])
        )

        with open(f"blog/{slug}.html", "w", encoding="utf-8") as f:
            f.write(html)

        print(f"✅ Post gerado: {slug}.html")
        return slug
    except Exception as e:
        print(f"Erro ao salvar: {e}")
        return None


def main():
    print(f"\nGerador Manual de Posts — {date.today().strftime('%d/%m/%Y')}")
    print("=" * 60)

    random.seed(date.today().toordinal())
    temas_dia = random.sample(BANCO_TEMAS, min(3, len(BANCO_TEMAS)))  # reduzido para não sobrecarregar

    for tema in temas_dia:
        print(f"\nGerando: {tema['tema'][:60]}...")
        dados = gerar_post(tema)
        if dados:
            salvar_post(dados, tema)

    print("\nGerador manual finalizado.")


if __name__ == "__main__":
    main()
