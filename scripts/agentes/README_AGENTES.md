# Agentes CalculaPrazo — Guia de Execução

## Pré-requisitos

```bash
pip install requests python-slugify
```

## Variáveis de ambiente obrigatórias

| Variável             | Onde obter                                    |
|----------------------|-----------------------------------------------|
| `ANTHROPIC_API_KEY`  | console.anthropic.com → API Keys              |
| `PEXELS_API_KEY`     | pexels.com/api → solicitar chave (gratuita)   |

## Como executar localmente

**Sempre execute a partir da raiz do projeto** (onde ficam as pastas `blog/` e `data/`):

```bash
cd /caminho/para/calculaprazo-site

# Exportar variáveis
export ANTHROPIC_API_KEY="sk-ant-..."
export PEXELS_API_KEY="sua-chave-pexels"

# Rodar um agente específico
python scripts/agentes/agente_tst_stf.py

# Rodar todos os agentes em sequência
python scripts/gerar_posts.py
```

## Publicar no site após rodar

```bash
git add blog/ data/posts.json sitemap.xml
git commit -m "conteudo: posts gerados $(date +%d/%m/%Y)"
git push origin main
```
O Cloudflare Pages faz deploy automático após o push.

## Agentes disponíveis

| Arquivo                    | Categoria             | Fontes monitoradas                    |
|----------------------------|-----------------------|---------------------------------------|
| `agente_tst_stf.py`        | jurisprudencia-tst    | TST, STF                              |
| `agente_trts.py`           | jurisprudencia-trts   | CSJT, TRT-1, 2, 3, 4, 5, 9, 12       |
| `agente_mte.py`            | legislacao-normas     | MTE, Planalto, eSocial, FGTS Digital  |
| `agente_mpt.py`            | noticias-mte-mpt      | MPT Nacional, PRTs SC/RJ/SP/RS/MG/BA  |
| `agente_noticias_gerais.py`| orientacoes-praticas  | Contábeis, Migalhas, Jus.com.br       |

## Imagens (Pexels)

- API gratuita, sem custo por requisição
- Registro em: https://www.pexels.com/api/
- Licença: uso livre, inclusive comercial, sem atribuição obrigatória
- Se `PEXELS_API_KEY` não estiver configurada, usa imagem padrão

## GitHub Actions (automação)

Crie `.github/workflows/agentes.yml`:

```yaml
name: Agentes CalculaPrazo
on:
  schedule:
    - cron: '0 12 * * 1-5'   # seg-sex, 09h Brasília (12h UTC)
  workflow_dispatch:

jobs:
  rodar-agentes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install requests python-slugify
      - run: python scripts/gerar_posts.py
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          PEXELS_API_KEY: ${{ secrets.PEXELS_API_KEY }}
      - uses: actions/checkout@v4
      - run: |
          git config user.name "CalculaPrazo Bot"
          git config user.email "bot@calculaprazo.com.br"
          git add blog/ data/posts.json sitemap.xml
          git diff --staged --quiet || git commit -m "conteudo: posts automaticos $(date +%d/%m/%Y)"
          git push
```

Adicione os secrets em: GitHub repo → Settings → Secrets → Actions
