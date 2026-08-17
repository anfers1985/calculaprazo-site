# Correção — wrap mobile nas ferramentas + newsletter institucional
16/08/2026 · 68 arquivos

## 1. Ícone quebrando linha de forma inconsistente no mobile (63 arquivos + styles.css)
Confirmado no código: os dois blocos de compartilhar (início e após o
FAQ) das ferramentas/calculadoras usam exatamente o mesmo HTML/CSS — não
havia diferença real entre eles. O que acontecia é que "COMPARTILHAR" +
6 ícones fica bem no limite da largura da tela em celulares, e qualquer
variação mínima fazia o último ícone (copiar link) quebrar pra uma linha
sozinho, de forma inconsistente entre uma página e outra.

**Correção:** abaixo de 400px de largura, o rótulo "Compartilhar" agora
vai para uma linha própria (centralizado, acima dos ícones) e os ícones
encolhem ligeiramente (29px), garantindo que os 6 sempre caibam numa
única linha — sem depender de coincidência de largura. Isso deixa o
comportamento **determinístico e sempre idêntico** entre o bloco do
início e o do final, em qualquer aparelho.

`styles.css?v=33` → `?v=34` em 63 arquivos.

## 2. Newsletter ausente em 5 páginas institucionais (5 arquivos)
Confirmado: as páginas Sobre, Contato, Privacidade & LGPD, Termos de Uso
e Ferramentas tinham rodapé, mas nenhuma carregava o `styles.css` externo
nem o `blog.min.js` — por isso a seção de newsletter nunca tinha sido
adicionada (não bastava copiar o HTML, faltava o CSS e a função
JavaScript do formulário).

**Correção, em cada uma das 5 páginas:**
- Adicionado o HTML da newsletter (mesmo bloco da home/artigos/ferramentas).
- Adicionado o CSS `.ftr-newsletter` e variantes (regra normal + mobile),
  direto no `<style>` embutido de cada página — essas páginas não usam o
  `styles.css` externo, então precisava estar ali.
- Adicionada uma versão isolada da função `newsletterSubscribe()` (só ela,
  não o `blog.min.js` inteiro, pra não carregar código desnecessário
  nessas páginas institucionais).

Páginas: sobre, contato, privacidade, termos, ferramentas.

## Como usar
Sobrescreva os arquivos nos mesmos caminhos. Nenhum outro arquivo do
site precisa de atualização nesta rodada.

## Recomendação antes de publicar
Testar o cadastro de e-mail em pelo menos 1 dessas 5 páginas pra
confirmar que o formulário envia de verdade (mensagem de sucesso/erro
deve aparecer abaixo do botão "Inscrever").
