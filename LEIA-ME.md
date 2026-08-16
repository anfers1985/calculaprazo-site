# Correção — posicionamento do compartilhar nas ferramentas/calculadoras
16/08/2026 · 15 arquivos

## O problema real (confirmado nos seus prints)
Os dois blocos de compartilhar (início e após o FAQ) estavam sendo
inseridos **fora de qualquer `.container`** da página — por isso
grudavam na borda esquerda da tela ("COMPARTILHAR" cortado) e não
respeitavam a margem/alinhamento que o resto do conteúdo tem. Nos
artigos do blog isso não acontecia porque lá existe um `.article-wrap`
envolvendo tudo; nas ferramentas a estrutura é diferente por página, e a
minha inserção original não levou isso em conta.

## Correção aplicada
Os dois blocos agora ficam dentro do próprio `<div class="container"
style="max-width:800px;...">`, com a mesma largura e margens do texto
explicativo da página (o "O que é a Calculadora de X?"). Isso garante
alinhamento correto **independente da estrutura interna de cada
página**, já que cada bloco cria seu próprio container em vez de tentar
"encaixar" num container existente que varia de página pra página.

Aplicado nas 15 páginas: gerador-de-senhas, calculadora-imc,
validador-cpf-cnpj, numero-por-extenso, gerador-de-qr-code,
calculadora-de-datas, calculadora-de-juros, calculadora-de-porcentagem,
calculadora-de-prazo-processual, calculadora-de-prescricao,
calculadora-salario-intermitente, calculadora-salario-liquido,
calculadora-verbas-trabalhistas, conversor-de-moedas, correcao-monetaria.

## Como usar
Sobrescreva os 15 arquivos `index.html` nas respectivas pastas. Nenhum
outro arquivo do site precisa de atualização nesta rodada — os demais já
estavam corretos, conforme a última comparação com o site ao vivo.

## Recomendação antes de publicar
Abrir 2-3 dessas páginas no desktop e no mobile, conferir que o bloco de
compartilhar (início e após o FAQ) fica alinhado com a mesma margem do
texto da página, sem cortar na borda da tela.
