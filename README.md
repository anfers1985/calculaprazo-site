# Calcula Prazo — Site Jurídico com Ferramentas Gratuitas

[![Cloudflare Pages](https://img.shields.io/badge/Hospedagem-Cloudflare%20Pages-orange)](https://calculaprazo.com.br)
[![AdSense](https://img.shields.io/badge/Monetização-Google%20AdSense-brightgreen)](https://calculaprazo.com.br)

> Calculadoras jurídicas e trabalhistas gratuitas para advogados, RH e contadores.
> Calculadora de prazos processuais, verbas rescisórias, correção monetária, salário líquido e muito mais.

---

## 📋 Visão Geral

O Calcula Prazo é uma SPA (Single Page Application) em HTML/JS puro com blog estático.
- **Frontend:** `index.html` (SPA completa) + páginas estáticas em `/privacidade`, `/termos`, `/contato`
- **Blog:** Arquivos HTML em `/blog/` gerados pelo painel admin (`/admin`)
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
├── sitemap.xml                 # Mapa do site
├── _redirects                  # Regras Cloudflare Pages
├── rebuild_posts_json.py       # Reconstrói data/posts.json manualmente
│
├── blog/
│   ├── POST_TEMPLATE.html      # Template base para novos posts (usado pelo admin)
│   └── *.html                  # Posts publicados
│
├── data/
│   └── posts.json              # Índice de posts (gerado automaticamente)
│
├── admin/
│   └── index.html              # Painel administrativo — é aqui que todo o conteúdo é criado/editado/publicado
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
│   └── 09-publicar-agendados.mjs   # Publica posts pré-preparados no horário agendado (via GitHub Actions)
│
└── .github/
    └── workflows/
        └── publicar-agendados.yml  # Roda o publicador agendado periodicamente
```

---

## ✍️ Como o Conteúdo é Gerado

Todo o conteúdo do site — artigos, súmulas comentadas e itens essenciais — é criado e publicado manualmente por **Anderson Fernandes** através do painel administrativo (`/admin`). O admin oferece:

- Editor de posts com categorias, tags, imagem de capa e agendamento de publicação.
- Geração automática do HTML final a partir de `blog/POST_TEMPLATE.html`, preenchendo título, data, categoria, conteúdo e autoria.
- Seletor de autor: por padrão publica como **Anderson Fernandes**, com opção de cadastrar outros autores caso haja parcerias futuras.
- Suporte a "Content Studio" — um proxy de IA (via Cloudflare Worker) usado como apoio na produção de conteúdo, mas sempre com revisão e publicação manual pelo próprio Anderson.

Conteúdo publicado em lote para projetos específicos (ex: as 463 súmulas comentadas do TST, itens da seção "Essenciais") segue o mesmo padrão de autoria, mas foi inserido diretamente nos arquivos HTML — esses itens não passam pelo fluxo padrão do admin.

Não existe mais nenhum pipeline automatizado de coleta/geração de conteúdo por agentes de IA sem supervisão — uma arquitetura desse tipo chegou a ser usada no início do projeto, mas foi descontinuada por problemas de qualidade no conteúdo gerado.

---

## 📝 Padrão Editorial

Todo artigo publicado segue:

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
6. **Autoria:** Anderson Fernandes (selecionável no admin; outros autores podem ser cadastrados)
7. **Link interno** para a calculadora relevante

---

## 🔧 Configuração e Deploy

### Configurar Cloudflare Pages

1. Conecte o repositório GitHub ao Cloudflare Pages
2. Build command: *(deixe vazio — site estático)*
3. Output directory: `/` (raiz)
4. A branch `main` é deployed automaticamente
5. A branch `main` recebe o output do publicador agendado (`scripts/09-publicar-agendados.mjs`)

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
