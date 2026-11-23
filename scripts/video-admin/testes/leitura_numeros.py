#!/usr/bin/env python3
"""Confere o leitor de números da narração (leitor_numeros.py) com os casos de testes/leitura_numeros.json
(os mesmos casos são conferidos em JavaScript por testes/leitura_numeros.mjs) e algumas frases completas.
Uso: python3 scripts/video-admin/testes/leitura_numeros.py"""
import json
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
from leitor_numeros import converter_numeros  # noqa: E402

FRASES = [  # frase completa (com abreviações, siglas e pronúncias) → o que a voz recebe
    ("Como funciona a contagem dos avos do 13º salário?", "Como funciona a contagem dos ávus do décimo terceiro salário?"),
    ("Escala 5x2 com jornada de 42 horas.", "Escala cinco por dois com jornada de quarenta e duas horas."),
    ("Conforme o art. 7º, inciso XIII, da CF/88.", "Conforme o artigo sétimo, inciso treze, da Constituição Federal de mil novecentos e oitenta e oito."),
    ("Para adquirir um avo, são 15 dias; cada avo vale 1/12.", "Para adquirir um ávu, são quinze dias; cada ávu vale um doze ávus."),
    ("Prazo até 1/5/2026.", "Prazo até primeiro de maio de dois mil e vinte e seis."),
]

def main() -> int:
    falhas = 0
    for caso in json.loads((AQUI / "leitura_numeros.json").read_text(encoding="utf-8")):
        obtido = converter_numeros(caso["entrada"])
        if obtido != caso["saida"]:
            falhas += 1
            print(f"FALHOU: {caso['entrada']!r}\n   esperado: {caso['saida']!r}\n   obtido:   {obtido!r}")
    try:
        import narracao  # noqa: WPS433 (importa só as funções; não chama a rede)
        for entrada, esperado in FRASES:
            obtido = narracao.normalizar_texto_fala(entrada)
            if obtido != esperado:
                falhas += 1
                print(f"FALHOU (frase): {entrada!r}\n   esperado: {esperado!r}\n   obtido:   {obtido!r}")
    except ImportError as e:  # pydub/requests ausentes: só os casos do JSON
        print(f"(frases completas puladas: {e})")
    print("OK" if not falhas else f"{falhas} falha(s)")
    return 1 if falhas else 0

if __name__ == "__main__":
    sys.exit(main())
