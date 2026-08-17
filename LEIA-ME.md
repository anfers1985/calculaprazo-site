# Correção definitiva — compartilhar quebrando linha no mobile
16/08/2026 · 63 arquivos (styles.css)

## O que estava errado
A correção anterior só valia para telas ≤400px. Seu celular (e a
maioria dos Android no mercado) tem entre ~400-412px de largura CSS —
ficava de fora dessa regra e caía na regra antiga, que quebrava de um
jeito pior (4 ícones numa linha, 2 na outra).

## Correção
Simplifiquei para uma única regra, valendo até 640px (praticamente todo
mobile): o rótulo "Compartilhar" sempre vai para uma linha própria,
centralizado, e os 6 ícones (30px cada, 6px de espaço entre eles = 210px
no total) sempre cabem numa linha só embaixo — não depende mais de
coincidência de largura de tela.

Confirmei no código: os blocos do início e do final usam a mesma classe
CSS (`post-share-final`), byte a byte idênticos — então essa correção
vale igual para os dois, em qualquer página de ferramenta/calculadora.

`styles.css?v=34` → `?v=35` em 63 arquivos.

## Como usar
Sobrescreva os 63 arquivos nos mesmos caminhos.
