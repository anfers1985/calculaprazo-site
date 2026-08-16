# Pacote de sincronização — Calcula Prazo
16/08/2026 · 65 arquivos, gerado a partir da comparação com o site que
você enviou (calculaprazo-site-main__2_.zip)

## O que eu encontrei ao comparar com o site ao vivo

**Boas notícias primeiro:** os 387 artigos do blog originais, os 15
arquivos de ferramenta/calculadora (HTML) e as 46 páginas de `/conteudo`
já estão publicados exatamente como nos meus pacotes — as correções de
newsletter, "Ver todos os conteúdos", compartilhar (blog e ferramentas)
já estão todas no ar. `blog.min.js?v=15` também confirmado.

**3 coisas realmente precisavam de atualização:**

### 1. `styles.css` ainda em `?v=32`, não `?v=33` (63 arquivos)
Você publicou até a v8 (que adicionou o CSS do compartilhar nas
ferramentas), mas a v9 (que corrige a versão do arquivo pra tirar do
cache) ainda não tinha ido — por isso o botão aparecia "amontoado" nas
ferramentas/calculadoras. Neste pacote, os 63 arquivos que carregam
`styles.css` já apontam pra `?v=33`.

### 2. `/ferramentas` sumiu do sitemap de novo
Confirmado: aconteceu exatamente o que eu tinha avisado — o script de
publicação (`scripts/09-publicar-agendados.mjs`) regenerou o
`sitemap.xml` do zero ao publicar o post novo, e como a lista fixa dele
nunca teve `/ferramentas`, ela sumiu de novo. Recoloquei a URL usando
como base o seu `sitemap.xml` mais atual (que já tem o post novo e os
`lastmod` corretos) — 455 URLs agora.

**Isso vai continuar acontecendo a cada novo post publicado**, a menos
que a lista fixa dentro do `scripts/09-publicar-agendados.mjs` seja
corrigida na raiz. Você tinha pedido pra eu não mexer nesse arquivo — não
mexi. Se quiser que eu corrija (é 1 linha), me avise.

### 3. Um post "órfão" (`salario-maternidade-pai-regras-inss.html`)
Esse post não existia no zip original — foi publicado pelo seu pipeline
depois, usando uma versão do `POST_TEMPLATE.html` anterior às correções
de sticky/card (v6/v7). Apliquei manualmente as mesmas correções nele
(estrutura idêntica aos outros 387 agora): sticky só no mobile, bloco
final sem card, ícone de "copiado" no tamanho certo.

## Como usar
Sobrescreva os 65 arquivos deste pacote no mesmo caminho no seu
repositório. Depois de publicar, todo post novo do pipeline já vai nascer
certo (o `POST_TEMPLATE.html` corrigido já está em produção desde os
pacotes anteriores) — só ficam faltando corrigir manualmente outros
posts publicados no mesmo intervalo que esse, se houver mais algum (não
verifiquei além deste, porque foi o único a mais que apareceu no zip que
você me mandou).

## Pendente, fora deste pacote
- Decisão sobre corrigir a lista fixa do sitemap dentro do
  `scripts/09-publicar-agendados.mjs` (raiz do problema do item 2).
- Bloco "Mais Acessados / Últimos Adicionados" na página `/conteudo`.
