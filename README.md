# Calcula Prazo — Site Jurídico com Ferramentas Gratuitas

[![Cloudflare Pages](https://img.shields.io/badge/Hospedagem-Cloudflare%20Pages-orange)](https://calculaprazo.com.br)
[![AdSense](https://img.shields.io/badge/Monetização-Google%20AdSense-brightgreen)](https://calculaprazo.com.br)

> Calculadoras jurídicas e trabalhistas gratuitas para advogados, RH e contadores.
> Calculadora de prazos processuais, verbas rescisórias, correção monetária, salário líquido e muito mais.

---

## 📋 Visão Geral

O Calcula Prazo é uma SPA (Single Page Application) em HTML/JS puro com blog estático.
- **Frontend:** `index.html` (SPA completa) + páginas estáticas em `/privacidade`, `/termos`, `/contato`
- **Blog:** Arquivos HTML em `/blog/` gerados pelos agentes ou manualmente
- **Dados:** `data/posts.json` — índice de posts para o blog
- **Deploy:** Cloudflare Pages (push na `main` → deploy automático)

---

## 🗂️ Estrutura do Projeto

```
calculaprazo-site/
├── index.html                  # SPA principal (todas as calculadoras)
├── og-image.png                # Imagem Open Graph padrão
├── ads.txt                     # Verificação Google AdSense
├── robots.txt                  # Instruções para rastreadores
├── sitemap.xml                 # Mapa do site (atualizado pelos agentes)
├── _redirects                  # Regras Cloudflare Pages
├── rebuild_posts_json.py       # Reconstrói data/posts.json manualmente
│
├── blog/
│   ├── POST_TEMPLATE.html      # Template base para novos posts
│   └── *.html                  # Posts publicados
│
├── data/
│   └── posts.json              # Índice de posts (gerado automaticamente)
│
├── privacidade/
│   └── index.html              # Página de Política de Privacidade
│
├── termos/
│   └── index.html              # Página de Termos de Uso
│
├── contato/
│   └── index.html              # Página de Contato
│
├── scripts/
│   └── agentes/
│       ├── agente_base.py      # ⭐ Módulo compartilhado (validação, salvar, sitemap)
│       ├── agente_tst_stf.py   # Agente TST + STF
│       ├── agente_trts.py      # Agente TRTs regionais
│       ├── agente_mpt.py       # Agente MPT
│       ├── agente_mte.py       # Agente MTE
│       └── agente_noticias_gerais.py  # Agente notícias gerais
│
└── .github/
    ├── pull_request_template.md    # Checklist de revisão editorial
    └── workflows/
        ├── agente-tst-stf.yml
        ├── agente-trts.yml
        ├── agente-mpt.yml
        ├── agente-mte.yml
        ├── agente-noticias-gerais.yml
        └── post-generator.yml      # Fallback manual
```

---

## 🤖 Pipeline de Publicação de Conteúdo

### Fluxo Atual (com revisão humana)

```
GitHub Actions (schedule)
        ↓
  Agente IA coleta conteúdo da fonte
        ↓
  Validação automática de qualidade
  (wordcount ≥ 300, tem H2, sem título genérico)
        ↓
  [REPROVADO] → log de erro, nada publicado
  [APROVADO]  → salva em blog/ + atualiza posts.json + sitemap
        ↓
  Push para branch: draft/agentes
        ↓
  ⚠️ REVISÃO HUMANA OBRIGATÓRIA
  Abrir Pull Request de draft/agentes → main
  Verificar checklist em .github/pull_request_template.md
        ↓
  Merge → Cloudflare Pages deploy automático em produção
```

### Taxonomia de Categorias

| Categoria (ID) | Label | Agente |
|---|---|---|
| `jurisprudencia-tst` | Jurisprudência TST/STF | agente_tst_stf |
| `jurisprudencia-trts` | Jurisprudência TRTs | agente_trts |
| `noticias-mte-mpt` | MTE & MPT | agente_mpt, agente_mte |
| `legislacao-normas` | Legislação e Normas | agente_mte |
| `esocial-fgts-digital` | eSocial e FGTS Digital | agente_noticias_gerais |
| `orientacoes-praticas` | Orientações Práticas RH | agente_noticias_gerais |
| `saude-seguranca` | Saúde e Segurança | qualquer agente |

---

## 📝 Padrão Editorial Obrigatório

Todo artigo publicado **deve** ter:

1. **Título técnico e específico** — sem "novas tendências", "análise pós-X"
2. **Fonte verificável** — número de processo, portaria, lei ou URL linkada
3. **Mínimo 400 palavras** de conteúdo substantivo
4. **Estrutura obrigatória:**
   - H2: Contexto
   - H2: O que aconteceu (com fato concreto datado)
   - H2: Fundamentação (base legal)
   - H2: Impacto Prático
   - H2: Recomendação Imediata
5. **Disclaimer jurídico** ao final (inserido automaticamente pelo template)
6. **Autoria:** "Equipe Editorial Calcula Prazo" (inserida automaticamente)
7. **Link interno** para a calculadora relevante

### ❌ Artigos que devem ser REJEITADOS no PR

- Conteúdo genérico sem fato concreto (ex: "O direito do trabalho está evoluindo...")
- Sem fonte verificável
- Dados inventados pelo agente (não presentes no conteúdo coletado)
- Menos de 300 palavras

---

## 🔧 Configuração e Deploy

### Segredos necessários no GitHub

Acesse: **Settings → Secrets and variables → Actions**

| Secret | Descrição |
|---|---|
| `OPENROUTER_KEY` | Chave da API OpenRouter (para Gemini 2.5 Flash) |

### Configurar Cloudflare Pages

1. Conecte o repositório GitHub ao Cloudflare Pages
2. Build command: *(deixe vazio — site estático)*
3. Output directory: `/` (raiz)
4. A branch `main` é deployed automaticamente
5. A branch `draft/agentes` gera um **Preview URL** para revisão

### Executar agentes localmente

```bash
# Instalar dependências
pip install requests python-slugify

# Executar um agente específico (da raiz do projeto)
OPENROUTER_KEY=sua_chave python scripts/agentes/agente_tst_stf.py
```

### Reconstruir posts.json manualmente

```bash
# Útil após edições manuais em posts do blog
python rebuild_posts_json.py
```

---

## 📊 AdSense e Monetização

- **Publisher ID:** `pub-3280539734623058`
- **ads.txt:** configurado na raiz
- **Slots:** configurados no index.html (substituir `SLOT_*` pelos IDs reais após aprovação)
- **Status:** aguardando aprovação — manter qualidade editorial do blog

### Checklist para aprovação AdSense

- [x] Política de Privacidade em URL dedicada (`/privacidade`)
- [x] Termos de Uso em URL dedicada (`/termos`)
- [x] Página de Contato com formulário (`/contato`)
- [x] Autoria identificada em todos os posts
- [x] Disclaimer jurídico em todos os artigos
- [x] Cookie banner com consentimento
- [x] ads.txt configurado
- [ ] Mínimo 20-25 posts de qualidade publicados
- [ ] Solicitar revisão em: google.com/adsense

---

## 🚀 Próximos Passos (Roadmap)

### Curto Prazo (1 mês)
- [ ] Substituir `og-image.png` por imagem real com marca visual do Calcula Prazo
- [ ] Publicar 15+ posts seguindo o padrão editorial
- [ ] Substituir `SLOT_*` pelos IDs reais de slots AdSense após aprovação
- [ ] Configurar Formspree no formulário de contato (`/contato/index.html`)
- [ ] Submeter sitemap no Google Search Console

### Médio Prazo (2-4 meses)
- [ ] Criar páginas pilares: `/direito-do-trabalho`, `/prazos-processuais`, `/esocial`
- [ ] Adicionar breadcrumb schema (BreadcrumbList) nas calculadoras
- [ ] Criar og-image por calculadora (geração automatizada)
- [ ] Newsletter trabalhista semanal

### Longo Prazo (6-12 meses)
- [ ] Perfil de autor especialista com currículo verificável
- [ ] Calculadoras de nicho: Insalubridade/Periculosidade, Art. 484-A, Dano Moral
- [ ] Canal YouTube com tutoriais das calculadoras

---

## 📞 Contato

- **Site:** [calculaprazo.com.br](https://calculaprazo.com.br)
- **E-mail:** calculaprazo@calculaprazo.com.br
- **Pix:** calculaprazo@calculaprazo.com.br

---

*© 2026 Calcula Prazo. Todos os direitos reservados.*
